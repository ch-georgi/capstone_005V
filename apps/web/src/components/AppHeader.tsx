import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import "./AppHeader.css";

export function AppHeader() {
  const { isAuthenticated, logout, session } = useAuth();
  const role = session?.role ?? null;
  // Mismas reglas que exige el backend (RequireAccess en cada controller):
  // así nadie ve un link a algo que de todas formas le devolvería 403.
  const canSeePatients = role === "CLINIC_ADMIN" || role === "CLINICIAN";
  const canSeeAdminTools = role === "CLINIC_ADMIN";
  const isGlobalAdmin = session?.context === "GLOBAL";

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="brand" aria-label="WellQ, ir al inicio">
          <span className="brand-mark" aria-hidden="true">Q</span>
          <span className="brand-name">WellQ</span>
        </Link>
        <div className="app-header-actions">
        <ThemeToggle />
        {isAuthenticated ? (
          <nav className="app-nav">
            {canSeePatients ? <Link to="/pacientes">Pacientes</Link> : null}
            {canSeeAdminTools ? <Link to="/profesionales">Profesionales</Link> : null}
            {canSeeAdminTools ? <Link to="/auditoria">Auditoría</Link> : null}
            {isGlobalAdmin ? <Link to="/admin/crear-usuario">Crear usuario</Link> : null}
            <button type="button" className="link-button" onClick={logout}>
              Cerrar sesión
            </button>
          </nav>
        ) : null}
        </div>
      </div>
    </header>
  );
}
