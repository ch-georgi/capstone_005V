import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { FormBanner } from "../components/ui/FormBanner";
import { ApiError, listAudit, listPatients, type AuditAction, type AuditEntry, type Patient } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./Clinical.css";

const PAGE_SIZE = 20;

const ACTIONS: { value: AuditAction; label: string }[] = [
  { value: "CREATE", label: "Creación" },
  { value: "VIEW", label: "Visualización" },
  { value: "DOWNLOAD", label: "Descarga" },
  { value: "NEW_VERSION", label: "Nueva versión" },
  { value: "UPDATE", label: "Edición" },
  { value: "DELETE", label: "Eliminación" },
  { value: "PURGE", label: "Purga" },
];
const LABEL = Object.fromEntries(ACTIONS.map((a) => [a.value, a.label])) as Record<AuditAction, string>;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Panel de auditoría de la clínica (PB-078). La API solo lo permite a CLINIC_ADMIN. */
export function Audit() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [action, setAction] = useState<AuditAction | "">("");
  const [patientId, setPatientId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    listPatients(token, { limit: 100 }).then((p) => setPatients(p.items)).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAudit(token, { action: action || undefined, patientId: patientId || undefined, limit: PAGE_SIZE, offset })
      .then((page) => { if (!cancelled) { setItems(page.items); setTotal(page.total); setError(null); setForbidden(false); } })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, action, patientId, offset]);

  const change = (fn: () => void) => { fn(); setOffset(0); };
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  if (forbidden) {
    return (
      <main className="container clinical">
        <h1>Auditoría</h1>
        <FormBanner tone="error">Solo los administradores de la clínica pueden consultar la auditoría.</FormBanner>
      </main>
    );
  }

  return (
    <main className="container clinical">
      <div className="clinical-head">
        <h1>Auditoría</h1>
        <p className="muted">Registro inmutable de accesos y cambios sobre los exámenes de tu clínica.</p>
      </div>

      <div className="filters">
        <label>Acción
          <select value={action} onChange={(e) => change(() => setAction(e.target.value as AuditAction | ""))}>
            <option value="">Todas</option>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <label>Paciente
          <select value={patientId} onChange={(e) => change(() => setPatientId(e.target.value))}>
            <option value="">Todos</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName}</option>)}
          </select>
        </label>
        {(action || patientId) ? (
          <button type="button" className="link-button" onClick={() => change(() => { setAction(""); setPatientId(""); })}>Limpiar filtros</button>
        ) : null}
      </div>

      <Card>
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Fecha</th><th>Acción</th><th>Usuario</th><th>Paciente</th><th>Examen</th><th>Versión</th><th>IP</th></tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{formatDateTime(a.createdAt)}</td>
                  <td><span className={`audit-badge audit-${a.action.toLowerCase()}`}>{LABEL[a.action] ?? a.action}</span></td>
                  <td>{a.actor.email ?? "—"}</td>
                  <td>{a.patient ? <Link to={`/pacientes/${a.patient.id}`}>{a.patient.lastName}, {a.patient.firstName}</Link> : "—"}</td>
                  <td>{a.exam?.title ?? "—"}</td>
                  <td>{a.fileMetadata?.version_number ? `v${a.fileMetadata.version_number}` : "—"}</td>
                  <td>{a.ipAddress ?? "—"}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? <tr><td colSpan={7} className="empty">No hay registros para estos filtros.</td></tr> : null}
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
