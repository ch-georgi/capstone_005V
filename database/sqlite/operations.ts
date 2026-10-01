import type { SQLiteAdapter } from './migrate';
export const retryDelayMs = (failures: number): number => Math.min(5000 * 2 ** Math.max(0, failures - 1), 300000);

// Must be called with an authenticated owner; tenant selection alone is insufficient.
export async function claimUpload(db: SQLiteAdapter, owner: string, clinic: string, now: Date) {
  const timestamp=now.toISOString(), until=new Date(now.getTime()+300000).toISOString();
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await db.runAsync("UPDATE sync_queue SET status='PENDING',processing_until=NULL,updated_at=? WHERE owner_user_id=? AND clinic_id=? AND status='PROCESSING' AND processing_until<=?",timestamp,owner,clinic,timestamp);
    const rows=await db.getAllAsync<{id:string}>("SELECT q.id FROM sync_queue q JOIN local_contexts c USING(owner_user_id,clinic_id) WHERE q.owner_user_id=? AND q.clinic_id=? AND c.access_state='READ_WRITE' AND q.status IN ('PENDING','FAILED') AND q.is_retryable=1 AND q.retry_count<8 AND q.pause_reason IS NULL AND (q.next_attempt_at IS NULL OR q.next_attempt_at<=?) ORDER BY q.created_at,q.id LIMIT 1",owner,clinic,timestamp);
    if (!rows.length) { await db.execAsync('COMMIT'); return null; }
    await db.runAsync("UPDATE sync_queue SET status='PROCESSING',retry_count=retry_count+1,processing_until=?,updated_at=? WHERE owner_user_id=? AND clinic_id=? AND id=?",until,timestamp,owner,clinic,rows[0].id);
    const claimed=await db.getAllAsync("SELECT * FROM sync_queue WHERE owner_user_id=? AND clinic_id=? AND id=?",owner,clinic,rows[0].id);
    await db.execAsync('COMMIT'); return claimed[0];
  } catch(error) { await db.execAsync('ROLLBACK'); throw error; }
}

// The adapter callback validates/normalizes DTOs, applies tombstones and schedules
// file cleanup. Cursor and page effects commit together; network is outside this txn.
export async function applySyncPage(db: SQLiteAdapter, owner: string, clinic: string,
  cursor: string, revision: string, now: string, applyChanges: () => Promise<void>): Promise<void> {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await applyChanges();
    await db.runAsync("INSERT INTO sync_metadata(owner_user_id,clinic_id,stream,cursor,revision,updated_at) VALUES(?,?,'clinical',?,?,?) ON CONFLICT(owner_user_id,clinic_id,stream) DO UPDATE SET cursor=excluded.cursor,revision=excluded.revision,updated_at=excluded.updated_at",owner,clinic,cursor,revision,now);
    await db.execAsync('COMMIT');
  } catch(error) { await db.execAsync('ROLLBACK'); throw error; }
}
export type UploadOutcome = {kind:'SUCCESS'} | {kind:'TRANSIENT'|'PERMANENT'|'AUTH'|'PERMISSION';error:string};
export async function settleUpload(db:SQLiteAdapter,owner:string,clinic:string,id:string,leaseUntil:string,outcome:UploadOutcome,now:Date) {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const rows=await db.getAllAsync<{retry_count:number}>("SELECT retry_count FROM sync_queue WHERE owner_user_id=? AND clinic_id=? AND id=? AND status='PROCESSING' AND processing_until=?",owner,clinic,id,leaseUntil);
    if(!rows.length) throw new Error('Stale upload lease');
    const paused=outcome.kind==='AUTH'||outcome.kind==='PERMISSION';
    const failures=rows[0].retry_count-(paused?1:0); // Attempts, including interrupted leases; auth/permission consumes none.
    const retryable=outcome.kind!=='PERMANENT' && failures<8;
    await db.runAsync("UPDATE sync_queue SET status=?,processing_until=NULL,retry_count=?,is_retryable=?,pause_reason=?,last_error=?,next_attempt_at=?,updated_at=? WHERE owner_user_id=? AND clinic_id=? AND id=?",
      outcome.kind==='SUCCESS'?'COMPLETED':paused?'PENDING':'FAILED',failures,retryable?1:0,paused?outcome.kind:null,
      outcome.kind==='SUCCESS'?null:outcome.error,outcome.kind==='TRANSIENT'&&retryable?new Date(now.getTime()+retryDelayMs(failures)).toISOString():null,now.toISOString(),owner,clinic,id);
    await db.execAsync('COMMIT');
  } catch(error) {await db.execAsync('ROLLBACK');throw error;}
}
// Call inside applySyncPage's transaction. This applies a server-authorized
// tombstone even when the entity was never cached locally.
export async function applyTombstone(db:SQLiteAdapter,owner:string,clinic:string,
  entity:'PATIENT'|'EXAM'|'EXAM_VERSION',id:string,now:string):Promise<void> {
  const target={PATIENT:['local_patients','patient_id'],EXAM:['local_exams','exam_id'],EXAM_VERSION:['local_exam_versions','version_id']}[entity];
  await db.runAsync("UPDATE sync_queue SET status='FAILED',is_retryable=0,pause_reason='RESOURCE_DELETED',processing_until=NULL,next_attempt_at=NULL,last_error='Server resource removed',updated_at=? WHERE owner_user_id=? AND clinic_id=? AND "+target[1]+"=? AND status<>'COMPLETED'",now,owner,clinic,id);
  await db.runAsync('DELETE FROM '+target[0]+' WHERE owner_user_id=? AND clinic_id=? AND id=?',owner,clinic,id);
}
