import { migrateLocalDatabase, SQLiteAdapter } from './migrate';
export async function migrateClinicalDatabase(db: SQLiteAdapter, schema: string): Promise<void> {
 await db.execAsync('PRAGMA foreign_keys=ON');
 const fk=(await db.getAllAsync<{foreign_keys:number}>('PRAGMA foreign_keys'))[0]?.foreign_keys;
 if(fk!==1)throw new Error('Foreign keys unavailable');
 const version=(await db.getAllAsync<{user_version:number}>('PRAGMA user_version'))[0].user_version;
 if(version!==3) await migrateLocalDatabase(db,schema);
 if(version===3){
  const tables=await db.getAllAsync<{name:string}>("SELECT name FROM sqlite_master WHERE type='table'");
  if(!['local_exam_types','local_contexts','local_patients','local_exams','local_exam_versions','sync_queue','sync_metadata','local_file_cleanup','legacy_queue_quarantine'].every(n=>tables.some(t=>t.name===n)))throw new Error('Incomplete v3 database');
  const columns=await db.getAllAsync<{name:string}>('PRAGMA table_info(local_exams)');
  if(!['detail_json','exam_type_id'].every(n=>columns.some(c=>c.name===n))||(await db.getAllAsync('PRAGMA foreign_key_check')).length)throw new Error('Incomplete v3 schema');
  return;
 }
 await db.execAsync('BEGIN EXCLUSIVE');
 try {
  await db.execAsync(`ALTER TABLE local_exams ADD COLUMN detail_json TEXT CHECK(detail_json IS NULL OR json_valid(detail_json));
ALTER TABLE local_exams ADD COLUMN exam_type_id TEXT;
CREATE TABLE local_exam_types(owner_user_id TEXT NOT NULL,clinic_id TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(owner_user_id,clinic_id,id),FOREIGN KEY(owner_user_id,clinic_id) REFERENCES local_contexts(owner_user_id,clinic_id));
DELETE FROM sync_metadata;
PRAGMA user_version=3;`);
  await db.execAsync('COMMIT');
 }catch(error){await db.execAsync('ROLLBACK');throw error;}
}
