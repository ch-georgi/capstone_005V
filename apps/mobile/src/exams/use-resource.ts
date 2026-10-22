import {Platform} from "react-native";
import {useEffect,useState} from "react";
import {useAuth} from "../auth/context";
export function useResource<T>(path:string|null){
 const {manager,profile,offline}=useAuth();
 const context=manager.contextKey();
 const [revision,setRevision]=useState(0);
 const [state,setState]=useState<{key:string;data:T|null;loading:boolean;error:string}>({key:"",data:null,loading:false,error:""});
 const key=`${context}|${path}|${revision}|${offline}`;
 useEffect(()=>{let current=true;let stopClinical:(()=>void)|undefined;
 if(path&&Platform.OS==="android"){
  void (async()=>{
   const {cachedResource,synchronize}=await import("../clinical/sync");
   const {subscribeClinical}=await import("../clinical/database");
   if(!current)return;
   stopClinical=subscribeClinical(()=>{void cachedResource<T>(manager,path).then(data=>{if(current)setState({key,data,loading:false,error:""});}).catch(error=>{if(current)setState({key,data:null,loading:false,error:error instanceof Error?error.message:"No hay copia local disponible."});});});
   let cached:T|null=null;
   try{cached=await cachedResource<T>(manager,path);if(current)setState({key,data:cached,loading:false,error:""});}catch{/* First synchronization may populate an empty cache. */}
   try{if(!offline)await synchronize(manager);const data=await cachedResource<T>(manager,path);if(current)setState({key,data,loading:false,error:""});}
   catch(error){if(current)setState({key,data:cached,loading:false,error:error instanceof Error?error.message:"No se pudo actualizar la copia local."});}
  })().catch(error=>{if(current)setState({key,data:null,loading:false,error:error instanceof Error?error.message:"No se pudo abrir la base local."});});
 }else if(path&&!offline)void manager.request<T>(path).then(data=>{if(current)setState({key,data,loading:false,error:""});}).catch(error=>{if(current)setState({key,data:null,loading:false,error:error instanceof Error?error.message:"No se pudo completar la consulta."});});
 return ()=>{current=false;stopClinical?.();};
 },[manager,key,path,offline]);
 return {...(state.key===key?state:{key,data:null,loading:!!path&&!offline,error:offline?"Estás sin conexión. Conéctate para consultar tus exámenes.":""}),reload:()=>setRevision(value=>value+1),profile};
}
