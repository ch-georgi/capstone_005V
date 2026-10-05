-- Additional database invariants. Kept in the migration, not only Prisma.
ALTER TABLE clinics ADD CHECK (btrim(name) <> '' AND btrim(code) <> '' AND sync_revision >= 0);
ALTER TABLE users ADD CHECK (email IS NULL OR (email = lower(btrim(email)) AND email <> '' AND position('@' in email) > 1));
ALTER TABLE users ADD CHECK (password_hash IS NULL OR (email IS NOT NULL AND btrim(password_hash) <> ''));
ALTER TABLE user_clinics ADD CHECK (btrim(display_name) <> '' AND permission_revision >= 1);
ALTER TABLE patients ADD CHECK (btrim(first_name) <> '' AND btrim(last_name) <> '');
ALTER TABLE patients ADD CHECK (medical_record_number IS NULL OR btrim(medical_record_number) <> '');
ALTER TABLE patients ADD CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));
ALTER TABLE exam_types ADD CHECK (btrim(code) <> '' AND btrim(name) <> '');
ALTER TABLE exams ADD CHECK (btrim(title) <> '' AND ((deleted_at IS NULL) = (deleted_by IS NULL)));
ALTER TABLE exam_versions ADD CHECK (version_number >= 1 AND size_bytes BETWEEN 1 AND 10000000);
ALTER TABLE exam_versions ADD CHECK (mime_type IN ('application/pdf','image/jpeg','image/png'));
ALTER TABLE exam_versions ADD CHECK (sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE exam_versions ADD CHECK (btrim(storage_key) <> '' AND btrim(original_filename) <> '');
ALTER TABLE refresh_tokens ADD CHECK (token_hash ~ '^[0-9a-f]{64}$' AND expires_at > created_at AND (revoked_at IS NULL OR revoked_at >= created_at));
ALTER TABLE idempotency_records ADD CHECK (request_hash ~ '^[0-9a-f]{64}$' AND jsonb_typeof(response) = 'object');
ALTER TABLE sync_changes ADD CHECK (revision >= 1 AND jsonb_typeof(payload) = 'object');
ALTER TABLE storage_deletion_jobs ADD CHECK (retry_count >= 0 AND btrim(storage_key) <> '' AND ((status = 'PROCESSING') = (processing_until IS NOT NULL)));

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER touch_clinic BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_user BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_membership BEFORE UPDATE ON user_clinics FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_patient BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_exam BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_deletion_job BEFORE UPDATE ON storage_deletion_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- These helpers are reusable by the future API; actor comes from verified JWT.
CREATE FUNCTION can_read_patient(p_actor uuid, p_patient uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM patients p JOIN user_clinics pm ON (pm.user_id,pm.clinic_id)=(p.user_id,p.clinic_id)
    JOIN user_clinics actor ON actor.clinic_id=p.clinic_id AND actor.user_id=p_actor
    JOIN clinics c ON c.id=p.clinic_id
    WHERE p.id=p_patient AND (p.user_id=p_actor OR
      (c.is_active AND actor.is_active AND actor.role IN ('CLINICIAN','CLINIC_ADMIN') AND pm.is_active AND p.deleted_at IS NULL))
  );
$$;
CREATE FUNCTION can_write_patient(p_actor uuid, p_patient uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM patients p JOIN user_clinics pm ON (pm.user_id,pm.clinic_id)=(p.user_id,p.clinic_id)
    JOIN user_clinics actor ON actor.clinic_id=p.clinic_id AND actor.user_id=p_actor
    JOIN clinics c ON c.id=p.clinic_id
    WHERE p.id=p_patient AND c.is_active AND pm.is_active AND p.deleted_at IS NULL AND actor.is_active
    AND (actor.role IN ('CLINICIAN','CLINIC_ADMIN') OR (actor.role='PATIENT' AND p.user_id=p_actor))
  );
$$;

CREATE FUNCTION protect_patient() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Patients can only be logically deleted'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.clinic_id) IS DISTINCT FROM (OLD.id,OLD.clinic_id) THEN
    RAISE EXCEPTION 'Patient identity and clinic are immutable';
  END IF;
  IF NEW.deleted_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_clinics WHERE user_id=NEW.deleted_by AND clinic_id=NEW.clinic_id) THEN
    RAISE EXCEPTION 'Patient deletion actor must belong to this clinic';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_clinics WHERE user_id=NEW.user_id AND clinic_id=NEW.clinic_id AND role='PATIENT') THEN
    RAISE EXCEPTION 'Patient requires a PATIENT membership';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_patient BEFORE INSERT OR UPDATE OR DELETE ON patients FOR EACH ROW EXECUTE FUNCTION protect_patient();
