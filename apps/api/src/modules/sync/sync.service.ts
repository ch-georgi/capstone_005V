import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma,SyncEntity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/types/auth-context';
import { apiError } from '../../common/filters/api-error';
import { ContextService } from '../auth/context.service';
import { SyncQuery } from './sync.controller';
import { readCursor,signCursor } from './cursor';
type Change={revision:string;entity:SyncEntity;entityId:string;patientId:string;action:'UPSERT'|'DELETE';payload:Record<string,unknown>};
@Injectable()
export class SyncService {
 constructor(private readonly db:PrismaService,private readonly config:ConfigService,private readonly contexts:ContextService){}
 async get(context:TenantContext,query:SyncQuery){
  if(context.clinicId!==query.clinicId) throw apiError(403,'FORBIDDEN','La clínica no corresponde a la sesión.');
  const secret=this.config.get<string>('SYNC_CURSOR_SECRET');
  if(!secret) throw apiError(503,'SYNC_NOT_CONFIGURED','La sincronización no está configurada.');
  return this.db.$transaction(async tx=>{
   const ctx=await this.contexts.resolve({sub:context.actorId,context:'TENANT',clinicId:context.clinicId},tx);
   if(ctx.kind!=='TENANT') throw apiError(403,'FORBIDDEN','Se requiere una clínica.');
   const member=await tx.userClinic.findUniqueOrThrow({where:{userId_clinicId:{userId:ctx.actorId,clinicId:ctx.clinicId}}});
   const clinic=await tx.clinic.findUniqueOrThrow({where:{id:ctx.clinicId}});
   const scope={userId:ctx.actorId,clinicId:ctx.clinicId,permissionRevision:member.permissionRevision.toString()};
   const claims=query.cursor?readCursor(query.cursor,secret,scope):null;
   const through=claims && claims.afterRevision!==claims.throughRevision?BigInt(claims.throughRevision):clinic.syncRevision;
   const after=claims?BigInt(claims.afterRevision):0n;
   if(after>through || through>clinic.syncRevision) throw apiError(409,'SYNC_RESET_REQUIRED','Actualiza la copia local.');
   const patients=await tx.patient.findMany({where:{clinicId:ctx.clinicId,...(ctx.role==='PATIENT'?{userId:ctx.actorId}:{})}});
   const readable=new Set<string>();
   for(const patient of patients){const rows=await tx.$queryRaw<{ok:boolean}[]>`SELECT can_read_patient(${ctx.actorId}::uuid,${patient.id}::uuid) AS ok`;if(rows[0]?.ok)readable.add(patient.id);}
   const names=new Map((await tx.userClinic.findMany({where:{clinicId:ctx.clinicId},select:{userId:true,displayName:true}})).map(m=>[m.userId,m.displayName]));
   const person=(id:string)=>({id,displayName:names.get(id)??null});
   const exams=await tx.exam.findMany({where:{clinicId:ctx.clinicId,patientId:{in:[...readable]},deletedAt:null},include:{examType:true,versions:{orderBy:{versionNumber:'desc'}}}});
   const payloads=new Map<string,Record<string,unknown>>();
   for(const p of patients.filter(p=>readable.has(p.id))){const m=await tx.userClinic.findUniqueOrThrow({where:{userId_clinicId:{userId:p.userId,clinicId:ctx.clinicId}}});payloads.set('PATIENT:'+p.id,{...p,dateOfBirth:p.dateOfBirth.toISOString().slice(0,10),createdAt:p.createdAt.toISOString(),updatedAt:p.updatedAt.toISOString(),deletedAt:p.deletedAt?.toISOString()??null,isActive:m.isActive});}
   for(const e of exams){const versions=e.versions.map(v=>({id:v.id,versionNumber:v.versionNumber,originalFilename:v.originalFilename,mimeType:v.mimeType,sizeBytes:Number(v.sizeBytes),sha256:v.sha256,createdAt:v.createdAt.toISOString(),uploadedBy:person(v.uploadedBy)}));
    payloads.set('EXAM:'+e.id,{id:e.id,patientId:e.patientId,title:e.title,examDate:e.examDate.toISOString().slice(0,10),professionalName:e.professionalName,notes:e.notes,examType:{id:e.examType.id,code:e.examType.code,name:e.examType.name},versionCount:versions.length,latestVersion:versions[0]??null,versions,createdBy:person(e.createdBy),createdAt:e.createdAt.toISOString(),updatedAt:e.updatedAt.toISOString()});
    for(const v of versions)payloads.set('EXAM_VERSION:'+v.id,{...v,examId:e.id});
   }
   const changes:Change[]=[];let scanned=through;
   if(!claims){for(const entity of ['PATIENT','EXAM','EXAM_VERSION'] as const)for(const [key,payload] of payloads){if(!key.startsWith(entity+':'))continue;const id=key.slice(entity.length+1);const patientId=entity==='PATIENT'?id:entity==='EXAM'?payload.patientId as string:exams.find(e=>e.id===payload.examId)!.patientId;changes.push({revision:through.toString(),entity,entityId:id,patientId,action:'UPSERT',payload});}}
   else {
    const rows=await tx.syncChange.findMany({where:{clinicId:ctx.clinicId,revision:{gt:after,lte:through}},orderBy:{revision:'asc'},take:query.limit});
    scanned=rows.length?rows[rows.length-1].revision:through;
    for(const row of rows){
     if(ctx.role==='PATIENT'&&!patients.some(p=>p.id===row.patientId))continue;
     if(!readable.has(row.patientId)){if(ctx.role!=='PATIENT')changes.push({revision:row.revision.toString(),entity:'PATIENT',entityId:row.patientId,patientId:row.patientId,action:'DELETE',payload:{}});continue;}
     const payload=payloads.get(row.entity+':'+row.entityId);
     changes.push({revision:row.revision.toString(),entity:row.entity,entityId:row.entityId,patientId:row.patientId,action:payload?'UPSERT':'DELETE',payload:payload??{}});
    }
   }
   return {mode:claims?'DELTA':'SNAPSHOT',access:ctx.access,permissionRevision:scope.permissionRevision,changes,nextCursor:signCursor({version:1,...scope,afterRevision:scanned.toString(),throughRevision:through.toString()},secret),revision:scanned.toString(),hasMore:scanned<through};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
 }
}
