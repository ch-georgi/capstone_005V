import {exclusive} from "../src/clinical/database";
import {synchronize,cachedResource} from "../src/clinical/sync";
import {migrateClinicalDatabase} from "../../../database/sqlite/migrate-v3";
import {schema} from "../src/clinical/schema";
import {SessionManager} from "../src/auth/session";
jest.mock("../src/clinical/database",()=>({exclusive:jest.fn(),notifyClinical:jest.fn()}));
const {DatabaseSync}=require("node:sqlite");
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const owner=id(1),clinic=id(2),patient=id(3),exam=id(4),version=id(5),now="2026-10-22T12:00:00.000Z";
let raw:any,db:any,request:jest.Mock,manager:SessionManager;
const patientPayload={id:patient,userId:owner,clinicId:clinic,firstName:"Test",lastName:"Patient",dateOfBirth:"1990-01-01",email:null,phone:null,medicalRecordNumber:null,isActive:true,deletedAt:null,updatedAt:now};
const v={id:version,examId:exam,versionNumber:1,originalFilename:"test.pdf",mimeType:"application/pdf",sizeBytes:10,sha256:"a".repeat(64),createdAt:now,uploadedBy:{id:owner,displayName:"Test"}};
const e={id:exam,patientId:patient,title:"Test",examDate:"2026-10-20",professionalName:null,notes:null,examType:{id:id(6),code:"LAB",name:"Lab"},versions:[v],versionCount:1,latestVersion:v,createdAt:now,updatedAt:now,createdBy:{id:owner,displayName:"Test"}};
const snapshot=()=>({mode:"SNAPSHOT",access:"READ_WRITE",permissionRevision:"1",revision:"1",nextCursor:"cursor1",hasMore:false,changes:[{entity:"PATIENT",entityId:patient,patientId:patient,action:"UPSERT",payload:patientPayload},{entity:"EXAM",entityId:exam,patientId:patient,action:"UPSERT",payload:e},{entity:"EXAM_VERSION",entityId:version,patientId:patient,action:"UPSERT",payload:v}]});
beforeEach(async()=>{
 raw=new DatabaseSync(":memory:");db={execAsync:async(s:string)=>raw.exec(s),runAsync:async(s:string,...args:any[])=>raw.prepare(s).run(...args),getAllAsync:async(s:string,...args:any[])=>raw.prepare(s).all(...args),getFirstAsync:async(s:string,...args:any[])=>raw.prepare(s).get(...args)};
 await migrateClinicalDatabase(db,schema);(exclusive as jest.Mock).mockImplementation(work=>work(db));
 request=jest.fn(async(path:string)=>path==="/exam-types"?{items:[e.examType]}:snapshot());manager={request,contextKey:()=>"session",getSnapshot:()=>({profile:{user:{id:owner},clinic:{id:clinic},patientId:patient},offline:false})} as unknown as SessionManager;
});
afterEach(()=>raw.close());
it("persists snapshot and reconstructs a filtered list and detail",async()=>{
 await synchronize(manager);expect((await cachedResource<any>(manager,`/patients/${patient}/exams?limit=20&offset=0`)).items[0].title).toBe("Test");expect((await cachedResource<any>(manager,`/exams/${exam}`)).versions[0].sha256).toBe(v.sha256);
 expect((await cachedResource<any>(manager,`/patients/${patient}/exams?examTypeId=other`)).total).toBe(0);
});
it("preserves a verified file when replacing an unchanged snapshot",async()=>{
 await synchronize(manager);raw.prepare("UPDATE local_exam_versions SET local_file_uri='file:///verified.pdf',verified_at=?").run(now);await synchronize(manager);expect(raw.prepare("SELECT local_file_uri FROM local_exam_versions").get().local_file_uri).toBe("file:///verified.pdf");
});
it("rolls back entities and cursor if a page violates a foreign key",async()=>{
 await synchronize(manager);request.mockImplementation(async path=>{if(path==="/exam-types")return {items:[]};const page=snapshot();page.nextCursor="broken";page.changes[0].payload={...patientPayload,firstName:"Changed"};page.changes[2].payload={...v,examId:id(90),id:id(91)};page.changes[2].entityId=id(91);return page;});
 await expect(synchronize(manager)).rejects.toThrow();expect(raw.prepare("SELECT first_name FROM local_patients").get().first_name).toBe("Test");expect(raw.prepare("SELECT cursor FROM sync_metadata").get().cursor).toBe("cursor1");
});
it("tombstones remove metadata and schedule verified file cleanup",async()=>{
 await synchronize(manager);raw.prepare("UPDATE local_exam_versions SET local_file_uri='file:///verified.pdf',verified_at=?").run(now);
 request.mockImplementation(async path=>path==="/exam-types"?{items:[]}:{...snapshot(),mode:"DELTA",revision:"2",nextCursor:"cursor2",changes:[{entity:"EXAM",entityId:exam,patientId:patient,action:"DELETE",payload:{}}]});
 await synchronize(manager);expect(raw.prepare("SELECT count(*) n FROM local_exams").get().n).toBe(0);expect(raw.prepare("SELECT count(*) n FROM local_file_cleanup").get().n).toBe(1);
});
it("never serves cached records from another owner",async()=>{await synchronize(manager);const other={...manager,getSnapshot:()=>({profile:{user:{id:id(99)},clinic:{id:clinic},patientId:patient}})} as unknown as SessionManager;await expect(cachedResource(other,`/exams/${exam}`)).rejects.toThrow();});
