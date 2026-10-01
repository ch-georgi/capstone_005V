# Resumen proyectos 4 integrantes

**User:** Anonymous  
**Created:** 8/14/2026 10:02:48  
**Updated:** 9/3/2026 9:56:35  
**Exported:** 9/3/2026 10:16:02  

## Response:
Perfecto. Con la libertad que ahora tienen para cerrar el alcance, conviene dejar una **versión base formal del proyecto** y usarla después como fuente para el informe, arquitectura, GitHub Projects y planificación.

Voy a asumir como decisiones ya tomadas:

- Proyecto académico autónomo inspirado en el contexto de WellQ; **sin integración con la plataforma WellQ real**.
- 9 semanas.
- 4 integrantes.
- Web clínica + aplicación Android.
- iOS fuera del alcance.
- Monolito modular.
- Backend: **NestJS + TypeScript**.
- Web: **React + TypeScript + Vite**.
- Android: **React Native + Expo + TypeScript**.
- BD central: **PostgreSQL**.
- BD local Android: **SQLite**.
- Archivos: API compatible con S3, usando **MinIO en desarrollo** y dejando intercambiable el proveedor de producción.
- Docker para desarrollo.
- Railway para despliegue de API, Web y PostgreSQL.
- Monorepo GitHub + GitHub Projects + GitHub Actions.
- JWT + RBAC + aislamiento multitenant por clínica.

---

# 1. Nombre propuesto

## WellQ Medical Records — Gestión Multitenant de Exámenes Médicos

Puede mantenerse administrativamente como **“WellQ App Exámenes Médicos”**, pero en la documentación sugiero añadir un subtítulo:

> **Plataforma web y móvil para la gestión segura y trazable de exámenes médicos en clínicas de rehabilitación.**

Esto evita afirmar que están desarrollando directamente sobre el producto comercial existente de WellQ.

---

# 2. Descripción general

WellQ Medical Records será una plataforma orientada a clínicas de rehabilitación que permitirá centralizar los documentos médicos asociados a sus pacientes, tales como exámenes de laboratorio, informes médicos, estudios de imagenología y documentos de derivación.

La solución estará compuesta por:

1. Una **aplicación web** utilizada por personal clínico y administradores.
2. Una **aplicación móvil Android** utilizada principalmente por pacientes.
3. Una **API REST centralizada**.
4. Una base de datos PostgreSQL.
5. Un almacenamiento de objetos para documentos.
6. Una base SQLite local en la aplicación móvil para soportar caché, metadatos y sincronización diferida.

La arquitectura será multitenant: una única instancia de la aplicación podrá atender a múltiples clínicas, manteniendo separación lógica de sus datos.

---

# 3. Alcance

## 3.1 Alcance incluido

La solución permitirá:

- registrar múltiples clínicas;
- administrar usuarios asociados a cada clínica;
- manejar roles de sistema;
- registrar pacientes;
- asociar pacientes con clínicas;
- permitir acceso clínico a los pacientes correspondientes;
- registrar metadatos de exámenes médicos;
- subir archivos PDF, JPEG y PNG;
- consultar y descargar documentos;
- visualizar el historial documental de un paciente mediante una línea de tiempo;
- clasificar exámenes por tipo;
- mantener múltiples versiones de un mismo examen;
- realizar borrado lógico;
- mantener trazabilidad de accesos y operaciones;
- aplicar aislamiento multitenant;
- permitir que el paciente consulte y cargue documentos desde Android;
- mantener información local en SQLite para mejorar la experiencia móvil;
- sincronizar información entre la app Android y el backend;
- documentar la API mediante OpenAPI/Swagger;
- desplegar el sistema mediante integración continua.

## 3.2 Fuera del alcance

Quedan explícitamente fuera:

- aplicación iOS;
- integración con el producto comercial WellQ;
- integración con sistemas hospitalarios;
- HL7/FHIR productivo;
- interpretación clínica automática de resultados;
- diagnóstico mediante IA;
- extracción OCR como requisito obligatorio;
- procesamiento de imágenes médicas;
- integración con wearables;
- videollamadas;
- chat paciente-profesional;
- gestión de prescripciones;
- pagos y suscripciones;
- firma electrónica avanzada;
- integración con laboratorios;
- almacenamiento de grandes estudios DICOM;
- certificación formal de cumplimiento GDPR.

## 3.3 Funciones opcionales / Stretch

Solo se desarrollarán si el MVP se encuentra estable:

- OCR de documentos;
- notificaciones;
- compartir temporalmente un documento;
- exportar auditoría;
- dashboard estadístico;
- recuperación/restauración administrativa de documentos eliminados;
- PWA para la web.

---

# 4. Funciones del Producto

## FP-01 — Autenticación

El sistema permitirá iniciar y finalizar sesión y renovar las credenciales de acceso.

## FP-02 — Gestión de clínicas

Permitirá registrar y administrar clínicas dentro de la plataforma.

## FP-03 — Gestión de usuarios

Permitirá administrar usuarios y asignarles rol y actividad dentro de cada clínica mediante UserClinic; la misma cuenta puede tener condiciones distintas en otra clínica.

## FP-04 — Gestión de pacientes

Permitirá registrar, consultar y actualizar pacientes.

## FP-05 — Gestión documental

Permitirá crear registros de exámenes médicos y asociarles uno o más archivos/versiones.

## FP-06 — Carga de archivos

Permitirá cargar PDF, JPEG y PNG desde web y Android.

## FP-07 — Visualización

Permitirá visualizar o descargar los documentos almacenados.

## FP-08 — Línea de tiempo

Permitirá consultar cronológicamente los documentos asociados a un paciente.

