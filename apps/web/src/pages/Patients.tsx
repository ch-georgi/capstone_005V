import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { FormBanner } from "../components/ui/FormBanner";
import { listPatients, type Patient } from "../lib/api";
import { formatDate } from "../lib/exams";
import { useAuth } from "../context/AuthContext";
import "./Clinical.css";

const PAGE_SIZE = 20;

export function Patients() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce de la búsqueda para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPatients(token, { search: term, limit: PAGE_SIZE, offset })
      .then((page) => { if (!cancelled) { setItems(page.items); setTotal(page.total); setError(null); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, term, offset]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <main className="container clinical">
      <div className="clinical-head">
        <h1>Pacientes</h1>
        {session?.role === "CLINIC_ADMIN" ? (
          <Link to="/pacientes/nuevo" className="btn btn-primary">Nuevo paciente</Link>
        ) : null}
      </div>
      <Card>
        <label className="sr-only" htmlFor="patient-search">Buscar paciente</label>
        <input
          id="patient-search" className="search-input" type="search" value={search}
          placeholder="Buscar por nombre, apellido o N° de ficha"
          onChange={(e) => setSearch(e.target.value)}
        />
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Paciente</th><th>N° ficha</th><th>Nacimiento</th><th>Contacto</th></tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/pacientes/${p.id}`}>{p.lastName}, {p.firstName}</Link></td>
                  <td>{p.medicalRecordNumber ?? "—"}</td>
                  <td>{formatDate(p.dateOfBirth)}</td>
                  <td>{p.email ?? p.phone ?? "—"}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr><td colSpan={4} className="empty">No se encontraron pacientes.</td></tr>
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