CREATE FUNCTION protect_membership() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Deactivate memberships instead of deleting them'; END IF;
  IF (NEW.user_id,NEW.clinic_id) IS DISTINCT FROM (OLD.user_id,OLD.clinic_id) THEN RAISE EXCEPTION 'Membership identity is immutable'; END IF;
  IF NEW.role <> 'PATIENT' AND EXISTS (SELECT 1 FROM patients WHERE user_id=OLD.user_id AND clinic_id=OLD.clinic_id) THEN
    RAISE EXCEPTION 'A patient membership cannot change role while its historical patient exists';
  END IF;
  NEW.permission_revision := greatest(NEW.permission_revision, OLD.permission_revision + CASE WHEN (NEW.role,NEW.is_active) IS DISTINCT FROM (OLD.role,OLD.is_active) THEN 1 ELSE 0 END);
  RETURN NEW;
END $$;
CREATE TRIGGER protect_membership BEFORE UPDATE OR DELETE ON user_clinics FOR EACH ROW EXECUTE FUNCTION protect_membership();

-- One committed counter per clinic: a transaction holds the row lock until commit.
CREATE FUNCTION emit_change(p_clinic uuid,p_entity sync_entity,p_id uuid,p_patient uuid,p_action sync_action,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n bigint;
BEGIN
  UPDATE clinics SET sync_revision=sync_revision+1 WHERE id=p_clinic RETURNING sync_revision INTO n;
  INSERT INTO sync_changes(clinic_id,revision,entity,entity_id,patient_id,action,payload)
    VALUES(p_clinic,n,p_entity,p_id,p_patient,p_action,p_payload);
END $$;
REVOKE ALL ON FUNCTION emit_change(uuid,sync_entity,uuid,uuid,sync_action,jsonb) FROM PUBLIC;

CREATE FUNCTION sync_patient() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM emit_change(NEW.clinic_id,'PATIENT',NEW.id,NEW.id,'UPSERT',to_jsonb(NEW)||jsonb_build_object('is_active',(SELECT is_active FROM user_clinics WHERE user_id=NEW.user_id AND clinic_id=NEW.clinic_id)));
  IF TG_OP='UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    UPDATE user_clinics SET permission_revision=permission_revision+1 WHERE user_id=NEW.user_id AND clinic_id=NEW.clinic_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_patient AFTER INSERT OR UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION sync_patient();

CREATE FUNCTION membership_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p patients;
BEGIN
  IF (NEW.role,NEW.is_active) IS DISTINCT FROM (OLD.role,OLD.is_active) THEN
    SELECT * INTO p FROM patients WHERE user_id=NEW.user_id AND clinic_id=NEW.clinic_id;
    IF FOUND THEN PERFORM emit_change(p.clinic_id,'PATIENT',p.id,p.id,'UPSERT',to_jsonb(p)||jsonb_build_object('is_active',NEW.is_active)); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_changed AFTER UPDATE ON user_clinics FOR EACH ROW EXECUTE FUNCTION membership_changed();
CREATE FUNCTION clinic_access_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE user_clinics SET permission_revision=permission_revision+1 WHERE clinic_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clinic_access_changed AFTER UPDATE OF is_active ON clinics FOR EACH ROW EXECUTE FUNCTION clinic_access_changed();

CREATE FUNCTION sync_exam() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rowdata exams; a sync_action; data jsonb;
BEGIN
  IF TG_OP='DELETE' THEN rowdata:=OLD; ELSE rowdata:=NEW; END IF;
  a:=CASE WHEN TG_OP='DELETE' OR rowdata.deleted_at IS NOT NULL THEN 'DELETE'::sync_action ELSE 'UPSERT'::sync_action END;
  IF a='UPSERT' AND NOT EXISTS(SELECT 1 FROM exam_versions WHERE exam_id=rowdata.id) THEN RETURN NEW; END IF;
  IF a='DELETE' THEN data:=jsonb_build_object('id',rowdata.id); ELSE
    SELECT to_jsonb(rowdata) || jsonb_build_object('latest_server_version',coalesce(max(version_number),0), 'exam_type_code',(SELECT code FROM exam_types WHERE id=rowdata.exam_type_id), 'exam_type_name',(SELECT name FROM exam_types WHERE id=rowdata.exam_type_id)) INTO data FROM exam_versions WHERE exam_id=rowdata.id;
  END IF;
  PERFORM emit_change(rowdata.clinic_id,'EXAM',rowdata.id,rowdata.patient_id,a,data);
  RETURN NULL;
END $$;
CREATE TRIGGER sync_exam AFTER INSERT OR UPDATE OR DELETE ON exams FOR EACH ROW EXECUTE FUNCTION sync_exam();
CREATE FUNCTION sync_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v exam_versions; e exams;
BEGIN
  IF TG_OP='DELETE' THEN v:=OLD; ELSE v:=NEW; END IF;
  SELECT * INTO STRICT e FROM exams WHERE id=v.exam_id;
  IF TG_OP='INSERT' THEN UPDATE exams SET updated_at=clock_timestamp() WHERE id=v.exam_id; END IF;
  PERFORM emit_change(e.clinic_id,'EXAM_VERSION',v.id,e.patient_id,
    CASE WHEN TG_OP='DELETE' THEN 'DELETE'::sync_action ELSE 'UPSERT'::sync_action END,
    CASE WHEN TG_OP='DELETE' THEN jsonb_build_object('id',v.id,'exam_id',v.exam_id) ELSE to_jsonb(v) END);
  RETURN NULL;
END $$;
CREATE TRIGGER sync_version AFTER INSERT OR DELETE ON exam_versions FOR EACH ROW EXECUTE FUNCTION sync_version();

CREATE FUNCTION protect_exam() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE owner_name text;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc WHERE oid='purge_exam(uuid,uuid)'::regprocedure;
    IF current_user<>owner_name OR current_setting('wellq.purging_exam',true) IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'Physical deletion requires purge_exam';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.deleted_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_clinics WHERE user_id=NEW.deleted_by AND clinic_id=NEW.clinic_id) THEN RAISE EXCEPTION 'Exam deletion actor must belong to this clinic'; END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM sync_changes WHERE entity='EXAM' AND entity_id=NEW.id) THEN RAISE EXCEPTION 'A historical exam UUID cannot be reused'; END IF;
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM exam_types WHERE id=NEW.exam_type_id AND is_active) THEN RAISE EXCEPTION 'New exams require an active exam type'; END IF;
  IF TG_OP='INSERT' AND NOT can_write_patient(NEW.created_by,NEW.patient_id) THEN RAISE EXCEPTION 'Creator cannot write this patient'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.clinic_id,NEW.patient_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM
    (OLD.id,OLD.clinic_id,OLD.patient_id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Exam identity and authorship are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_exam BEFORE INSERT OR UPDATE OR DELETE ON exams FOR EACH ROW EXECUTE FUNCTION protect_exam();
CREATE FUNCTION protect_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE e exams; owner_name text; expected_prefix text;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Confirmed versions are immutable'; END IF;
  IF TG_OP='DELETE' THEN
    SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc WHERE oid='purge_exam(uuid,uuid)'::regprocedure;
    IF current_user<>owner_name OR current_setting('wellq.purging_exam',true) IS DISTINCT FROM OLD.exam_id::text THEN RAISE EXCEPTION 'Versions can only be removed by purge'; END IF;
    RETURN OLD;
  END IF;
  IF EXISTS(SELECT 1 FROM storage_deletion_jobs WHERE version_id=NEW.id OR storage_key=NEW.storage_key) OR EXISTS(SELECT 1 FROM sync_changes WHERE entity='EXAM_VERSION' AND entity_id=NEW.id) THEN RAISE EXCEPTION 'A historical version UUID/storage key cannot be reused'; END IF;
  SELECT * INTO STRICT e FROM exams WHERE id=NEW.exam_id;
  IF e.deleted_at IS NOT NULL OR NOT can_write_patient(NEW.uploaded_by,e.patient_id) THEN RAISE EXCEPTION 'Uploader cannot write this exam'; END IF;
  expected_prefix:='clinics/'||e.clinic_id||'/patients/'||e.patient_id||'/exams/'||e.id||'/versions/'||NEW.id;
  IF NEW.storage_key <> expected_prefix THEN RAISE EXCEPTION 'Storage key must identify clinic, patient, exam and version UUID'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_version BEFORE INSERT OR UPDATE OR DELETE ON exam_versions FOR EACH ROW EXECUTE FUNCTION protect_version();
CREATE FUNCTION require_exam_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE eid uuid;
BEGIN
  IF TG_TABLE_NAME='exams' THEN eid:=NEW.id; ELSE eid:=OLD.exam_id; END IF;
  IF EXISTS(SELECT 1 FROM exams WHERE id=eid) AND NOT EXISTS(SELECT 1 FROM exam_versions WHERE exam_id=eid) THEN RAISE EXCEPTION 'A published exam needs at least one version'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_exam_version AFTER INSERT ON exams DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_exam_version();
CREATE CONSTRAINT TRIGGER keep_exam_version AFTER DELETE ON exam_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_exam_version();

CREATE FUNCTION protect_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE e exams; v exam_versions; p patients;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Audit logs cannot be deleted'; END IF;
  IF TG_OP='UPDATE' THEN
    -- FK referential actions are nested triggers; only nullification may change.
    IF pg_trigger_depth()>1 AND
      (to_jsonb(NEW)-'exam_id'-'exam_version_id')=(to_jsonb(OLD)-'exam_id'-'exam_version_id') AND
      (NEW.exam_id IS NULL OR NEW.exam_id IS NOT DISTINCT FROM OLD.exam_id) AND
      (NEW.exam_version_id IS NULL OR NEW.exam_version_id IS NOT DISTINCT FROM OLD.exam_version_id) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Audit history is immutable';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM user_clinics WHERE user_id=NEW.actor_id AND clinic_id=NEW.clinic_id) AND
     NOT (NEW.patient_id IS NULL AND NEW.exam_id IS NULL AND NEW.exam_version_id IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND is_system_admin)) THEN
    RAISE EXCEPTION 'Audit actor requires a membership in this clinic';
  END IF;
  IF NEW.action IN ('VIEW','DOWNLOAD','NEW_VERSION') AND NEW.exam_version_id IS NULL THEN RAISE EXCEPTION 'Action requires a concrete version'; END IF;
  IF NEW.patient_id IS NOT NULL THEN
    SELECT * INTO STRICT p FROM patients WHERE id=NEW.patient_id;
    IF p.clinic_id<>NEW.clinic_id THEN RAISE EXCEPTION 'Audit patient belongs to another clinic'; END IF;
  END IF;
  IF NEW.exam_id IS NOT NULL THEN
    SELECT * INTO STRICT e FROM exams WHERE id=NEW.exam_id;
    IF e.clinic_id<>NEW.clinic_id OR NEW.patient_id IS DISTINCT FROM e.patient_id THEN RAISE EXCEPTION 'Incoherent audit exam'; END IF;
  END IF;
  IF NEW.exam_version_id IS NOT NULL THEN
    SELECT * INTO STRICT v FROM exam_versions WHERE id=NEW.exam_version_id;
    IF NEW.exam_id IS DISTINCT FROM v.exam_id THEN RAISE EXCEPTION 'Incoherent audit version'; END IF;
    NEW.file_metadata:=jsonb_build_object('original_filename',v.original_filename,'mime_type',v.mime_type,'size_bytes',v.size_bytes,'sha256',v.sha256,'version_number',v.version_number);
  END IF;
  NEW.historical_exam_id:=NEW.exam_id;
  NEW.historical_version_id:=NEW.exam_version_id;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_audit BEFORE INSERT OR UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION protect_audit();