## FP-09 — Versionamiento

Permitirá crear nuevas versiones de un documento sin destruir las anteriores.

## FP-10 — Auditoría

Registrará acciones relevantes relacionadas con pacientes y documentos.

## FP-11 — Borrado lógico

Permitirá retirar un documento de la operación normal sin eliminar inmediatamente su trazabilidad.

## FP-12 — Multitenancy

Garantizará que los usuarios solo puedan acceder a datos pertenecientes a la clínica autorizada.

## FP-13 — Operación móvil

El paciente podrá consultar y cargar sus exámenes desde Android.

## FP-14 — Caché y sincronización móvil

La aplicación Android conservará localmente metadatos necesarios para ofrecer una experiencia tolerante a interrupciones temporales de conectividad.

---

# 5. Características de los Usuarios

Propongo solamente cuatro perfiles.

| Rol | Características | Principales acciones |
|---|---|---|
| **System Administrator** | Usuario técnico de la plataforma | Crear clínicas, administrar configuración global |
| **Clinic Administrator** | Personal administrativo de una clínica | Usuarios, profesionales, pacientes, auditoría |
| **Clinician** | Fisioterapeuta u otro profesional clínico | Consultar pacientes, subir y revisar exámenes |
| **Patient** | Paciente de una clínica | Consultar y subir sus propios documentos |

## 5.1 System Administrator

Perfil con conocimientos técnicos y bajo volumen de uso.

No debería tener acceso rutinario al contenido clínico del paciente.

## 5.2 Clinic Administrator

Usuario con conocimientos informáticos básicos/intermedios.

Trabajará principalmente desde la aplicación web.

## 5.3 Clinician

Usuario profesional que requiere acceso rápido a la información.

El sistema deberá minimizar el número de pasos necesarios para encontrar un examen.

## 5.4 Patient

Puede tener conocimientos digitales variables.

La aplicación Android deberá privilegiar:

- botones claros;
- navegación simple;
- mensajes comprensibles;
- pocos campos obligatorios;
- carga sencilla desde cámara, galería o archivos.

---

# 6. Restricciones

## RST-01 — Tiempo

El desarrollo dispone de **9 semanas**.

## RST-02 — Equipo

El proyecto será desarrollado por cuatro estudiantes con distintos niveles de experiencia.

## RST-03 — Participación

Todos los integrantes deberán participar en desarrollo de software.

## RST-04 — iOS

No se desarrollará ni validará una aplicación iOS por no disponer de infraestructura macOS/Xcode.

## RST-05 — Costos

Se priorizarán herramientas:

- open source;
- gratuitas;
- con free tier;
- o ya disponibles para el equipo.

## RST-06 — Arquitectura

No se utilizarán microservicios.

Se empleará un **monolito modular**.

## RST-07 — Tecnología común

Se priorizará TypeScript en backend, web y móvil para reducir la curva de aprendizaje.

## RST-08 — Archivos

Los documentos no se almacenarán dentro de PostgreSQL ni SQLite como BLOB.

## RST-09 — Producción académica

El sistema será un prototipo funcional/MVP y no una plataforma certificada para operación clínica real.

## RST-10 — Privacidad

No deberán utilizarse datos médicos reales durante desarrollo, pruebas o demostraciones.

---

# 7. Requisitos Específicos

## 7.1 Plataforma web

Debe soportar navegadores modernos basados en Chromium y Firefox.

Resolución mínima objetivo:

> 1280 × 720

Debe ser responsive para notebook y escritorio.

## 7.2 Aplicación móvil

Objetivo:

> Android 10 o superior.

Podrá desarrollarse mediante React Native + Expo.

## 7.3 Backend

API REST versionada:

```text
/api/v1/
```

Debe generar documentación OpenAPI.

## 7.4 Datos

PostgreSQL será la fuente autoritativa.

SQLite será una base local subordinada y sincronizable.

## 7.5 Archivos

Formatos MVP:

- `application/pdf`
- `image/jpeg`
- `image/png`

Tamaño máximo inicial:

> **10.000.000 bytes por archivo (10 MB decimales)**

## 7.6 Integridad

Cada versión deberá almacenar un checksum SHA-256.

---

# 8. Requisitos comunes de las interfaces

# 8.1 Interfaces de usuario

## Web

La aplicación web deberá incluir como mínimo:

- Login.
- Dashboard básico.
- Pacientes.
- Detalle de paciente.
- Línea de tiempo.
- Exámenes.
- Formulario de carga.
- Visualizador.
- Usuarios.
- Auditoría.

Navegación propuesta:

```text
Inicio
├── Pacientes
│   └── Paciente
│       ├── Resumen
│       ├── Exámenes
│       └── Actividad
├── Usuarios
└── Auditoría
```

## Android

```text
Login
  ↓
Inicio
  ↓
Mis Exámenes
 ├── Detalle
 └── Nuevo Examen
```

La app evitará exponer funciones administrativas.

---

# 8.2 Interfaces de hardware

No se requiere hardware clínico especializado.

La aplicación móvil podrá utilizar:

- cámara del dispositivo;
- almacenamiento local;
- conectividad Wi-Fi;
- conectividad móvil.

No se integrarán:

- wearables;
- dispositivos biomédicos;
- impresoras especiales;
- sensores externos.

---

# 8.3 Interfaces de software

La solución interactuará con:

### PostgreSQL

Persistencia central.

### SQLite

Persistencia local móvil.

### API compatible S3

Almacenamiento de objetos.

Implementación de desarrollo:

> MinIO.

### Railway

Despliegue de servicios.

### GitHub

Código, Issues, Projects, Actions y Pull Requests.

### OpenAPI

