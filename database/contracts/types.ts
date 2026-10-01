// Wire contracts only. No routes, authorization middleware or S3 worker exist yet.
export type UUID = string;
export type DecimalRevision = string;
export type UTCInstant = string; // YYYY-MM-DDTHH:mm:ss.sssZ
export type ClinicalDate = string; // YYYY-MM-DD
export type TenantRole = 'CLINIC_ADMIN' | 'CLINICIAN' | 'PATIENT';
export type AccessState = 'READ_WRITE' | 'READ_ONLY' | 'REVOKED';
export interface UploadPayload {
  schemaVersion: 1;
  patientId: UUID;
  examId: UUID;
  versionId: UUID;
  title?: string; // required for CREATE_EXAM_WITH_VERSION
  examDate?: ClinicalDate;
  examTypeId?: UUID;
  professionalName?: string;
  notes?: string;
}
export interface UploadEnvelope {
  operationId: UUID;
  clinicId: UUID;
  operation: 'CREATE_EXAM_WITH_VERSION' | 'UPLOAD_VERSION';
  payload: UploadPayload;
  filename: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number; // bounded by 10_000_000, safe to serialize from PostgreSQL bigint
  sha256: string;
}
export interface CursorClaims {
  version: 1;
  userId: UUID;
  clinicId: UUID;
  permissionRevision: DecimalRevision;
  afterRevision: DecimalRevision;
  throughRevision: DecimalRevision;
}
export interface SyncChange {
  revision: DecimalRevision;
  entity: 'PATIENT' | 'EXAM' | 'EXAM_VERSION';
  entityId: UUID;
  patientId: UUID;
  action: 'UPSERT' | 'DELETE';
  payload: Record<string,unknown>;
}
export interface SyncResponse {
  mode: 'SNAPSHOT' | 'DELTA';
  access: AccessState;
  permissionRevision: DecimalRevision;
  changes: SyncChange[];
  nextCursor: string;
  revision: DecimalRevision;
  hasMore: boolean;
}
