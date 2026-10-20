import {Directory,File,Paths} from "expo-file-system";
import * as Legacy from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import {ExamVersion} from "../exams/types";
import {verifyDocument} from "./verify";
const root=()=>new Directory(Paths.cache,"wellq-documents");
export function clearTemporaryDocuments(){try{const dir=root();if(dir.exists)dir.delete();}catch{ /* A later cleanup retries inaccessible temporary files. */ }}
export async function temporaryDocument(bytes:Uint8Array,mime:string,version:ExamVersion){
 await verifyDocument(bytes,mime,version);
 const dir=root();dir.create({idempotent:true,intermediates:true});
 const file=new File(dir,`${Crypto.randomUUID()}.${mime==="application/pdf"?"pdf":mime==="image/png"?"png":"jpg"}`);file.create();file.write(bytes);
 return {uri:file.uri,base64:()=>file.base64(),remove:()=>{try{if(file.exists)file.delete();}catch{ /* Startup cleanup retries. */ }}};
}
export async function exportDocument(bytes:Uint8Array,mime:string,version:ExamVersion){
 const temp=await temporaryDocument(bytes,mime,version);
 try{const picked=await Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync();if(!picked.granted)return false;
 const name=version.originalFilename.replace(/[\\/\u0000-\u001f]/g,"_");
 const uri=await Legacy.StorageAccessFramework.createFileAsync(picked.directoryUri,name,mime);
 await Legacy.writeAsStringAsync(uri,await temp.base64(),{encoding:Legacy.EncodingType.Base64});return true;
 }finally{temp.remove();}
}