Contrato y documentación de API.

---

# 8.4 Interfaces de comunicación

Toda comunicación cliente-servidor será mediante:

```text
HTTPS
```

Formato principal:

```text
application/json
```

Carga documental:

```text
multipart/form-data
```

Autenticación:

```http
Authorization: Bearer <JWT>
```

No se utilizarán WebSockets en el MVP porque no existe una necesidad funcional que justifique introducirlos.

---

# 9. Requisitos Funcionales

Usaría IDs formales desde ahora.

## RF-001 — Autenticación

El sistema deberá permitir que un usuario registrado inicie sesión mediante correo y contraseña.

### Aceptación

- credenciales correctas generan sesión;
- credenciales incorrectas son rechazadas;
- una cuenta pendiente sin credenciales no ingresa;
- una membresía inactiva pierde funciones clínicas y escritura, pero un paciente conserva lectura histórica propia.

---

## RF-002 — Autorización

El sistema deberá restringir funcionalidades según el rol.

---

## RF-003 — Contexto de clínica

Toda operación clínica deberá ejecutarse dentro de una clínica autorizada.

---

## RF-004 — Aislamiento multitenant

Un usuario solo deberá consultar recursos privados de clínicas autorizadas. Una cuenta con membresías en A y B utiliza el contexto y permisos propios de cada una, sin compartir datos administrativos de pacientes entre fichas.

Este requisito será **crítico**.

---

## RF-005 — Registro de pacientes

Clinic Administrator podrá registrar una ficha privada por clínica asociada a una membresía PATIENT; puede crear una cuenta pendiente si aún no hay credenciales.

---

## RF-006 — Consulta de pacientes

Clinician activo podrá consultar todos los pacientes activos no eliminados de su clínica activa. No se utiliza asignación profesional-paciente en el MVP.

---

## RF-007 — Actualización de pacientes

Usuarios autorizados podrán modificar datos administrativos permitidos.

---

## RF-008 — Creación de examen

Patient o Clinician podrá crear un examen asociado a un paciente autorizado.

---

## RF-009 — Metadatos

El examen deberá considerar al menos:

- tipo;
- fecha;
- título/descripción;
- paciente;
- profesional asociado opcional;
- usuario creador.

---

## RF-010 — Carga documental

El sistema permitirá cargar archivos admitidos.

---

## RF-011 — Validación de archivo

La API deberá validar:

- MIME;
- tamaño;
- existencia de archivo.

---

## RF-012 — Hash

El backend deberá calcular SHA-256 para cada archivo almacenado.

---

## RF-013 — Listado

El sistema permitirá listar exámenes de un paciente.

---

## RF-014 — Paginación

Los listados deberán soportar paginación.

---

## RF-015 — Filtros

La web permitirá filtrar al menos por:

- tipo;
- rango de fechas.

---

## RF-016 — Línea de tiempo

El sistema mostrará exámenes en orden cronológico.

---

## RF-017 — Descarga

Un usuario autorizado podrá descargar un archivo.

---

## RF-018 — Visualización

Web y Android deberán permitir acceder al contenido admitido.

---

## RF-019 — Versionamiento

Un usuario autorizado podrá cargar una nueva versión de un examen existente.

---

## RF-020 — Historial

El sistema permitirá consultar las versiones previas.

---

## RF-021 — Borrado lógico

Un examen eliminado deberá dejar de aparecer en consultas normales sin destruirse inmediatamente.

---

## RF-022 — Auditoría

Se registrarán como mínimo:

- creación;
- visualización;
- descarga;
- nueva versión;
- actualización;
- eliminación.

---

## RF-023 — Consulta de auditoría

Clinic Administrator podrá consultar la auditoría correspondiente a su clínica.

---

## RF-024 — Aplicación Android

El paciente deberá poder iniciar sesión y consultar sus exámenes.

---

## RF-025 — Upload Android

El paciente podrá seleccionar PDF o imagen desde el dispositivo y cargarla.

---

## RF-026 — Persistencia local

La aplicación móvil almacenará localmente metadatos esenciales.

---

## RF-027 — Sincronización

La aplicación deberá actualizar sus datos locales al recuperar comunicación con la API.

---

## RF-028 — Cola de operaciones

Una carga que no pueda completarse inmediatamente podrá quedar registrada como pendiente de sincronización.

Esta funcionalidad podría implementarse de forma limitada en el MVP.

---

## RF-029 — OpenAPI

La API deberá exponer documentación técnica actualizada.

---

## RF-030 — Administración de usuarios

Clinic Administrator podrá registrar, activar y desactivar usuarios de su clínica.

---

# 10. Requisitos no funcionales

## RNF-001 — Seguridad

Contraseñas almacenadas exclusivamente mediante hash seguro.

Recomendaría Argon2.

---

## RNF-002 — HTTPS

Los entornos desplegados deberán utilizar HTTPS.

---

## RNF-003 — Aislamiento

Las consultas deberán incorporar el tenant correspondiente desde el contexto autenticado y nunca confiar en un `clinic_id` arbitrario enviado por el cliente.

---

## RNF-004 — Trazabilidad

Las operaciones sensibles deberán generar auditoría.

---

## RNF-005 — Rendimiento

Para operaciones normales sin transferencia de archivos:

> objetivo ≤2 segundos en condiciones normales de demostración.

---

## RNF-006 — Disponibilidad

No se establecerá un SLA comercial.

El sistema deberá recuperarse de reinicios sin pérdida de los datos persistidos.

---

## RNF-007 — Usabilidad

Un paciente deberá poder cargar un examen sin capacitación previa.

---

## RNF-008 — Mantenibilidad

El código deberá:

