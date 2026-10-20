import {useEffect,useState} from "react";
import {useAuth} from "../auth/context";
export function useResource<T>(path:string|null){
 const {manager,profile,offline}=useAuth();
 const context=manager.contextKey();
 const [revision,setRevision]=useState(0);
 const [state,setState]=useState<{key:string;data:T|null;loading:boolean;error:string}>({key:"",data:null,loading:false,error:""});
 const key=`${context}|${path}|${revision}|${offline}`;
 useEffect(()=>{let current=true;
 if(path&&!offline)void manager.request<T>(path).then(data=>{if(current)setState({key,data,loading:false,error:""});}).catch(error=>{if(current)setState({key,data:null,loading:false,error:error instanceof Error?error.message:"No se pudo completar la consulta."});});
 return ()=>{current=false;};
 },[manager,key,path,offline]);
 return {...(state.key===key?state:{key,data:null,loading:!!path&&!offline,error:offline?"Estás sin conexión. Conéctate para consultar tus exámenes.":""}),reload:()=>setRevision(value=>value+1),profile};
}
