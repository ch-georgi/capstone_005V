# Contrato de datos y sincronización de WellQ

Este documento es el contrato vigente de persistencia. La API NestJS y el cliente Android todavía no existen. Los esquemas, migraciones, triggers, helpers SQL, adaptadores SQLite y utilidades de firma/hash sí están implementados. Los endpoints y trabajadores descritos a continuación son trabajo posterior.

## Identidad y autorización

`User` es una identidad global de acceso; no contiene nombres, ficha clínica, rol de tenant ni actividad de tenant. `email` normalizado único y `password_hash` son opcionales para cuentas pendientes. El login requiere ambos. `is_system_admin` no concede lectura de contenido clínico.

`UserClinic(user_id,clinic_id)` es la única pertenencia a una clínica. Contiene rol, actividad, nombre de presentación y revisión de permisos. No se elimina: se desactiva. Un rol PATIENT con ficha histórica no se transforma en otro rol; una futura capacidad de múltiples roles requerirá ampliar el modelo.

`Patient` es una ficha PRIVADA de una clínica, con UUID propio y FK a esa membresía. Dos clínicas tienen fichas distintas para la misma cuenta. Nombres, nacimiento, contacto y número de ficha solo pertenecen a esa ficha. `PatientClinic` ya no existe. El correo administrativo no vincula identidades ni se utiliza como credencial. Una vinculación posterior de una cuenta pendiente requiere prueba de propiedad y una transacción que reasigne la ficha a la membresía verificada; si ya existe otra ficha para la misma cuenta/clínica, se detiene para conciliación explícita. No se fusionan automáticamente fichas ni documentos.

La actividad del paciente deriva de UserClinic; su eliminación lógica usa `deleted_at/deleted_by`. No hay otro booleano activo en Patient. Pacientes y membresías no admiten DELETE/TRUNCATE. Conservar su identidad permite mantener sus exámenes aunque dejen de participar en una clínica.

| Actor | Lectura | Escritura documental |
|---|---|---|
| Administrador global sin membresía clínica | Ninguna | Ninguna |
| Administrador/clínico activo en clínica activa | Pacientes activos, no eliminados, de su clínica | Los mismos pacientes |
| Paciente activo, ficha y clínica activas | Sus propios exámenes no eliminados | Sus propios exámenes |
| Paciente inactivo, ficha eliminada o clínica inactiva | Sus propios exámenes históricos no eliminados | Ninguna |
| Cuenta pendiente sin credenciales | No puede autenticarse | No puede autenticarse |

No hay asignación profesional-paciente: por ahora los clínicos activos acceden a todos los pacientes activos de su clínica. Las funciones SQL `can_read_patient(actor,patient)` y `can_write_patient(actor,patient)` expresan esas reglas, pero no autentican al actor. El backend debe obtenerlo del JWT verificado, nunca del body. La administración de fichas y membresías requiere CLINIC_ADMIN activo. Toda descarga/listado/versionado obtiene el tenant desde una membresía autorizada; los índices no son aislamiento ni reemplazan autorización.

## Archivos, auditoría y purga

Un examen tiene una o más versiones; cada versión tiene exactamente un archivo. Un constraint diferido impide confirmar un examen sin versiones. Versiones confirmadas no se actualizan.

Límite exacto: **10.000.000 bytes**, tamaño mínimo 1. Formatos: `application/pdf`, `image/jpeg`, `image/png`. SHA-256: 64 hexadecimales en minúsculas. El backend calcula hash y detecta el MIME real; no confía en los datos enviados por el cliente. Las restricciones SQL verifican metadatos, no el contenido de S3.

El esquema PostgreSQL de despliegue es public; no configurar otro search_path/schema en DATABASE_URL. Un solo bucket por despliegue. Clave obligatoria y única:

```text
clinics/{clinicId}/patients/{patientId}/exams/{examId}/versions/{versionId}
```

Los identificadores son UUID nativos en PostgreSQL y UUID canónicos en SQLite. Las fechas clínicas son YYYY-MM-DD; instantes de API/SQLite son UTC `YYYY-MM-DDTHH:mm:ss.sssZ`; PostgreSQL usa timestamptz(3). Los triggers mantienen updated_at incluso para SQL externo.