- utilizar TypeScript;
- aplicar lint;
- estar modularizado;
- utilizar convenciones consistentes;
- poseer documentación mínima.

---

## RNF-009 — Testabilidad

Los módulos críticos deberán ser testeables automáticamente.

---

## RNF-010 — Portabilidad

El backend deberá poder ejecutarse mediante contenedores.

---

## RNF-011 — Observabilidad

La API deberá utilizar logs estructurados al menos para:

- errores;
- autenticación;
- acciones críticas.

---

## RNF-012 — Integridad

El sistema almacenará checksum SHA-256 de archivos.

---

## RNF-013 — Escalabilidad

La arquitectura deberá permitir múltiples clínicas sin requerir desplegar una instancia independiente por clínica.

---

## RNF-014 — Compatibilidad

Web deberá funcionar en navegadores modernos y móvil en Android 10+.

---

## RNF-015 — Privacidad

La interfaz no deberá exponer información perteneciente a otro tenant incluso ante manipulación de URLs o IDs.

---

# 11. Otros requisitos

## OR-001 — Datos sintéticos

Todas las demostraciones usarán pacientes y documentos ficticios.

## OR-002 — Seed

El proyecto deberá disponer de datos iniciales reproducibles.

Por ejemplo:

```text
Clínica A
Clínica B

2 administradores
4 profesionales
10 pacientes
20 exámenes
```

## OR-003 — Backup

Antes de la presentación final deberá generarse:

- backup PostgreSQL;
- copia/documentación de archivos demo;
- instrucciones de restauración.

## OR-004 — Documentación

El repositorio deberá contener:

- README;
- arquitectura;
- modelo ER;
- instrucciones de ejecución;
- variables de entorno;
- OpenAPI;
- estrategia de testing.

---

# 12. Arquitectura

## 12.1 Patrón

**Monolito modular + clientes desacoplados.**

```text
                         ┌───────────────────────┐
                         │      WEB APP          │
                         │ React + TypeScript    │
                         └───────────┬───────────┘
                                     │
                                     │ HTTPS REST
                                     │
┌──────────────────────────┐         │
│       ANDROID APP        │         │
│ React Native + Expo      │─────────┤
│ SQLite                   │         │
└──────────────────────────┘         ▼
                         ┌────────────────────────┐
                         │       NestJS API       │
                         │      TypeScript        │
                         │                        │
                         │ Auth                   │
                         │ Clinics                │
                         │ Users                  │
                         │ Patients               │
                         │ Exams                  │
                         │ Storage                │
                         │ Audit                  │
                         └───────────┬────────────┘
                                     │
                       ┌─────────────┴─────────────┐
                       ▼                           ▼
                ┌─────────────┐             ┌─────────────┐
                │ PostgreSQL  │             │ Object      │
                │             │             │ Storage     │
                │ Metadata    │             │ MinIO/S3    │
                └─────────────┘             └─────────────┘
```

---

# 13. Backend por módulos

```text
apps/api/src/

├── auth/
├── clinics/
├── users/
├── patients/
├── exams/
├── exam-versions/
├── storage/
├── audit/
├── common/
└── database/
```

Dependencias:

```text
Controller
    ↓
Service
    ↓
Repository / Prisma
    ↓
PostgreSQL
```

El módulo de negocio no deberá depender directamente de MinIO:

```text
ExamService
     ↓
StorageService interface
     ↓
S3StorageAdapter
```

Esto permite cambiar MinIO por otro proveedor compatible con S3 sin modificar la lógica de exámenes.

---

# 14. PostgreSQL — Modelo vigente

Decisiones cerradas el 1 de octubre de 2026. Este modelo reemplaza el borrador anterior. El contrato detallado de persistencia, permisos, carga, purga y sincronización está en [database/contracts/README.md](../database/contracts/README.md).

```mermaid
erDiagram
    USER ||--o{ USER_CLINIC : membership
    CLINIC ||--o{ USER_CLINIC : tenant
    USER_CLINIC ||--o| PATIENT : private_record
    PATIENT ||--o{ EXAM : documents
    EXAM_TYPE ||--o{ EXAM : classification
    EXAM ||--|{ EXAM_VERSION : immutable_files
    USER ||--o{ REFRESH_TOKEN : sessions
    CLINIC ||--o{ AUDIT_LOG : historical_events
    EXAM_VERSION o|--o{ AUDIT_LOG : live_reference
    CLINIC ||--o{ SYNC_CHANGE : committed_revisions
    CLINIC ||--o{ IDEMPOTENCY_RECORD : upload_results
    CLINIC ||--o{ STORAGE_DELETION_JOB : object_cleanup
```

No hay PatientClinic: Patient es una ficha por clínica y referencia la única membresía UserClinic. La misma cuenta puede tener fichas distintas en varias clínicas. Un Patient no es una identidad clínica global compartida.

# 15. PostgreSQL — entidades y reglas

El schema completo y tipos se encuentran en [schema.prisma](../apps/api/prisma/schema.prisma); restricciones y triggers adicionales se incluyen en la migración inicial.

