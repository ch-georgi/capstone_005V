import {DateField} from "../src/components/DateField";
import React,{useState} from "react";
import {router,useLocalSearchParams} from "expo-router";
import {useAuth} from "../src/auth/context";
import {useResource} from "../src/exams/use-resource";
import {ExamType,ExamDetail,validDate} from "../src/exams/types";
import {SelectedDocument,selectDocument,enqueue,sendNext} from "../src/clinical/uploads";
import {synchronize} from "../src/clinical/sync";
import {Screen,Heading,Copy,Card,Field,Button,ErrorMessage} from "../src/ui";
export default function Upload(){
 const {examId}=useLocalSearchParams<{examId?:string}>();const {manager,profile,offline}=useAuth();
 const catalog=useResource<{items:ExamType[]}>(profile?.patientId?"/exam-types":null);
 const detail=useResource<ExamDetail>(examId?`/exams/${examId}`:null);
 const [title,setTitle]=useState(""),[date,setDate]=useState(""),[type,setType]=useState(""),[professional,setProfessional]=useState(""),[notes,setNotes]=useState(""),[file,setFile]=useState<SelectedDocument|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function pick(){setError("");try{const selected=await selectDocument();if(selected)setFile(selected);}catch(e){setError(e instanceof Error?e.message:"No se pudo seleccionar.");}}
 async function submit(){if(busy)return;if(!profile||!file)return;if(!manager.canUseOffline()){setError("Inicia sesion nuevamente antes de registrar cargas.");return;}if(!examId&&(!title.trim()||!validDate(date)||!type)){setError("Completa título, fecha válida y tipo de examen.");return;}setBusy(true);setError("");try{await enqueue(profile,file,{...(examId?{examId}:{title:title.trim(),examDate:date,examTypeId:type,professionalName:professional.trim(),notes:notes.trim()})});if(!offline)void sendNext(manager).then(()=>synchronize(manager)).catch(()=>undefined);router.replace("/pending");}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la carga.");}finally{setBusy(false);}}
 return <Screen center={false}><Heading>{examId?"Subir nueva versión":"Subir examen"}</Heading><Button title="Volver" secondary disabled={busy} onPress={()=>router.back()}/>{profile?.access!=="READ_WRITE"?<Copy>Tu acceso es de solo lectura.</Copy>:<>{examId?<Card><Copy>{detail.data?.title??"Cargando examen destino…"}</Copy><Copy>El servidor asignará el número de versión. Los datos del examen no cambian.</Copy><ErrorMessage message={detail.error}/></Card>:<><Field label="Título" value={title} onChangeText={setTitle} maxLength={200}/><DateField label="Fecha del examen" value={date} onChangeText={setDate} disabled={busy}/><Copy>Tipo de examen</Copy>{catalog.data?.items.map(t=><Button key={t.id} title={`${type===t.id?"✓ ":""}${t.name}`} secondary onPress={()=>setType(t.id)}/>)}<ErrorMessage message={catalog.error}/><Field label="Profesional (opcional)" value={professional} onChangeText={setProfessional} maxLength={200}/><Field label="Notas (opcional)" value={notes} onChangeText={setNotes} maxLength={5000} multiline/></>}
 <Button title={file?"Cambiar archivo":"Seleccionar PDF, JPG o PNG"} secondary disabled={busy} onPress={()=>void pick()}/>{file?<Card><Copy>{file.filename}</Copy><Copy>{file.mimeType} · {file.sizeBytes} bytes</Copy></Card>:null}<Copy>{offline?"La carga quedará pendiente hasta recuperar conexión.":"Se guardará primero en este dispositivo y se enviará al servidor."}</Copy><ErrorMessage message={error}/><Button title="Registrar carga" busy={busy} disabled={!file||!!examId&&!detail.data} onPress={()=>void submit()}/></>}</Screen>;
}
