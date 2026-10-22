import React,{useCallback,useEffect,useState} from "react";
import {Alert} from "react-native";
import {router} from "expo-router";
import {useAuth} from "../src/auth/context";
import {exclusive} from "../src/clinical/database";
import {removeOffline} from "../src/clinical/documents";
import {Screen,Heading,Copy,Card,Button,ErrorMessage} from "../src/ui";
interface Row{id:string;exam_id:string;exam_title:string;original_filename:string;size_bytes:number;version_number:number}
export default function Offline(){const {manager,profile}=useAuth();const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState("");
 const load=useCallback(async()=>{if(profile)setRows(await exclusive(db=>db.getAllAsync<Row>("SELECT v.*, e.title AS exam_title FROM local_exam_versions v JOIN local_exams e ON e.owner_user_id=v.owner_user_id AND e.clinic_id=v.clinic_id AND e.id=v.exam_id WHERE v.owner_user_id=? AND v.clinic_id=? AND v.local_file_uri IS NOT NULL",profile.user.id,profile.clinic.id)));},[profile]);useEffect(()=>{const first=setTimeout(()=>void load().catch(e=>setError(String(e))),0);return()=>clearTimeout(first);},[load]);
 async function remove(id?:string){try{await removeOffline(manager,id);await load();}catch(e){setError(String(e));}}
 return <Screen center={false}><Heading>Documentos sin conexión</Heading><Button title="Volver" secondary onPress={()=>router.back()}/><Copy>{rows.length} copias · {rows.reduce((n,r)=>n+r.size_bytes,0)} bytes</Copy><ErrorMessage message={error}/>{rows.map(r=><Card key={r.id}><Heading>{r.exam_title}</Heading><Copy>{r.original_filename} · Versión {r.version_number}</Copy><Button title="Abrir copia" onPress={()=>router.push(`/document/${r.exam_id}/${r.id}`)}/><Button title="Retirar copia del dispositivo" secondary onPress={()=>void remove(r.id)}/></Card>)}{rows.length?<Button title="Eliminar todas las copias de esta clínica" secondary onPress={()=>Alert.alert("Eliminar copias","Las cargas pendientes y los documentos del servidor se conservan.",[{text:"Cancelar",style:"cancel"},{text:"Eliminar copias",style:"destructive",onPress:()=>void remove()}])}/>:<Copy>No has marcado versiones como disponibles sin conexión.</Copy>}</Screen>;
}
