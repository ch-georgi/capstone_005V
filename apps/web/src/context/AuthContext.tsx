import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { getPatientProfile, login as apiLogin, type PatientProfile, type LoginRequest, type TenantRole, type Gender } from "../lib/api";

type SessionContext = "GLOBAL" | "TENANT";

export type LoginProfile = { clinicName?: string; displayName?: string; role?: TenantRole; gender: Gender };

type Session = {
  accessToken: string;
  expiresAt: number;
  context: SessionContext;
  clinicId: string | null;
  clinicName: string | null;
  userId: string | null;
  displayName: string | null;
  role: TenantRole | null;
  gender: Gender;
  patientProfile: PatientProfile | null;
};

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  login: (input: LoginRequest, profile?: LoginProfile) => Promise<void>;
  logout: () => void;
  refreshPatientProfile: () => Promise<PatientProfile | null>;
  setExitWarning: (message: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * El access token se guarda solo en memoria (no localStorage/sessionStorage):
 * minimiza la ventana de robo por XSS a costa de perder la sesión al recargar
 * la página. Dura 15 min y hoy no hay refresh token (PB-018 pendiente), así
 * que ese trade-off es razonable para esta entrega.
 */
function decodeJwtPayload(token: string): { sub?: string; context?: string; clinicId?: string; exp?: number } {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const current = useRef<Session | null>(null);
  const generation = useRef(0);
  const profileRequest = useRef(0);
  const exitWarning = useRef<string | null>(null);
  const setExitWarning = useCallback((message: string | null) => { exitWarning.current = message; }, []);

  const login = useCallback(async (input: LoginRequest, profile?: LoginProfile) => {
    const attempt = ++generation.current;
    const response = await apiLogin(input);
    const claims = decodeJwtPayload(response.accessToken);
    const patientProfile = profile?.role === "PATIENT" ? await getPatientProfile(response.accessToken) : null;
    if (attempt !== generation.current) return;
    const next: Session = {
      accessToken: response.accessToken,
      expiresAt: Date.now() + response.expiresIn * 1000,
      context: claims.context === "GLOBAL" ? "GLOBAL" : "TENANT",
      clinicId: claims.clinicId ?? null,
      clinicName: patientProfile?.clinic.name ?? profile?.clinicName ?? null,
      userId: claims.sub ?? null,
      displayName: patientProfile?.displayName ?? profile?.displayName ?? null,
      role: patientProfile?.role ?? profile?.role ?? null,
      gender: profile?.gender ?? "UNSPECIFIED",
      patientProfile,
    };
    current.current = next;
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    if (exitWarning.current && !window.confirm(exitWarning.current)) return;
    generation.current++;
    profileRequest.current++;
    current.current = null;
    setSession(null);
  }, []);

  const refreshPatientProfile = useCallback(async () => {
    const active = current.current;
    if (active?.role !== "PATIENT") return null;
    const request = ++profileRequest.current;
    const profile = await getPatientProfile(active.accessToken);
    if (current.current?.accessToken !== active.accessToken || request !== profileRequest.current) return null;
    const next = { ...current.current, patientProfile: profile, role: profile.role,
      displayName: profile.displayName, clinicName: profile.clinic.name };
    current.current = next;
    setSession(next);
    return profile;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: session !== null, login, logout, refreshPatientProfile, setExitWarning }),
    [session, login, logout, refreshPatientProfile, setExitWarning],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
