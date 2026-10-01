// PROPUESTA FUTURA NO VIGENTE: IndexedDB/Dexie para una eventual PWA.
// Android utiliza sqlite_mobile_schema.sql y las migraciones de database/sqlite/.
// Este prototipo conserva el diseño anterior; no es compatible con el contrato v2.
// No importarlo en la app actual ni usarlo como fuente de requisitos.
//
// Misma función que antes: caché de lectura + cola de sincronización
// para operaciones offline. PostgreSQL sigue siendo la única fuente
// de verdad — solo la caché confirmada es reconstruible; las cargas pendientes se deben conservar.
//
// IMPORTANTE (igual que en la versión SQLite):
//   El JWT / refresh token NUNCA se guardan aquí. Usar un mecanismo
//   aparte y más seguro en el navegador (ver nota al final del archivo).
//
// Setup:
//   npm install dexie

import Dexie, { type EntityTable } from "dexie";

// =====================================================================
// Tipos (equivalentes a las tablas local_* de la versión SQLite)
// =====================================================================

export interface LocalPatient {
  id: string; // mismo UUID que patients.id en PostgreSQL
  firstName: string;
  lastName: string;
  clinicId: string; // clínica activa en este contexto de uso
  updatedAt: string; // ISO-8601
}

export interface LocalExam {
  id: string; // mismo UUID que exams.id en PostgreSQL
  patientId: string;
  examTypeCode: string; // LAB, IMAGING, MEDICAL_REPORT, etc.
  examTypeName: string;
  title: string;
  examDate: string; // ISO-8601 (date)
  professionalName?: string;
  currentVersion: number;
  deleted: boolean; // borrado lógico espejado del backend
  updatedAt: string;
}

export interface LocalExamVersion {
  id: string; // mismo UUID que exam_versions.id
  examId: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  remoteAvailable: boolean; // ¿ya existe confirmado en el backend?
  localBlobKey?: string; // referencia a un Blob guardado en localBlobs (ver abajo)
  createdAt: string;
}

// La PWA no tiene "almacenamiento privado de archivos" como una app
// nativa — los archivos pendientes de subir (offline) se guardan como
// Blob directamente en IndexedDB, en su propio store.
export interface LocalBlob {
  key: string; // uuid generado localmente al momento de seleccionar el archivo
  blob: Blob;
  createdAt: string;
}

export type SyncStatus = "PENDING" | "PROCESSING" | "FAILED" | "COMPLETED";

export interface SyncQueueItem {
  id: string;
  operation: string; // ej: 'CREATE_EXAM', 'UPLOAD_VERSION'
  entityType: string; // ej: 'exam', 'exam_version'
  entityId: string;

  payload: string; // JSON serializado con los datos a enviar
  blobKey?: string; // referencia a LocalBlob, si la operación incluye archivo

  status: SyncStatus;
  retryCount: number;
  lastError?: string;

  createdAt: string;
  updatedAt: string;
}

export interface SyncMetadata {
  key: string; // ej: 'last_exam_sync', 'last_patient_sync'
  value: string;
}

// =====================================================================
// Definición de la base Dexie
// =====================================================================

class WellQLocalDB extends Dexie {
  localPatients!: EntityTable<LocalPatient, "id">;
  localExams!: EntityTable<LocalExam, "id">;
  localExamVersions!: EntityTable<LocalExamVersion, "id">;
  localBlobs!: EntityTable<LocalBlob, "key">;
  syncQueue!: EntityTable<SyncQueueItem, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "key">;

  constructor() {
    super("wellq_local_db");

    // Índices: el primer campo listado es siempre la PK.
    // Los demás son los campos por los que se va a filtrar/ordenar,
    // equivalentes a los CREATE INDEX de la versión SQLite.
    this.version(1).stores({
      localPatients: "id, clinicId",
      localExams: "id, patientId, deleted, updatedAt",
      localExamVersions: "id, examId",
      localBlobs: "key",
      syncQueue: "id, status, entityType",
      syncMetadata: "key",
    });
  }
}

export const db = new WellQLocalDB();

// =====================================================================
// Ejemplo de uso (lectura con caché, patrón ya documentado en la
// sección 20 del documento original: "Abrir pantalla → Mostrar caché
// → Consultar API → Actualizar caché → Actualizar UI")
// =====================================================================
//
// async function loadExamsForPatient(patientId: string) {
//   // 1. Mostrar lo que ya hay en caché de inmediato
//   const cached = await db.localExams
//     .where("patientId")
//     .equals(patientId)
//     .and((e) => !e.deleted)
//     .toArray();
//   render(cached);
//
//   // 2. Refrescar contra la API en segundo plano
//   const fresh = await api.get(`/patients/${patientId}/exams`);
//   await db.localExams.bulkPut(fresh);
//   render(fresh);
// }
//
// =====================================================================
// Nota sobre credenciales
// =====================================================================
// En una PWA, el JWT/refresh token NO va en IndexedDB ni en
// localStorage de forma ingenua (ambos son accesibles por JavaScript,
// lo que los expone a XSS). La práctica recomendada es:
//   - access token: en memoria (variable de la app), vive solo
//     mientras la pestaña está abierta;
//   - refresh token: en una cookie httpOnly + Secure + SameSite,
//     gestionada por el backend, nunca legible desde JavaScript.
// Esto reemplaza la recomendación original de "Secure Storage de
// Expo" (sección 19), que ya no aplica fuera de una app nativa.
