# Validación de la corrección de schemas

Fecha: 1 de octubre de 2026.

| Comprobación | Resultado local |
|---|---|
| Prisma 5.22: validate | Correcto |
| TypeScript apps/api y database | Correcto, sin errores |
| SQL adicional coincide con la migración | Correcto |
| SQLite Python (constraints, contextos, archivos y migraciones) | 21 pruebas correctas |
| SQLite TypeScript (adaptador real, cola, cursores, tombstones) | 7 pruebas correctas |
| Migración y suite en PostgreSQL 16 | Pendiente: Docker respondió HTTP 500; no se autorizó la descarga alternativa de binarios |
| Seed ejecutado dos veces en PostgreSQL | Pendiente con la suite PostgreSQL |
| Carga de fixtures en S3 | Pendiente de bucket y credenciales |
| HTTP/API/Android E2E | Pendiente de implementación de esos componentes |

Las 28 pruebas locales no demuestran que el SQL PL/pgSQL se haya ejecutado correctamente. La suite apps/api/scripts/test-postgres.ts y el workflow de CI están preparados para PostgreSQL 16 temporal, pero no se ejecutó ni publicó el workflow desde esta sesión. Seguir database/contracts/README.md para reproducir.

Los tests de cola/cursores ejecutan las utilidades implementadas. Idempotencia HTTP, coordinación S3, autorización del JWT, snapshot/delta del endpoint y workers siguen definidos como contratos; no se presentan como servicios ya implementados.
