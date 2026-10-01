# WellQ Medical Records

Proyecto académico autónomo de gestión documental clínica multitenant, inspirado en WellQ y sin integración con el producto real. Web clínica y Android para pacientes; API NestJS/TypeScript, React, React Native/Expo, PostgreSQL 16, SQLite y S3/MinIO. PWA es opcional y no reemplaza Android.

El alcance vigente está en [Propuesta de redefinición](Fase%201/Propuesta%20redefinicion%20proyecto.md). El contrato técnico de persistencia está en [database/contracts/README.md](database/contracts/README.md).

## Estado actual

Implementados: schemas PostgreSQL/Prisma y SQLite v2, migración inicial con constraints/triggers, protección de auditoría y purga, seed repetible, PDF sintético real, script de fixtures S3, adaptadores de migración/cola/sync local, firma de cursor y hash de solicitudes, suites de pruebas y workflow CI.

Pendientes: backend HTTP, autenticación/RBAC, autorización de consultas, coordinador de cargas, endpoint sync, worker S3 y UI web/Android. Las tablas y helpers no equivalen a tener esos flujos desplegados.

## Modelo y privacidad

```text
User global → UserClinic (clínica, rol, actividad) → Patient privado → Exam → ExamVersion
```

Patient es una ficha por clínica; la misma cuenta puede tener fichas independientes en varias clínicas. No existe PatientClinic. El correo de contacto de una ficha no identifica automáticamente la cuenta de login. Cuentas pendientes pueden tener ficha sin credenciales.

Los clínicos activos acceden a todos los pacientes activos de su clínica; el administrador global no tiene acceso clínico automático. Un paciente inactivo o eliminado lógicamente conserva lectura de sus propios exámenes no eliminados, sin permiso de escritura. Las membresías y pacientes se conservan físicamente.

Cada versión contiene un archivo inmutable, PDF/JPEG/PNG, entre 1 y 10.000.000 bytes, con SHA-256 real. Los exámenes se eliminan lógicamente y pueden purgarse explícitamente; quedan auditoría, tombstones y trabajos de eliminación S3.

SQLite es una base compartida que separa propietario y clínica en claves/FKs, cola y cursor. current_version es la última versión de archivo descargada y verificada; latest_server_version es la última confirmada por el servidor. Credenciales fuera de SQLite. La caché confirmada puede reconstruirse; los pendientes deben preservarse.

## Desarrollo y validación

```powershell
npm.cmd ci --prefix apps/api
npm.cmd run db:generate --prefix apps/api
npm.cmd run typecheck --prefix apps/api
python database/tests/test_sqlite.py
node database/tests/run-local.cjs
```

Las pruebas locales TypeScript requieren Node 22.13+ (node:sqlite); Android usa Expo SQLite. Para migración PostgreSQL temporal, permisos del grupo de aplicación, seed y suite de integración, seguir [el contrato técnico](database/contracts/README.md#validación-reproducible).

Usar migrate deploy: db push omite las restricciones y triggers SQL. La migración inicial se regeneró para el entorno descartable confirmado; no ejecutar reset sobre bases con datos que deban conservarse. Separar el login de migración del login de aplicación.

El seed no borra pacientes ni modifica versiones existentes. db:seed registra metadatos con checksum del PDF sintético; db:fixtures carga los archivos al bucket existente con variables S3. Las descargas de demo necesitan ambos pasos.

No utilizar datos médicos reales en desarrollo, pruebas ni demostraciones.