La auditoría identifica clínica, paciente, examen y versión coherentes. VIEW, DOWNLOAD y NEW_VERSION requieren una versión. Conserva UUIDs históricos y metadatos de archivo al purgar; no permite cambios del contenido histórico ni eliminación. La desvinculación automática de FKs operativas es la única actualización permitida.

El borrado habitual del examen es lógico, con fecha y actor. `purge_exam(exam,actor)` exige un administrador activo de la clínica, clínica activa y examen previamente eliminado. Registra PURGE, encola StorageDeletionJob, emite tombstones de versiones y examen y elimina las filas dentro de la misma transacción. UUIDs y claves purgados no pueden reutilizarse.

El trabajador S3 pendiente elimina objetos fuera de esa transacción. Un 404 confirma ausencia; una falla mantiene el trabajo con error/intentos/proxima ejecución. El target del trabajo es inmutable. Sus leases duran cinco minutos y los reintentos usan la política de la cola local. Los archivos se conservan hasta completar ese trabajo; una purga de filas no equivale a haber borrado S3. No se pierden auditoría ni tombstones si falla S3.

`database/postgresql/application_role.sql` crea el grupo NOLOGIN wellq_app y concede permisos mínimos después de las migraciones. Debe asignarse al login real de API, que no debe ser dueño de tablas ni heredar al migrador. El API no puede modificar versiones, auditoría, resultados de idempotencia o el historial de cambios, ni borrar/truncar pacientes. El worker solo actualiza campos de ejecución de StorageDeletionJob. RLS no está implementado; los SELECT autorizados siguen siendo responsabilidad del backend.

## Cargas y reintentos

Contrato pendiente: POST `/api/v1/exams/uploads`, multipart, con un campo JSON `request` de tipo UploadEnvelope (types.ts) y un campo `file`. Operaciones: CREATE_EXAM_WITH_VERSION y UPLOAD_VERSION. No hay dos operaciones dependientes para la primera carga.

Los UUID de operación, examen y versión se generan antes de encolar y no cambian. CREATE requiere título, fecha y tipo; UPLOAD_VERSION requiere examen existente. El archivo debe copiarse primero a un directorio privado persistente de pendientes, separado del directorio de descargas. Las tablas de caché solo reciben entidades confirmadas por el servidor.

La huella se calcula sobre UploadEnvelope normalizado con claves JSON ordenadas recursivamente (security.ts), UTF-8 y SHA-256. Campos opcionales ausentes se omiten, no se representan como undefined. El backend recalcula tamaño/MIME/hash del archivo y valida el DTO antes de calcular su propia huella. El request_hash local no es una prueba de autenticidad.

Secuencia del backend pendiente:

1. Autenticar actor y validar pertenencia/actividad/escritura; validar DTO y archivo.
2. Para usuario+clínica+operationId existente: igual huella devuelve el resultado guardado con HTTP 200 y `replayed:true`; distinta huella devuelve 409 IDEMPOTENCY_CONFLICT. Revalidar autorización antes de devolver resultados. Los resultados se conservan durante el MVP.
3. Serializar solicitudes de la misma operación con un advisory lock estable sobre esa combinación, comprobar de nuevo el resultado y almacenar el objeto bajo la clave UUID. Una repetición idéntica puede reutilizar el objeto verificado; una huella distinta jamás lo sobrescribe.
4. Después de verificar S3, iniciar la transacción de publicación. Bloquear primero la clínica, después el examen; tomar el máximo número de versión y sumar uno. Para operaciones de varias clínicas, bloquear UUIDs ordenados. Los uploads de red no mantienen estos locks.
5. Crear examen+primera versión o agregar versión; insertar auditoría e IdempotencyRecord con respuesta `{examId,versionId,versionNumber}`. Triggers producen cambios y updated_at. Confirmar conjuntamente y responder 201, `replayed:false`.
6. Un fallo previo al commit permite reintento con los mismos UUID. Para objetos sin publicación, el backend debe conciliar operaciones terminadas/interrumpidas antes de encolar su limpieza; jamás borrar un objeto de una operación todavía en curso. Las transacciones que fallen por deadlock/serialización se reintentan hasta tres veces con el mismo operationId.

SQLite conserva la cola por propietario+clínica. claimUpload solo toma trabajos de ese contexto con READ_WRITE y lease de cinco minutos. Los leases vencidos se recuperan; settleUpload exige el mismo lease para impedir que un worker antiguo confirme un trabajo reclamado.

