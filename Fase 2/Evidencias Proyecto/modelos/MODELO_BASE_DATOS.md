# Modelo de base de datos de WellQ

Modelo derivado del código del repositorio al 11 de noviembre de 2026. Documenta el esquema versionado; no se consultó una base desplegada.

Fuentes: [Prisma/PostgreSQL](../apps/api/prisma/schema.prisma), [migraciones](../apps/api/prisma/migrations/), [SQLite móvil v2](sqlite_mobile_schema.sql) y [contrato de persistencia](contracts/README.md).

## Vista general del dominio

```mermaid
erDiagram
    users ||--o{ user_clinics : pertenece
    clinics ||--o{ user_clinics : agrupa
    user_clinics ||..o| patients : tiene_ficha
    patients ||..o{ exams : registra
    clinics ||..o{ exams : contiene
    exam_types ||..o{ exams : clasifica
    exams ||..|{ exam_versions : contiene
```

La cuenta de acceso es global. La membresía define el rol en cada clínica y puede tener una ficha de paciente propia. Una cuenta puede tener fichas independientes en varias clínicas.

## Modelo completo PostgreSQL

Incluye todas las tablas y columnas de Prisma con sus nombres físicos SQL. `PK` indica clave primaria; `FK`, clave foránea; `UK`, unicidad individual. En claves compuestas, `PK` marca cada componente. Las restricciones únicas compuestas se detallan después del diagrama. `nullable` indica que la columna admite NULL. Los valores por defecto, índices y validaciones CHECK no se enumeran en los atributos.

Cardinalidades: `||` = exactamente uno; `o|` = cero o uno; `o{` = cero o muchos; `|{` = uno o muchos. La línea continua representa una relación identificadora (la FK integra la PK del hijo); la discontinua, una relación no identificadora. Ambas representan FKs reales.

La relación examen–versiones muestra el mínimo de una versión exigido por el constraint diferido de las migraciones, además de la FK.

```mermaid
erDiagram
    clinics {
        uuid id PK
        text name
        text code UK
        boolean is_active
        bigint sync_revision
        timestamptz created_at
        timestamptz updated_at
    }
    users {
        uuid id PK
        text email UK "nullable"
        text password_hash "nullable"
        boolean is_system_admin
        gender gender
        timestamptz created_at
        timestamptz updated_at
        integer credentials_version
    }
    user_clinics {
        uuid user_id PK, FK
        uuid clinic_id PK, FK
        tenant_role role
        boolean is_active
        text display_name
        bigint permission_revision
        timestamptz created_at
        timestamptz updated_at
    }
    patients {
        uuid id PK
        uuid user_id FK
        uuid clinic_id FK
        text first_name
        text last_name
        date date_of_birth
        text email "nullable"
        text phone "nullable"
        text medical_record_number "nullable"
        timestamptz deleted_at "nullable"
        uuid deleted_by FK "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    exam_types {
        uuid id PK
        text code UK
        text name
        boolean is_active
    }
    exams {
        uuid id PK
        uuid clinic_id FK
        uuid patient_id FK
        uuid exam_type_id FK
        text title
        date exam_date
        text professional_name "nullable"
        text notes "nullable"
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "nullable"
        uuid deleted_by FK "nullable"
    }
    exam_versions {
        uuid id PK
        uuid exam_id FK
        integer version_number
        text storage_key UK
        text original_filename
        text mime_type
        bigint size_bytes
        text sha256 "varchar(64)"
        uuid uploaded_by FK
        timestamptz created_at
    }
    audit_logs {
        uuid id PK
        uuid clinic_id FK
        uuid actor_id FK
        uuid patient_id FK "nullable"
        uuid exam_id FK "nullable"
        uuid exam_version_id FK "nullable"
        uuid historical_exam_id "nullable"
        uuid historical_version_id "nullable"
        jsonb file_metadata "nullable"
        audit_action action
        inet ip_address "nullable"
        text user_agent "nullable"
        jsonb metadata "nullable"
        timestamptz created_at
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        uuid session_id FK "nullable"
        text token_hash UK "varchar(64)"
        timestamptz expires_at
        timestamptz revoked_at "nullable"
        timestamptz created_at
    }
    idempotency_records {
        uuid id PK
        uuid user_id FK
        uuid clinic_id FK
        uuid operation_id
        upload_operation operation
        text request_hash "varchar(64)"
        jsonb response
        timestamptz created_at
    }
    sync_changes {
        uuid clinic_id PK, FK
        bigint revision PK
        sync_entity entity
        uuid entity_id
        uuid patient_id
        sync_action action
        jsonb payload
        timestamptz created_at
    }
    storage_deletion_jobs {
        uuid id PK
        uuid clinic_id FK
        uuid exam_id
        uuid version_id UK
        text storage_key UK
        deletion_job_status status
        integer retry_count
        timestamptz next_attempt_at "nullable"
        timestamptz processing_until "nullable"
        text last_error "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    auth_sessions {
        uuid id PK
        uuid user_id FK
        uuid clinic_id FK
        timestamptz expires_at
        timestamptz revoked_at "nullable"
        timestamptz created_at
    }
    auth_challenges {
        uuid id PK
        uuid user_id FK "nullable"
        text purpose
        text secret_hash "varchar(64)"
        integer credentials_version
        integer attempts
        timestamptz expires_at
        timestamptz consumed_at "nullable"
        timestamptz created_at
    }
    auth_rate_limits {
        text key PK
        integer count
        timestamptz reset_at
    }
    users ||--o{ user_clinics : "user_id"
    clinics ||--o{ user_clinics : "clinic_id"
    user_clinics ||..o| patients : "user_id, clinic_id"
    users |o..o{ patients : "deleted_by"
    clinics ||..o{ exams : "clinic_id"
    patients ||..o{ exams : "patient_id, clinic_id"
    exam_types ||..o{ exams : "exam_type_id"
    users ||..o{ exams : "created_by"
    users |o..o{ exams : "deleted_by"
    exams ||..|{ exam_versions : "exam_id"
    users ||..o{ exam_versions : "uploaded_by"
    clinics ||..o{ audit_logs : "clinic_id"
    users ||..o{ audit_logs : "actor_id"
    patients |o..o{ audit_logs : "patient_id"
    exams |o..o{ audit_logs : "exam_id"
    exam_versions |o..o{ audit_logs : "exam_version_id"
    auth_sessions |o..o{ refresh_tokens : "session_id"
    users ||..o{ refresh_tokens : "user_id"
    users ||..o{ idempotency_records : "user_id"
    clinics ||..o{ idempotency_records : "clinic_id"
    clinics ||--o{ sync_changes : "clinic_id"
    clinics ||..o{ storage_deletion_jobs : "clinic_id"
    users ||..o{ auth_sessions : "user_id"
    clinics ||..o{ auth_sessions : "clinic_id"
    users |o..o{ auth_challenges : "user_id"
```

