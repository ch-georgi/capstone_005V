# Autenticación móvil y recuperación

La nueva migración `20261015000100_mobile_auth` es incremental. No cambiar ni reiniciar la migración inicial ni usar `db push`. Hacer backup de cualquier entorno con datos antes de desplegar migraciones. Las pruebas usan una base separada terminada en `_schema_test`.

```powershell
npm.cmd ci --prefix apps/api
npm.cmd run db:generate --prefix apps/api
npm.cmd run db:migrate:deploy --prefix apps/api
```

Después de migrar, volver a ejecutar `database/postgresql/application_role.sql` como dueño para conceder permisos de las nuevas tablas al rol `wellq_app`. La cuenta de ejecución debe pertenecer a ese grupo y ser distinta del dueño/migrador. No se borran ni reasignan fichas o membresías.

## Configuración

Mantener `DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER` y `JWT_AUDIENCE`. Para recuperación añadir un `PASSWORD_RESET_SECRET` aleatorio independiente de al menos 32 bytes; no versionarlo. Se exige cuando SMTP está configurado. La API puede arrancar sin SMTP para desarrollo de login; la recuperación devuelve 503 hasta configurarlo.

```powershell
docker compose up -d postgres mailpit
```

Configurar en el `.env` local, sin subirlo:

```dotenv
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=WellQ <no-reply@example.com>
```

Mailpit muestra los correos locales en http://localhost:8025; no se entregan a direcciones externas. En despliegue configurar SMTP real y remitente autorizado mediante `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_USER` y `SMTP_PASSWORD`. Para 465 usar SMTP_SECURE=true; para STARTTLS/587 usar false. Ninguna credencial se entrega a la app.

## Contratos REST

Prefijo `/api/v1`. Swagger: `/api/docs`, documento `/api/openapi.json` cuando habilitado.

| Ruta | Entrada | Salida |
|---|---|---|
| POST /auth/mobile/login | email, password | AUTHENTICATED + session, o CLINIC_SELECTION_REQUIRED + selectionToken y clinics |
| POST /auth/mobile/select-clinic | selectionToken, clinicId | Session |
| POST /auth/mobile/switch-clinic | Bearer móvil; clinicId | Session nueva; revoca la anterior y conserva el plazo absoluto |
| GET /auth/me | Bearer móvil | Profile vigente |
| PATCH /auth/me | Bearer móvil PATIENT; displayName | Profile con nombre de la membresía actual actualizado |
| POST /auth/refresh | refreshToken | Session con refresh rotativo |
| POST /auth/logout | refreshToken | 204; idempotente, no exige JWT vigente |
| POST /auth/password/forgot | email | 202; challengeId, message genérico, resendAfter:60 |
| POST /auth/password/verify | challengeId, code | resetToken, expiresIn:300 |
| POST /auth/password/reset | resetToken, password | 204; revoca credenciales de todas las sesiones |

`Session`: accessToken, refreshToken, tokenType=Bearer, expiresIn (máximo 900 segundos y limitado por el plazo restante), sessionExpiresAt UTC y profile. `Profile`: user{id,email}, clinic{id,name}, displayName, role=PATIENT, access=READ_ONLY/READ_WRITE, patientRecordPending, patientId (UUID de la ficha propia en la clínica actual, o null) y clinics autorizadas. Cada opción de clínica incluye id, name, displayName, access y patientRecordPending.

## Seguridad y compatibilidad

El login anterior conserva entrada y salida; sus nuevos JWT incluyen credentialsVersion. Los anteriores sin versión equivalen a cero y expiran como antes. Después de una recuperación, el incremento de versión invalida también JWT anteriores, aunque no tengan sesión móvil.

Las nuevas sesiones son por dispositivo y clínica, con vencimiento absoluto a los 30 días. El servidor verifica sid, identidad, clínica, versión de credenciales, revocación y actividad/rol actuales. El paciente histórico conserva READ_ONLY. Un paciente activo sin ficha puede entrar, pero no escribir documentos. No hay acceso clínico implícito para el superadmin ni acceso móvil para roles exclusivamente profesionales.

