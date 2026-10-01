import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient,Prisma,TenantRole } from '@prisma/client';
const url=process.env.TEST_DATABASE_URL;
if(!url || !new URL(url).pathname.endsWith('_schema_test')) throw new Error('Use TEST_DATABASE_URL pointing to a disposable database ending in _schema_test');
const db=new PrismaClient({datasources:{db:{url}}});
type Tx=Prisma.TransactionClient;
async function setup(tx:Tx) {
 const a=randomUUID(),b=randomUUID(),actor=randomUUID(),owner=randomUUID(),p=randomUUID(),q=randomUUID(),type=randomUUID();
 await tx.clinic.createMany({data:[{id:a,name:'Test A',code:a},{id:b,name:'Test B',code:b}]});
 await tx.user.createMany({data:[{id:actor,email:`${actor}@example.com`,passwordHash:'test-hash'},{id:owner}]});
 await tx.userClinic.createMany({data:[{userId:actor,clinicId:a,role:TenantRole.CLINIC_ADMIN,displayName:'Admin A'},{userId:actor,clinicId:b,role:TenantRole.CLINICIAN,displayName:'Clinician B'},{userId:owner,clinicId:a,role:TenantRole.PATIENT,displayName:'Patient A'},{userId:owner,clinicId:b,role:TenantRole.PATIENT,displayName:'Patient B'}]});
 await tx.patient.createMany({data:[{id:p,userId:owner,clinicId:a,firstName:'Private A',lastName:'Test',dateOfBirth:new Date('2000-01-01')},{id:q,userId:owner,clinicId:b,firstName:'Private B',lastName:'Test',dateOfBirth:new Date('2001-01-01')}]});
 await tx.examType.create({data:{id:type,code:type,name:'Test'}});
 const exam=randomUUID(),version=randomUUID();
 await tx.exam.create({data:{id:exam,clinicId:a,patientId:p,examTypeId:type,title:'Test',examDate:new Date('2026-09-01'),createdBy:actor}});
 await addVersion(tx,{a,p,exam,actor},1,version);
 return {a,b,actor,owner,p,q,type,exam,version};
}
async function addVersion(tx:Tx,s:{a:string,p:string,exam:string,actor:string},number:number,id=randomUUID()) {
 return tx.examVersion.create({data:{id,examId:s.exam,versionNumber:number,storageKey:`clinics/${s.a}/patients/${s.p}/exams/${s.exam}/versions/${id}`,originalFilename:'test.pdf',mimeType:'application/pdf',sizeBytes:100n,sha256:'a'.repeat(64),uploadedBy:s.actor}});
}
async function denied(tx:Tx,action:()=>Promise<unknown>) {
 await tx.$executeRawUnsafe('SAVEPOINT expected_failure');
 try {await assert.rejects(action);} finally {
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT expected_failure');await tx.$executeRawUnsafe('RELEASE SAVEPOINT expected_failure');
 }
}
async function check(name:string,run:(tx:Tx,s:Awaited<ReturnType<typeof setup>>)=>Promise<void>) {
 const rollback=new Error('TEST_ROLLBACK');
 try {await db.$transaction(async tx=>{const s=await setup(tx);await run(tx,s);throw rollback;},{timeout:20000});}
 catch(e) {if(e!==rollback) throw e;}
 console.log('PASS '+name);
}
async function main() {
 await check('tenant roles, activation and private records',async(tx,s)=>{
  await tx.userClinic.update({where:{userId_clinicId:{userId:s.actor,clinicId:s.b}},data:{isActive:false}});
  const memberships=await tx.userClinic.findMany({where:{userId:s.actor},orderBy:{clinicId:'asc'}});
  assert.equal(memberships.filter(m=>m.isActive).length,1);assert.notEqual(memberships[0].role,memberships[1].role);
  assert.notEqual((await tx.patient.findUniqueOrThrow({where:{id:s.p}})).firstName,(await tx.patient.findUniqueOrThrow({where:{id:s.q}})).firstName);
 });
 await check('cross-tenant exam rejected',async(tx,s)=>{
  await denied(tx,()=>tx.exam.create({data:{clinicId:s.b,patientId:s.p,examTypeId:s.type,title:'Cross',examDate:new Date(),createdBy:s.actor}}));
 });
 await check('historical read, no write, no physical patient deletion',async(tx,s)=>{
  await tx.userClinic.update({where:{userId_clinicId:{userId:s.owner,clinicId:s.a}},data:{isActive:false}});
  await tx.patient.update({where:{id:s.p},data:{deletedAt:new Date(),deletedBy:s.actor}});
  const r=await tx.$queryRaw<{read:boolean,write:boolean}[]>`SELECT can_read_patient(${s.owner}::uuid,${s.p}::uuid) AS read,can_write_patient(${s.owner}::uuid,${s.p}::uuid) AS write`;
  assert.equal(r[0].read,true);assert.equal(r[0].write,false);
  await denied(tx,()=>tx.patient.delete({where:{id:s.p}}));
  await denied(tx,()=>addVersion(tx,{...s,actor:s.owner},2));
 });
 await check('metadata, UUIDs, duplicates, immutability and publication',async(tx,s)=>{
  await denied(tx,()=>tx.$executeRawUnsafe("INSERT INTO users(id) VALUES('invalid-uuid')"));
  await denied(tx,()=>tx.$executeRawUnsafe('INSERT INTO users(id) VALUES(NULL)'));
  await denied(tx,()=>addVersion(tx,s,1));
  await denied(tx,()=>tx.examVersion.update({where:{id:s.version},data:{sha256:'bad'}}));
  for(const bad of [{sizeBytes:-1n},{sizeBytes:10000001n},{sha256:'bad'},{sha256:'G'.repeat(64)},{mimeType:'application/x-executable'},{versionNumber:0},{originalFilename:' '}]) {
   const id=randomUUID();
   await denied(tx,()=>tx.examVersion.create({data:{id,examId:s.exam,versionNumber:2,storageKey:`clinics/${s.a}/patients/${s.p}/exams/${s.exam}/versions/${id}`,originalFilename:'test.pdf',mimeType:'application/pdf',sizeBytes:10n,sha256:'a'.repeat(64),uploadedBy:s.actor,...bad}}));
  }
  await denied(tx,async()=>{await tx.exam.create({data:{clinicId:s.a,patientId:s.p,examTypeId:s.type,title:'No file',examDate:new Date(),createdBy:s.actor}});await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');});
 });
 await check('audit coherence, version FK and immutable history',async(tx,s)=>{
  await denied(tx,()=>tx.auditLog.create({data:{clinicId:s.a,actorId:s.actor,patientId:s.p,examId:s.exam,examVersionId:randomUUID(),action:'DOWNLOAD'}}));
  await denied(tx,()=>tx.auditLog.create({data:{clinicId:s.b,actorId:s.actor,patientId:s.p,examId:s.exam,examVersionId:s.version,action:'DOWNLOAD'}}));
  const log=await tx.auditLog.create({data:{clinicId:s.a,actorId:s.actor,patientId:s.p,examId:s.exam,examVersionId:s.version,action:'DOWNLOAD'}});
  await denied(tx,()=>tx.auditLog.update({where:{id:log.id},data:{metadata:{tampered:true}}}));
  await denied(tx,()=>tx.auditLog.delete({where:{id:log.id}}));
 });
 await check('purge preserves snapshots, tombstones and deletion jobs',async(tx,s)=>{
  const log=await tx.auditLog.create({data:{clinicId:s.a,actorId:s.actor,patientId:s.p,examId:s.exam,examVersionId:s.version,action:'DOWNLOAD'}});
  await denied(tx,()=>tx.exam.delete({where:{id:s.exam}}));
  await denied(tx,()=>tx.$executeRaw`SELECT purge_exam(${s.exam}::uuid,${s.actor}::uuid)`);
  await tx.exam.update({where:{id:s.exam},data:{deletedAt:new Date(),deletedBy:s.actor}});
  await denied(tx,()=>tx.$executeRaw`SELECT purge_exam(${s.exam}::uuid,${s.owner}::uuid)`);
  await tx.$executeRaw`SELECT purge_exam(${s.exam}::uuid,${s.actor}::uuid)`;
  const saved=await tx.auditLog.findUniqueOrThrow({where:{id:log.id}});
  assert.equal(saved.examId,null);assert.equal(saved.examVersionId,null);
  assert.equal(saved.historicalExamId,s.exam);assert.equal(saved.historicalVersionId,s.version);assert.ok(saved.fileMetadata);
  const job=await tx.storageDeletionJob.findUniqueOrThrow({where:{versionId:s.version}});
  await tx.storageDeletionJob.update({where:{id:job.id},data:{status:'FAILED',retryCount:1,lastError:'Simulated S3 outage',nextAttemptAt:new Date()}});
  assert.equal((await tx.storageDeletionJob.findUniqueOrThrow({where:{id:job.id}})).retryCount,1);
  assert.ok(await tx.syncChange.findFirst({where:{clinicId:s.a,entityId:s.exam,action:'DELETE'}}));
  assert.ok(await tx.syncChange.findFirst({where:{clinicId:s.a,entityId:s.version,action:'DELETE'}}));
 });
 await check('idempotency result replay and uniqueness',async(tx,s)=>{
  const operationId=randomUUID(),data={userId:s.owner,clinicId:s.a,operationId,operation:'CREATE_EXAM_WITH_VERSION' as const,requestHash:'b'.repeat(64),response:{examId:s.exam,versionId:s.version}};
  await tx.idempotencyRecord.create({data});await denied(tx,()=>tx.idempotencyRecord.create({data}));
  const replay=await tx.idempotencyRecord.findUniqueOrThrow({where:{userId_clinicId_operationId:{userId:s.owner,clinicId:s.a,operationId}}});
  assert.deepEqual(replay.response,data.response);
  assert.notEqual(replay.requestHash,'c'.repeat(64)); // API must return 409 for this changed hash.
 });
 await check('version changes emit parent first and timestamps advance',async(tx,s)=>{
  const before=await tx.exam.findUniqueOrThrow({where:{id:s.exam}});const v=await addVersion(tx,s,2);
  const after=await tx.exam.findUniqueOrThrow({where:{id:s.exam}});assert.ok(after.updatedAt>=before.updatedAt);
  const versionChange=await tx.syncChange.findFirstOrThrow({where:{clinicId:s.a,entityId:v.id}});
  const parent=await tx.syncChange.findFirstOrThrow({where:{clinicId:s.a,entityId:s.exam,revision:{lt:versionChange.revision}},orderBy:{revision:'desc'}});
  assert.equal((parent.payload as {latest_server_version:number}).latest_server_version,2);
 });
 await check('permission revisions and API role protections',async(tx,s)=>{
  const before=await tx.userClinic.findUniqueOrThrow({where:{userId_clinicId:{userId:s.owner,clinicId:s.a}}});
  await tx.patient.update({where:{id:s.p},data:{deletedAt:new Date(),deletedBy:s.actor}});
  const after=await tx.userClinic.findUniqueOrThrow({where:{userId_clinicId:{userId:s.owner,clinicId:s.a}}});assert.ok(after.permissionRevision>before.permissionRevision);
  await tx.$executeRawUnsafe('SET LOCAL ROLE wellq_app');
  await denied(tx,()=>tx.$executeRawUnsafe('DELETE FROM patients'));
  await denied(tx,()=>tx.$executeRawUnsafe('TRUNCATE audit_logs CASCADE'));
  await denied(tx,()=>tx.$executeRawUnsafe("UPDATE sync_changes SET payload='{}'"));
  await tx.$executeRawUnsafe('RESET ROLE');
 });
 // Committed, concurrent transactions on the disposable test database.
 const s=await db.$transaction(setup);
 const upload=()=>db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM clinics WHERE id=${s.a}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM exams WHERE id=${s.exam}::uuid FOR UPDATE`;
  const max=await tx.examVersion.aggregate({where:{examId:s.exam},_max:{versionNumber:true}});
  return addVersion(tx,s,max._max.versionNumber!+1);
 },{timeout:15000});
 const versions=await Promise.all([upload(),upload()]);assert.deepEqual(versions.map(v=>v.versionNumber).sort(),[2,3]);
 const revisions=await db.syncChange.findMany({where:{clinicId:s.a},orderBy:{revision:'asc'}});
 for(let i=1;i<revisions.length;i++) assert.equal(revisions[i].revision,revisions[i-1].revision+1n);
 console.log('PASS concurrent versions and committed clinic revisions');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