### Unicidad compuesta PostgreSQL

| Tabla | Columnas UNIQUE |
|---|---|
| `patients` | `(user_id, clinic_id)` |
| `patients` | `(id, clinic_id)` |
| `patients` | `(clinic_id, medical_record_number)` |
| `exam_versions` | `(exam_id, version_number)` |
| `idempotency_records` | `(user_id, clinic_id, operation_id)` |

### Enumeraciones PostgreSQL

| Tipo | Valores |
|---|---|
| `tenant_role` | `CLINIC_ADMIN`, `CLINICIAN`, `PATIENT` |
| `gender` | `FEMALE`, `MALE`, `UNSPECIFIED` |
| `audit_action` | `CREATE`, `VIEW`, `DOWNLOAD`, `NEW_VERSION`, `UPDATE`, `DELETE`, `PURGE` |
| `upload_operation` | `CREATE_EXAM_WITH_VERSION`, `UPLOAD_VERSION` |
| `sync_entity` | `PATIENT`, `EXAM`, `EXAM_VERSION` |
| `sync_action` | `UPSERT`, `DELETE` |
| `deletion_job_status` | `PENDING`, `PROCESSING`, `FAILED`, `COMPLETED` |

## Reglas que complementan el diagrama

- `patients(user_id, clinic_id)` referencia a `user_clinics(user_id, clinic_id)`; no existe una tabla `patient_clinics`. La membresía admite como máximo una ficha de paciente.
- `exams(patient_id, clinic_id)` referencia a `patients(id, clinic_id)`, evitando asociar un examen a un paciente de otra clínica.
- `users.gender` es un atributo de la identidad global. El rol y la actividad dentro de una clínica pertenecen a `user_clinics`.
- Los pacientes y exámenes tienen eliminación lógica mediante `deleted_at` y `deleted_by`. Las membresías se desactivan y los pacientes se conservan físicamente.
- Cada versión representa un archivo inmutable en S3/MinIO; la base guarda su clave y metadatos. No hay una tabla de archivos ni contenido documental BLOB.
- Al purgar un examen, sus versiones se eliminan en cascada. Las FKs de `audit_logs` hacia examen y versión pasan a NULL; los UUID históricos y metadatos se conservan.
- `audit_logs.historical_exam_id` y `historical_version_id`; `sync_changes.entity_id` y `patient_id`; y `storage_deletion_jobs.exam_id` y `version_id` son identificadores históricos sin FK a esas entidades. Por eso no se dibujan relaciones para ellos.
- `auth_rate_limits` no declara FKs. `auth_challenges.user_id` y `refresh_tokens.session_id` son opcionales.
- Los triggers añaden reglas de coherencia y autorización que no se expresan completamente en un ERD. Véanse las migraciones y el contrato de persistencia.

