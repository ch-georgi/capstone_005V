-- Execute once as the database owner AFTER migrate deploy.
-- This group role has no login/password; grant it to the API login separately.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='wellq_app') THEN CREATE ROLE wellq_app NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO wellq_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM wellq_app;
GRANT SELECT ON clinics,users,user_clinics,patients,exam_types,exams,exam_versions,audit_logs,refresh_tokens,idempotency_records,sync_changes,storage_deletion_jobs TO wellq_app;
GRANT INSERT,UPDATE ON clinics,users,user_clinics,patients,exam_types,exams,refresh_tokens TO wellq_app;
GRANT INSERT ON exam_versions,audit_logs,idempotency_records TO wellq_app;
GRANT EXECUTE ON FUNCTION purge_exam(uuid,uuid) TO wellq_app;
-- No DELETE/TRUNCATE, no direct sync writes, no edits of versions/audits/results.
-- Application login must not own these tables or inherit the migration owner.

GRANT UPDATE(status,retry_count,next_attempt_at,processing_until,last_error,updated_at) ON storage_deletion_jobs TO wellq_app;
