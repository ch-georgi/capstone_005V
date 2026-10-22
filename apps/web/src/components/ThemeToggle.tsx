import { useState } from "react";
import { currentTheme, setTheme, type Theme } from "../lib/theme";
import "./ThemeToggle.css";

/** Alterna entre modo claro y oscuro. */
export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(currentTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Modo oscuro" : "Modo claro";

  const toggle = () => {
    setTheme(next);
    setLocal(next);
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Cambiar a ${label.toLowerCase()}`} title={label}>
      {next === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
      <span className="theme-toggle-label">{label}</span>
    </button>
  );
}
