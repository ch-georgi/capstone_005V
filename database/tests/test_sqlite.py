import json,sqlite3,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'sqlite'))
from migrate import migrate
ROOT=Path(__file__).resolve().parents[2]
NOW='2026-10-01T12:00:00.000Z'
def uid(n): return f'00000000-0000-4000-8000-{n:012x}'
class SQLiteTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');migrate(self.db)
  self.owner,self.clinic,self.patient,self.exam=map(uid,[1,2,3,4])
  self.context(self.owner,self.clinic)
  self.insert('local_patients',dict(owner_user_id=self.owner,clinic_id=self.clinic,id=self.patient,user_id=self.owner,first_name='Ana',last_name='Test',date_of_birth='2000-02-29',is_active=1,updated_at=NOW))
  self.insert('local_exams',dict(owner_user_id=self.owner,clinic_id=self.clinic,id=self.exam,patient_id=self.patient,exam_type_code='LAB',exam_type_name='Laboratorio',title='Test',exam_date='2026-09-10',latest_server_version=3,updated_at=NOW))
  self.db.commit()
 def tearDown(self):self.db.close()
 def insert(self,table,values):
  self.db.execute(f'INSERT INTO {table} ({",".join(values)}) VALUES ({",".join("?" for _ in values)})',tuple(values.values()))
 def context(self,owner,clinic):
  self.insert('local_contexts',dict(owner_user_id=owner,clinic_id=clinic,role='PATIENT',permission_revision='1',access_state='READ_WRITE',updated_at=NOW))
 def version(self,n=1,**updates):
  data=dict(owner_user_id=self.owner,clinic_id=self.clinic,id=uid(10+n),exam_id=self.exam,version_number=n,original_filename='x.pdf',mime_type='application/pdf',size_bytes=10,sha256='a'*64,created_at=NOW);data.update(updates);return data
 def queue(self,**updates):
  payload=dict(schemaVersion=1,patientId=self.patient,examId=self.exam,versionId=uid(51),title='Test',examDate='2026-09-10',examTypeId=uid(60))
  data=dict(owner_user_id=self.owner,clinic_id=self.clinic,id=uid(50),patient_id=self.patient,exam_id=self.exam,version_id=uid(51),operation='CREATE_EXAM_WITH_VERSION',payload=json.dumps(payload),file_uri='file:///private/pending.pdf',sha256='a'*64,request_hash='b'*64,mime_type='application/pdf',size_bytes=10,original_filename='x.pdf',created_at=NOW,updated_at=NOW);data.update(updates);return data
 def rejected(self,table,values):
  with self.assertRaises(sqlite3.IntegrityError):self.insert(table,values)
 def test_migration_invariants_match_committed_migration(self):
  invariant=(ROOT/'database/postgresql/invariants.sql').read_text(encoding='utf-8')
  migration=(ROOT/'apps/api/prisma/migrations/20261001030827_init/migration.sql').read_text(encoding='utf-8')
  self.assertTrue(migration.endswith(invariant))
 def test_uuid_null_and_shape(self):
  self.rejected('local_exam_versions',self.version(id=None));self.rejected('local_exam_versions',self.version(id='not-a-uuid'))
 def test_metadata(self):
  for changes in [dict(version_number=0),dict(version_number=1.5),dict(size_bytes=-1),dict(size_bytes=10000001),dict(size_bytes='bad'),dict(mime_type='application/x-executable'),dict(sha256='x'*64),dict(sha256='A'*64),dict(original_filename=' ')]:
   with self.subTest(changes=changes):self.rejected('local_exam_versions',self.version(**changes))
 def test_duplicate_version(self):
  self.insert('local_exam_versions',self.version());self.rejected('local_exam_versions',self.version(id=uid(25)))
 def test_cross_tenant_fk(self):
  self.context(self.owner,uid(99));self.rejected('local_exam_versions',self.version(clinic_id=uid(99)))
 def test_cross_owner_fk(self):
  self.context(uid(98),self.clinic);self.rejected('local_exam_versions',self.version(owner_user_id=uid(98)))
 def test_real_dates_and_instants(self):
  for value in ['2026-02-29','2026-02-30','2026-04-31','0000-01-01','2026-13-01','yesterday']:
   with self.subTest(value=value),self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE local_exams SET exam_date=?',(value,))
  for value in ['2026-10-01T25:00:00.000Z','2026-02-30T00:00:00.000Z','2026-10-01','2026-10-01T12:00:00+00:00']:
   with self.subTest(value=value),self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE local_exams SET updated_at=?',(value,))
 def test_current_download(self):
  self.assertIsNone(self.db.execute('SELECT current_version FROM local_exams').fetchone()[0])
  self.insert('local_exam_versions',self.version(1));self.insert('local_exam_versions',self.version(2))
  self.db.execute('UPDATE local_exam_versions SET local_file_uri=?,verified_at=? WHERE version_number=2',('file:///private/v2.pdf',NOW))
  self.assertEqual(self.db.execute('SELECT current_version FROM local_exams').fetchone()[0],2)
  self.db.execute('UPDATE local_exam_versions SET local_file_uri=?,verified_at=? WHERE version_number=1',('file:///private/v1.pdf',NOW))
  self.db.execute('UPDATE local_exam_versions SET local_file_uri=NULL,verified_at=NULL WHERE version_number=2')
  self.assertEqual(self.db.execute('SELECT current_version FROM local_exams').fetchone()[0],1)
  self.assertEqual(self.db.execute('SELECT count(*) FROM local_file_cleanup').fetchone()[0],1)
 def test_tombstone_schedules_file_cleanup_without_deleting_pending(self):
  self.insert('local_exam_versions',self.version(local_file_uri='file:///private/v1.pdf',verified_at=NOW))
  self.insert('sync_queue',self.queue())
  self.db.execute('DELETE FROM local_exams')
  self.assertEqual(self.db.execute('SELECT count(*) FROM local_exam_versions').fetchone()[0],0)
  self.assertEqual(self.db.execute('SELECT count(*) FROM local_file_cleanup').fetchone()[0],1)
  self.assertEqual(self.db.execute('SELECT count(*) FROM sync_queue').fetchone()[0],1)
 def test_current_cannot_be_faked(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE local_exams SET current_version=1')
 def test_verified_pair(self):self.rejected('local_exam_versions',self.version(local_file_uri='file:///private/v1.pdf'))
 def test_metadata_immutable(self):
  self.insert('local_exam_versions',self.version())
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE local_exam_versions SET sha256=?",('b'*64,))
 def test_queue_validation(self):
  for changes in [dict(payload='broken'),dict(payload='{}'),dict(payload='null'),dict(operation='UNKNOWN'),dict(status='PENDNG'),dict(retry_count=-1),dict(retry_count=9),dict(status='PROCESSING',processing_until=NOW)]:
   with self.subTest(changes=changes):self.rejected('sync_queue',self.queue(**changes))
 def test_pending_survives_patient_tombstone(self):
  self.insert('sync_queue',self.queue());self.db.execute('DELETE FROM local_patients')
  self.assertEqual(self.db.execute('SELECT count(*) FROM sync_queue').fetchone()[0],1)
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('DELETE FROM sync_queue')
 def test_queue_cannot_change_owner(self):
  self.insert('sync_queue',self.queue())
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE sync_queue SET owner_user_id=?',(uid(90),))
 def test_readonly_cannot_claim(self):
  self.insert('sync_queue',self.queue());self.db.execute("UPDATE local_contexts SET access_state='READ_ONLY'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE sync_queue SET status='PROCESSING',processing_until=?",(NOW,))
 def test_cursor_monotonic(self):
  self.insert('sync_metadata',dict(owner_user_id=self.owner,clinic_id=self.clinic,stream='clinical',cursor='signed',revision='10',updated_at=NOW))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE sync_metadata SET revision='9'")
 def test_fresh_and_repeat_migration(self):
  migrate(self.db);self.assertEqual(self.db.execute('PRAGMA user_version').fetchone()[0],2)
 def test_legacy_quarantined_losslessly(self):
  c=sqlite3.connect(':memory:');c.executescript((ROOT/'database/tests/fixtures/sqlite_v1.sql').read_text(encoding='utf-8-sig'))
  c.execute("INSERT INTO sync_queue VALUES(NULL,'CREATE_EXAM','exam','old','broken json','file:///pending.pdf','PENDNG',-2,NULL,'bad','bad')");c.commit()
  migrate(c)
  record=c.execute('SELECT raw_record,file_uri FROM legacy_queue_quarantine').fetchone()
  self.assertEqual(json.loads(record[0])['payload']['value'],'broken json');self.assertEqual(record[1],'file:///pending.pdf')
  self.assertEqual(c.execute('SELECT count(*) FROM legacy_sync_queue_raw').fetchone()[0],1)
  self.assertEqual(c.execute('SELECT count(*) FROM sync_queue').fetchone()[0],0)
  migrate(c);c.close()
 def test_unknown_migration_rolls_back(self):
  c=sqlite3.connect(':memory:');c.execute('CREATE TABLE unrelated(id)');c.commit()
  with self.assertRaises(RuntimeError):migrate(c)
  self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0],0);c.close()
 def test_migration_failure_atomic(self):
  c=sqlite3.connect(':memory:');c.executescript((ROOT/'database/tests/fixtures/sqlite_v1.sql').read_text(encoding='utf-8-sig'))
  c.execute('CREATE TRIGGER duplicate_name AFTER INSERT ON sync_queue BEGIN SELECT 1; END');c.commit()
  # A pre-existing trigger name collides with v2 creation, exercising rollback.
  c.execute('CREATE TRIGGER queue_initial_state AFTER INSERT ON sync_queue BEGIN SELECT 1; END');c.commit()
  with self.assertRaises(sqlite3.OperationalError):migrate(c)
  self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0],0)
  self.assertTrue(c.execute("SELECT 1 FROM sqlite_master WHERE name='sync_queue'").fetchone());c.close()
if __name__=='__main__':unittest.main(verbosity=2)
