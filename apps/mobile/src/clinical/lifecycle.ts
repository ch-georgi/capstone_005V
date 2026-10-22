import {AppState,Alert} from "react-native";
import * as Network from "expo-network";
import {SessionManager} from "../auth/session";
import {exclusive} from "./database";
import {synchronize} from "./sync";
import {sendNext,awaitActiveUpload} from "./uploads";
import {cleanFiles,cleanOrphanedFiles} from "./documents";
export function startClinical(manager:SessionManager){
 const ready=cleanOrphanedFiles();
 let stopped=false,busy=false,leaving=false;
 const run=async()=>{if(stopped||busy||leaving||AppState.currentState!=="active")return;busy=true;try{await ready;await manager.revalidate();const state=manager.getSnapshot();if(state.status!=="authenticated"||state.offline)return;await synchronize(manager);while(!stopped&&!leaving&&AppState.currentState==="active"&&await sendNext(manager))await synchronize(manager);await cleanFiles();}catch{/* Screens expose sync failures; persisted pending operations survive. */}finally{busy=false;}};
 const count=async(all:boolean)=>{const p=manager.getSnapshot().profile;if(!p)return 0;return exclusive(async db=>(await db.getFirstAsync<{n:number}>("SELECT count(*) n FROM sync_queue WHERE owner_user_id=? AND status<>'COMPLETED'"+(all?"":" AND clinic_id=?"),p.user.id,...(all?[]:[p.clinic.id])))?.n??0);};
 manager.beforeExit=async(all)=>{
  leaving=true;
  try{
   // Await an in-flight request so that discard never races its acknowledgement.
   while(busy)await new Promise(resolve=>setTimeout(resolve,100));
   await awaitActiveUpload(manager);
   if(!await count(all))return;
   const choice=await new Promise<string>(resolve=>Alert.alert("Hay cargas pendientes","Debes sincronizarlas o descartarlas antes de salir. Descartar aquí no revierte una carga que el servidor pudo recibir.",[{text:"Cancelar",style:"cancel",onPress:()=>resolve("cancel")},{text:"Sincronizar",onPress:()=>resolve("sync")},{text:"Descartar",style:"destructive",onPress:()=>resolve("discard")}],{cancelable:false}));
   if(choice==="sync"){await manager.revalidate();await synchronize(manager);while(await sendNext(manager))await synchronize(manager);if(await count(all))throw new Error("Quedan cargas pendientes. Revisa Cargas pendientes antes de salir.");}
   else if(choice==="discard"){
    const p=manager.getSnapshot().profile;if(p)await exclusive(async db=>{await db.execAsync("BEGIN IMMEDIATE");try{const scope=all?"owner_user_id=?":"owner_user_id=? AND clinic_id=?",args=all?[p.user.id]:[p.user.id,p.clinic.id];await db.runAsync(`INSERT OR IGNORE INTO local_file_cleanup SELECT owner_user_id,clinic_id,file_uri FROM sync_queue WHERE ${scope} AND status<>'COMPLETED'`,...args);await db.runAsync(`DELETE FROM sync_queue WHERE ${scope} AND status<>'COMPLETED'`,...args);await db.execAsync("COMMIT");}catch(error){await db.execAsync("ROLLBACK");throw error;}});
   }else throw new Error("Salida cancelada. Tus cargas se conservan.");
  }finally{leaving=false;}
 };
 manager.afterLogout=async(owner)=>{await exclusive(async db=>{await db.execAsync("BEGIN IMMEDIATE");try{await db.runAsync("DELETE FROM local_patients WHERE owner_user_id=?",owner);await db.runAsync("DELETE FROM local_exam_types WHERE owner_user_id=?",owner);await db.runAsync("DELETE FROM sync_metadata WHERE owner_user_id=?",owner);await db.runAsync("UPDATE local_contexts SET access_state='REVOKED' WHERE owner_user_id=?",owner);await db.execAsync("COMMIT");}catch(error){await db.execAsync("ROLLBACK");throw error;}});await cleanFiles();};
 const network=Network.addNetworkStateListener(state=>{if(state.isConnected)void run();});
 const app=AppState.addEventListener("change",state=>{if(state==="active")void run();});
 const timer=setInterval(()=>void run(),15000);void run();
 return ()=>{stopped=true;clearInterval(timer);app.remove();network.remove();manager.beforeExit=undefined;manager.afterLogout=undefined;};
}
