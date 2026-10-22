// Shared wire contracts. HTTP uploads/sync are implemented; the remote S3 purge worker is separate.
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
export interface SyncPerson { id: UUID; displayName: string | null }
export interface SyncPatientPayload {
  id: UUID; userId: UUID; clinicId: UUID; firstName: string; lastName: string;
  dateOfBirth: ClinicalDate; email: string | null; phone: string | null;
  medicalRecordNumber: string | null; isActive: boolean; deletedAt: UTCInstant | null;
  createdAt: UTCInstant; updatedAt: UTCInstant;
}
export interface SyncVersionPayload {
  id: UUID; examId: UUID; versionNumber: number; originalFilename: string;
  mimeType: UploadEnvelope['mimeType']; sizeBytes: number; sha256: string;
  createdAt: UTCInstant; uploadedBy: SyncPerson;
}
export interface SyncExamPayload {
  id: UUID; patientId: UUID; title: string; examDate: ClinicalDate;
  professionalName: string | null; notes: string | null;
  examType: { id: UUID; code: string; name: string }; versionCount: number;
  latestVersion: Omit<SyncVersionPayload, 'examId'> | null; versions: Omit<SyncVersionPayload, 'examId'>[];
  createdBy: SyncPerson; createdAt: UTCInstant; updatedAt: UTCInstant;
}
export interface SyncPayloadByEntity {
  PATIENT: SyncPatientPayload; EXAM: SyncExamPayload; EXAM_VERSION: SyncVersionPayload;
}
export type SyncChange = {
  [E in keyof SyncPayloadByEntity]: {
    revision: DecimalRevision; entity: E; entityId: UUID; patientId: UUID;
  } & ({ action: 'UPSERT'; payload: SyncPayloadByEntity[E] } |
       { action: 'DELETE'; payload: Record<string, never> })
}[keyof SyncPayloadByEntity];
export interface SyncResponse {
  mode: 'SNAPSHOT' | 'DELTA';
  access: AccessState;
  permissionRevision: DecimalRevision;
  changes: SyncChange[];
  nextCursor: string;
  revision: DecimalRevision;
  hasMore: boolean;
}