Los refresh tokens aleatorios se guardan como SHA-256. La renovación se serializa por usuario, consume el token anterior y crea otro; su reutilización revoca toda la sesión. El cliente comparte una sola renovación en curso. Si se pierde la respuesta de una rotación ya confirmada y luego se reutiliza la credencial anterior, se exige nuevo login por seguridad.

Los desafíos de selección duran cinco minutos, son de un uso, se conservan solo en memoria del cliente y no sirven como Bearer. Elegir una clínica siempre vuelve a verificar la membresía.

Recuperación: código aleatorio de seis dígitos protegido por HMAC, diez minutos, cinco intentos. Reenviar invalida códigos/autorizaciones anteriores; la nueva contraseña requiere un token aleatorio de uso único y cinco minutos. Nunca se activa una cuenta sin credenciales ni se crea/vincula una membresía. La contraseña global cambia para todas las clínicas.

Los límites se persisten en PostgreSQL: login 30 intentos/IP y 10/correo cada 15 minutos; recuperación 20/IP y 5/correo por hora y 1/correo por minuto; verificación 50/IP por hora más cinco intentos/desafío. La IP se toma de la conexión Express; no confiar en X-Forwarded-For sin configurar explícitamente un proxy confiable en el despliegue. Códigos, contraseñas y tokens no se registran. La entrega SMTP se separa de la respuesta pública para no exponer existencia de cuentas por la latencia del correo; fallos quedan como eventos genéricos sin datos sensibles.

La app cierra localmente aun sin red; sin una solicitud entregada el servidor no confirma revocación remota. Los tokens del dispositivo siguen en almacenamiento seguro hasta el borrado local; permisos clínicos se vuelven a verificar online. No habilitar operaciones documentales con el perfil informativo offline.

## Pruebas

Definir TEST_DATABASE_URL y DATABASE_URL a una base descartable terminada en `_schema_test`, aplicar migraciones, luego:

```powershell
npm.cmd run typecheck --prefix apps/api
npm.cmd run typecheck:test --prefix apps/api
npm.cmd test --prefix apps/api
npm.cmd run test:integration --prefix apps/api
```

La suite móvil usa PostgreSQL real y reemplaza solo el envío de correo por una captura en memoria. Incluye aislamiento, desafíos, expiraciones, rotación concurrente, replay, logout, versión de credenciales, intentos/cooldown y recuperación. Mailpit permite además probar la entrega SMTP local sin enviar correos reales.

## Nombre y ficha del paciente móvil (0.2.0)

`patientId` también está presente en login, selección/cambio de clínica y renovación. Se resuelve en servidor desde usuario y clínica autenticados; permite consultar la ficha histórica autorizada. Una ficha pendiente devuelve null. La app no consulta el listado administrativo de pacientes.

`PATCH /api/v1/auth/me` acepta exclusivamente `{ "displayName": "Nombre" }`. Recorta extremos y exige 1–100 caracteres. Modifica solo la membresía de paciente de la clínica del JWT móvil, incluso con acceso clínico READ_ONLY. No cambia correo ni el nombre de la ficha. Registra una auditoría de campos modificados sin los valores anteriores/nuevos. Reutiliza el esquema existente; esta ampliación no requiere migración.

## SMTP2GO por HTTPS en Railway

Railway Free, Trial y Hobby no admiten SMTP saliente. Configurar `SMTP2GO_API_KEY` en el backend con una clave de Sending > API Keys autorizada para `/email/send`. No es la contraseña del usuario SMTP. Esta clave selecciona HTTPS y tiene prioridad sobre SMTP. Mantener `SMTP_FROM` con un remitente verificado y `PASSWORD_RESET_SECRET` independiente de al menos 32 bytes. Desplegar el backend con estas variables; no requiere recompilar Android.

Referencia: https://developers.smtp2go.com/docs/send-an-email y https://docs.railway.com/networking/outbound-networking.
