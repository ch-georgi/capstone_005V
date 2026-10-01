# Despliegue de la base de datos en Railway

Contrato vigente: [contracts/README.md](contracts/README.md). PostgreSQL usa schema public, roles por UserClinic y fichas Patient privadas por clínica. La migración inicial fue regenerada para un entorno descartable; no aplicarla como reemplazo sobre una base con migraciones antiguas y datos que conservar. Después de migrate deploy ejecutar postgresql/application_role.sql como dueño y asignar wellq_app al login de API; ese login no debe ser dueño ni heredar al migrador. No utilizar db push, que omite constraints/triggers SQL. El seed usa upserts; db:fixtures carga los archivos reales al bucket por separado.

Notas para dejar PostgreSQL funcionando en Railway, alineado a la arquitectura de despliegue documentada (sección 21 de la propuesta):
GitHub → GitHub Actions (lint/tests/build) → Railway (Web / API / PostgreSQL).

## 1. Crear el servicio de PostgreSQL

1. En el proyecto de Railway, **New → Database → Add PostgreSQL**.
2. Railway genera automáticamente la variable `DATABASE_URL` para ese
   servicio. Cópiala — es la que usará Prisma.
3. Formato esperado por Prisma:
   ```
   postgresql://usuario:password@host:puerto/basedatos
   ```

## 2. Conectar el backend (apps/api) a esa base de datos

En el servicio de la API dentro de Railway, agrega la variable de entorno:

```
DATABASE_URL=${{ Postgres.DATABASE_URL }}
```

(Railway permite referenciar la variable de otro servicio directamente
con esta sintaxis — así no copias el valor a mano y si cambia, se
actualiza solo.)

## 3. Aplicar las migraciones en el deploy

En el `package.json` de `apps/api`, el script de arranque en producción
debe correr las migraciones **antes** de levantar el servidor:

```json
{
  "scripts": {
    "start:prod": "prisma migrate deploy && node dist/main.js"
  }
}
```

`prisma migrate deploy` (a diferencia de `migrate dev`) no genera migraciones nuevas ni pide confirmación — solo aplica las que ya
existen en el repositorio. Es el comando correcto para producción.

## 4. Variables de entorno mínimas en Railway (servicio API)

| Variable         | Valor                                   |
|-------------------|------------------------------------------|
| `DATABASE_URL`    | `${{ Postgres.DATABASE_URL }}`           |
| `JWT_SECRET`       | generado aleatorio, nunca el mismo que en local |
| `NODE_ENV`         | `production`                             |

No se debe commitear ningún `.env` con estos valores — van solo en la configuración de variables de Railway.

## 5. Seed en Railway (opcional, solo para la demo)

El seed **no corre automáticamente** en cada deploy — solo se ejecuta
una vez, a mano, para dejar datos de demostración:

```bash
railway run npx prisma db seed
```

(`railway run` ejecuta el comando con las variables de entorno del
servicio ya inyectadas, sin que tengas que exportarlas tú mismo.)

## 6. Verificación rápida

```bash
railway run npx prisma studio
```

Abre una vista de los datos reales en Railway — útil para confirmar en
vivo, antes de la demo, que el seed se aplicó correctamente.

## 7. Qué NO va en Railway

- SQLite es local al dispositivo móvil — no se despliega ni se
  sincroniza con Railway directamente; solo se comunica con la API.
- MinIO en producción normalmente no se aloja en Railway (su free
  tier de almacenamiento persistente es limitado) — conviene evaluar
  con el equipo si usar un bucket real (ej. Cloudflare R2, con free
  tier) para la demo final, manteniendo MinIO solo para desarrollo
  local vía Docker Compose, tal como ya está documentado.

## 8. Checklist antes de la próxima evaluación de avance

- [ ] `DATABASE_URL` conectado y migraciones aplicadas sin error.
- [ ] `npx prisma migrate deploy` corre limpio en el pipeline de CI/CD (US-005).
- [ ] Seed ejecutado al menos una vez para tener datos de demo.
- [ ] Suite de integridad PostgreSQL ejecutada en base temporal, y autorización cross-tenant probada en la API cuando exista. Prisma Studio por sí solo no comprueba aislamiento.
