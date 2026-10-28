import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { login as apiLogin, type LoginRequest, type TenantRole } from "../lib/api";

type SessionContext = "GLOBAL" | "TENANT";

export type LoginProfile = { clinicName: string; displayName: string; role: TenantRole };

type Session = {
  accessToken: string;
  expiresAt: number;
  context: SessionContext;
  clinicId: string | null;
  clinicName: string | null;
  userId: string | null;
  displayName: string | null;
  role: TenantRole | null;
};

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  login: (input: LoginRequest, profile?: LoginProfile) => Promise<void>;
  logout: () => void;
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

  const login = useCallback(async (input: LoginRequest, profile?: LoginProfile) => {
    const response = await apiLogin(input);
    const claims = decodeJwtPayload(response.accessToken);
    setSession({
      accessToken: response.accessToken,
      expiresAt: Date.now() + response.expiresIn * 1000,
      context: claims.context === "GLOBAL" ? "GLOBAL" : "TENANT",
      clinicId: claims.clinicId ?? null,
      clinicName: profile?.clinicName ?? null,
      userId: claims.sub ?? null,
      displayName: profile?.displayName ?? null,
      role: profile?.role ?? null,
    });
  }, []);

  const logout = useCallback(() => setSession(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: session !== null, login, logout }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
