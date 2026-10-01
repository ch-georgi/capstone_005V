import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {migrateLocalDatabase,SQLiteAdapter} from '../sqlite/migrate';
import {claimUpload,settleUpload,applySyncPage,applyTombstone,retryDelayMs} from '../sqlite/operations';
import {signCursor,verifyCursor,uploadRequestHash} from '../contracts/security';
const {DatabaseSync}=require('node:sqlite');
const schema=readFileSync(resolve(__dirname,'../sqlite_mobile_schema.sql'),'utf8');
const uid=(n:number)=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const now=new Date('2026-10-01T12:00:00.000Z');
function adapter() {
 const raw=new DatabaseSync(':memory:');
 const db:SQLiteAdapter={execAsync:async(sql)=>raw.exec(sql),getAllAsync:async<T>(sql:string,...p:any[])=>raw.prepare(sql).all(...p) as T[],runAsync:async(sql,...p:any[])=>raw.prepare(sql).run(...p)};
 return {db,raw};
}
function context(raw:any,owner=uid(1),clinic=uid(2)) {
 raw.prepare("INSERT INTO local_contexts VALUES(?,?,'PATIENT','1','READ_WRITE',?)").run(owner,clinic,now.toISOString());
}
function queue(raw:any,owner=uid(1),clinic=uid(2),id=uid(50)) {
 const payload=JSON.stringify({schemaVersion:1,patientId:uid(3),examId:uid(4),versionId:uid(51),title:'Test',examDate:'2026-09-01',examTypeId:uid(60)});
 raw.prepare('INSERT INTO sync_queue(owner_user_id,clinic_id,id,patient_id,exam_id,version_id,operation,payload,file_uri,sha256,request_hash,mime_type,size_bytes,original_filename,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?)').run(owner,clinic,id,uid(3),uid(4),uid(51),'CREATE_EXAM_WITH_VERSION',payload,'file:///private/pending.pdf','a'.repeat(64),'b'.repeat(64),'application/pdf',10,'test.pdf',now.toISOString(),now.toISOString());
}
test('TypeScript migrator: fresh, repeated and legacy quarantine',async()=>{
 const {db,raw}=adapter();await migrateLocalDatabase(db,schema);await migrateLocalDatabase(db,schema);assert.equal(raw.prepare('PRAGMA user_version').get().user_version,2);raw.close();
 const legacy=adapter();legacy.raw.exec(readFileSync(resolve(__dirname,'fixtures/sqlite_v1.sql'),'utf8'));
 legacy.raw.exec("INSERT INTO sync_queue VALUES('legacy','CREATE_EXAM','exam','old','broken','file:///pending','PENDNG',-1,NULL,'bad','bad')");
 await migrateLocalDatabase(legacy.db,schema);
 const row=legacy.raw.prepare('SELECT * FROM legacy_queue_quarantine').get();assert.equal(JSON.parse(row.raw_record).payload.value,'broken');assert.equal(row.file_uri,'file:///pending');
 assert.equal(legacy.raw.prepare('SELECT count(*) AS n FROM sync_queue').get().n,0);legacy.raw.close();
});
test('TypeScript migration rolls back without losing pending data',async()=>{
 const {db,raw}=adapter();raw.exec(readFileSync(resolve(__dirname,'fixtures/sqlite_v1.sql'),'utf8'));
 raw.exec("INSERT INTO sync_queue VALUES('legacy','CREATE_EXAM','exam','old','broken','file:///pending','PENDING',0,NULL,'bad','bad');CREATE TRIGGER queue_initial_state AFTER INSERT ON sync_queue BEGIN SELECT 1; END;");
 await assert.rejects(migrateLocalDatabase(db,schema));assert.equal(raw.prepare('SELECT count(*) n FROM sync_queue').get().n,1);assert.equal(raw.prepare('PRAGMA user_version').get().user_version,0);raw.close();
});
test('Claims isolate owners; expired processing recovers; stale workers cannot acknowledge',async()=>{
 const {db,raw}=adapter();await migrateLocalDatabase(db,schema);context(raw);context(raw,uid(9));queue(raw);queue(raw,uid(9),uid(2),uid(59));
 const claimed:any=await claimUpload(db,uid(1),uid(2),now);assert.equal(claimed.owner_user_id,uid(1));
 assert.equal(raw.prepare('SELECT status FROM sync_queue WHERE owner_user_id=?').get(uid(9)).status,'PENDING');
 const later=new Date(now.getTime()+300001),recovered:any=await claimUpload(db,uid(1),uid(2),later);assert.equal(recovered.id,claimed.id);assert.notEqual(recovered.processing_until,claimed.processing_until);
 await assert.rejects(settleUpload(db,uid(1),uid(2),claimed.id,claimed.processing_until,{kind:'SUCCESS'},later));
 await settleUpload(db,uid(1),uid(2),recovered.id,recovered.processing_until,{kind:'TRANSIENT',error:'network'},later);
 assert.equal(raw.prepare('SELECT retry_count FROM sync_queue WHERE owner_user_id=?').get(uid(1)).retry_count,2);
 assert.equal(await claimUpload(db,uid(1),uid(2),later),null);raw.close();
});
test('Authorization pauses and completed upload schedules cleanup',async()=>{
 const {db,raw}=adapter();await migrateLocalDatabase(db,schema);context(raw);queue(raw);
 const q:any=await claimUpload(db,uid(1),uid(2),now);await settleUpload(db,uid(1),uid(2),q.id,q.processing_until,{kind:'AUTH',error:'expired'},now);
 assert.equal(await claimUpload(db,uid(1),uid(2),now),null);
 raw.exec('UPDATE sync_queue SET pause_reason=NULL');const resumed:any=await claimUpload(db,uid(1),uid(2),now);
 await settleUpload(db,uid(1),uid(2),resumed.id,resumed.processing_until,{kind:'SUCCESS'},now);
 assert.equal(raw.prepare('SELECT count(*) n FROM local_file_cleanup').get().n,1);raw.close();
});
test('Sync page and cursor commit atomically and support replay',async()=>{
 const {db,raw}=adapter();await migrateLocalDatabase(db,schema);context(raw);
 await applySyncPage(db,uid(1),uid(2),'cursor-1','1',now.toISOString(),async()=>{});
 await assert.rejects(applySyncPage(db,uid(1),uid(2),'cursor-2','2',now.toISOString(),async()=>{await db.runAsync("UPDATE local_contexts SET access_state='REVOKED'");throw new Error('interrupted');}));
 assert.equal(raw.prepare('SELECT cursor FROM sync_metadata').get().cursor,'cursor-1');assert.equal(raw.prepare('SELECT access_state FROM local_contexts').get().access_state,'READ_WRITE');
 await applySyncPage(db,uid(1),uid(2),'cursor-2','2',now.toISOString(),async()=>{});await applySyncPage(db,uid(1),uid(2),'cursor-2','2',now.toISOString(),async()=>{});raw.close();
});
test('Signed cursor rejects tampering and other tenants; hashes ignore key order',()=>{
 const secret=Buffer.alloc(32,7),scope={userId:uid(1),clinicId:uid(2),permissionRevision:'1'};
 const signed=signCursor({...scope,version:1,afterRevision:'1',throughRevision:'20'},secret);assert.equal(verifyCursor(signed,secret,scope).throughRevision,'20');
 assert.throws(()=>verifyCursor(signed+'a',secret,scope));assert.throws(()=>verifyCursor(signed,secret,{...scope,clinicId:uid(9)}));assert.throws(()=>verifyCursor(signed,secret,{...scope,permissionRevision:'2'}));
 const req:any={operationId:uid(50),clinicId:uid(2),operation:'UPLOAD_VERSION',payload:{schemaVersion:1,patientId:uid(3),examId:uid(4),versionId:uid(51)},filename:'test.pdf',mimeType:'application/pdf',sizeBytes:10,sha256:'a'.repeat(64)};
 assert.equal(uploadRequestHash(req),uploadRequestHash({...req,payload:{versionId:uid(51),examId:uid(4),patientId:uid(3),schemaVersion:1}}));assert.notEqual(uploadRequestHash(req),uploadRequestHash({...req,sizeBytes:11}));
 assert.equal(retryDelayMs(1),5000);assert.equal(retryDelayMs(8),300000);
});

