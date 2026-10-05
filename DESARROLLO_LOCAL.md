# Puesta en marcha local de WellQ

Esta guía prepara PostgreSQL, MinIO, el esquema de la base de datos y los
archivos de demostración. Los comandos están escritos para **PowerShell** y se
ejecutan desde la raíz del repositorio, donde está `docker-compose.yml`.

Actualmente el repositorio incluye persistencia, migraciones, scripts de
validación y la API HTTP de usuarios/login. Completar esta guía deja listo el
entorno de datos; continuar con [la guía de API y Swagger](apps/api/README.md)
para configurar JWT, crear el superadmin y probar usuarios. Las interfaces
web/Android y los endpoints clínicos siguen pendientes.

## 1. Requisitos

- Git y una copia actualizada del repositorio.
- Docker Desktop abierto, con contenedores Linux y Docker Compose disponible.
  En Windows se puede utilizar el backend WSL 2.
- Node.js **22.13 o superior dentro de la versión 22**, con npm.
- Internet para descargar imágenes Docker y dependencias npm la primera vez.
- Puertos `5432`, `9222` y `9223` disponibles.
- Python 3.12 si se van a ejecutar las pruebas SQLite de Python.

Comprueba las herramientas:

```powershell
docker info
docker compose version
node --version
npm.cmd --version
```

`docker info` debe mostrar la sección `Server` sin errores de conexión.
En macOS/Linux, utiliza `npm` en lugar de `npm.cmd` y adapta la copia de archivos
al shell de tu equipo. No necesitas instalar PostgreSQL, MinIO ni `psql` en el host.

## 2. Preparar las variables de entorno

Abre una terminal en la carpeta del repositorio. Por ejemplo:

```powershell
Set-Location C:\ruta\al\capstone
```

La primera vez, crea el archivo de entorno de la API sin sobrescribir uno existente:

```powershell
if (-not (Test-Path apps/api/.env)) {
    Copy-Item apps/api/.env.example apps/api/.env
}
```

Verifica que `apps/api/.env` tenga estos valores para el Compose actual:

```dotenv
DATABASE_URL="postgresql://wellq:wellq_dev_password@localhost:5432/wellq_dev?schema=public"

S3_ENDPOINT=http://localhost:9222
S3_BUCKET=wellq-dev
S3_ACCESS_KEY_ID=wellq_minio
S3_SECRET_ACCESS_KEY=wellq_minio_password
S3_REGION=us-east-1
```

Son credenciales de desarrollo local. `.env` está excluido de Git; comparte
`.env.example`, no el archivo de entorno personal. Usa solamente datos sintéticos.

El Compose actual define sus credenciales directamente en `environment`, por lo
que **no requiere un `.env` en la raíz**. Editar `apps/api/.env` no cambia las
credenciales de los contenedores: ambos lados deben coincidir.

## 3. Levantar PostgreSQL y MinIO

```powershell
docker compose config --quiet
docker compose up -d
docker compose ps
```

La primera ejecución descarga las imágenes y crea redes y volúmenes. `-d` deja
los servicios ejecutándose en segundo plano. Ambos deben aparecer como `Up`.

