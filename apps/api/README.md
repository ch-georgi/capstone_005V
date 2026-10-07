# API WellQ: usuarios, login y Swagger

Esta entrega implementa PB-016, PB-017, PB-019 y PB-020. La documentación local
adelanta PB-104; Swagger desplegado (PB-094) sigue pendiente de despliegue.
Las carpetas para clínicas, pacientes, exámenes, versiones, storage, auditoría,
sync, cargas y trabajos están preparadas con `.gitkeep`, sin funcionalidades.

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

No hay refresh ni logout todavía (PB-018): para renovar, iniciar sesión otra vez.

Errores uniformes: `{ "statusCode": 403, "code": "FORBIDDEN", "message": "..." }`.

| HTTP | Códigos principales |
|---|---|
| 400 | `VALIDATION_ERROR`, `CLINIC_REQUIRED` |
| 401 | `INVALID_CREDENTIALS`, `UNAUTHORIZED` |
| 403 | `FORBIDDEN`, `TENANT_FORBIDDEN`, `TENANT_INACTIVE` |
| 404 | `CLINIC_NOT_FOUND`, `NOT_FOUND` |
| 409 | `EMAIL_DUPLICATE` |
| 500 | `INTERNAL_ERROR` sin detalles de base de datos ni secretos |

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
