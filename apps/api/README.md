# API WellQ: usuarios, login y Swagger

La API implementa PB-016, PB-017, PB-019 y PB-020, y añade sesiones móviles renovables (PB-018), selección de clínica y recuperación por correo. La documentación local
adelanta PB-104; Swagger desplegado (PB-094) sigue pendiente de despliegue.
Pacientes, auditoría y la carga/descarga de exámenes ya están implementados; las carpetas de
clínicas, exámenes (listados), sync y trabajos siguen con `.gitkeep`.

## Preparar y arrancar

Ejecutar desde la raíz con Node 22.13+ dentro de la versión 22. Primero seguir
[DESARROLLO_LOCAL.md](../../DESARROLLO_LOCAL.md) para PostgreSQL y migraciones.
Usar `migrate deploy`, no `db push`. La API utiliza el esquema vigente sin
migraciones nuevas. En despliegue, usar un login miembro de `wellq_app`, distinto
del dueño/migrador; ver [contrato de datos](../../database/contracts/README.md).

```powershell
npm.cmd ci --prefix apps/api
npm.cmd run db:generate --prefix apps/api
```

Completar `apps/api/.env` sin versionarlo:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL obligatoria. |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 bytes, obligatorio, sin valor predeterminado. |
| `JWT_ISSUER` | Emisor obligatorio; ejemplo local: `wellq-api`. |
| `JWT_AUDIENCE` | Audiencia obligatoria; ejemplo local: `wellq-clients`. |
| `PORT` | Puerto, 3000 por defecto. |
| `SWAGGER_ENABLED` | `true`/`false`; por defecto desactivado en producción y activado en otros entornos. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Almacenamiento de documentos (MinIO local: ver DESARROLLO_LOCAL.md). Opcionales para arrancar, pero si defines una deben estar las cuatro; sin ellas, las rutas de archivos responden `503 STORAGE_NOT_CONFIGURED`. `S3_REGION` es opcional (`us-east-1`). |
| `BOOTSTRAP_ADMIN_EMAIL` | Email del superadmin inicial; solo para el comando bootstrap. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Contraseña inicial de 12–128 caracteres; solo para bootstrap. |

Una forma de generar el secreto para la sesión PowerShell, sin imprimirlo:

```powershell
$env:JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:JWT_ISSUER = 'wellq-api'
$env:JWT_AUDIENCE = 'wellq-clients'
```

Para conservarlo entre terminales, guardar un secreto generado en el `.env`
local. Las variables de la terminal tienen precedencia sobre ese archivo.

```powershell
npm.cmd run bootstrap:admin --prefix apps/api
npm.cmd run start:dev --prefix apps/api
```

El bootstrap crea únicamente una cuenta global, sin membresías ni clínicas.
Repetir con el mismo email de superadmin conserva la contraseña. Un email de
usuario ordinario provoca error; nunca lo promueve. No se ejecuta al arrancar.
En una base vacía aún deben existir clínicas: para desarrollo usar `db:seed`.
El seed conserva su superadmin sintético y sus cuentas; el bootstrap no reemplaza
el seed ni modifica las credenciales existentes.

Para ejecutar compilado:

```powershell
npm.cmd run build --prefix apps/api
npm.cmd start --prefix apps/api
```

## Probar el flujo en Swagger

