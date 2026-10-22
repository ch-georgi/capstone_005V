import type {SQLiteDatabase} from "expo-sqlite";
export function exclusive<T>(_work:(db:SQLiteDatabase)=>Promise<T>):Promise<T>{return Promise.reject(new Error("La persistencia offline esta disponible en Android."));}
export function subscribeClinical(_listener:()=>void){return()=>{};}
export function notifyClinical(){}
