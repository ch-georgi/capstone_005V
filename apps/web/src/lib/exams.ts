import { ApiError, apiUpload, type DocumentVersion, type UploadResult } from "./api";

export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_FILE_BYTES = 10_000_000;

export async function sha256Hex(file: Blob): Promise<string> {
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

export function validClinicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validSignature(bytes: Uint8Array, mime: string) {
  if (mime === "application/pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (mime === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  return mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

export async function verifyDocument(blob: Blob, version: Pick<DocumentVersion, "mimeType" | "sizeBytes" | "sha256">) {
  if (!(ALLOWED_MIME as readonly string[]).includes(blob.type) || blob.type !== version.mimeType ||
    blob.size !== version.sizeBytes || blob.size < 1 || blob.size > MAX_FILE_BYTES) {
    throw new Error("El documento recibido no coincide con su registro.");
  }
  if (!validSignature(new Uint8Array(await blob.arrayBuffer()), blob.type)) throw new Error("El formato del documento no es válido.");
  if (await sha256Hex(blob) !== version.sha256) throw new Error("No se pudo verificar la integridad del documento.");
}

export type PreparedUpload = { file: File; request: {
  operationId: string; clinicId: string; operation: "CREATE_EXAM_WITH_VERSION" | "UPLOAD_VERSION";
  payload: Record<string, unknown>; filename: string; mimeType: string; sizeBytes: number; sha256: string;
} };

export async function prepareUpload(common: Omit<Common, "token">, fields: NewExamFields | { examId: string }): Promise<PreparedUpload> {
  const error = validateFile(common.file);
  if (error) throw new Error(error);
  const bytes = new Uint8Array(await common.file.arrayBuffer());
  if (!validSignature(bytes, common.file.type)) throw new Error("El formato del documento no es válido.");
  const sha256 = await sha256Hex(common.file);
  const isVersion = "examId" in fields;
  const payload = isVersion ? { examId: fields.examId } : {
    examId: crypto.randomUUID(), title: fields.title, examDate: fields.examDate, examTypeId: fields.examTypeId,
    ...(fields.professionalName ? { professionalName: fields.professionalName } : {}),
    ...(fields.notes ? { notes: fields.notes } : {}),
  };
  const request = {
    operationId: crypto.randomUUID(),
    clinicId: common.clinicId,
    operation: isVersion ? "UPLOAD_VERSION" as const : "CREATE_EXAM_WITH_VERSION" as const,
    payload: { schemaVersion: 1, patientId: common.patientId, versionId: crypto.randomUUID(), ...payload },
    filename: common.file.name,
    mimeType: common.file.type,
    sizeBytes: common.file.size,
    sha256,
  };
  return { file: common.file, request };
}

export async function sendPreparedUpload(prepared: PreparedUpload, token: string) {
  const form = new FormData();
  form.append("request", JSON.stringify(prepared.request));
  form.append("file", prepared.file);
  const result = await apiUpload<UploadResult>("/exams/uploads", form, token);
  if (!result || result.examId !== prepared.request.payload.examId || result.versionId !== prepared.request.payload.versionId ||
    !Number.isInteger(result.versionNumber) || result.versionNumber < 1 || typeof result.replayed !== "boolean") {
    throw new ApiError(0, "UNCERTAIN_UPLOAD", "No se pudo confirmar la carga. Reintenta con los mismos datos.");
  }
  return result;
}

export type NewExamFields = { title: string; examDate: string; examTypeId: string; professionalName?: string; notes?: string };

export const uploadNewExam = async (common: Common, fields: NewExamFields) =>
  sendPreparedUpload(await prepareUpload(common, fields), common.token);

export const uploadNewVersion = async (common: Common, examId: string) => sendPreparedUpload(await prepareUpload(common, { examId }), common.token);

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
