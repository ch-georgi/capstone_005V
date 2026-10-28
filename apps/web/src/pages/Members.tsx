import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { FormBanner } from "../components/ui/FormBanner";
import { listMembers, type Member, type TenantRole } from "../lib/api";
import { tenantRoleLabels } from "../lib/validation";
import { useAuth } from "../context/AuthContext";
import "./Clinical.css";

const PAGE_SIZE = 20;
const ROLE_BADGE: Record<TenantRole, string> = {
  CLINIC_ADMIN: "audit-update",
  CLINICIAN: "audit-create",
  PATIENT: "audit-view",
};

export function Members() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [role, setRole] = useState<TenantRole | "">("");
  const [active, setActive] = useState<"" | "true" | "false">("true");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setOffset(0); }, [role, active]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMembers(token, {
      q: term || undefined,
      role: role || undefined,
      isActive: active === "" ? undefined : active === "true",
      limit: PAGE_SIZE,
      offset,
    })
      .then((page) => { if (!cancelled) { setItems(page.items); setTotal(page.total); setError(null); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, term, role, active, offset]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <main className="container clinical">
      <div className="clinical-head">
        <h1>Profesionales</h1>
        <Link to="/crear-usuario" className="btn btn-primary">Nuevo usuario</Link>
      </div>
      <Card>
        <label className="sr-only" htmlFor="member-search">Buscar</label>
        <input
          id="member-search" className="search-input" type="search" value={search}
          placeholder="Buscar por nombre o correo"
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters" style={{ marginBottom: 16 }}>
          <label>
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value as TenantRole | "")}>
              <option value="">Todos</option>
              <option value="CLINIC_ADMIN">{tenantRoleLabels.CLINIC_ADMIN}</option>
              <option value="CLINICIAN">{tenantRoleLabels.CLINICIAN}</option>
              <option value="PATIENT">{tenantRoleLabels.PATIENT}</option>
            </select>
          </label>
          <label>
            Estado
            <select value={active} onChange={(e) => setActive(e.target.value as "" | "true" | "false")}>
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </label>
        </div>
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Cuenta</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td><Link to={`/profesionales/${m.id}`}>{m.displayName}</Link></td>
                  <td>{m.email ?? "—"}</td>
                  <td><span className={`audit-badge ${ROLE_BADGE[m.role]}`}>{tenantRoleLabels[m.role]}</span></td>
                  <td>{m.hasCredentials ? "Activada" : "Pendiente"}</td>
                  <td>{m.isActive ? "Activo" : "Inactivo"}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr><td colSpan={5} className="empty">No se encontraron personas.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{loading ? "Cargando…" : `${from}–${to} de ${total}`}</span>
          <div>
            <button type="button" className="btn btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Anterior</button>
            <button type="button" className="btn btn-ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Siguiente</button>
          </div>
        </div>
      </Card>
    </main>
  );
}
