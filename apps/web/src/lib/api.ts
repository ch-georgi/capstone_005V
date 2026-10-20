const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

async function readError(response: Response): Promise<ApiError> {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;
  const code = typeof payload?.code === "string" ? payload.code : "UNKNOWN_ERROR";
  const message = typeof payload?.message === "string" ? payload.message : "Ocurrió un error inesperado.";
  return new ApiError(response.status, code, message);
}

/** Envía multipart/form-data (el navegador fija el boundary) y devuelve JSON. */
export async function apiUpload<T>(path: string, form: FormData, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.");
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

/** Descarga un archivo autenticado como Blob (el token va en el header, nunca en la URL). */
export async function apiBlob(path: string, token: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.");
  }
  if (!response.ok) throw await readError(response);
  return response.blob();
}

/**
 * Wrapper mínimo sobre fetch: agrega el prefijo de la API, serializa el body,
 * adjunta el Bearer token cuando corresponde y normaliza errores al formato
 * {statusCode, code, message} que devuelve la API.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor. Revisa tu conexión.");
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  const isJson = response.headers.get("content-type")?.includes("application/json");
  return (isJson ? await response.json().catch(() => null) : null) as T;
}

export type LoginRequest = { email: string; password: string; clinicId?: string };
export type LoginResponse = { accessToken: string; tokenType: "Bearer"; expiresIn: number };

export function login(input: LoginRequest) {
  return apiRequest<LoginResponse>("/auth/login", { method: "POST", body: input });
}

export type ClinicOption = { clinicId: string; clinicName: string; role: TenantRole };
export type VerifyClinicsResponse = { isSystemAdmin: boolean; clinics: ClinicOption[] };

/** Valida credenciales y devuelve las clínicas elegibles, sin emitir token. */
export function verifyClinics(input: { email: string; password: string }) {
  return apiRequest<VerifyClinicsResponse>("/auth/clinics", { method: "POST", body: input });
}

export type TenantRole = "CLINIC_ADMIN" | "CLINICIAN" | "PATIENT";
export type CreateUserRequest = { email: string; password: string; displayName: string; role: TenantRole };
export type CreatedUser = {
  id: string; email: string; clinicId: string; displayName: string;
  role: TenantRole; isActive: boolean; createdAt: string;
};

export function createUser(input: CreateUserRequest, token: string) {
  return apiRequest<CreatedUser>("/users", { method: "POST", body: input, token });
}

// ---------- Pacientes ----------
export type Patient = {
  id: string; userId: string; clinicId: string; firstName: string; lastName: string;
  dateOfBirth: string; email: string | null; phone: string | null; medicalRecordNumber: string | null;
  createdAt: string; updatedAt: string;
};
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type PatientInput = {
  firstName: string; lastName: string; dateOfBirth: string;
  email?: string | null; phone?: string | null; medicalRecordNumber?: string | null;
};

const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const text = q.toString();
  return text ? `?${text}` : "";
};

export const listPatients = (token: string, p: { search?: string; limit?: number; offset?: number } = {}) =>
  apiRequest<Page<Patient>>(`/patients${qs(p)}`, { token });
export const getPatient = (token: string, id: string) => apiRequest<Patient>(`/patients/${id}`, { token });
export const createPatient = (token: string, input: PatientInput & { userId: string }) =>
  apiRequest<Patient>("/patients", { method: "POST", body: input, token });
export const updatePatient = (token: string, id: string, input: Partial<PatientInput>) =>
  apiRequest<Patient>(`/patients/${id}`, { method: "PATCH", body: input, token });

// ---------- Miembros (cuentas PATIENT sin ficha) ----------
export type Member = { id: string; email: string | null; displayName: string; role: TenantRole; isActive: boolean; patientId: string | null };
export const listMembers = (token: string, p: { role?: TenantRole; isActive?: boolean; q?: string; limit?: number; offset?: number }) =>
  apiRequest<Page<Member>>(`/users${qs({ ...p, isActive: p.isActive === undefined ? undefined : String(p.isActive) })}`, { token });

// ---------- Exámenes ----------
export type ExamType = { id: string; code: string; name: string };
export const listExamTypes = (token: string) => apiRequest<{ items: ExamType[] }>("/exam-types", { token });

export type ExamVersion = {
  id: string; versionNumber: number; originalFilename: string; mimeType: string; sizeBytes: number | string;
  createdAt: string; sha256?: string; uploadedBy?: { id: string; displayName: string | null };
};
export type TimelineExam = {
  id: string; title: string; examDate: string; professionalName: string | null; notes: string | null;
  examType: ExamType; versions: ExamVersion[]; createdAt: string;
};
export type PatientTimeline = { patient: Patient; totalExams: number; timeline: TimelineExam[] };
export const getTimeline = (token: string, patientId: string) =>
  apiRequest<PatientTimeline>(`/patients/${patientId}/timeline`, { token });

export type ExamDetail = {
  id: string; patientId: string; title: string; examDate: string; professionalName: string | null; notes: string | null;
  examType: ExamType; versionCount: number; versions: ExamVersion[];
};
export const getExam = (token: string, examId: string) => apiRequest<ExamDetail>(`/exams/${examId}`, { token });
export const deleteExam = (token: string, examId: string) => apiRequest<void>(`/exams/${examId}`, { method: "DELETE", token });

export type UploadResult = { examId: string; versionId: string; versionNumber: number; replayed: boolean };
export const fileUrlPath = (examId: string, versionId: string, mode: "download" | "view") =>
  `/exams/${examId}/versions/${versionId}/${mode}`;
