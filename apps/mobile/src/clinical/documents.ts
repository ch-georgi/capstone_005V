import * as Crypto from "expo-crypto";
import {Directory,File,Paths} from "expo-file-system";
import {SessionManager} from "../auth/session";
import {ExamVersion} from "../exams/types";
import {verifyDocument} from "../documents/verify";
import {exclusive} from "./database";
export async function offlineCopy(manager:SessionManager,version:ExamVersion){
 const {profile}=manager.getSnapshot();if(!profile||!manager.canUseOffline())throw new Error("Inicia sesión.");
 const row=await exclusive(db=>db.getFirstAsync<{local_file_uri:string|null}>("SELECT v.local_file_uri FROM local_exam_versions v JOIN local_contexts c USING(owner_user_id,clinic_id) WHERE v.owner_user_id=? AND v.clinic_id=? AND v.id=? AND c.access_state<>'REVOKED'",profile.user.id,profile.clinic.id,version.id));
 if(!row?.local_file_uri)return null;
 try{const file=new File(row.local_file_uri);await verifyDocument(await file.bytes(),version.mimeType,version);return {uri:file.uri,base64:()=>file.base64(),remove:()=>{}};}
 catch{await removeOffline(manager,version.id);throw new Error("La copia local falta o está dañada. Descárgala nuevamente con conexión.");}
}
export async function saveOffline(manager:SessionManager,examId:string,version:ExamVersion){
 const {profile,offline}=manager.getSnapshot();if(!profile||offline)throw new Error("Conectate para guardar esta version.");
 const key=manager.contextKey(),result=await manager.file(`/exams/${examId}/versions/${version.id}/view`);
 await verifyDocument(result.bytes,result.mimeType,version);
 const root=new Directory(Paths.document,"wellq-offline",profile.user.id,profile.clinic.id);
 const nonce=Crypto.randomUUID();
 const temporary=new File(root,`${version.id}-${nonce}.partial`);
 const target=new File(root,`${version.id}-${nonce}`);
 try{
  await exclusive(async db=>{
   if(key!==manager.contextKey())throw new Error("La sesion cambio.");
   root.create({idempotent:true,intermediates:true});temporary.create();temporary.write(result.bytes);
   await verifyDocument(await temporary.bytes(),version.mimeType,version);
   await temporary.move(target);
   if(key!==manager.contextKey())throw new Error("La sesion cambio.");
   const updated=await db.runAsync("UPDATE local_exam_versions SET local_file_uri=?,verified_at=? WHERE owner_user_id=? AND clinic_id=? AND id=?",target.uri,new Date().toISOString(),profile.user.id,profile.clinic.id,version.id);
   if(!updated.changes)throw new Error("Sincroniza el examen antes de guardarlo.");
  });
 }catch(error){if(temporary.exists)temporary.delete();if(target.exists)target.delete();throw error;}
}
export async function removeOffline(manager:SessionManager,versionId?:string){
 const {profile}=manager.getSnapshot();if(!profile)return;
 await exclusive(db=>db.runAsync("UPDATE local_exam_versions SET local_file_uri=NULL,verified_at=NULL WHERE owner_user_id=? AND clinic_id=?"+(versionId?" AND id=?":""),profile.user.id,profile.clinic.id,...(versionId?[versionId]:[])));
 await cleanFiles();
}
export async function cleanFiles(){
 await exclusive(async db=>{
  for(const row of await db.getAllAsync<{owner_user_id:string;clinic_id:string;file_uri:string}>("SELECT * FROM local_file_cleanup")){
   if(await db.getFirstAsync("SELECT id FROM local_exam_versions WHERE local_file_uri=? UNION ALL SELECT id FROM sync_queue WHERE file_uri=? AND status<>'COMPLETED'",row.file_uri,row.file_uri))continue;
   try{const allowed=[new Directory(Paths.document,"wellq-offline").uri,new Directory(Paths.document,"wellq-pending").uri];if(!allowed.some(root=>row.file_uri.startsWith(root.endsWith("/")?root:root+"/")))continue;const file=new File(row.file_uri);if(file.exists)file.delete();await db.runAsync("DELETE FROM local_file_cleanup WHERE owner_user_id=? AND clinic_id=? AND file_uri=?",row.owner_user_id,row.clinic_id,row.file_uri);}catch{/* Retry the cleanup later. */}
  }
 });
}

// Called once at startup, before uploads or downloads can prepare files.
export async function cleanOrphanedFiles(){
 await exclusive(async db=>{
  const rows=await db.getAllAsync<{uri:string}>("SELECT file_uri uri FROM sync_queue UNION SELECT local_file_uri uri FROM local_exam_versions WHERE local_file_uri IS NOT NULL UNION SELECT file_uri uri FROM legacy_queue_quarantine WHERE file_uri IS NOT NULL");
  const referenced=new Set(rows.map(r=>r.uri));
  const scan=(directory:Directory)=>{if(!directory.exists)return;for(const item of directory.list()){if(item instanceof Directory)scan(item);else if(!referenced.has(item.uri))item.delete();}};
  scan(new Directory(Paths.document,"wellq-offline"));scan(new Directory(Paths.document,"wellq-pending"));
 });
}
