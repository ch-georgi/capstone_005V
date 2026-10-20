# API remota para Android y desarrollo local

La app habla con una API HTTP; solo la API se conecta a PostgreSQL.

| Uso | API | PostgreSQL |
| --- | --- | --- |
| Vista web de desarrollo | http://localhost:3000/api/v1 | La conexión de apps/api/.env (local) |
| Emulador de desarrollo | http://10.0.2.2:3000/api/v1 | La misma base local |
| APK de producción | URL HTTPS del servicio API en Railway | PostgreSQL remoto mediante variable del servicio |

## Desplegar la API en Railway

La API ya está desplegada en `https://capstone005v-production.up.railway.app/`; su prefijo es `/api/v1`. Los pasos siguientes sirven para recrear o revisar el servicio API en el mismo proyecto y entorno de Railway, desde este repositorio. Configurar Root Directory `/apps/api` y el archivo de configuración `/apps/api/railway.toml` si Railway no lo detecta automáticamente. El archivo configura instalación, generación de Prisma, compilación y arranque. Usar Node 22.13+ de la rama 22 (`RAILPACK_NODE_VERSION=22`).

En las variables del **servicio API**, definir:

- `DATABASE_URL`: URL privada de PostgreSQL para el usuario de aplicación (host `postgres.railway.internal`, puerto 5432, base `railway`). Dentro de Railway se usa la conexión interna; la conexión pública `caboose.proxy.rlwy.net:20469` se reserva para administración desde fuera de Railway.
- `JWT_SECRET`: valor aleatorio de al menos 32 bytes, persistente entre despliegues.
- `PASSWORD_RESET_SECRET`: otro secreto aleatorio independiente de al menos 32 bytes.
- `JWT_ISSUER=wellq-api-production`.
- `JWT_AUDIENCE=wellq-clients-production`.
- `NODE_ENV=production`.
- `SWAGGER_ENABLED=false` (habilitar temporalmente si hace falta verificar contratos).
- Para recuperación: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` y, cuando corresponda, `SMTP_USER` y `SMTP_PASSWORD`, de un proveedor real. Mailpit de tu equipo no es accesible desde Railway.

Railway proporciona `PORT`. No subir archivos `.env` al repositorio. No copiar credenciales de PostgreSQL a Android ni usar `postgres` como cuenta de ejecución de la API.

Antes del primer arranque contra esta base, aplicar `npm run db:migrate:deploy` desde apps/api con la conexión del dueño/migrador; después ejecutar `database/postgresql/application_role.sql` y crear un login de ejecución miembro de `wellq_app`, distinto del dueño. Configurar su URL en el servicio API. Revisar las migraciones y respaldar datos existentes antes de aplicarlas. No usar `db push`, `migrate reset` ni seed de pruebas en producción. Las migraciones no se ejecutan automáticamente en cada arranque.

En Networking del servicio API generar un dominio público HTTPS. La URL que necesita Android tendrá la forma `https://DOMINIO-API/api/v1`.

## Configurar y compilar Android

Completar `apps/mobile/.env.production.local` (ignorado por Git):

```env
WELLQ_PRODUCTION_API_URL=https://DOMINIO-API/api/v1
```

Desde la raíz:

```powershell
npm.cmd run check:production --prefix apps/mobile
npm.cmd run apk --prefix apps/mobile
```

El comando `apk` exige una URL HTTPS pública y genera `apps/mobile/artifacts/wellq-0.1.0-production.apk`. Sigue siendo una compilación con firma de desarrollo; el nombre identifica el entorno de API, no una firma de publicación. El archivo existente de preview no se sustituye. Cambiar la URL requiere recompilar. No es posible completar un APK conectado a producción hasta que exista la API desplegada y su esquema esté actualizado.

## Mantener desarrollo local

Conservar `apps/api/.env` y su DATABASE_URL local. Arrancar la API como siempre y ejecutar:

```powershell
npm.cmd run start:dev --prefix apps/api
npm.cmd run web --prefix apps/mobile
```

`web` usa localhost:3000, configurable con `WELLQ_WEB_API_URL`; no toma WELLQ_PRODUCTION_API_URL. Para generar un APK conectado a la API local usar `npm run apk:preview --prefix apps/mobile`, con EXPO_PUBLIC_API_URL del entorno de desarrollo. La separación depende del servidor API utilizado, no de una conexión PostgreSQL incorporada en el cliente.

## Crear un paciente adicional de prueba

La base remota ya contiene las clínicas A y B y usuarios sintéticos. Para comenzar no hace falta crear otra cuenta: patient2@example.com / Demo1234! entra a Clínica A; patient1@example.com / Demo1234! permite seleccionar A o B. Se verificaron login móvil, perfil, renovación y revocación el 20 de octubre de 2026. Swagger devuelve 404 en el despliegue actual; el alta siguiente no depende de Swagger.

Para una cuenta nueva, ejecutar este bloque en PowerShell. Se autentica como el administrador sintético existente de Clínica A y crea un PATIENT usando la API. La nueva contraseña se solicita de forma oculta, debe tener 12–128 caracteres y se conserva exactamente, incluidos espacios.

```powershell
$apiBase = 'https://capstone005v-production.up.railway.app/api/v1'

$login = Invoke-RestMethod -Method Post `
  -Uri "$apiBase/auth/login" -ContentType 'application/json; charset=utf-8' `
  -Body (@{
    email = 'admin1@example.com'
    password = 'Demo1234!'
    clinicId = '00000001-0000-4000-8000-000000000001'
  } | ConvertTo-Json)

$clave = Read-Host 'Contraseña nueva del paciente (12–128 caracteres)' -AsSecureString
$credencial = [pscredential]::new('paciente', $clave)

Invoke-RestMethod -Method Post `
  -Uri "$apiBase/users" -ContentType 'application/json; charset=utf-8' `
  -Headers @{ Authorization = "Bearer $($login.accessToken)" } `
  -Body (@{
    email = 'christopher.prueba@example.com'
    password = $credencial.GetNetworkCredential().Password
    displayName = 'Christopher (prueba)'
    role = 'PATIENT'
  } | ConvertTo-Json)

Remove-Variable login, clave, credencial
```

Respuesta esperada: HTTP 201, cuenta y membresía activa con rol PATIENT. El correo es ficticio y no recibe recuperación; para probar correo usar una dirección propia. HTTP 409 significa que el email ya está registrado: no modificar ni restablecer esa cuenta automáticamente.

El alta no genera la ficha Patient. El nuevo usuario puede acceder a la bienvenida y verá que la clínica debe completar su registro. Las cuentas sintéticas existentes con ficha permiten probar la bienvenida normal. No insertar contraseñas directamente en PostgreSQL ni volver a ejecutar el seed para crear una sola cuenta.
