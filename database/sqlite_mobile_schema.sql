-- apps/mobile/database/schema.sql
--
-- Esquema SQLite local para la app Android (React Native + Expo).
-- Construido sobre las secciones 16-18 de la Propuesta de Redefinición.
--
-- IMPORTANTE (sección 19 del documento):
--   El JWT / refresh token NUNCA se guardan aquí. Van en el almacenamiento
--   seguro del sistema operativo (expo-secure-store), no en esta base.
--   SQLite es solo para datos de aplicación: caché y cola de sincronización.
--
-- PostgreSQL sigue siendo la fuente de verdad (sección 16). Esta base
-- es subordinada y desechable: se puede reconstruir completa volviendo
-- a sincronizar contra la API.
--
-- Uso con expo-sqlite (ejemplo):
--   import * as SQLite from 'expo-sqlite';
--   const db = await SQLite.openDatabaseAsync('wellq_local.db');
--   await db.execAsync(<contenido de este archivo>);

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- local_patients
-- En el caso del paciente móvil, normalmente contendrá solo al propio
-- paciente autenticado (no una lista completa, a diferencia del backend).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_patients (
  id          TEXT PRIMARY KEY,     -- mismo UUID que en PostgreSQL (patients.id)
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  clinic_id   TEXT NOT NULL,        -- clínica activa del paciente en este dispositivo
  updated_at  TEXT NOT NULL         -- ISO-8601, para detectar datos obsoletos
);

-- ---------------------------------------------------------------------
-- local_exams
-- Caché de metadatos de examen. NO almacena el archivo binario.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_exams (
  id                  TEXT PRIMARY KEY,   -- mismo UUID que exams.id en PostgreSQL
  patient_id          TEXT NOT NULL,
  exam_type_code      TEXT NOT NULL,      -- LAB, IMAGING, MEDICAL_REPORT, etc.
  exam_type_name      TEXT NOT NULL,
  title               TEXT NOT NULL,
  exam_date           TEXT NOT NULL,      -- ISO-8601 (date)
  professional_name   TEXT,
  current_version     INTEGER NOT NULL DEFAULT 1,
  deleted             INTEGER NOT NULL DEFAULT 0,  -- 0/1 (borrado lógico espejado)
  updated_at          TEXT NOT NULL,

  FOREIGN KEY (patient_id) REFERENCES local_patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_exams_patient ON local_exams(patient_id);

-- ---------------------------------------------------------------------
-- local_exam_versions
-- storage_key apunta al objeto en MinIO/S3 (remoto). local_file_uri
-- apunta a un archivo descargado en el almacenamiento privado de la
-- app (si el usuario ya lo abrió/descargó para ver offline).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_exam_versions (
  id                  TEXT PRIMARY KEY,   -- mismo UUID que exam_versions.id
  exam_id             TEXT NOT NULL,
  version_number      INTEGER NOT NULL,
  original_filename   TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  sha256              TEXT NOT NULL,
  remote_available    INTEGER NOT NULL DEFAULT 1,  -- 0/1: ¿existe ya en el backend?
  local_file_uri      TEXT,                        -- NULL si no se ha descargado localmente
  created_at          TEXT NOT NULL,

  FOREIGN KEY (exam_id) REFERENCES local_exams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_exam_versions_exam ON local_exam_versions(exam_id);

-- ---------------------------------------------------------------------
-- sync_queue
-- Cola de operaciones pendientes de sincronizar con el backend
-- (por ejemplo, una subida de examen hecha sin conexión).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
  id            TEXT PRIMARY KEY,
  operation     TEXT NOT NULL,       -- ej: 'CREATE_EXAM', 'UPLOAD_VERSION'
  entity_type   TEXT NOT NULL,       -- ej: 'exam', 'exam_version'
  entity_id     TEXT NOT NULL,

  payload       TEXT NOT NULL,       -- JSON serializado con los datos a enviar
  file_uri      TEXT,                -- referencia al archivo local a subir (si aplica)

  status        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | PROCESSING | FAILED | COMPLETED
  retry_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

-- ---------------------------------------------------------------------
-- sync_metadata
-- Tabla key-value simple para marcas de tiempo de la última
-- sincronización por tipo de entidad.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Ejemplos de filas esperadas (no se insertan automáticamente):
--   ('last_exam_sync', '2026-09-30T12:00:00Z')
--   ('last_patient_sync', '2026-09-30T12:00:00Z')
