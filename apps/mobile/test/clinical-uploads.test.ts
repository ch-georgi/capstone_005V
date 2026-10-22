const {Buffer:mockBuffer}=require("node:buffer");
import {enqueue,selectDocument,sendNext} from "../src/clinical/uploads";
import {exclusive} from "../src/clinical/database";
import {migrateClinicalDatabase} from "../../../database/sqlite/migrate-v3";
import {schema} from "../src/clinical/schema";
import {ApiError,Profile} from "../src/auth/types";
import {SessionManager} from "../src/auth/session";
import * as Picker from "expo-document-picker";
const {DatabaseSync}=require("node:sqlite");
const crypto=require("node:crypto");
const mockFiles=new Map<string,Uint8Array>();
jest.mock("../src/clinical/database",()=>({exclusive:jest.fn()}));
jest.mock("expo-document-picker",()=>({getDocumentAsync:jest.fn()}));
jest.mock("expo-crypto",()=>{const c=require("node:crypto");return {randomUUID:c.randomUUID,CryptoDigestAlgorithm:{SHA256:"sha256"},digest:async(_a:string,bytes:ArrayBuffer)=>{const b=c.createHash("sha256").update(mockBuffer.from(bytes)).digest();return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);},digestStringAsync:async(_a:string,s:string)=>c.createHash("sha256").update(s).digest("hex")};});
jest.mock("expo-file-system",()=>({Paths:{document:"file:///private"},Directory:class{uri:string;constructor(...p:any[]){this.uri=p.map(x=>typeof x==="string"?x:x.uri).join("/");}create(){}},File:class{uri:string;constructor(...p:any[]){this.uri=p.map(x=>typeof x==="string"?x:x.uri).join("/");}get exists(){return mockFiles.has(this.uri);}get size(){return mockFiles.get(this.uri)?.length??0;}create(){mockFiles.set(this.uri,new Uint8Array());}write(bytes:Uint8Array){mockFiles.set(this.uri,bytes);}async move(target:any){const old=this.uri;this.uri=target.uri;mockFiles.set(target.uri,mockFiles.get(old)!);mockFiles.delete(old);}async base64(){return mockBuffer.from(mockFiles.get(this.uri)!).toString("base64");}async bytes(){const data=mockFiles.get(this.uri);if(!data)throw new Error("missing");return data;}copy(target:any){mockFiles.set(target.uri,mockFiles.get(this.uri)!);}delete(){mockFiles.delete(this.uri);}}}));
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const profile={user:{id:uid(1)},clinic:{id:uid(2)},patientId:uid(3),access:"READ_WRITE"} as Profile;
let raw:any,manager:SessionManager,upload:jest.Mock;
beforeEach(async()=>{
 raw=new DatabaseSync(":memory:");const db={execAsync:async(s:string)=>raw.exec(s),runAsync:async(s:string,...a:any[])=>raw.prepare(s).run(...a),getAllAsync:async(s:string,...a:any[])=>raw.prepare(s).all(...a),getFirstAsync:async(s:string,...a:any[])=>raw.prepare(s).get(...a)};
 await migrateClinicalDatabase(db,schema);raw.prepare("INSERT INTO local_contexts VALUES(?,?,'PATIENT','1','READ_WRITE',?)").run(profile.user.id,profile.clinic.id,new Date().toISOString());
 (exclusive as jest.Mock).mockImplementation(work=>work(db));mockFiles.clear();mockFiles.set("file:///selected.pdf",new Uint8Array(mockBuffer.from("%PDF-test")));
 (Picker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:false,assets:[{uri:"file:///selected.pdf",name:"test.pdf"}]});
 upload=jest.fn().mockResolvedValue({});manager={upload,contextKey:()=>"session",canUseOffline:()=>true,getSnapshot:()=>({profile,offline:false})} as unknown as SessionManager;
});
afterEach(()=>raw.close());
it("handles cancellation and rejects unsupported content",async()=>{
 (Picker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({canceled:true});expect(await selectDocument()).toBeNull();mockFiles.set("file:///selected.pdf",new Uint8Array(mockBuffer.from("invalid")));await expect(selectDocument()).rejects.toThrow();
});
it("durably enqueues and retries exactly the same operation after a network failure",async()=>{
 const selected=(await selectDocument())!;const id=await enqueue(profile,selected,{title:"Test",examDate:"2026-10-22",examTypeId:uid(6)});
 const pending=raw.prepare("SELECT * FROM sync_queue").get();expect(pending.status).toBe("PENDING");expect(mockFiles.has(pending.file_uri)).toBe(true);
 expect(pending.request_hash).toHaveLength(64);upload.mockRejectedValueOnce(new ApiError(0,"NETWORK_ERROR","No network"));expect(await sendNext(manager)).toBe(false);
 raw.exec("UPDATE sync_queue SET next_attempt_at=NULL");expect(await sendNext(manager)).toBe(true);
 expect(upload.mock.calls[0][0]).toEqual(upload.mock.calls[1][0]);expect(upload.mock.calls[1][0].operationId).toBe(id);
 expect(raw.prepare("SELECT status,retry_count FROM sync_queue").get()).toMatchObject({status:"COMPLETED",retry_count:2});expect(raw.prepare("SELECT count(*) n FROM local_file_cleanup").get().n).toBe(1);
 const envelope=upload.mock.calls[0][0];const normalize=(x:any):any=>x&&typeof x==="object"?Object.fromEntries(Object.entries(x).sort().map(([k,v])=>[k,normalize(v)])):x;
 expect(pending.request_hash).toBe(crypto.createHash("sha256").update(JSON.stringify(normalize(envelope))).digest("hex"));
});
it("marks a missing pending file as a permanent failure without uploading",async()=>{
 const file=(await selectDocument())!;await enqueue(profile,file,{title:"Test",examDate:"2026-10-22",examTypeId:uid(6)});mockFiles.clear();expect(await sendNext(manager)).toBe(false);expect(upload).not.toHaveBeenCalled();expect(raw.prepare("SELECT status,is_retryable FROM sync_queue").get()).toMatchObject({status:"FAILED",is_retryable:0});
});
it("does not enqueue new versions for an unconfirmed exam",async()=>{await expect(enqueue(profile,(await selectDocument())!,{examId:uid(99)})).rejects.toThrow();expect(raw.prepare("SELECT count(*) n FROM sync_queue").get().n).toBe(0);});

it("keeps verified offline copies and removes a corrupted copy reference",async()=>{
 const {saveOffline,offlineCopy}=require("../src/clinical/documents");
 const now=new Date().toISOString(),exam=uid(4),version=uid(5);
 raw.prepare("INSERT INTO local_patients(owner_user_id,clinic_id,id,user_id,first_name,last_name,date_of_birth,is_active,updated_at) VALUES(?,?,?,?,?,?,?,1,?)").run(profile.user.id,profile.clinic.id,profile.patientId,profile.user.id,"Test","Patient","1990-01-01",now);
 raw.prepare("INSERT INTO local_exams(owner_user_id,clinic_id,id,patient_id,exam_type_code,exam_type_name,title,exam_date,latest_server_version,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?)").run(profile.user.id,profile.clinic.id,exam,profile.patientId,"LAB","Lab","Test","2026-10-22",now);
 const bytes=mockFiles.get("file:///selected.pdf")!,sha256=crypto.createHash("sha256").update(bytes).digest("hex");
 raw.prepare("INSERT INTO local_exam_versions(owner_user_id,clinic_id,id,exam_id,version_number,original_filename,mime_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,1,'test.pdf','application/pdf',?,?,?)").run(profile.user.id,profile.clinic.id,version,exam,bytes.length,sha256,now);
 (manager as any).file=jest.fn().mockResolvedValue({bytes,mimeType:"application/pdf"});
 const v={id:version,mimeType:"application/pdf",sizeBytes:bytes.length,sha256} as any;
 await saveOffline(manager,exam,v);const copy=await offlineCopy(manager,v);expect(copy).not.toBeNull();expect(raw.prepare("SELECT current_version FROM local_exams").get().current_version).toBe(1);
 mockFiles.set(copy!.uri,new Uint8Array([0]));await expect(offlineCopy(manager,v)).rejects.toThrow();expect(raw.prepare("SELECT local_file_uri FROM local_exam_versions").get().local_file_uri).toBeNull();expect(raw.prepare("SELECT current_version FROM local_exams").get().current_version).toBeNull();
});

it("pauses an uncertain upload after forced context change without exhausting its retries",async()=>{
 await enqueue(profile,(await selectDocument())!,{title:"Test",examDate:"2026-10-22",examTypeId:uid(6)});
 upload.mockRejectedValueOnce(new ApiError(409,"CONTEXT_CHANGED","Session changed"));
 expect(await sendNext(manager)).toBe(false);
 expect(raw.prepare("SELECT status,pause_reason,retry_count FROM sync_queue").get()).toMatchObject({status:"PENDING",pause_reason:"AUTH",retry_count:0});
});