| Entidad | Datos y reglas principales |
|---|---|
| clinics | UUID, nombre, código único, actividad, contador de cambios y fechas |
| users | UUID global, correo de login normalizado único opcional, hash opcional, is_system_admin, fechas; sin rol ni actividad de tenant |
| user_clinics | PK(user_id,clinic_id), rol CLINIC_ADMIN/CLINICIAN/PATIENT, actividad, presentación, revisión de permisos, fechas |
| patients | UUID de ficha, FK(user_id,clinic_id) a membresía, unicidad de esa pareja, nombre, apellido, nacimiento, contacto privado, número de ficha único por clínica, borrado lógico y fechas |
| exam_types | Catálogo LAB/IMAGING/MEDICAL_REPORT/REFERRAL/FUNCTIONAL/OTHER |
| exams | UUID, clínica, FK(patient_id,clinic_id) a ficha, tipo, título, fecha, profesional informado opcional, notas, creador, borrado lógico y fechas |
| exam_versions | UUID, examen, número positivo único por examen, clave de objeto única, nombre original, MIME permitido, tamaño, SHA-256, uploader y fecha; un archivo por versión e inmutabilidad |
| audit_logs | Actor, clínica, ficha, FKs operativas a examen/versión, UUIDs históricos, snapshot de archivo, acción, IP, user-agent, metadata y fecha |
| refresh_tokens | Usuario, hash único, expiración, revocación por sesión y fecha |
| idempotency_records | Usuario, clínica, UUID de operación, operación, huella y respuesta confirmada; unicidad por contexto y operación |
| sync_changes | Clínica+revisión, entidad, UUID, ficha afectada, UPSERT/DELETE, payload y fecha; conserva tombstones |
| storage_deletion_jobs | Destino inmutable, clínica, UUIDs históricos de examen/versión, estado, intentos, lease, errores y fechas |

Una cuenta pendiente puede tener ficha/membresía sin email de login ni contraseña, pero no puede autenticarse. El correo administrativo de la ficha no identifica automáticamente la cuenta. La activación o vinculación requiere verificación; una colisión de fichas por usuario/clínica necesita conciliación explícita.

Los roles y la actividad son por clínica. Los clínicos activos pueden consultar todos los pacientes activos no eliminados de su propia clínica; no se requiere asignación profesional-paciente en el MVP. El administrador global no obtiene acceso clínico automáticamente.

Los pacientes/membresías no se borran físicamente. El propietario conserva lectura de sus exámenes no eliminados aun con membresía inactiva, ficha eliminada o clínica inactiva; no conserva escritura. Las FKs de examen comprueban identidad de ficha/clínica y no requieren actividad.

Los exámenes se eliminan lógicamente. Una purga explícita posterior exige administrador activo de clínica activa, conserva auditoría y tombstones y encola borrado S3. Las FKs de auditoría a examen/versión se anulan al purgar, pero sus identificadores históricos y snapshot permanecen. Los logs son inmutables.

Límite: 1..10.000.000 bytes, MIME PDF/JPEG/PNG, SHA-256 hexadecimal de 64 caracteres en minúsculas. Un examen no se publica sin primera versión: objeto verificado, metadatos+auditoría+idempotencia en una transacción. La numeración concurrente se resuelve en backend con bloqueo clínica→examen. Toda versión nueva actualiza el examen y emite cambios.

UUID es un tipo nativo PostgreSQL, con generación en la base. Fechas clínicas DATE, instantes timestamptz(3), updated_at mediante triggers. Los índices optimizan consultas; la autorización del backend determina el acceso.

# 16. SQLite — finalidad y contexto

Una base Android compartida, subordinada a PostgreSQL. Todas las filas operativas se separan mediante propietario de sesión y clínica. Solo la caché confirmada se reconstruye desde el servidor; cargas pendientes y archivos sin confirmar no son desechables.

# 17. SQLite — relaciones

```mermaid
erDiagram
    LOCAL_CONTEXT ||--o{ LOCAL_PATIENT : scoped_cache
    LOCAL_PATIENT ||--o{ LOCAL_EXAM : documents
    LOCAL_EXAM ||--o{ LOCAL_EXAM_VERSION : confirmed_versions
    LOCAL_CONTEXT ||--o{ SYNC_QUEUE : pending_uploads
    LOCAL_CONTEXT ||--o| SYNC_METADATA : cursor
```

PKs y FKs incluyen owner_user_id y clinic_id. La cola no depende por FK de filas descartables de caché: un tombstone no destruye una carga pendiente. Las identidades de contexto no pueden reasignarse.

# 18. SQLite — tablas vigentes

| Tabla | Función |
|---|---|
| local_contexts | Cuenta, clínica, rol, revisión de permisos, READ_WRITE/READ_ONLY/REVOKED |
| local_patients | Fichas privadas confirmadas, actividad derivada, borrado lógico y actualización |
| local_exams | Metadatos confirmados, latest_server_version y current_version nullable |
| local_exam_versions | Versiones confirmadas, checksum/tamaño/MIME, URI privada y fecha de verificación |
| sync_queue | Operación estable, contexto, payload v1, archivo persistente, huella, estado, intentos, pausa, próxima ejecución y lease |
| sync_metadata | Cursor opaco y revisión por cuenta, clínica y stream clínico |
| local_file_cleanup | Borrados de archivos físicos por procesar después del commit |
| legacy_queue_quarantine | Pendientes antiguos sin propietario/clínica verificados; conserva también legacy_sync_queue_raw al migrar |

current_version identifica la versión de número más alto cuyo archivo se descargó y verificó y sigue presente. No es la última versión del servidor ni la última página de metadatos. Sin archivo local no hay apertura offline; online se descarga y verifica antes de abrir. remote_available fue eliminado; las entidades pendientes se mantienen solo en cola.

Todas las PK son NOT NULL; hay validación de UUID, tipos efectivos, fechas reales, timestamps UTC, booleanos, MIME, tamaño, hash, estados y JSON. No se depende de STRICT. Las migraciones son secuenciales con user_version, transacción exclusiva y foreign_keys en cada conexión. Un esquema antiguo desconocido se rechaza; uno conocido conserva los pendientes íntegros en cuarentena sin adivinar su sesión.

# 19. Seguridad móvil

