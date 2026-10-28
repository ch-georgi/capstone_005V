import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import "./AppHeader.css";

export function AppHeader() {
  const { isAuthenticated, logout } = useAuth();

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
            <Link to="/pacientes">Pacientes</Link>
            <Link to="/profesionales">Profesionales</Link>
            <Link to="/auditoria">Auditoría</Link>
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