test('Tombstone removes downloads and blocks pending upload, preserving original payload',async()=>{
 const {db,raw}=adapter();await migrateLocalDatabase(db,schema);context(raw);queue(raw);
 raw.prepare('INSERT INTO local_patients(owner_user_id,clinic_id,id,user_id,first_name,last_name,date_of_birth,is_active,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(uid(1),uid(2),uid(3),uid(1),'Ana','Test','2000-01-01',1,now.toISOString());
 raw.prepare('INSERT INTO local_exams(owner_user_id,clinic_id,id,patient_id,exam_type_code,exam_type_name,title,exam_date,latest_server_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(1),uid(2),uid(4),uid(3),'LAB','Laboratorio','Test','2026-09-01',1,now.toISOString());
 raw.prepare('INSERT INTO local_exam_versions(owner_user_id,clinic_id,id,exam_id,version_number,original_filename,mime_type,size_bytes,sha256,local_file_uri,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(uid(1),uid(2),uid(11),uid(4),1,'test.pdf','application/pdf',10,'a'.repeat(64),'file:///private/v1.pdf',now.toISOString(),now.toISOString());
 const payload=raw.prepare('SELECT payload FROM sync_queue').get().payload;
 await applySyncPage(db,uid(1),uid(2),'cursor-2','2',now.toISOString(),()=>applyTombstone(db,uid(1),uid(2),'EXAM',uid(4),now.toISOString()));
 assert.equal(raw.prepare('SELECT count(*) n FROM local_exam_versions').get().n,0);assert.equal(raw.prepare('SELECT count(*) n FROM local_file_cleanup').get().n,1);
 const pending=raw.prepare('SELECT * FROM sync_queue').get();assert.equal(pending.payload,payload);assert.equal(pending.status,'FAILED');assert.equal(pending.is_retryable,0);
 assert.equal(await claimUpload(db,uid(1),uid(2),now),null);raw.close();
});