JWT y refresh token permanecen en almacenamiento seguro Android, nunca en SQLite. Una sesión no puede consultar ni enviar la cola de otra. Una cuenta inactiva conserva lectura histórica propia, sin permitir escritura; al recuperar conexión se actualiza el estado de permisos y se retira caché que ya no corresponde.

IndexedDB/Dexie (`database/local_db.ts`) es una propuesta futura de PWA, no el reemplazo vigente de SQLite. Android sigue dentro del alcance y PWA sigue siendo opcional.

# 20. Carga y sincronización — contrato

CREATE_EXAM_WITH_VERSION publica examen y primer archivo juntos; UPLOAD_VERSION agrega un archivo a un examen existente. UUID de operación y solicitud no cambian en reintentos. El servidor guarda resultado por usuario/clínica/operación: misma huella devuelve el resultado, huella diferente devuelve 409. La cola tiene lease de cinco minutos, recuperación tras interrupción, hasta ocho intentos y backoff 5 segundos..5 minutos. Errores de autenticación/permisos pausan el envío. Un cambio de cuenta no reasigna pendientes.

GET /api/v1/sync devuelve snapshot inicial consistente y luego cambios incrementales mediante cursor firmado del servidor. El cursor queda vinculado a usuario, clínica y revisión de permisos; revisiones son cadenas decimales. La revisión se asigna bajo bloqueo transaccional por clínica, no con reloj del móvil ni secuencia previa al commit. Borrados generan tombstones que sobreviven a purgas.

Página y cursor se aplican juntos en SQLite; repeticiones son idempotentes. Un cambio de permisos exige snapshot nuevo del contexto, conservando pendientes. Se filtran eventos según autorización actual, no se devuelve directamente el payload histórico. La API y el worker S3 aún son contratos pendientes de implementación; las tablas, triggers y adaptadores que los soportan sí están implementados.

---

# 21. Despliegue

```text
                    GitHub
                       │
                  push / PR
                       │
                       ▼
                GitHub Actions
              ┌────────┼────────┐
              │        │        │
            lint     tests    build
                       │
                   main branch
                       │
                       ▼
                    Railway
            ┌──────────┼───────────┐
            ▼          ▼           ▼
           Web         API      PostgreSQL
```

El almacenamiento puede mantenerse detrás de la interfaz S3.

---

# 22. Estructura del repositorio

```text
wellq-medical-records/
│
├── apps/
│   ├── api/
│   ├── web/
│   └── mobile/
│
├── packages/
│   ├── contracts/
│   ├── types/
│   └── config/
│
├── database/
│   ├── diagrams/
│   ├── seeds/
│   └── backups/
│
├── docs/
│   ├── requirements/
│   ├── architecture/
│   ├── database/
│   ├── api/
│   ├── tests/
│   └── evidence/
│
├── infrastructure/
│   ├── docker/
│   └── railway/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── package.json
└── README.md
```

---

# 23. Descripción general acerca de la planificación

Se empleará un enfoque iterativo basado en Scrum adaptado a nueve iteraciones semanales.

Cada semana tendrá:

1. planificación;
2. desarrollo;
3. integración continua;
4. revisión;
5. prueba;
6. cierre de historias.

La planificación busca disponer de un **MVP funcional al finalizar la semana 5**.

De esta forma las semanas 6–8 agregan madurez, no funciones indispensables.

La semana 9 estará bajo:

> **Feature Freeze.**

No se incorporarán nuevas funcionalidades salvo correcciones indispensables.

---

# 24. Hitos

| Semana | Hito |
|---|---|
| 1 | Arquitectura y entorno |
| 2 | Seguridad y multitenancy |
| 3 | Gestión clínica/pacientes |
| 4 | Gestión documental web |
| **5** | **MVP funcional Web + Android** |
| 6 | Versionamiento |
| 7 | Auditoría y endurecimiento |
| 8 | Release Candidate |
| **9** | **Entrega final** |

---

# 25. Estructura de Desglose del Trabajo — EDT

Podemos estructurarla jerárquicamente.

```text
1. Gestión del proyecto
   1.1 Definición de alcance
   1.2 Product Backlog
   1.3 GitHub Projects
   1.4 Seguimiento semanal

2. Arquitectura
   2.1 Arquitectura lógica
   2.2 Arquitectura física
   2.3 Modelo PostgreSQL
   2.4 Modelo SQLite
   2.5 Seguridad
   2.6 Estrategia multitenant

3. Infraestructura
   3.1 Monorepo
   3.2 Docker
   3.3 PostgreSQL
   3.4 MinIO
   3.5 Railway
   3.6 GitHub Actions

4. Backend
   4.1 Auth
   4.2 RBAC
   4.3 Tenant Context
   4.4 Clinics
   4.5 Users
   4.6 Patients
   4.7 Exams
   4.8 Versions
   4.9 Storage
   4.10 Audit

5. Aplicación Web
   5.1 Autenticación
   5.2 Layout
   5.3 Pacientes
   5.4 Exámenes
   5.5 Timeline
   5.6 Visualizador
   5.7 Versionamiento
   5.8 Auditoría

6. Aplicación Android
   6.1 Foundation
   6.2 Login
   6.3 SQLite
   6.4 Mis exámenes
   6.5 Detalle
   6.6 Upload
   6.7 Cache
   6.8 Sincronización

7. Seguridad
   7.1 Contraseñas
   7.2 JWT
   7.3 Multitenancy
   7.4 Validación archivos
   7.5 Hash documental
   7.6 Auditoría

8. Calidad
   8.1 Unit Tests
   8.2 Integration Tests
   8.3 E2E
   8.4 Testing multitenant
   8.5 QA manual

9. Documentación
   9.1 README
   9.2 Swagger
   9.3 Arquitectura
   9.4 Base de datos
   9.5 Manual de despliegue
   9.6 Manual de usuario

10. Entrega
   10.1 Datos demo
   10.2 Backup
   10.3 Release final
   10.4 Evidencias
   10.5 Presentación
```

