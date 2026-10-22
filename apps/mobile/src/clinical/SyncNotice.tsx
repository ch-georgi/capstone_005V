import React,{useEffect,useState} from "react";
import {Platform} from "react-native";
import {useAuth} from "../auth/context";
import {Copy,ErrorMessage} from "../ui";
export function SyncNotice(){const {manager,profile,offline}=useAuth();const [date,setDate]=useState(""),[error,setError]=useState("");
 useEffect(()=>{let active=true;let stop:(()=>void)|undefined;if(Platform.OS==="android"&&profile)void import("./database").then(({exclusive,subscribeClinical})=>{if(!active)return;const update=()=>{void exclusive(db=>db.getFirstAsync<{updated_at:string}>("SELECT updated_at FROM sync_metadata WHERE owner_user_id=? AND clinic_id=?",profile.user.id,profile.clinic.id)).then(row=>{if(active)setDate(row?.updated_at??"");}).catch(e=>{if(active)setError(String(e));});};stop=subscribeClinical(update);update();});return()=>{active=false;stop?.();};},[manager,profile]);
 return Platform.OS==="android"?<><Copy muted>{offline?"Sin conexion. ":""}{date?`Ultima sincronizacion: ${new Date(date).toLocaleString()}`:"Sin copia sincronizada disponible."}</Copy><ErrorMessage message={error}/></>:null;
}
