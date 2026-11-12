import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import "./SideMenu.css";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

/** Menú lateral (hamburguesa) con todas las opciones de navegación que antes vivían en el navbar. */
export function SideMenu({ isOpen, onClose }: Props) {
  const { logout, session } = useAuth();
  const role = session?.role ?? null;
  // Mismas reglas que exige el backend (RequireAccess en cada controller):
  // así nadie ve un link a algo que de todas formas le devolvería 403.
  const canSeePatients = role === "CLINIC_ADMIN" || role === "CLINICIAN";
  const canSeeAdminTools = role === "CLINIC_ADMIN";
  const isGlobalAdmin = session?.context === "GLOBAL";

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      <div className={`side-menu-backdrop${isOpen ? " open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`side-menu${isOpen ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Menú">
        <div className="side-menu-head">
          <span className="side-menu-title">Menú</span>
          <button type="button" className="side-menu-close" onClick={onClose} aria-label="Cerrar menú">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="side-menu-nav" onClick={onClose}>
          {canSeePatients ? <Link to="/pacientes">Pacientes</Link> : null}
          {canSeeAdminTools ? <Link to="/profesionales">Profesionales</Link> : null}
          {canSeeAdminTools ? <Link to="/auditoria">Auditoría</Link> : null}
          {isGlobalAdmin ? <Link to="/admin/usuarios">Usuarios</Link> : null}
          {isGlobalAdmin ? <Link to="/admin/crear-usuario">Crear usuario</Link> : null}
          {isGlobalAdmin ? <Link to="/admin/crear-clinica">Crear clínica</Link> : null}
        </nav>

        <div className="side-menu-foot">
          <ThemeToggle />
          <button type="button" className="link-button side-menu-logout" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
