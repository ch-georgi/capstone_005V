const {randomUUID,createHash}=require("node:crypto");
const {readFileSync,mkdirSync,writeFileSync}=require("node:fs");
const {resolve}=require("node:path");
if(process.env.WELLQ_SYNTHETIC_TESTS!=="1")throw new Error("Configura WELLQ_SYNTHETIC_TESTS=1 para usar solo cuentas y archivos ficticios.");
const root=resolve(__dirname,"../../..");
const base=(process.env.SMOKE_API_URL??"http://localhost:3102/api/v1").replace(/\/$/,"");
const email=process.env.SMOKE_EMAIL??"patient2@example.com", password=process.env.SMOKE_PASSWORD;
if(!password)throw new Error("Falta SMOKE_PASSWORD");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const id=new Date().toISOString().replace(/[-:.]/g,"");
const report={date:new Date().toISOString(),apiUrl:base,runId:id,files:[]};
let refresh;
const check=(condition,message)=>{if(!condition)throw new Error(message);};
async function json(path,body,token,method){const response=await fetch(base+path,{method:method??(body?"POST":"GET"),headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json().catch(()=>null);check(response.ok,`${path}: HTTP ${response.status} ${value?.code??""}`);return value;}
async function login(mail=email){const value=await json("/auth/mobile/login",{email:mail,password});if(value.status!=="AUTHENTICATED")throw new Error("Se requiere cuenta de una clínica para este smoke");return value.session;}
(async()=>{
 try{
 let session=await login();refresh=session.refreshToken;const profile=session.profile;
 const patientId=profile.patientId??process.env.SMOKE_PATIENT_ID;
 check(patientId,"Falta patientId en el servidor; para servidor anterior usa SMOKE_PATIENT_ID explícito solo para este script.");
 const types=await json("/exam-types",null,session.accessToken);check(types.items.length>0,"Catálogo vacío");
 async function upload(fileName,examId,operation="CREATE_EXAM_WITH_VERSION",versionNumber=1){
 const bytes=readFileSync(resolve(root,"database/fixtures/mobile-v020",fileName));check(bytes.length<100000,"Fixture demasiado grande");
 const mime=fileName.endsWith("pdf")?"application/pdf":fileName.endsWith("png")?"image/png":"image/jpeg";
 const versionId=randomUUID();const payload={schemaVersion:1,patientId,examId,versionId,...(operation==="CREATE_EXAM_WITH_VERSION"?{title:`[PRUEBA MÓVIL] ${id} ${fileName}`,examDate:new Date().toISOString().slice(0,10),examTypeId:types.items[0].id}:{})};
 const envelope={operationId:randomUUID(),clinicId:profile.clinic.id,operation,payload,filename:fileName,mimeType:mime,sizeBytes:bytes.length,sha256:sha(bytes)};
 async function send(){const form=new FormData();form.append("request",JSON.stringify(envelope));form.append("file",new Blob([bytes],{type:mime}),fileName);return fetch(base+"/exams/uploads",{method:"POST",headers:{authorization:`Bearer ${session.accessToken}`},body:form});}
 const response=await send();const result=await response.json();check(response.status===201,`Carga: HTTP ${response.status} ${result.code??""}`);check(result.versionNumber===versionNumber,"Versión inesperada");
 const replay=await send();check(replay.status===200&&(await replay.json()).replayed,"Falló idempotencia");
 const row={fileName,examId,versionId,versionNumber,bytes:bytes.length,sha256:sha(bytes),uploadHttp:201,idempotent:true};
 for(const action of ["view","download"]){const delivered=await fetch(`${base}/exams/${examId}/versions/${versionId}/${action}`,{headers:{authorization:`Bearer ${session.accessToken}`}});check(delivered.status===200,`${action}: HTTP ${delivered.status}`);const recovered=Buffer.from(await delivered.arrayBuffer());check(recovered.length===bytes.length&&sha(recovered)===sha(bytes),"Contenido recuperado distinto");row[action]=true;}
 report.files.push(row);console.log(`${fileName}: carga, idempotencia y bytes recuperados OK`);
 return row;
 }
 const first=randomUUID();await upload("wellq-prueba-v1.pdf",first);await upload("wellq-prueba-v2.pdf",first,"UPLOAD_VERSION",2);await upload("wellq-prueba.png",randomUUID());await upload("wellq-prueba.jpg",randomUUID());
 await json("/auth/logout",{refreshToken:refresh});refresh=null;
 session=await login();refresh=session.refreshToken;
 const detail=await json(`/exams/${first}`,null,session.accessToken);check(detail.versions.length===2&&detail.latestVersion.versionNumber===2,"Historial no persistido");
 report.reopenedSession=true;report.twoVersionsPersisted=true;
 // Another synthetic patient must not see the newly created exam.
 const other=await json("/auth/mobile/login",{email:"patient3@example.com",password});check(other.status==="AUTHENTICATED","Otra cuenta de prueba no disponible");
 try{const denied=await fetch(base+`/exams/${first}`,{headers:{authorization:`Bearer ${other.session.accessToken}`}});check(denied.status===404,"Se permitió leer a otro paciente");report.otherPatientHttp=denied.status;}finally{await json("/auth/logout",{refreshToken:other.session.refreshToken});}
 if(profile.patientId!==undefined){const before=profile.displayName;try{const renamed=await json("/auth/me",{displayName:before+" QA"},session.accessToken,"PATCH");check(renamed.displayName===before+" QA","No se actualizó el nombre");report.nameUpdate=true;}finally{await json("/auth/me",{displayName:before},session.accessToken,"PATCH");report.nameRestored=true;}}
 const out=resolve(root,"apps/mobile/evidence/v020",base.includes("localhost")?"local":"production");mkdirSync(out,{recursive:true});writeFileSync(resolve(out,"storage.json"),JSON.stringify(report,null,2)+"\n");console.log("Almacenamiento real y aislamiento verificados.");
 }finally{if(refresh)await json("/auth/logout",{refreshToken:refresh});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