Abrir [Swagger UI](http://localhost:3000/api/docs) o el
[documento OpenAPI JSON](http://localhost:3000/api/openapi.json).
La especificación se genera desde DTO/controladores; no se mantiene una copia
manual. Solo se documentan las rutas implementadas. Swagger no conserva el token
al recargar. Contraseñas se marcan `writeOnly`; no hay ejemplos con tokens reales.

1. Ejecutar `POST /api/v1/auth/login` con las credenciales del bootstrap,
   **omitiendo** `clinicId`. Copiar `accessToken`.
2. Pulsar **Authorize**, pegar el token sin el prefijo `Bearer` y confirmar.
3. En `POST /api/v1/clinics/{clinicId}/users`, usar una clínica del seed:
   A: `00000001-0000-4000-8000-000000000001`;
   B: `00000001-0000-4000-8000-000000000002`.
   Crear un `CLINIC_ADMIN` con un email nuevo y contraseña de 12–128 caracteres.
4. Volver al login con la nueva cuenta y `clinicId` de su clínica. Reemplazar
   el token de **Authorize** por el nuevo token clínico.
5. Ejecutar `POST /api/v1/users` para crear un profesional o paciente.
   No incluir `clinicId` en el body: se obtiene del JWT.

Ejemplo sintético de creación (la contraseña es solo para demostración):

```json
{
  "email": "profesional-demo@example.com",
  "password": "Solo-demo-2026!",
  "displayName": "Profesional de prueba",
  "role": "CLINICIAN"
}
```

## Contrato y permisos

| Ruta | Respuesta | Autorización |
|---|---|---|
| `POST /api/v1/auth/login` | 200, `accessToken`, `tokenType`, `expiresIn: 900` | Pública; email, password y clínica salvo superadmin global. |
| `POST /api/v1/users` | 201, cuenta y membresía | Administrador activo de la clínica vinculada al JWT. |
| `POST /api/v1/clinics/:clinicId/users` | 201, cuenta y membresía | Superadmin con JWT GLOBAL; clínica destino existente y activa. |
| `POST /api/v1/exams/uploads` | 201 (nueva) o 200 (`replayed:true`), `{examId, versionId, versionNumber, replayed}` | Cualquier rol con escritura sobre el paciente (ver «Carga y descarga»). |
| `GET /api/v1/exams/:examId/versions/:versionId/download` | 200, archivo como adjunto | Quien pueda leer al paciente: personal de la clínica o el propio paciente. Audita `DOWNLOAD`. |
| `GET /api/v1/exams/:examId/versions/:versionId/view` | 200, archivo en línea | Igual que la descarga. Audita `VIEW`. |

Cada creación recibe email, contraseña, nombre de presentación y rol.
Administradores clínicos y globales pueden asignar `CLINIC_ADMIN`, `CLINICIAN`
y `PATIENT`. `isSystemAdmin` nunca se acepta por HTTP. Clínica A no administra B.
El superadmin sin membresía no puede usar la ruta clínica ni obtiene acceso
automático a pacientes o documentos. Un superadmin con membresía puede obtener
un JWT clínico y operar únicamente bajo el rol de esa membresía.

`User` es la cuenta global; `UserClinic` contiene clínica, rol, actividad y nombre.
Crear un PATIENT no crea su ficha clínica (PB-022). No se reutilizan cuentas con
email existente ni se vinculan a otra clínica desde este flujo.

Email se normaliza con `trim().toLowerCase()`; el nombre se recorta. Contraseña
se conserva exactamente, incluidos espacios, y se almacena con Argon2id.
Respuesta: `id`, `email`, `clinicId`, `displayName`, `role`, `isActive`, `createdAt`
UTC. La cuenta y membresía se crean juntas o se revierten juntas. Duplicados se
rechazan también ante peticiones concurrentes. No se devuelve hash ni contraseña.

JWT HS256 dura 15 minutos e incluye identidad, contexto y clínica cuando aplica.
Issuer, audience, algoritmo y vencimiento se verifican. Cambiar de clínica exige
otro login; no se aceptan cabeceras de selección ni roles del cliente.
Autenticación, resolución de contexto y permisos se ejecutan en ese orden;
cuenta, rol y actividad se consultan en cada petición. El servicio vuelve a
validarlos dentro de la transacción, bloqueando clínica y registros del actor.
Nuevas rutas requieren una política explícita; un token por sí solo no autoriza.

**Precisión de PB-017:** personal inactivo o con clínica inactiva no obtiene
sesión clínica. Un paciente con ficha histórica mantiene autenticación y contexto
`READ_ONLY` aunque su membresía/clínica estén inactivas o la ficha eliminada.
Esto conserva el contrato de lectura de sus propios exámenes no eliminados;
los endpoints clínicos futuros deben además verificar la propiedad del recurso.
Cuenta pendiente sin contraseña no autentica. Un paciente nuevo sin ficha activa
puede iniciar sesión con membresía activa, pero no obtiene escritura documental.

Android dispone de sesión renovable, logout y recuperación por correo. Ver [autenticación móvil](MOBILE_AUTH.md). El login descrito arriba conserva su contrato original y no emite refresh token.

Errores uniformes: `{ "statusCode": 403, "code": "FORBIDDEN", "message": "..." }`.

| HTTP | Códigos principales |
|---|---|
| 400 | `VALIDATION_ERROR`, `CLINIC_REQUIRED` |
| 401 | `INVALID_CREDENTIALS`, `UNAUTHORIZED` |
| 403 | `FORBIDDEN`, `TENANT_FORBIDDEN`, `TENANT_INACTIVE` |
| 404 | `CLINIC_NOT_FOUND`, `NOT_FOUND` |
| 409 | `EMAIL_DUPLICATE` |
| 400 (carga) | `REQUEST_REQUIRED`, `INVALID_REQUEST_JSON`, `FILE_REQUIRED`, `CLINIC_MISMATCH`, `FILE_SIZE_MISMATCH`, `FILE_HASH_MISMATCH`, `MIME_TYPE_MISMATCH`, `INVALID_EXAM_DATE` |
| 404 (archivos) | `PATIENT_NOT_FOUND`, `EXAM_NOT_FOUND`, `EXAM_TYPE_NOT_FOUND`, `EXAM_VERSION_NOT_FOUND` |
| 409 (carga) | `IDEMPOTENCY_CONFLICT`, `EXAM_ID_CONFLICT`, `VERSION_ID_CONFLICT`, `STORAGE_KEY_CONFLICT`, `RESOURCE_ID_CONFLICT`, `EXAM_TYPE_INACTIVE` |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE` |
| 502 / 503 | `STORAGE_OBJECT_MISSING`, `STORAGE_INTEGRITY_ERROR`, `STORAGE_ERROR` / `STORAGE_UNAVAILABLE`, `STORAGE_NOT_CONFIGURED` |
| 500 | `INTERNAL_ERROR` sin detalles de base de datos ni secretos |

## Carga y descarga de exámenes (PB-034 a 039, 041, 042, 063, 064, 072 a 075)

`POST /api/v1/exams/uploads` es `multipart/form-data` con dos campos, según el
[contrato de datos](../../database/contracts/README.md): `request` (texto JSON con el
`UploadEnvelope` de `database/contracts/types.ts`) y `file` (PDF, JPEG o PNG de 1 a
10.000.000 bytes). Una sola ruta cubre las dos operaciones:

| `operation` | Efecto | Campos obligatorios en `payload` |
|---|---|---|
| `CREATE_EXAM_WITH_VERSION` | Crea el examen y su versión 1. Audita `CREATE`. | `patientId`, `examId`, `versionId`, `title`, `examDate` (YYYY-MM-DD), `examTypeId` |
| `UPLOAD_VERSION` | Agrega la versión siguiente (numeración automática bajo bloqueo). Audita `NEW_VERSION`. | `patientId`, `examId`, `versionId` y **nada más** (no admite título, fecha ni tipo) |

Reglas que aplica el backend (no confía en lo que declara el cliente):

- El tipo real se detecta por los primeros bytes; tamaño y SHA-256 se recalculan y deben coincidir con el sobre. `sha256` va en minúsculas y los UUID en minúsculas.
- `clinicId` del sobre debe ser el de la sesión (JWT). Opcionales ausentes se **omiten**; no se envían como `null`.
- Autorización: el paciente debe ser de la clínica del JWT y el actor debe poder escribir sobre él (`can_write_patient`): personal activo de la clínica, o el propio paciente sobre sus exámenes. Si no, `404` (sin revelar existencia).
- **Idempotencia** por usuario + clínica + `operationId`: misma huella → `200` con el resultado guardado y `replayed:true`; otra huella → `409 IDEMPOTENCY_CONFLICT`. Si falla antes del commit (almacenamiento caído, corte), se reintenta con **los mismos UUID**.
- Nunca se sobrescribe un objeto: la clave `clinics/{clinicId}/patients/{patientId}/exams/{examId}/versions/{versionId}` solo se reutiliza si contiene byte a byte la misma carga de una operación interrumpida. Un `versionId`/`examId` ya usado (incluso purgado) → `409`.
- Examen, versión, auditoría y registro de idempotencia se confirman juntos; ante un fallo posterior a la subida, el objeto recién creado se elimina. Deadlocks o fallos de serialización se reintentan hasta 3 veces.

Descarga y visualización devuelven los bytes con `Cache-Control: private, no-store`,
`X-Content-Type-Options: nosniff` y `Content-Disposition` (`attachment` o `inline`).
Antes de responder se verifican tamaño y SHA-256 contra el registro (`502
STORAGE_INTEGRITY_ERROR` si no coinciden) y **solo entonces** se registra `DOWNLOAD`/`VIEW`
con el `examVersionId`. Un examen eliminado, de otra clínica o de otro paciente responde `404`.

Pendiente en este módulo: listar exámenes y versiones (PB-031, 032, 065), editar metadatos
(PB-033), eliminación lógica (PB-068) y el trabajador que concilia/borra objetos huérfanos y
purgas. Hoy, si una carga falla *después* de subir el objeto y el servidor cae antes de
limpiarlo, el objeto queda huérfano hasta que exista ese trabajador.

### Probarlo con tu MinIO local

Con Docker, la API y `db:fixtures` ya levantados (ver DESARROLLO_LOCAL.md):

```powershell
$env:SMOKE_EMAIL = 'admin1@example.com'
$env:SMOKE_PASSWORD = 'Demo1234!'
npm.cmd run smoke:exam-files --prefix apps/api
```

El script inicia sesión, sube `database/fixtures/documento-demo.pdf` a un paciente de esa
clínica, repite la operación (idempotencia), descarga y visualiza comprobando que los bytes
son idénticos, sube una versión 2 y lista la auditoría. Variables opcionales:
`SMOKE_API_URL`, `SMOKE_CLINIC_ID`, `SMOKE_PATIENT_ID`, `SMOKE_EXAM_TYPE_ID`, `SMOKE_FILE`.
Si no defines clínica, paciente o tipo, los toma de la base de desarrollo.

## Consulta de exámenes (PB-029, 031, 032, 065)

Rutas de solo lectura, disponibles para `CLINIC_ADMIN`, `CLINICIAN` y `PATIENT` (el paciente solo ve su propia ficha):

| Método y ruta | Qué devuelve |
| --- | --- |
| `GET /api/v1/exam-types` | Tipos de examen **activos**, ordenados por nombre (`{ items: [{ id, code, name }] }`). Alimenta el selector de `examTypeId` al subir. |
| `GET /api/v1/patients/{patientId}/exams` | Página `{ items, total, limit, offset }` de exámenes no eliminados, del más reciente al más antiguo, cada uno con su `latestVersion` y `versionCount`. |
| `GET /api/v1/exams/{examId}` | Detalle con `createdBy` e historial completo `versions` (de la más reciente a la más antigua). |

Filtros del listado: `limit` (1-100, por defecto 50), `offset`, `examTypeId` (UUID), `from` y `to` (`YYYY-MM-DD`, inclusivos).

Reglas: exámenes de otra clínica, eliminados o de pacientes que el actor no puede leer responden `404` (`PATIENT_NOT_FOUND` / `EXAM_NOT_FOUND`) sin revelar si existen. Las fechas imposibles dan `400 INVALID_DATE_FILTER` y `from > to` da `400 INVALID_DATE_RANGE`. `sizeBytes` es numérico. Nunca se exponen `storageKey` ni correos; el responsable se muestra con su `displayName` en la clínica. Consultar no genera auditoría: `VIEW` y `DOWNLOAD` se registran al abrir o descargar el archivo.

### Editar y eliminar un examen (PB-033, PB-068 a 070)

| Método y ruta | Qué hace |
| --- | --- |
| `PATCH /api/v1/exams/{examId}` | Edición parcial de `title`, `examDate`, `examTypeId`, `professionalName` y `notes`. Lo omitido no cambia; `professionalName` y `notes` aceptan `null` para borrarse. Devuelve el detalle actualizado (200). |
| `DELETE /api/v1/exams/{examId}` | Eliminación **lógica** (204): marca fecha y actor, conserva versiones y archivos. |

Reglas:
- Pueden usarlas `CLINIC_ADMIN`, `CLINICIAN` y `PATIENT` con la misma regla de escritura de las cargas (`can_write_patient`); una sesión de solo lectura recibe `403`.
- Examen inexistente, ya eliminado, de otra clínica o ilegible para el actor: `404 EXAM_NOT_FOUND`. Si el actor lo puede leer pero no modificar (p. ej. paciente inactivo): `403 EXAM_READ_ONLY`.
- No se pueden cambiar el paciente, el autor ni los archivos (un archivo nuevo es una versión nueva con `POST /exams/uploads`).
- `examTypeId` debe ser un tipo activo: `404 EXAM_TYPE_NOT_FOUND` / `409 EXAM_TYPE_INACTIVE`. Cuerpo vacío: `400 EMPTY_UPDATE`; fecha imposible: `400 INVALID_EXAM_DATE`; campos desconocidos: `400`.
- Si los valores enviados son iguales a los actuales no se escribe, no se audita y no se emite sincronización.
- Auditoría: `UPDATE` (con `metadata.changedFields`, solo nombres de campos) y `DELETE`, en la misma transacción que el cambio. Se bloquea primero la clínica y luego el examen, y se reintenta hasta 3 veces ante deadlock.
- Tras eliminar, el examen desaparece de listados, detalle, descargas y nuevas versiones (`404`). La purga definitiva (`purge_exam`) es un proceso aparte, todavía no expuesto.

## Gestión de miembros de la clínica

Rutas del administrador de la clínica de la sesión (`CLINIC_ADMIN` activo; `PATCH` además exige sesión de escritura). Complementan `POST /api/v1/users`, que crea cuentas.

| Método y ruta | Qué hace |
| --- | --- |
| `GET /api/v1/users` | Página `{ items, total, limit, offset }` de miembros, por nombre. Filtros: `role`, `isActive` (`true`/`false`), `q` (nombre o correo, contiene), `limit` (1-100, 50 por defecto) y `offset`. |
| `GET /api/v1/users/{userId}` | Un miembro de la clínica. |
| `PATCH /api/v1/users/{userId}` | Edita `displayName`, `role` (solo `CLINIC_ADMIN` o `CLINICIAN`) o `isActive`. Devuelve el miembro actualizado. |

Cada miembro incluye `id` (cuenta), `email` (null si la cuenta está pendiente), `displayName`, `role`, `isActive`, `hasCredentials`, `patientId` (ficha, si existe) y fechas. Nunca se devuelven hashes ni datos de otras clínicas.

Reglas:
- Un usuario de otra clínica o inexistente responde `404 USER_NOT_FOUND`; un clínico o paciente que llama estas rutas recibe `403`.
- Las membresías **no se eliminan**: se desactivan (`isActive: false`). El acceso se corta de inmediato (`403 TENANT_INACTIVE`), salvo que un paciente conserva lectura de sus exámenes históricos, como ya define el contrato de datos.
- No puedes cambiar tu propio rol ni desactivarte (`409 SELF_CHANGE_FORBIDDEN`), así la clínica nunca se queda sin administrador activo. Sí puedes cambiar tu nombre.
- El rol de un paciente no cambia (`409 PATIENT_ROLE_LOCKED`) y `PATIENT` no se puede asignar por esta ruta (`400`).
- Cuerpo vacío: `400 EMPTY_UPDATE`. Si los valores son iguales a los actuales, no se escribe ni se audita.
- Auditoría `UPDATE` con `metadata`: `entity: 'USER_CLINIC'`, `userId`, `changedFields` y, si cambia el rol, `roleFrom`/`roleTo`. Si el miembro es un paciente, el registro se asocia a su ficha. La revisión de permisos (`permission_revision`) la incrementa la base de datos al cambiar rol o estado.
- Bloqueo en orden fijo (clínica, luego membresías) y hasta 3 reintentos ante deadlock.

## Pruebas y CI

```powershell
npm.cmd run typecheck --prefix apps/api
npm.cmd run typecheck:test --prefix apps/api
npm.cmd run build --prefix apps/api
npm.cmd test --prefix apps/api
```

Las pruebas HTTP con persistencia y las existentes de PostgreSQL necesitan una
base **separada y descartable**, con nombre terminado en `_schema_test`.
No apuntar estos comandos a la base de desarrollo con datos que conservar.

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:test_password@localhost:5432/wellq_schema_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npm.cmd run db:migrate:deploy --prefix apps/api
# Aplicar database/postgresql/application_role.sql como dueño, según el contrato.
npm.cmd run db:seed --prefix apps/api
npm.cmd run test:postgres --prefix apps/api
npm.cmd run test:integration --prefix apps/api
```

La suite API usa UUID/email sintéticos nuevos por ejecución y conserva filas en
esa base descartable: no borra físicamente pacientes o membresías protegidos.
El CI mantiene las suites de persistencia y agrega build, pruebas unitarias/HTTP,
verificación OpenAPI e integración contra PostgreSQL temporal.

Para trabajar en equipo: infraestructura → bootstrap → login → guards/contexto
→ creación → documentación y pruebas. Mantener DTO, OpenAPI y casos de aceptación
actualizados junto a cada endpoint. Swagger local no implica API desplegada.

## Aplicación Android

Ver [contratos de sesión y recuperación](MOBILE_AUTH.md) y [guía de la app](../mobile/README.md). Swagger incluye todas las rutas móviles y esquemas de respuesta.

Para separar desarrollo local y el APK conectado a Railway, ver [guía de despliegue y entornos](RAILWAY.md).

### Perfil móvil para consulta documental

El perfil móvil incorpora `patientId` de la clínica autenticada (o null para ficha pendiente). `PATCH /api/v1/auth/me` permite al paciente editar únicamente el nombre de presentación de esa membresía, con 1–100 caracteres recortados. No modifica correo ni ficha clínica. Ver [contratos y reglas](MOBILE_AUTH.md#nombre-y-ficha-del-paciente-móvil-020).
