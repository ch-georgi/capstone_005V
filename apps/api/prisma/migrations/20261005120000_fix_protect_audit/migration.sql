-- Repair audit inserts without changing the applied initial migration.
-- Historical version UUID/storage key checks belong to protect_version().
CREATE OR REPLACE FUNCTION protect_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
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