CREATE FUNCTION purge_exam(p_exam uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e exams; c uuid;
BEGIN
  SELECT clinic_id INTO STRICT c FROM exams WHERE id=p_exam;
  PERFORM 1 FROM clinics WHERE id=c FOR UPDATE;
  SELECT * INTO STRICT e FROM exams WHERE id=p_exam FOR UPDATE;
  IF e.deleted_at IS NULL OR NOT EXISTS (SELECT 1 FROM user_clinics m JOIN clinics c ON c.id=m.clinic_id
    WHERE m.user_id=p_actor AND m.clinic_id=e.clinic_id AND m.is_active AND m.role='CLINIC_ADMIN' AND c.is_active) THEN
    RAISE EXCEPTION 'Purge requires a deleted exam and an active clinic administrator';
  END IF;
  PERFORM set_config('wellq.purging_exam',p_exam::text,true);
  INSERT INTO audit_logs(clinic_id,actor_id,patient_id,exam_id,action) VALUES(e.clinic_id,p_actor,e.patient_id,e.id,'PURGE');
  INSERT INTO storage_deletion_jobs(clinic_id,exam_id,version_id,storage_key)
    SELECT e.clinic_id,e.id,id,storage_key FROM exam_versions WHERE exam_id=e.id;
  -- Emit version tombstones while their parent still exists.
  DELETE FROM exam_versions WHERE exam_id=e.id;
  DELETE FROM exams WHERE id=e.id;
  PERFORM set_config('wellq.purging_exam','',true);
END $$;
REVOKE ALL ON FUNCTION purge_exam(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION protect_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME; END $$;
CREATE TRIGGER protect_sync_history BEFORE UPDATE OR DELETE ON sync_changes FOR EACH ROW EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER protect_idempotency BEFORE UPDATE OR DELETE ON idempotency_records FOR EACH ROW EXECUTE FUNCTION protect_append_only();

-- Statement-level protection closes the TRUNCATE bypass of row triggers.
CREATE TRIGGER no_patient_truncate BEFORE TRUNCATE ON patients FOR EACH STATEMENT EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER no_membership_truncate BEFORE TRUNCATE ON user_clinics FOR EACH STATEMENT EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER no_audit_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER no_exam_truncate BEFORE TRUNCATE ON exams FOR EACH STATEMENT EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER no_version_truncate BEFORE TRUNCATE ON exam_versions FOR EACH STATEMENT EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER no_sync_truncate BEFORE TRUNCATE ON sync_changes FOR EACH STATEMENT EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER no_idempotency_truncate BEFORE TRUNCATE ON idempotency_records FOR EACH STATEMENT EXECUTE FUNCTION protect_append_only();

CREATE FUNCTION protect_sync_counter() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.sync_revision<>0 THEN RAISE EXCEPTION 'A new clinic starts at revision zero'; END IF;
  ELSIF NEW.sync_revision IS DISTINCT FROM OLD.sync_revision AND pg_trigger_depth()<=1 THEN
    RAISE EXCEPTION 'The sync revision is managed by change triggers';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_sync_counter BEFORE INSERT OR UPDATE OF sync_revision ON clinics FOR EACH ROW EXECUTE FUNCTION protect_sync_counter();
CREATE FUNCTION protect_deletion_job() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF (NEW.id,NEW.clinic_id,NEW.exam_id,NEW.version_id,NEW.storage_key,NEW.created_at) IS DISTINCT FROM
     (OLD.id,OLD.clinic_id,OLD.exam_id,OLD.version_id,OLD.storage_key,OLD.created_at) THEN
    RAISE EXCEPTION 'Deletion job target is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_deletion_job BEFORE UPDATE ON storage_deletion_jobs FOR EACH ROW EXECUTE FUNCTION protect_deletion_job();

CREATE FUNCTION exam_type_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid;
BEGIN
  IF (NEW.code,NEW.name,NEW.is_active) IS DISTINCT FROM (OLD.code,OLD.name,OLD.is_active) THEN
    FOR c IN SELECT DISTINCT clinic_id FROM exams WHERE exam_type_id=NEW.id ORDER BY clinic_id LOOP
      PERFORM 1 FROM clinics WHERE id=c FOR UPDATE;
    END LOOP;
    UPDATE exams SET updated_at=clock_timestamp() WHERE exam_type_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exam_type_changed AFTER UPDATE ON exam_types FOR EACH ROW EXECUTE FUNCTION exam_type_changed();
