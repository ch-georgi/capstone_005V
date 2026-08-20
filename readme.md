
# WellQ App Exámenes Médicos

## Objetivo de negocio
WellQ es una plataforma de salud digital desarrollada para una clínica de fisioterapia del Reino Unido, cuyo núcleo
es una aplicación móvil de pacientes que hace seguimiento del progreso durante los planes de rehabilitación,
integrando datos de wearables y documentación clínica generada en consulta. En ese ecosistema, los exámenes
médicos (analíticas, informes de imagen, resultados de laboratorio, informes de derivación) circulan hoy fuera de
la plataforma, por correo o en papel, lo que fragmenta la historia del paciente y complica el trabajo del
fisioterapeuta.
Este proyecto, según la descripción de la planilla, aborda el uploading de exámenes médicos multipaciente y
multitenant en los tres niveles de la plataforma: app móvil, backend y frontend clínico. El objetivo de negocio es
que cada clínica (tenant) gestione de forma segura y aislada los documentos de todos sus pacientes, y que el clínico
los consulte junto al resto de datos de la sesión. La carpeta del proyecto está vacía, por lo que el detalle funcional
que sigue debe leerse como alcance propuesto sobre la base documentada de la plataforma WellQ.
## Cómo funciona
Como alcance propuesto: el paciente (o el personal de la clínica) sube un examen desde la app o desde el panel
web, indicando tipo de documento, fecha y profesional asociado. El backend valida el archivo (tipo MIME, tamaño),
lo almacena en un bucket de objetos con una clave con alcance de tenant (por ejemplo
`clinics/{clinicId}/patients/{patientId}/exams/{uuid}`) y registra los metadatos en base de datos. Toda consulta
queda restringida por el middleware de alcance multitenant, siguiendo el patrón ya documentado en la Clinical API
de WellQ: un clínico de la Clínica A nunca puede acceder a documentos de la Clínica B. El fisioterapeuta visualiza los
exámenes del paciente en una línea de tiempo, junto a las sesiones y notas clínicas, con control de versiones y
registro de auditoría de cada acceso (requisito de cumplimiento UK GDPR).
## Componentes
* Módulo de subida y visualización en la app móvil de pacientes (propuesto).
* Endpoints REST de carga multipart, listado paginado, descarga y borrado lógico de exámenes, con
aislamiento por `clinic_id`.
* Almacenamiento de objetos (S3/MinIO) y modelo de metadatos en base de datos relacional.
* Panel web/front clínico para revisión de documentos y auditoría de accesos (propuesto).
## Tecnología
Stack propuesto, alineado con el documentado en el ecosistema WellQ: backend Node.js 20 con TypeScript y
Express/Fastify, PostgreSQL 16 con migraciones versionadas y borrado lógico, MinIO/S3 para archivos,
autenticación JWT con middleware de tenant, validación con Zod, Docker Compose para desarrollo local, tests con
Jest/Supertest y documentación OpenAPI/Swagger; app móvil en Flutter/Dart, consistente con el cliente WellQ
existente.