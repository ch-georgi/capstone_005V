import {ExamVersion} from "../exams/types";
import {verifyDocument} from "./verify";
export function clearTemporaryDocuments(){}
export async function temporaryDocument(bytes:Uint8Array,mime:string,version:ExamVersion){await verifyDocument(bytes,mime,version);const blob=new Blob([new Uint8Array(bytes)],{type:mime});const uri=URL.createObjectURL(blob);return {uri,base64:()=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(blob);}),remove:()=>URL.revokeObjectURL(uri)};}
export async function exportDocument(bytes:Uint8Array,mime:string,version:ExamVersion){const file=await temporaryDocument(bytes,mime,version);try{const a=document.createElement("a");a.href=file.uri;a.download=version.originalFilename;a.click();return true;}finally{setTimeout(file.remove,1000);}}
