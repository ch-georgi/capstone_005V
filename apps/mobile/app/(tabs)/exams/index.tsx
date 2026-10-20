import React,{useState} from "react";
import {ActivityIndicator} from "react-native";
import {router} from "expo-router";
import {useAuth} from "../../../src/auth/context";
import {useResource} from "../../../src/exams/use-resource";
import {ExamPage,ExamType,dateLabel,validDate} from "../../../src/exams/types";
import {Screen,Heading,Copy,Card,Badge,Button,Field,ErrorMessage} from "../../../src/ui";
export default function Exams(){
 const {profile,offline}=useAuth();
 const [offset,setOffset]=useState(0),[type,setType]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[filters,setFilters]=useState({type:"",from:"",to:""}),[error,setError]=useState(""),[show,setShow]=useState(false);
 const params=new URLSearchParams({limit:"20",offset:String(offset)});if(filters.type)params.set("examTypeId",filters.type);if(filters.from)params.set("from",filters.from);if(filters.to)params.set("to",filters.to);
 const path=profile?.patientId?`/patients/${profile.patientId}/exams?${params}`:null;
 const resource=useResource<ExamPage>(path),catalogue=useResource<{items:ExamType[]}>(profile?.patientId?"/exam-types":null);
 function apply(){if((from&&!validDate(from))||(to&&!validDate(to))){setError("Usa fechas válidas con formato AAAA-MM-DD.");return;}if(from&&to&&from>to){setError("La fecha inicial no puede ser posterior a la final.");return;}setError("");setOffset(0);setFilters({type,from,to});setShow(false);}
 return <Screen center={false}><Heading>Mis exámenes</Heading><Copy muted>{profile?.clinic.name}</Copy>
 {profile?.access==="READ_ONLY"?<Badge>Acceso de solo lectura</Badge>:null}
 {profile?.patientId===undefined?<ErrorMessage message="El backend necesita actualizarse para identificar tu ficha. Vuelve a iniciar sesión después del despliegue."/>:!profile?.patientId?<Card><Copy>Tu clínica debe completar tu ficha de paciente para consultar exámenes.</Copy></Card>:<>
 <Button title={show?"Ocultar filtros":"Filtrar exámenes"} secondary onPress={()=>setShow(!show)}/>
 {show?<Card><Copy>Tipo de examen</Copy><Button title="Todos los tipos" secondary onPress={()=>setType("")}/>{catalogue.data?.items.map(item=><Button key={item.id} title={`${type===item.id?"✓ ":""}${item.name}`} secondary onPress={()=>setType(item.id)}/>)}<ErrorMessage message={catalogue.error}/><Field label="Desde (AAAA-MM-DD)" value={from} onChangeText={setFrom} placeholder="2026-01-01" autoCapitalize="none"/><Field label="Hasta (AAAA-MM-DD)" value={to} onChangeText={setTo} placeholder="2026-12-31" autoCapitalize="none"/><ErrorMessage message={error}/><Button title="Aplicar filtros" onPress={apply}/><Button title="Limpiar filtros" secondary onPress={()=>{setType("");setFrom("");setTo("");setFilters({type:"",from:"",to:""});setOffset(0);setError("");}}/></Card>:null}
 <Button title="Actualizar" secondary disabled={offline||resource.loading} onPress={resource.reload}/>
 {resource.loading?<ActivityIndicator accessibilityLabel="Cargando exámenes"/>:null}<ErrorMessage message={resource.error}/>{resource.error?<Button title="Reintentar" onPress={resource.reload}/>:null}
 {resource.data?.items.length===0?<Card><Copy>No hay exámenes para mostrar{filters.type||filters.from||filters.to?" con estos filtros":""}.</Copy></Card>:null}
 {resource.data?.items.map(exam=><Card key={exam.id}><Badge>{exam.examType.name}</Badge><Copy>{exam.title}</Copy><Copy muted>{dateLabel(exam.examDate)} · {exam.latestVersion?`Versión ${exam.latestVersion.versionNumber}`:"Sin versión disponible"}</Copy><Button title="Ver detalle" secondary onPress={()=>router.push(`/exams/${exam.id}`)}/></Card>)}
 {resource.data?<><Copy muted>{resource.data.total} exámenes · Página {Math.floor(offset/20)+1}</Copy>{offset>0?<Button title="Anterior" secondary onPress={()=>setOffset(Math.max(0,offset-20))}/>:null}{offset+20<resource.data.total?<Button title="Siguiente" secondary onPress={()=>setOffset(offset+20)}/>:null}</>:null}
 </>}
 </Screen>;
}
