import React,{useEffect,useState} from "react";
import {useAuth} from "../auth/context";
import {ExamVersion} from "../exams/types";

import {Button,Copy,ErrorMessage} from "../ui";
export function OfflineButton({examId,version}:{examId:string;version:ExamVersion}){
 const {manager,offline}=useAuth();const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let active=true;void import("./documents").then(({offlineCopy})=>offlineCopy(manager,version)).then(copy=>{if(active)setSaved(!!copy);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[manager,version]);
 async function toggle(){setBusy(true);setError("");try{const {removeOffline,saveOffline}=await import("./documents");if(saved)await removeOffline(manager,version.id);else await saveOffline(manager,examId,version);setSaved(!saved);}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la copia. Revisa el espacio disponible.");}finally{setBusy(false);}}
 return <><Copy muted>{saved?"Disponible sin conexión":"Esta versión requiere conexión"}</Copy><Button title={saved?"Retirar copia sin conexión":"Disponible sin conexión"} secondary busy={busy} disabled={!saved&&offline} onPress={()=>void toggle()}/><ErrorMessage message={error}/></>;
}
