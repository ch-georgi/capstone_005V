import { Api, ApiError, Profile, Session, Storage } from "./types";

// Public mockup credentials. These are never sent to the backend.
export const DEMO_EMAIL = "demo@wellq.app";
export const DEMO_PASSWORD = "WellQDemo123!";
const profile: Profile = {
  patientId: null,
  user: { id: "demo-patient", email: DEMO_EMAIL },
  clinic: { id: "demo-clinic", name: "Clínica WellQ Demo" },
  displayName: "Christopher",
  role: "PATIENT",
  access: "READ_WRITE",
  patientRecordPending: false,
  clinics: [{ id: "demo-clinic", name: "Clínica WellQ Demo", displayName: "Christopher", access: "READ_WRITE", patientRecordPending: false }],
};
export function createDemoStorage(): Storage {
  const values = new Map<string, string>();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async deleteItem(key) { values.delete(key); },
  };
}
export function createDemoApi(): Api {
  let session: Session | null = null;
  function renew(): Session {
    session = {
      accessToken: "demo-access-not-a-jwt",
      refreshToken: "demo-refresh-not-a-real-token",
      tokenType: "Bearer",
      expiresIn: 900,
      sessionExpiresAt: session?.sessionExpiresAt ?? new Date(Date.now() + 30 * 86400000).toISOString(),
      profile: JSON.parse(JSON.stringify(profile)) as Profile,
    };
    return session;
  }
  return {
    async request<T>(path: string, body?: unknown, token?: string, method?: string): Promise<T> {
      const input = body as Record<string, unknown> | undefined;
      if (path === "/auth/mobile/login") {
        if (typeof input?.email !== "string" || input.email.trim().toLowerCase() !== DEMO_EMAIL || input.password !== DEMO_PASSWORD)
          throw new ApiError(401, "INVALID_CREDENTIALS", "Correo o contraseña de demostración incorrectos.");
        return { status: "AUTHENTICATED", session: renew() } as T;
      }
      if (path === "/auth/logout") { session = null; return undefined as T; }
      if (path.startsWith("/auth/password/"))
        throw new ApiError(400, "DEMO_ONLY", "En modo demostración no se envían correos ni se cambian contraseñas. Usa las credenciales de prueba.");
      if (!session) throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión con la cuenta de demostración.");
      if (path === "/auth/refresh" && input?.refreshToken === session.refreshToken) return renew() as T;
      if (path === "/auth/me" && token === session.accessToken) { if(method === "PATCH" && typeof input?.displayName === "string") session.profile.displayName=input.displayName.trim(); return session.profile as T; }
      if(path.startsWith("/exam-types")) return {items:[]} as T;
      throw new ApiError(400, "DEMO_ONLY", "Esta función no está disponible en el mockup.");
    },
  };
}
