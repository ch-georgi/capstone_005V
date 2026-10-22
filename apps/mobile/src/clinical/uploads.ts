import * as Picker from "expo-document-picker";
import {Directory,File,Paths} from "expo-file-system";
import * as Crypto from "expo-crypto";
import {exclusive} from "./database";
import {claimUpload,settleUpload} from "../../../../database/sqlite/operations";
import {ApiError,Profile} from "../auth/types";
import {SessionManager} from "../auth/session";
import {verifyDocument} from "../documents/verify";
export interface SelectedDocument{uri:string;filename:string;mimeType:string;sizeBytes:number;sha256:string}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,"0")).join("");
function canonical(value:unknown):string{
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 return "{"+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")+"}";
}
export async function selectDocument():Promise<SelectedDocument|null>{
 const result=await Picker.getDocumentAsync({type:["application/pdf","image/jpeg","image/png"],multiple:false,copyToCacheDirectory:true});
 if(result.canceled)return null;
 const asset=result.assets[0],file=new File(asset.uri);
 if(file.size<1||file.size>10000000)throw new Error("El archivo debe tener entre 1 y 10.000.000 bytes.");
 const bytes=await file.bytes();
 const mimeType=bytes[0]===255&&bytes[1]===216?"image/jpeg":bytes[0]===137&&bytes[1]===80?"image/png":"application/pdf";
 const sha256=hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(bytes).buffer));
 await verifyDocument(bytes,mimeType,{mimeType,sizeBytes:bytes.length,sha256});
 return {uri:file.uri,filename:asset.name,mimeType,sizeBytes:bytes.length,sha256};
}
export async function enqueue(profile:Profile,file:SelectedDocument,input:{examId?:string;title?:string;examDate?:string;examTypeId?:string;professionalName?:string;notes?:string}){
 if(!profile.patientId||profile.access!=="READ_WRITE")throw new Error("Tu sesión no permite registrar cargas.");
 const operationId=Crypto.randomUUID(),examId=input.examId??Crypto.randomUUID(),versionId=Crypto.randomUUID();
 const payload={schemaVersion:1,patientId:profile.patientId,examId,versionId,...(input.examId?{}:Object.fromEntries(Object.entries(input).filter(([k,v])=>k!=="examId"&&v!==undefined&&v!=="")))};
 const envelope={operationId,clinicId:profile.clinic.id,operation:input.examId?"UPLOAD_VERSION":"CREATE_EXAM_WITH_VERSION",payload,filename:file.filename,mimeType:file.mimeType,sizeBytes:file.sizeBytes,sha256:file.sha256};
 const root=new Directory(Paths.document,"wellq-pending",profile.user.id,profile.clinic.id);root.create({idempotent:true,intermediates:true});
 const target=new File(root,operationId);
 try{
  const requestHash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,canonical(envelope));
  const now=new Date().toISOString();
  await exclusive(async db=>{
   await new File(file.uri).copy(target);
   await verifyDocument(await target.bytes(),file.mimeType,file);
   const ctx=await db.getFirstAsync<{access_state:string}>("SELECT access_state FROM local_contexts WHERE owner_user_id=? AND clinic_id=?",profile.user.id,profile.clinic.id);
   if(ctx?.access_state!=="READ_WRITE")throw new Error("Conéctate para sincronizar primero tu ficha y permisos.");
   if(input.examId&&!await db.getFirstAsync("SELECT id FROM local_exams WHERE owner_user_id=? AND clinic_id=? AND id=?",profile.user.id,profile.clinic.id,input.examId))throw new Error("El examen debe estar confirmado y sincronizado.");
   await db.runAsync("INSERT INTO sync_queue(owner_user_id,clinic_id,id,patient_id,exam_id,version_id,operation,payload,file_uri,sha256,request_hash,mime_type,size_bytes,original_filename,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",profile.user.id,profile.clinic.id,operationId,profile.patientId!,examId,versionId,envelope.operation,JSON.stringify(payload),target.uri,file.sha256,requestHash,file.mimeType,file.sizeBytes,file.filename,now,now);
  });return operationId;
 }catch(error){if(target.exists)target.delete();throw error;}
}
interface Queued{ id:string;owner_user_id:string;clinic_id:string;operation:string;payload:string;file_uri:string;original_filename:string;mime_type:string;size_bytes:number;sha256:string;processing_until:string;request_hash:string }
const active=new WeakMap<SessionManager,Promise<boolean>>();
export function sendNext(manager:SessionManager):Promise<boolean>{
 const existing=active.get(manager);if(existing)return existing;
 const work=(async()=>{
  const {profile,offline}=manager.getSnapshot();if(!profile||offline||profile.access!=="READ_WRITE")return false;
  const key=manager.contextKey();
  const row=await exclusive(db=>claimUpload(db,profile.user.id,profile.clinic.id,new Date())) as Queued|null;
  if(!row)return false;
  try{
   if(key!==manager.contextKey())throw new ApiError(401,"CONTEXT_CHANGED","La sesión cambió.");
   const file=new File(row.file_uri);if(!file.exists)throw new ApiError(400,"LOCAL_FILE_MISSING","El archivo pendiente ya no existe.");
   await verifyDocument(await file.bytes(),row.mime_type,{mimeType:row.mime_type,sizeBytes:row.size_bytes,sha256:row.sha256});
   const envelope={operationId:row.id,clinicId:row.clinic_id,operation:row.operation,payload:JSON.parse(row.payload),filename:row.original_filename,mimeType:row.mime_type,sizeBytes:row.size_bytes,sha256:row.sha256};
   const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,canonical(envelope));if(hash!==row.request_hash)throw new ApiError(400,"LOCAL_REQUEST_CHANGED","La operación pendiente cambió.");
   await manager.upload(envelope,row.file_uri,row.original_filename,row.mime_type);
   await exclusive(db=>settleUpload(db,row.owner_user_id,row.clinic_id,row.id,row.processing_until,{kind:"SUCCESS"},new Date()));return true;
  }catch(error){
   const status=error instanceof ApiError?error.status:-1;
   const contextChanged=error instanceof ApiError&&error.code==="CONTEXT_CHANGED";
   const kind=status===401||contextChanged?"AUTH":status===403?"PERMISSION":status===0||status===429||status>=500?"TRANSIENT":"PERMANENT";
   await exclusive(db=>settleUpload(db,row.owner_user_id,row.clinic_id,row.id,row.processing_until,{kind,error:error instanceof Error?error.message:"No se pudo enviar."},new Date()));return false;
  }
 })().finally(()=>active.delete(manager));active.set(manager,work);return work;
}

export async function awaitActiveUpload(manager:SessionManager){await active.get(manager);}