---

# 26. Prioridades del Product Backlog

Usaría:

| Prioridad | Significado |
|---|---|
| **P0** | Imprescindible. Sin esto el proyecto no cumple su objetivo |
| **P1** | Importante para la entrega |
| **P2** | Deseable |
| **P3** | Stretch |

Y estimación Fibonacci:

```text
1
2
3
5
8
```

No asignaría historias >8 SP. Si aparece una, debe dividirse.

---

# 27. Product Backlog — Semana 1

## US-001 — Inicializar monorepo

**P0 · 3 SP**

> Como desarrollador quiero disponer de una estructura común para trabajar en web, backend y mobile.

### Criterios

- existen `apps/api`, `apps/web`, `apps/mobile`;
- todos pueden instalar dependencias;
- README inicial documentado.

---

## US-002 — Entorno Docker

**P0 · 3 SP**

> Como desarrollador quiero levantar las dependencias locales de forma reproducible.

### Criterios

- PostgreSQL funciona;
- MinIO funciona;
- variables están documentadas;
- `docker compose up` levanta servicios.

---

## US-003 — Modelo PostgreSQL inicial

**P0 · 5 SP**

### Criterios

- schema implementado;
- migración reproducible;
- claves y relaciones;
- seed inicial.

---

## US-004 — CI inicial

**P1 · 3 SP**

### Criterios

En cada PR se ejecutan:

- install;
- lint;
- typecheck;
- build.

---

## US-005 — Despliegue Railway inicial

**P1 · 3 SP**

### Criterios

- API accesible;
- PostgreSQL conectado;
- web mínima accesible.

---

# 28. Semana 2 — Auth y Multitenancy

## US-006 — Login

**P0 · 5 SP**

### Criterios

- email/password;
- hash seguro;
- JWT;
- errores adecuados.

---

## US-007 — Refresh token

**P1 · 3 SP**

### Criterios

- renovación válida;
- token revocable;
- logout invalida sesión.

---

## US-008 — RBAC

**P0 · 5 SP**

### Criterios

Los cuatro perfiles poseen permisos diferenciados: administrador global mediante User.isSystemAdmin y roles clínicos por UserClinic, sin acceso clínico automático para el administrador global.

---

## US-009 — Tenant Context

**P0 · 5 SP**

### Criterios

- clínica obtenida desde sesión autorizada;
- cliente no puede indicar arbitrariamente otra clínica;
- servicios reciben tenant explícito.

---

## US-010 — Test cross-tenant

**P0 · 5 SP**

> Como responsable de seguridad quiero garantizar que Clínica A nunca pueda consultar recursos de Clínica B.

### Criterios

Tests automatizados para:

- paciente;
- examen;
- archivo.

---

# 29. Semana 3 — Gestión clínica

## US-011 — CRUD pacientes API

**P0 · 5 SP**

### Criterios

- crear;
- listar;
- consultar;
- actualizar;
- tenant aplicado.

---

## US-012 — Pacientes Web

**P0 · 5 SP**

### Criterios

- listado;
- búsqueda;
- loading;
- errores.

---

## US-013 — Crear/editar paciente Web

**P1 · 3 SP**

---

## US-014 — Detalle paciente Web

**P0 · 3 SP**

---

## US-015 — Login Android

**P0 · 5 SP**

### Criterios

- autenticación;
- persistencia segura de sesión;
- logout.

---

## US-016 — SQLite Foundation

**P1 · 3 SP**

### Criterios

- creación automática;
- esquema versionado;
- consultas básicas.

---

# 30. Semana 4 — Gestión documental

## US-017 — Crear examen

**P0 · 5 SP**

---

## US-018 — Storage Service

**P0 · 5 SP**

### Criterios

- interfaz desacoplada;
- implementación S3/MinIO;
- upload;
- download.

---

## US-019 — Validación documental

**P0 · 3 SP**

### Criterios

- MIME;
- 10.000.000 bytes;
- PDF/JPEG/PNG;
- rechazo correcto.

---

## US-020 — SHA-256

**P1 · 2 SP**

---

## US-021 — Upload Web

**P0 · 5 SP**

---

## US-022 — Timeline Web

**P0 · 5 SP**

### Criterios

- orden cronológico;
- tipo;
- fecha;
- título;
- acceso a detalle.

---

## US-023 — Visualizar/descargar

**P0 · 5 SP**

---

# 31. Semana 5 — MVP Android

## US-024 — Listado móvil

**P0 · 5 SP**

> Como paciente quiero consultar mis exámenes desde Android.

---

## US-025 — Caché SQLite de exámenes

**P1 · 5 SP**

### Criterios

- muestra datos locales;
- refresca desde API;
- actualización local automática.

---

## US-026 — Detalle Android

**P0 · 3 SP**

---

## US-027 — Upload Android

**P0 · 8 SP**

### Criterios

- PDF;
- JPEG/PNG;
- selector de archivo;
- progreso;
- manejo de error;
- aparece posteriormente en listado.

---

## US-028 — Descarga/visualización Android

**P1 · 5 SP**

---

### Al finalizar semana 5

Deben poder demostrar:

> Android paciente → upload → backend → storage → PostgreSQL → web clínico → timeline → visualización.

Ese es el **MVP**.

---

# 32. Semana 6 — Versionamiento

## US-029 — Versionar examen API

