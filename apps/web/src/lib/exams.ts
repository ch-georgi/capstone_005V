import { apiUpload, type UploadResult } from "./api";

export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_FILE_BYTES = 10_000_000;

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valida tipo y tamaño en el cliente (la API vuelve a validar). Devuelve un mensaje o null. */
export function validateFile(file: File): string | null {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) return "Solo se permiten archivos PDF, JPEG o PNG.";
  if (file.size < 1) return "El archivo está vacío.";
  if (file.size > MAX_FILE_BYTES) return "El archivo supera el máximo de 10 MB.";
  return null;
}

type Common = { token: string; clinicId: string; patientId: string; file: File };

async function send(common: Common, operation: "CREATE_EXAM_WITH_VERSION" | "UPLOAD_VERSION", payload: Record<string, unknown>) {
  const sha256 = await sha256Hex(common.file);
  const request = {
    operationId: crypto.randomUUID(),
    clinicId: common.clinicId,
    operation,
    payload: { schemaVersion: 1, patientId: common.patientId, versionId: crypto.randomUUID(), ...payload },
    filename: common.file.name,
    mimeType: common.file.type,
    sizeBytes: common.file.size,
    sha256,
  };
  const form = new FormData();
  form.append("request", JSON.stringify(request));
  form.append("file", common.file);
  return apiUpload<UploadResult>("/exams/uploads", form, common.token);
}

export type NewExamFields = { title: string; examDate: string; examTypeId: string; professionalName?: string; notes?: string };

export const uploadNewExam = (common: Common, fields: NewExamFields) =>
  send(common, "CREATE_EXAM_WITH_VERSION", {
    examId: crypto.randomUUID(),
    title: fields.title,
    examDate: fields.examDate,
    examTypeId: fields.examTypeId,
    ...(fields.professionalName ? { professionalName: fields.professionalName } : {}),
    ...(fields.notes ? { notes: fields.notes } : {}),
  });

export const uploadNewVersion = (common: Common, examId: string) => send(common, "UPLOAD_VERSION", { examId });

export function formatBytes(value: number | string): string {
  const n = Number(value);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}
