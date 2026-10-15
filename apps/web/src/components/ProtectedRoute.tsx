import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Gate de UX, no de seguridad: solo evita mostrar el formulario si no hay
 * sesión. La autorización real (rol CLINIC_ADMIN, clínica correcta) la
 * aplica la API y se refleja como error 403 si corresponde.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
