import { useEffect, useState } from "react";
import { Card } from "../components/ui/Card";
import { FormBanner } from "../components/ui/FormBanner";
import { listGlobalMembers, listClinics, type Clinic, type GlobalMember, type TenantRole } from "../lib/api";
import { tenantRoleLabels, tenantRoles } from "../lib/validation";
import { useAuth } from "../context/AuthContext";
import "./Clinical.css";

const PAGE_SIZE = 20;
const ROLE_BADGE: Record<TenantRole, string> = {
  CLINIC_ADMIN: "audit-update",
  CLINICIAN: "audit-create",
  PATIENT: "audit-view",
};

export function GlobalMembers() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [role, setRole] = useState<TenantRole | "">("");
  const [active, setActive] = useState<"" | "true" | "false">("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<GlobalMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listClinics(token).then((page) => setClinics(page.items)).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setOffset(0); }, [role, active, clinicId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listGlobalMembers(token, {
      clinicId: clinicId || undefined,
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
  }, [token, term, role, active, clinicId, offset]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <main className="container clinical">
      <div className="clinical-head">
        <h1>Usuarios de todas las clínicas</h1>
      </div>
      <Card>
        <label className="sr-only" htmlFor="global-member-search">Buscar</label>
        <input
          id="global-member-search" className="search-input" type="search" value={search}
          placeholder="Buscar por nombre o correo"
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters" style={{ marginBottom: 16 }}>
          <label>
            Clínica
            <select value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
              <option value="">Todas</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value as TenantRole | "")}>
              <option value="">Todos</option>
              {tenantRoles.map((r) => <option key={r} value={r}>{tenantRoleLabels[r]}</option>)}
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
              <tr><th>Nombre</th><th>Correo</th><th>Clínica</th><th>Rol</th><th>Cuenta</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={`${m.clinicId}-${m.id}`}>
                  <td>{m.displayName}</td>
                  <td>{m.email ?? "—"}</td>
                  <td>{m.clinicName}</td>
                  <td><span className={`audit-badge ${ROLE_BADGE[m.role]}`}>{tenantRoleLabels[m.role]}</span></td>
                  <td>{m.hasCredentials ? "Activada" : "Pendiente"}</td>
                  <td>{m.isActive ? "Activo" : "Inactivo"}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr><td colSpan={6} className="empty">No se encontraron personas.</td></tr>
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