**P0 · 5 SP**

---

## US-030 — Historial de versiones

**P1 · 3 SP**

---

## US-031 — Versionamiento Web

**P1 · 5 SP**

---

## US-032 — Borrado lógico

**P0 · 3 SP**

---

## US-033 — Filtros Timeline

**P1 · 3 SP**

### Criterios

Por:

- tipo;
- fecha.

---

## US-034 — Paginación

**P1 · 3 SP**

---

# 33. Semana 7 — Auditoría y seguridad

## US-035 — Registrar auditoría

**P0 · 5 SP**

Debe cubrir:

```text
CREATE
VIEW
DOWNLOAD
NEW_VERSION
UPDATE
DELETE
```

---

## US-036 — Panel auditoría

**P1 · 5 SP**

---

## US-037 — Tests autorización

**P0 · 5 SP**

---

## US-038 — Tests almacenamiento

**P1 · 3 SP**

---

## US-039 — Hardening upload

**P1 · 3 SP**

---

## US-040 — Logs estructurados

**P2 · 2 SP**

---

# 34. Semana 8 — Release Candidate

Aquí ya no planearía grandes módulos.

## US-041 — Tests E2E críticos

**P0 · 8 SP**

Flujo:

```text
login
→ paciente
→ examen
→ upload
→ download
```

---

## US-042 — Corrección UX Web

**P1 · 5 SP**

---

## US-043 — Corrección UX Android

**P1 · 5 SP**

---

## US-044 — Datos Demo

**P0 · 3 SP**

---

## US-045 — OpenAPI Final

**P1 · 3 SP**

---

## US-046 — Documentar despliegue

**P1 · 3 SP**

---

## US-047 — Backup y restore

**P1 · 3 SP**

---

# 35. Semana 9 — Cierre

## US-048 — Bugfix Release

**P0 · 8 SP reservados**

No son ocho puntos obligatorios de trabajo. Es capacidad reservada.

---

## US-049 — Evidencias técnicas

**P0 · 5 SP**

- arquitectura;
- capturas;
- ERD;
- API;
- CI;
- pruebas;
- base de datos.

---

## US-050 — Manual técnico

**P1 · 3 SP**

---

## US-051 — Manual de usuario

**P1 · 3 SP**

---

## US-052 — Release Final

**P0 · 3 SP**

### Criterios

- tag Git;
- aplicación desplegada;
- APK generado;
- backup realizado;
- demo reproducible.

---

# 36. Backlog opcional

No metería esto en ningún sprint hasta tener US-001 a US-052 controladas.

```text
ST-01 OCR básico
ST-02 Notificaciones
ST-03 Compartición temporal
ST-04 Restaurar examen
ST-05 Dashboard estadísticas
ST-06 Exportar auditoría CSV
ST-07 Captura directa de cámara Android
```

Prioridad:

> **P3**

---

# 37. Cómo repartirlo entre cuatro integrantes

Dado el nivel actual del equipo, inicialmente haría algo así:

### Integrante A

Responsabilidad primaria:

- arquitectura;
- backend core;
- auth;
- multitenancy;
- storage;
- CI/CD;
- code reviews.

### Integrante B

Responsabilidad primaria:

- web;
- pacientes;
- timeline;
- formularios;
- visualización.

### Integrante C

Responsabilidad primaria:

- Android;
- SQLite;
- consumo API;
- upload.

### Integrante D

Responsabilidad primaria:

- CRUD sencillos;
- administración;
- auditoría;
- tests;
- seeds.

Pero **esto no significa asignarles un subsistema entero**.

Por ejemplo, una historia:

> US-021 Upload Web

puede implicar:

- A: endpoint;
- B: formulario;
- D: test;
- C: revisar contrato porque lo consumirá Android.

Así todos participan realmente en código y conocen más de una capa.

---

# 38. Regla crítica para GitHub Projects

Cada tarjeta debe representar algo que pueda terminarse.

No creen:

> “Desarrollar módulo exámenes — 3 semanas”

Creen:

```text
US-017 Crear examen
US-018 Storage Service
US-019 Validación
US-020 SHA
US-021 Upload Web
US-022 Timeline
US-023 Download
```

Y cada historia idealmente debe poder ser completada en **1–3 días** por uno o dos integrantes.

---

# 39. Definition of Done común

La pondría literalmente en GitHub:

> Una historia se considera terminada únicamente cuando:

- [ ] cumple sus criterios de aceptación;
- [ ] código integrado en la rama correspondiente;
- [ ] compila sin errores;
- [ ] lint exitoso;
- [ ] manejo de errores implementado;
- [ ] permisos revisados cuando corresponda;
- [ ] tests correspondientes aprobados;
- [ ] Pull Request revisado;
- [ ] CI exitoso;
- [ ] documentación actualizada si modifica API/arquitectura;
- [ ] disponible en el entorno integrado cuando corresponda.

---

## Resultado

Con esta definición, el proyecto ya tiene una frontera bastante clara:

> **No están construyendo una plataforma médica completa. Están construyendo un sistema multitenant especializado en gestión documental clínica, con web para profesionales, Android para pacientes, almacenamiento de objetos, versionamiento, auditoría y sincronización móvil.**

Eso es suficientemente amplio para cuatro estudiantes, pero las partes difíciles están concentradas en problemas de ingeniería defendibles: **multitenancy, seguridad, almacenamiento documental, sincronización, trazabilidad, arquitectura full-stack y CI/CD**.

Y, especialmente, el plan deja un **MVP**, cuatro semanas antes de la entrega. Esa debería ser una de las restricciones centrales del proyecto; no conviene que el “primer flujo completo” aparezca recién en semana 8 o 9.
