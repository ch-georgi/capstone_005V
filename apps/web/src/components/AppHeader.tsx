import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SideMenu } from "./SideMenu";
import "./AppHeader.css";

export function AppHeader() {
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        {isAuthenticated ? (
          <button
            type="button"
            className="menu-trigger"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        ) : null}
        <Link to="/" className="brand" aria-label="WellQ, ir al inicio">
          <span className="brand-mark" aria-hidden="true">Q</span>
          <span className="brand-name">WellQ</span>
        </Link>
      </div>
      {isAuthenticated ? <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} /> : null}
    </header>
  );
}
