# Actualizar tu entorno local — cambios de la rama `web/frontend`

Guía rápida para quienes **ya tenían** Docker, la API y la base de datos
funcionando, y solo necesitan traer los cambios nuevos (frontend web +
ajustes de login).

## 1. Traer los cambios

```powershell
git fetch origin
git checkout web/frontend
git pull
```

## 2. Instalar el frontend (solo la primera vez que lo pruebas)

La carpeta `apps/web` es nueva. Si nunca la has corrido:

```powershell
if (-not (Test-Path apps/web/.env)) { Copy-Item apps/web/.env.example apps/web/.env }
npm.cmd install --prefix apps/web
```

Si ya la habías instalado antes, sáltate este paso.

## 3. ¿Ya habías corrido `db:seed` alguna vez antes de hoy?

- **No / nunca lo he corrido** → sigue directo al paso 4, no necesitas hacer nada más aquí.
- **Sí** → la cuenta de prueba cambió, así que resetea tu base local para tenerla al día:

```powershell
docker compose down -v
docker compose up -d
docker compose exec minio mc alias set local http://localhost:9000 wellq_minio wellq_minio_password
docker compose exec minio mc mb --ignore-existing local/wellq-dev

npm.cmd run db:migrate:deploy --prefix apps/api

docker compose cp database/postgresql/application_role.sql postgres:/tmp/wellq_application_role.sql
docker compose exec postgres psql -U wellq -d wellq_dev -v ON_ERROR_STOP=1 -f /tmp/wellq_application_role.sql

npm.cmd run db:seed --prefix apps/api
```

(`docker compose down -v` borra los datos locales — son sintéticos y se regeneran con el seed, no hay nada que perder.)

## 4. Levantar todo (dos terminales)

```powershell
# Terminal 1 — API
npm.cmd run start:dev --prefix apps/api

# Terminal 2 — Web
npm.cmd run dev --prefix apps/web
```

## 5. Probar

Abre **http://localhost:5173** e inicia sesión con:

- **`admin@wellq.cl`** / **`----`**

---

