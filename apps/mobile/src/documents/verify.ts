import * as Crypto from "expo-crypto";
import {ExamVersion} from "../exams/types";
export async function verifyDocument(bytes:Uint8Array,mime:string,version:Pick<ExamVersion,"mimeType"|"sizeBytes"|"sha256">){
 if(!["application/pdf","image/jpeg","image/png"].includes(mime)||mime!==version.mimeType||bytes.length!==version.sizeBytes||bytes.length===0||bytes.length>10000000)throw new Error("El documento recibido no coincide con su registro.");
 const hash=Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(bytes).buffer))).map(value=>value.toString(16).padStart(2,"0")).join("");
 if(hash!==version.sha256)throw new Error("No se pudo verificar la integridad del documento.");
 const signature=mime==="application/pdf"?String.fromCharCode(...bytes.slice(0,5))==="%PDF-":mime==="image/png"?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!signature)throw new Error("El formato del documento no es válido.");
}