| Servicio | Acceso desde el equipo | Credenciales locales |
| --- | --- | --- |
| PostgreSQL | `localhost:5432`, base `wellq_dev` | `wellq` / `wellq_dev_password` |
| MinIO API S3 | `http://localhost:9222` | `wellq_minio` / `wellq_minio_password` |
| Consola MinIO | [http://localhost:9223](http://localhost:9223) | Las mismas credenciales de MinIO |

Comprueba que estén listos antes de continuar:

```powershell
docker compose exec -T postgres pg_isready -U wellq -d wellq_dev
(Invoke-WebRequest -Uri http://localhost:9222/minio/health/live).StatusCode
```

Los resultados esperados son `accepting connections` y `200`. Si todavía están
iniciando, espera unos segundos y repite la comprobación.

La imagen de MinIO está fijada a
`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`, una compilación comunitaria
desde las fuentes de MinIO. Mantén esa referencia: la anterior `minio/minio` de
Docker Hub fallaba al descargarse. La imagen actual ya incluye el cliente `mc`.

## 4. Crear el bucket de archivos

El Compose no crea el bucket automáticamente. Ejecuta:

```powershell
docker compose exec -T minio mc alias set local http://localhost:9000 wellq_minio wellq_minio_password
docker compose exec -T minio mc mb --ignore-existing local/wellq-dev
docker compose exec -T minio mc ls local
```

Debe aparecer `wellq-dev/`. Estos comandos se pueden repetir: `--ignore-existing`
permite que el bucket ya exista.

Aquí se usa el puerto `9000` porque `mc` corre **dentro del contenedor MinIO**.
Los scripts ejecutados en el equipo utilizan `localhost:9222`, como indica el `.env`.

## 5. Instalar dependencias y aplicar migraciones

```powershell
npm.cmd ci --prefix apps/api
npm.cmd run db:generate --prefix apps/api
npm.cmd run db:validate --prefix apps/api
npm.cmd run db:migrate:deploy --prefix apps/api
```

`db:migrate:deploy` aplica las migraciones pendientes, incluida la corrección del
trigger de auditoría. Utiliza este comando para preparar la copia local del equipo.
`db:push` no es un script del proyecto; tampoco uses `prisma db push` para sustituir
las migraciones, porque omite los triggers y restricciones SQL personalizados.

Configura el grupo de permisos de aplicación con el cliente PostgreSQL incluido
en el contenedor:

```powershell
docker compose cp database/postgresql/application_role.sql postgres:/tmp/wellq_application_role.sql
docker compose exec -T postgres psql -U wellq -d wellq_dev -v ON_ERROR_STOP=1 -f /tmp/wellq_application_role.sql
```

Este SQL prepara el grupo `wellq_app`, que no tiene login. La conexión `wellq`
de esta guía es la del propietario para migraciones y seed; la futura API deberá
utilizar un login separado con los permisos de aplicación.

## 6. Cargar los datos y PDF de demostración

Primero carga los registros:

```powershell
npm.cmd run db:seed --prefix apps/api
```

El seed crea dos clínicas, diez fichas de pacientes y veinte exámenes sintéticos.
Se puede repetir y no carga archivos en MinIO.

Después carga los PDF reales de demostración:

```powershell
node --env-file=apps/api/.env apps/api/node_modules/ts-node/dist/bin.js apps/api/scripts/upload-fixtures.ts
```

Se utiliza `--env-file` porque el script actual de fixtures no carga el `.env`
automáticamente. Ejecutar únicamente `npm run db:fixtures` requiere haber exportado
las variables en la terminal previamente.

Comprueba que existan objetos:

```powershell
docker compose exec -T minio mc ls --recursive local/wellq-dev
```

En una base recién preparada se esperan veinte PDF bajo rutas `clinics/...`.
Si el equipo tiene datos previos, la cantidad puede variar.

## 7. Validar e inspeccionar

```powershell
npm.cmd run db:check-invariants --prefix apps/api
npm.cmd run typecheck --prefix apps/api
```

Para revisar los registros con Prisma Studio:

```powershell
npm.cmd run db:studio --prefix apps/api
```

Abre la dirección que indique la terminal. Studio se ejecuta en el equipo y se
detiene con `Ctrl+C`.

Pruebas locales adicionales, con Python instalado:

```powershell
python database/tests/test_sqlite.py
node database/tests/run-local.cjs
```

La suite `test:postgres` requiere una base descartable cuyo nombre termine en
`_schema_test`. No apuntes `TEST_DATABASE_URL` a `wellq_dev`. Para esa suite,
consulta [la validación del contrato de datos](database/contracts/README.md#validación-reproducible).

## 8. Uso diario y persistencia

Para retomar el trabajo:

```powershell
docker compose up -d
```

Después de recibir nuevas migraciones del equipo:

```powershell
npm.cmd run db:generate --prefix apps/api
npm.cmd run db:migrate:deploy --prefix apps/api
```

Si cambió `package-lock.json`, ejecuta antes `npm.cmd ci --prefix apps/api`.
No es necesario repetir el seed ni la carga de PDF en cada arranque.

Para detener sin eliminar datos:

```powershell
docker compose stop
```

Para retirar contenedores y redes conservando los volúmenes:

```powershell
docker compose down
```

El volumen `wellq_postgres_data` conserva la base de datos y `minio-volume`
conserva los archivos. Docker añade el prefijo del proyecto a sus nombres.
No uses `docker compose down -v` para apagar normalmente: elimina esos volúmenes
y sus datos. Usa la misma carpeta y el mismo nombre de proyecto Compose al retomar.

## Problemas frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| Docker no conecta al motor | Abre Docker Desktop y espera hasta que `docker info` muestre `Server`. |
| `pull access denied for minio/minio` | Actualiza tu copia del repositorio y verifica la imagen `ghcr.io/coollabsio/minio` en el Compose. |
| Puerto ocupado | Revisa si tienes otro PostgreSQL o MinIO local. Si cambias el puerto publicado del Compose, actualiza el `.env` y los comandos de acceso desde el equipo. |
| PostgreSQL rechaza la contraseña | Comprueba que el `.env` coincida con el Compose. Cambiar `POSTGRES_PASSWORD` no modifica una base ya inicializada en un volumen existente. |
| Prisma no encuentra `DATABASE_URL` | Verifica que el archivo se llame `apps/api/.env`, sin `.example` ni `.txt`. |
| Seed falla en `auditLog.create()` con columna `new` | Comprueba que tu copia incluya la migración `20261005120000_fix_protect_audit` y ejecuta `db:migrate:deploy`. |
| Fixtures informa variables faltantes | Usa el comando con `node --env-file=apps/api/.env` desde la raíz. |
| Carga S3 responde `NoSuchBucket` | Crea `wellq-dev` con el paso 4 y comprueba `S3_BUCKET`. |
| Carga S3 responde `403` | Comprueba que las credenciales S3 coincidan con las de MinIO. |
| Servicio aparece como `Exited` | Revisa `docker compose logs --tail=100 postgres minio`. |

## Referencias

- [Contrato de persistencia del proyecto](database/contracts/README.md).
- [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
- [Variables de entorno de Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
- [Compilaciones MinIO de Coollabs](https://github.com/coollabsio/minio).