PENDING → PROCESSING → COMPLETED o FAILED. Cada claim consume un intento, también si el proceso se interrumpe, hasta un máximo de ocho; espera `min(5000 * 2^(intentos-1),300000)` ms. Errores definitivos no reintentan. AUTH/PERMISSION dejan PENDING pausado sin consumir intentos. Solo una nueva autenticación/verificación de permisos puede quitar esa pausa. Una resolución manual reintenta conservando identidad/contenido o descarta explícitamente el archivo; no cambia una solicitud existente para reutilizar su operationId.

Al completar se agenda limpieza del archivo pendiente. El worker local procesa local_file_cleanup después del commit; verifica que el URI no siga referenciado como descarga verificada antes de eliminarlo y reconoce el trabajo luego. No se deben reutilizar los URIs de pendientes como URIs de descargas confirmadas.

## Sincronización incremental

Contrato pendiente: GET `/api/v1/sync?clinicId=UUID&cursor=TOKEN&limit=N`. JWT obligatorio. Limit entero 1..500, default 100. Sin cursor devuelve SNAPSHOT completo y no paginado para el volumen del MVP, obtenido en una transacción REPEATABLE READ junto con la revisión confirmada. La respuesta usa SyncResponse de types.ts; SNAPSHOT incluye fichas, exámenes y versiones permitidos ordenados padre antes de hijo.

SyncChange tiene revisión monotónica por clínica, entidad, UUID, paciente, UPSERT/DELETE y payload. La base incrementa el contador de la clínica bajo un lock que dura hasta commit; no utiliza una secuencia ni un reloj del móvil. Versiones nuevas emiten primero su examen actualizado y luego la versión. Los eventos de examen incluyen código/nombre de tipo; editar el catálogo vuelve a emitir los exámenes afectados, bajo locks de clínica ordenados. No se crean exámenes nuevos con tipos inactivos. Los tombstones sobreviven a purgas; no se podan en este MVP.

Cursor firmado HMAC-SHA256: `{version,userId,clinicId,permissionRevision,afterRevision,throughRevision}`. La clave secreta tiene al menos 32 bytes y no se entrega al móvil. security.ts implementa firma, validación de firma y vínculo al contexto. Revisiones se serializan como cadenas decimales; tamaños de archivo como números acotados. DTOs de salida convierten snake_case SQL a camelCase y normalizan instantes a UTC.

Para DELTA, si afterRevision=throughRevision se captura un nuevo límite superior confirmado. En caso contrario se continúa hasta el límite ya firmado. Se escanean hasta limit cambios dentro de ese rango en una lectura consistente; el cursor avanza por la última revisión ESCANEADA, aunque no se devuelvan cambios visibles. hasMore indica cambios pendientes hasta ese límite. Nuevos commits quedan para el siguiente ciclo.

Nunca se devuelve el payload histórico bruto sin autorización actual. PATIENT recibe solamente eventos de su propia ficha de ese tenant, incluidos datos históricos permitidos. Para personal clínico, una ficha actualmente inactiva/eliminada produce tombstone de paciente en lugar de datos privados; su eliminación local en cascada retira exámenes/versiones. Un evento de examen/versión cuyo paciente ya no es visible puede omitirse cuando la retirada del paciente se incluye en el rango o en el snapshot de permisos. Eventos de una entidad ya purgada/eliminada se transforman en DELETE, incluso si el evento original era UPSERT. Esto evita filtrar datos desde eventos viejos o resucitar documentos.

La revisión de permisos cambia al desactivar/cambiar rol, eliminar/restaurar ficha propia o activar/desactivar clínica. Un cursor de otra cuenta/clínica o con permisos obsoletos devuelve 409 SYNC_RESET_REQUIRED; firma inválida devuelve 400 INVALID_CURSOR. Sin membresía devuelve 403. El cliente hace snapshot nuevo, sustituyendo solo la caché del contexto; conserva o pausa la cola y nunca la reasigna. Una cuenta paciente inactiva/eliminada recibe READ_ONLY y sus exámenes no eliminados.

