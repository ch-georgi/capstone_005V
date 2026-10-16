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

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const code = typeof payload?.code === "string" ? payload.code : "UNKNOWN_ERROR";
    const message = typeof payload?.message === "string" ? payload.message : "Ocurrió un error inesperado.";
    throw new ApiError(response.status, code, message);
  }

  return payload as T;
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
