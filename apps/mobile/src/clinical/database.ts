import * as SQLite from "expo-sqlite";
import {migrateClinicalDatabase} from "../../../../database/sqlite/migrate-v3";
import {schema} from "./schema";
let connection:Promise<SQLite.SQLiteDatabase>|undefined;
let tail:Promise<unknown>=Promise.resolve();
export function exclusive<T>(work:(db:SQLite.SQLiteDatabase)=>Promise<T>):Promise<T>{
 const result=tail.then(async()=>{
  connection??=SQLite.openDatabaseAsync("wellq-clinical.db").then(async db=>{try{await migrateClinicalDatabase(db,schema);return db;}catch(error){await db.closeAsync();throw error;}}).catch(error=>{connection=undefined;throw error;});
  return work(await connection);
 });tail=result.catch(()=>undefined);return result;
}

const listeners=new Set<()=>void>();
export function subscribeClinical(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function notifyClinical(){listeners.forEach(listener=>listener());}
