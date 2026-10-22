import {exclusive,notifyClinical} from "./database";
import {SessionManager} from "../auth/session";
import {ApiError} from "../auth/types";
import {ExamDetail,ExamPage,ExamType} from "../exams/types";
import {applySyncPage,applyTombstone} from "../../../../database/sqlite/operations";
import type {SyncResponse} from "../../../../database/contracts/types";
const running=new WeakMap<SessionManager,Promise<void>>();
export function synchronize(manager:SessionManager):Promise<void>{
 const existing=running.get(manager);if(existing)return existing;
 const work=(async()=>{
  const {profile,offline}=manager.getSnapshot();if(!profile||offline)return;
  const owner=profile.user.id,clinic=profile.clinic.id,key=manager.contextKey();
  const saved=await exclusive(db=>db.getFirstAsync<{cursor:string}>("SELECT cursor FROM sync_metadata WHERE owner_user_id=? AND clinic_id=? AND stream='clinical'",owner,clinic));
  let cursor=saved?.cursor,reset=false;
  do{
   let page:SyncResponse;
   try{page=await manager.request<SyncResponse>(`/sync?clinicId=${clinic}&limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`);}
   catch(error){
    if(error instanceof ApiError&&error.status===403){await exclusive(async db=>{await db.execAsync("BEGIN IMMEDIATE");try{await db.runAsync("UPDATE local_contexts SET access_state='REVOKED' WHERE owner_user_id=? AND clinic_id=?",owner,clinic);await db.runAsync("UPDATE sync_queue SET status='PENDING',processing_until=NULL,pause_reason='PERMISSION' WHERE owner_user_id=? AND clinic_id=? AND status<>'COMPLETED'",owner,clinic);await db.runAsync("DELETE FROM local_patients WHERE owner_user_id=? AND clinic_id=?",owner,clinic);await db.execAsync("COMMIT");}catch(e){await db.execAsync("ROLLBACK");throw e;}});notifyClinical();}
    if(!reset&&error instanceof ApiError&&(error.code==="SYNC_RESET_REQUIRED"||error.code==="INVALID_CURSOR")){cursor=undefined;reset=true;continue;}throw error;}
   if(manager.contextKey()!==key)throw new Error("La sesión cambió.");
   if(!["SNAPSHOT","DELTA"].includes(page.mode)||!Array.isArray(page.changes)||!page.nextCursor||!/^\d+$/.test(page.revision))throw new Error("Respuesta de sincronización inválida.");
   await exclusive(async db=>{
    if(manager.contextKey()!==key)throw new Error("La sesión cambió.");
    await applySyncPage(db,owner,clinic,page.nextCursor,page.revision,new Date().toISOString(),async()=>{
     await db.runAsync("INSERT INTO local_contexts(owner_user_id,clinic_id,role,permission_revision,access_state,updated_at) VALUES(?,?,'PATIENT',?,?,?) ON CONFLICT(owner_user_id,clinic_id) DO UPDATE SET permission_revision=excluded.permission_revision,access_state=excluded.access_state,updated_at=excluded.updated_at",owner,clinic,page.permissionRevision,page.access,new Date().toISOString());
     if(page.access==="READ_WRITE")await db.runAsync("UPDATE sync_queue SET pause_reason=NULL WHERE owner_user_id=? AND clinic_id=? AND pause_reason IN ('AUTH','PERMISSION')",owner,clinic);
     if(page.mode==="SNAPSHOT"){
      for(const [entity,table] of [["EXAM_VERSION","local_exam_versions"],["EXAM","local_exams"],["PATIENT","local_patients"]] as const){
       const keep=new Set(page.changes.filter(c=>c.entity===entity&&c.action==="UPSERT").map(c=>c.entityId));
       for(const row of await db.getAllAsync<{id:string}>(`SELECT id FROM ${table} WHERE owner_user_id=? AND clinic_id=?`,owner,clinic))if(!keep.has(row.id))await applyTombstone(db,owner,clinic,entity,row.id,new Date().toISOString());
      }
     }
     // A current exam payload includes all its versions, so deltas are applied parent-first.
     const ordered=[...page.changes].sort((a,b)=>["PATIENT","EXAM","EXAM_VERSION"].indexOf(a.entity)-["PATIENT","EXAM","EXAM_VERSION"].indexOf(b.entity));
     for(const change of ordered){
      if(change.action==="DELETE"){await applyTombstone(db,owner,clinic,change.entity,change.entityId,new Date().toISOString());continue;}
      const p=change.payload as unknown as Record<string,unknown>;
      if(change.entity==="PATIENT"){
       if(p.userId!==owner||p.clinicId!==clinic)throw new Error("La ficha no corresponde a tu sesión.");
       await db.runAsync("INSERT INTO local_patients(owner_user_id,clinic_id,id,user_id,first_name,last_name,date_of_birth,email,phone,medical_record_number,is_active,deleted_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_user_id,clinic_id,id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,date_of_birth=excluded.date_of_birth,email=excluded.email,phone=excluded.phone,medical_record_number=excluded.medical_record_number,is_active=excluded.is_active,deleted_at=excluded.deleted_at,updated_at=excluded.updated_at",owner,clinic,change.entityId,owner,String(p.firstName),String(p.lastName),String(p.dateOfBirth),p.email as string|null,p.phone as string|null,p.medicalRecordNumber as string|null,p.isActive?1:0,p.deletedAt as string|null,String(p.updatedAt));
      }else if(change.entity==="EXAM"){
       const e=p as unknown as ExamDetail;if(!e.examType?.id||!Array.isArray(e.versions))throw new Error("Detalle incompleto.");
       await db.runAsync("INSERT INTO local_exams(owner_user_id,clinic_id,id,patient_id,exam_type_code,exam_type_name,title,exam_date,professional_name,notes,latest_server_version,updated_at,detail_json,exam_type_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_user_id,clinic_id,id) DO UPDATE SET exam_type_code=excluded.exam_type_code,exam_type_name=excluded.exam_type_name,title=excluded.title,exam_date=excluded.exam_date,professional_name=excluded.professional_name,notes=excluded.notes,latest_server_version=excluded.latest_server_version,updated_at=excluded.updated_at,detail_json=excluded.detail_json,exam_type_id=excluded.exam_type_id",owner,clinic,e.id,e.patientId,e.examType.code,e.examType.name,e.title,e.examDate,e.professionalName,e.notes,e.latestVersion?.versionNumber??1,e.updatedAt,JSON.stringify(e),e.examType.id);
      }else{
       await db.runAsync("INSERT INTO local_exam_versions(owner_user_id,clinic_id,id,exam_id,version_number,original_filename,mime_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_user_id,clinic_id,id) DO NOTHING",owner,clinic,change.entityId,String(p.examId),Number(p.versionNumber),String(p.originalFilename),String(p.mimeType),Number(p.sizeBytes),String(p.sha256),String(p.createdAt));
      }
     }
    });
   });
   notifyClinical();cursor=page.nextCursor;if(!page.hasMore)break;
  }while(true);
  const types=await manager.request<{items:ExamType[]}>("/exam-types");
  if(manager.contextKey()!==key)return;
  await exclusive(async db=>{await db.execAsync("BEGIN IMMEDIATE");try{await db.runAsync("DELETE FROM local_exam_types WHERE owner_user_id=? AND clinic_id=?",owner,clinic);for(const t of types.items)await db.runAsync("INSERT INTO local_exam_types VALUES(?,?,?,?,?)",owner,clinic,t.id,t.code,t.name);await db.execAsync("COMMIT");}catch(error){await db.execAsync("ROLLBACK");throw error;}});
 })().finally(()=>running.delete(manager));running.set(manager,work);return work;
}
export async function cachedResource<T>(manager:SessionManager,path:string):Promise<T>{
 const {profile}=manager.getSnapshot();if(!profile)throw new Error("Inicia sesión.");
 return exclusive(async db=>{
  const scope=[profile.user.id,profile.clinic.id];
  const context=await db.getFirstAsync<{access_state:string}>("SELECT access_state FROM local_contexts WHERE owner_user_id=? AND clinic_id=?",...scope);
  if(!context||context.access_state==="REVOKED")throw new Error("Conéctate para sincronizar tus datos primero.");
  if(path==="/exam-types")return {items:await db.getAllAsync("SELECT id,code,name FROM local_exam_types WHERE owner_user_id=? AND clinic_id=?",...scope)} as T;
  const detail=/^\/exams\/([^/?]+)$/.exec(path);
  if(detail){const row=await db.getFirstAsync<{detail_json:string|null}>("SELECT detail_json FROM local_exams WHERE owner_user_id=? AND clinic_id=? AND id=?",...scope,detail[1]);if(!row?.detail_json)throw new Error("El examen no está disponible en la copia local.");return JSON.parse(row.detail_json) as T;}
  const list=/^\/patients\/([^/]+)\/exams(?:\?(.*))?$/.exec(path);
  if(list&&list[1]===profile.patientId){
   const params=new URLSearchParams(list[2]??"");
   const rows=await db.getAllAsync<{detail_json:string}>("SELECT detail_json FROM local_exams WHERE owner_user_id=? AND clinic_id=? AND patient_id=? AND detail_json IS NOT NULL ORDER BY exam_date DESC,id DESC",...scope,profile.patientId!);
   const all=rows.map(r=>JSON.parse(r.detail_json) as ExamDetail).filter(e=>(!params.get("examTypeId")||e.examType.id===params.get("examTypeId"))&&(!params.get("from")||e.examDate>=params.get("from")!)&&(!params.get("to")||e.examDate<=params.get("to")!));
   const limit=Number(params.get("limit")??20),offset=Number(params.get("offset")??0);return {items:all.slice(offset,offset+limit),total:all.length,limit,offset} as ExamPage as T;
  }throw new Error("Consulta local no soportada.");
 });
}