## SQLite móvil: caché y sincronización

Es una base independiente del servidor. No hay FKs entre PostgreSQL y SQLite. Las columnas `owner_user_id` y `clinic_id` delimitan el contexto local; las relaciones compuestas conservan ese aislamiento. El diagrama se obtiene de las tablas y FKs del SQL v2 ejecutado en memoria.

```mermaid
erDiagram
    local_contexts {
        text owner_user_id PK
        text clinic_id PK
        text role
        text permission_revision
        text access_state
        text updated_at
    }
    local_patients {
        text owner_user_id PK, FK
        text clinic_id PK, FK
        text id PK
        text user_id
        text first_name
        text last_name
        text date_of_birth
        text email "nullable"
        text phone "nullable"
        text medical_record_number "nullable"
        integer is_active
        text deleted_at "nullable"
        text updated_at
    }
    local_exams {
        text owner_user_id PK, FK
        text clinic_id PK, FK
        text id PK
        text patient_id FK
        text exam_type_code
        text exam_type_name
        text title
        text exam_date
        text professional_name "nullable"
        text notes "nullable"
        integer current_version "nullable"
        integer latest_server_version
        text updated_at
    }
    local_exam_versions {
        text owner_user_id PK, FK
        text clinic_id PK, FK
        text id PK
        text exam_id FK
        integer version_number
        text original_filename
        text mime_type
        integer size_bytes
        text sha256
        text local_file_uri "nullable"
        text verified_at "nullable"
        text created_at
    }
    sync_queue {
        text owner_user_id PK, FK
        text clinic_id PK, FK
        text id PK
        text patient_id
        text exam_id
        text version_id
        text operation
        text payload
        text file_uri
        text sha256
        text request_hash
        text mime_type
        integer size_bytes
        text original_filename
        text status
        integer retry_count
        integer is_retryable
        text pause_reason "nullable"
        text next_attempt_at "nullable"
        text processing_until "nullable"
        text last_error "nullable"
        text created_at
        text updated_at
    }
    sync_metadata {
        text owner_user_id PK, FK
        text clinic_id PK, FK
        text stream PK
        text cursor "nullable"
        text revision
        text updated_at
    }
    local_file_cleanup {
        text owner_user_id PK
        text clinic_id PK
        text file_uri PK
    }
    legacy_queue_quarantine {
        integer legacy_rowid PK
        text raw_record
        text file_uri "nullable"
        text reason
    }
    local_contexts ||--o{ local_patients : "owner_user_id, clinic_id"
    local_patients ||..o{ local_exams : "owner_user_id, clinic_id, patient_id"
    local_exams ||..o{ local_exam_versions : "owner_user_id, clinic_id, exam_id"
    local_contexts ||--o{ sync_queue : "owner_user_id, clinic_id"
    local_contexts ||--o{ sync_metadata : "owner_user_id, clinic_id"
```

### Unicidad compuesta SQLite

| Tabla | Columnas UNIQUE |
|---|---|
| `local_patients` | `(owner_user_id, clinic_id, user_id)` |
| `local_exam_versions` | `(owner_user_id, clinic_id, exam_id, version_number)` |
| `sync_queue` | `(owner_user_id, clinic_id, version_id)` |

`local_file_cleanup` y `legacy_queue_quarantine` no declaran FKs. La limpieza de archivos debe sobrevivir a la eliminación de caché; la cuarentena preserva registros antiguos sin atribuirles automáticamente propietario o clínica.

`sync_queue` referencia únicamente al contexto: sus identificadores de paciente, examen y versión no tienen FK a la caché, porque una carga pendiente puede corresponder a entidades todavía no confirmadas. Las credenciales se almacenan fuera de SQLite.

`local_exams.current_version` se deriva de las descargas verificadas; `latest_server_version` indica la última versión confirmada por el servidor. Los archivos físicos se referencian mediante URI.