applySyncPage aplica cambios validados y cursor en una transacción SQLite. UPSERTs son idempotentes; no usar REPLACE porque elimina filas y dispara cascadas. Repetir una página no retrocede la revisión. applyTombstone retira las filas y agenda limpieza de archivos, pero conserva/falla cargas pendientes afectadas con RESOURCE_DELETED, incluso si no había una fila en caché. No las elimina ni reenvía automáticamente. La descarga online vuelve a autorizar en el servidor. Un móvil offline no puede conocer una revocación nueva; se aplica al recuperar conexión.

## Caché local y migraciones

Una sola base compartida con claves `(owner_user_id,clinic_id,...)`. El cliente nunca consulta por patientId/examId aislados. local_contexts distingue READ_WRITE, READ_ONLY y REVOKED. No contiene tokens ni contraseñas: van en Secure Storage Android.

current_version es nullable y se deriva de las versiones cuyo archivo existe y fue verificado. latest_server_version describe el servidor. Los triggers recalculan current_version al registrar, retirar o borrar una descarga. El cliente comprueba existencia real del URI antes de abrir y limpia `local_file_uri/verified_at` si falta el archivo. Sin archivo verificado no hay apertura offline; online se descarga primero a temporal, se calcula tamaño/hash y se mueve al directorio privado definitivo antes de confirmar URI+verified_at.

build_schema.py genera el SQL v2. migrate.ts adapta Expo SQLite mediante SQLiteAdapter; migrate.py es el runner de referencia/pruebas. La migración requiere conexión exclusiva, foreign_keys=ON y transacción EXCLUSIVE. Detecta base nueva, legacy sin versión o v1, y v2; rechaza estructuras desconocidas. Preserva la antigua cola completa como legacy_sync_queue_raw y registra su representación con tipos en legacy_queue_quarantine. No adivina propietario ni clínica, aunque una sesión esté abierta. Esas operaciones solo pueden reencolarse después de verificar ambos y revisar contenido/archivo. Se reconstruye la caché legacy; ningún pendiente ni archivo se borra.

Para futuras versiones añadir pasos secuenciales, actualizar user_version solo en la misma transacción y probar rollback. Un IF NOT EXISTS no es una migración. local_db.ts es solo una propuesta de PWA, sin uso en Android.

## Validación reproducible

Desde la raíz:

```powershell
npm.cmd ci --prefix apps/api
npm.cmd run db:generate --prefix apps/api
npm.cmd run typecheck --prefix apps/api
node apps/api/node_modules/typescript/bin/tsc --noEmit --project database/tsconfig.json
python database/tests/test_sqlite.py
node database/tests/run-local.cjs
```

Usar Node 22.13+ para las pruebas con node:sqlite; la app móvil usa Expo SQLite, no node:sqlite. Los tests TypeScript ejecutan el mismo adaptador contra SQLite real.

En una base PostgreSQL 16 TEMPORAL cuyo nombre termine en `_schema_test`:

```powershell
$env:DATABASE_URL='postgresql://postgres:test_password@localhost:55432/wellq_schema_test'
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npm.cmd run db:migrate:deploy --prefix apps/api
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/postgresql/application_role.sql
npm.cmd run db:seed --prefix apps/api
npm.cmd run db:seed --prefix apps/api
npm.cmd run test:postgres --prefix apps/api
```

test-postgres.ts comprueba constraints diferidos, FKs, acceso histórico SQL, auditoría/purga, permisos del grupo de aplicación, idempotencia persistida y transacciones concurrentes. Mantiene datos sintéticos únicamente en esa base de prueba. Los contratos de HTTP/S3 no son pruebas E2E de una API todavía inexistente. El workflow de CI usa PostgreSQL 16 temporal.

La migración inicial fue regenerada porque el entorno fue declarado descartable. No ejecutar reset sobre despliegues con datos; cualquier despliegue anterior requiere una migración de transición distinta.

Seed: upserts con UUIDs estables, cuentas activadas/pendientes, roles/activación diferentes por tenant y fichas históricas. documento-demo.pdf es un archivo sintético real cuyo checksum calcula el seed. db:seed crea metadatos; db:fixtures carga esos bytes al bucket existente mediante S3 SigV4, usando S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY y S3_REGION opcional. No hay descargas funcionales hasta cargar esos fixtures. El seed nunca usa borrado físico de pacientes ni modifica versiones confirmadas.
