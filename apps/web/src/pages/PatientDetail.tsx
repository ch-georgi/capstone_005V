import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { ExamUpload } from "../components/ExamUpload";
import { apiBlob, deleteExam, fileUrlPath, getTimeline, listExamTypes, type ExamType, type ExamVersion, type PatientTimeline, type TimelineExam } from "../lib/api";
import { formatBytes, formatDate } from "../lib/exams";
import { useAuth } from "../context/AuthContext";
import "./Clinical.css";

type Sort = "desc" | "asc";

export function PatientDetail() {
  const { patientId = "" } = useParams();
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const clinicId = session?.clinicId ?? "";
  const [data, setData] = useState<PatientTimeline | null>(null);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"new" | string | null>(null);
  const [openVersions, setOpenVersions] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<Sort>("desc");
  const [viewer, setViewer] = useState<{ url: string; mime: string; name: string } | null>(null);

  const load = useCallback(() => {
    getTimeline(token, patientId).then((d) => { setData(d); setError(null); }).catch((e: Error) => setError(e.message));
  }, [token, patientId]);

  useEffect(() => {
    load();
    listExamTypes(token).then((r) => setExamTypes(r.items)).catch(() => undefined);
  }, [load, token]);

  // Orden cronológico por fecha del examen y filtros por tipo y rango de fechas (PB-045/046/047).
  const exams = useMemo(() => {
    const list = (data?.timeline ?? []).filter((x) =>
      (!typeFilter || x.examType.id === typeFilter) && (!from || x.examDate >= from) && (!to || x.examDate <= to));
    return [...list].sort((a, b) => (sort === "desc" ? b.examDate.localeCompare(a.examDate) : a.examDate.localeCompare(b.examDate)));
  }, [data, typeFilter, from, to, sort]);

  // "Ver" muestra el archivo en un visor dentro de la página: una pestaña nueva
  // perdería la sesión (el token vive solo en memoria) y mandaría al login.
  const closeViewer = useCallback(() => {
    setViewer((v) => { if (v) URL.revokeObjectURL(v.url); return null; });
  }, []);

  const openFile = async (examId: string, v: ExamVersion, mode: "view" | "download") => {
    setError(null);
    try {
      const blob = await apiBlob(fileUrlPath(examId, v.id, mode), token);
      // Se fuerza el tipo declarado por la versión para que el visor lo reconozca.
      const typed = new Blob([blob], { type: v.mimeType });
      const url = URL.createObjectURL(typed);
      if (mode === "view") {
        setViewer({ url, mime: v.mimeType, name: v.originalFilename });
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = v.originalFilename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el archivo.");
    }
  };

  const remove = async (exam: TimelineExam) => {
    if (!window.confirm(`¿Eliminar el examen "${exam.title}"? Quedará registrado en la auditoría.`)) return;
    try {
      await deleteExam(token, exam.id);
      setNotice("Examen eliminado.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  };

  const done = (message: string) => { setUploading(null); setNotice(message); load(); };

  if (!data) {
    return <main className="container clinical">{error ? <FormBanner tone="error">{error}</FormBanner> : <p>Cargando…</p>}</main>;
  }
  const p = data.patient;

  return (
    <main className="container clinical">
      <div className="clinical-head">
        <div>
          <Link to="/pacientes" className="back-link">← Pacientes</Link>
          <h1>{p.firstName} {p.lastName}</h1>
        </div>
        <Link to={`/pacientes/${p.id}/editar`} className="btn btn-ghost">Editar datos</Link>
      </div>

      <Card className="patient-info">
        <dl>
          <div><dt>N° ficha</dt><dd>{p.medicalRecordNumber ?? "—"}</dd></div>
          <div><dt>Nacimiento</dt><dd>{formatDate(p.dateOfBirth)}</dd></div>
          <div><dt>Correo</dt><dd>{p.email ?? "—"}</dd></div>
          <div><dt>Teléfono</dt><dd>{p.phone ?? "—"}</dd></div>
          <div><dt>Exámenes</dt><dd>{data.totalExams}</dd></div>
        </dl>
      </Card>

      {error ? <FormBanner tone="error">{error}</FormBanner> : null}
      {notice ? <FormBanner tone="success">{notice}</FormBanner> : null}

      <div className="clinical-head section-head">
        <h2>Línea de tiempo</h2>
        {uploading !== "new" ? <Button onClick={() => { setUploading("new"); setNotice(null); }}>Subir examen</Button> : null}
      </div>

      {uploading === "new" ? (
        <Card>
          <ExamUpload token={token} clinicId={clinicId} patientId={p.id} examTypes={examTypes}
            onDone={() => done("Examen subido correctamente.")} onCancel={() => setUploading(null)} />
        </Card>
      ) : null}

      <div className="filters">
        <label>Tipo
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Todos</option>
            {examTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Desde <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Orden
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="desc">Más recientes primero</option>
            <option value="asc">Más antiguos primero</option>
          </select>
        </label>
        {(typeFilter || from || to) ? (
          <button type="button" className="link-button" onClick={() => { setTypeFilter(""); setFrom(""); setTo(""); }}>Limpiar filtros</button>
        ) : null}
      </div>

      <ol className="timeline">
        {exams.map((exam) => {
          const latest = exam.versions[0];
          return (
            <li key={exam.id} className="timeline-item">
              <span className="timeline-date">{formatDate(exam.examDate)}</span>
              <Card className="exam-card">
                <div className="exam-top">
                  <div>
                    <h3>{exam.title}</h3>
                    <p className="muted">{exam.examType.name}{exam.professionalName ? ` · ${exam.professionalName}` : ""}</p>
                  </div>
                  <span className="badge">v{latest?.versionNumber ?? 1}</span>
                </div>
                {exam.notes ? <p>{exam.notes}</p> : null}
                {latest ? (
                  <p className="muted file-line">{latest.originalFilename} · {formatBytes(latest.sizeBytes)}</p>
                ) : null}
                <div className="row-actions">
                  {latest ? <Button variant="ghost" onClick={() => openFile(exam.id, latest, "view")}>Ver</Button> : null}
                  {latest ? <Button variant="ghost" onClick={() => openFile(exam.id, latest, "download")}>Descargar</Button> : null}
                  <Button variant="ghost" onClick={() => { setUploading(exam.id); setNotice(null); }}>Nueva versión</Button>
                  {exam.versions.length > 1 ? (
                    <Button variant="ghost" onClick={() => setOpenVersions(openVersions === exam.id ? null : exam.id)}>
                      Historial ({exam.versions.length})
                    </Button>
                  ) : null}
                  <Button variant="danger" onClick={() => remove(exam)}>Eliminar</Button>
                </div>
                {uploading === exam.id ? (
                  <ExamUpload token={token} clinicId={clinicId} patientId={p.id} examTypes={examTypes} examId={exam.id}
                    onDone={() => done("Nueva versión subida.")} onCancel={() => setUploading(null)} />
                ) : null}
                {openVersions === exam.id ? (
                  <ul className="versions">
                    {exam.versions.map((v) => (
                      <li key={v.id}>
                        <span>v{v.versionNumber} · {formatDate(v.createdAt)} · {v.originalFilename} · {formatBytes(v.sizeBytes)}</span>
                        <span>
                          <button type="button" className="link-button" onClick={() => openFile(exam.id, v, "view")}>Ver</button>{" "}
                          <button type="button" className="link-button" onClick={() => openFile(exam.id, v, "download")}>Descargar</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          );
        })}
        {exams.length === 0 ? <li className="empty">No hay exámenes para mostrar.</li> : null}
      </ol>
      {viewer ? (
        <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label={viewer.name} onClick={closeViewer}>
          <div className="viewer" onClick={(e) => e.stopPropagation()}>
            <div className="viewer-bar">
              <span>{viewer.name}</span>
              <button type="button" className="link-button" onClick={closeViewer}>Cerrar</button>
            </div>
            {viewer.mime === "application/pdf"
              ? <iframe title={viewer.name} src={viewer.url} className="viewer-frame" />
              : <img src={viewer.url} alt={viewer.name} className="viewer-img" />}
          </div>
        </div>
      ) : null}
    </main>
  );
}
