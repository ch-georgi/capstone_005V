/**
 * Contrato de almacenamiento de documentos (PB-034).
 *
 * La API solo depende de esta clase abstracta; el adaptador concreto (S3/MinIO en
 * ejecución, memoria en pruebas) se elige en StorageModule. Las claves de objeto
 * las construye siempre el backend con el formato exigido por la BD:
 *   clinics/{clinicId}/patients/{patientId}/exams/{examId}/versions/{versionId}
 */
export type PutResult = 'CREATED' | 'EXISTS';

export class StorageError extends Error {
  constructor(
    readonly kind: 'UNAVAILABLE' | 'FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export abstract class StorageService {
  /**
   * Guarda el objeto SOLO si la clave no existe (nunca sobrescribe).
   * Devuelve 'EXISTS' cuando ya había un objeto; quien llama decide si es reutilizable.
   */
  abstract putIfAbsent(key: string, body: Buffer, mimeType: string): Promise<PutResult>;

  /** Devuelve el contenido o null si el objeto no existe. */
  abstract get(key: string): Promise<Buffer | null>;

  /** Elimina el objeto; no falla si ya no existe. */
  abstract delete(key: string): Promise<void>;
}

export function buildStorageKey(ids: { clinicId: string; patientId: string; examId: string; versionId: string }): string {
  return `clinics/${ids.clinicId}/patients/${ids.patientId}/exams/${ids.examId}/versions/${ids.versionId}`;
}
