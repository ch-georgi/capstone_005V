import { useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useExamResource } from "../lib/useExamResource";
import { formatDate, validClinicalDate } from "../lib/exams";
import type { ExamSummary, ExamType, Page } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormBanner } from "../components/ui/FormBanner";
import { ExamUpload } from "../components/ExamUpload";

export function MyExams() {
  const { session, refreshPatientProfile } = useAuth();
  const profile = session!.patientProfile!;
  const { accessVerified } = useOutletContext<{ accessVerified: boolean }>();
  const token = session!.accessToken;
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const type = params.get("examTypeId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const rawOffset = Number(params.get("offset") ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const filterKey = JSON.stringify([type, from, to]);
  const [previousFilters, setPreviousFilters] = useState(filterKey);
  const [draft, setDraft] = useState({ type, from, to });
  const [filterError, setFilterError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  if (previousFilters !== filterKey) {
    setPreviousFilters(filterKey);
    setDraft({ type, from, to });
    setFilterError("");
  }
  const invalidQuery = (!!from && !validClinicalDate(from)) || (!!to && !validClinicalDate(to)) || (!!from && !!to && from > to);
  const apiParams = new URLSearchParams({ limit: "20", offset: String(offset) });
  if (type) apiParams.set("examTypeId", type);
  if (from) apiParams.set("from", from);
  if (to) apiParams.set("to", to);
  const exams = useExamResource<Page<ExamSummary>>(invalidQuery ? null : `/patients/${profile.patientId}/exams?${apiParams}`, token);
  const catalogue = useExamResource<{ items: ExamType[] }>("/exam-types", token);
  const canWrite = profile.access === "READ_WRITE" && accessVerified;
  const suffix = query ? `?${query}` : "";
  const paginate = (next: number) => { const q = new URLSearchParams(params); q.set("offset", String(next)); setParams(q); };
  return <>
    <div className="clinical-head"><h1>Mis exámenes</h1><div className="row-actions">
      <Button variant="ghost" onClick={() => { exams.reload(); catalogue.reload(); void refreshPatientProfile().catch(() => undefined); }}>Actualizar</Button>
      {canWrite && !uploading ? <Button onClick={() => { setUploading(true); setNotice(""); }}>Subir examen</Button> : null}
    </div></div>
    {notice ? <FormBanner tone="success">{notice}</FormBanner> : null}
    {uploading ? <Card><ExamUpload token={token} clinicId={profile.clinic.id} patientId={profile.patientId!}
      examTypes={catalogue.data?.items ?? []} canWrite={canWrite} onPermissionDenied={refreshPatientProfile}
      onCancel={() => setUploading(false)} onDone={() => { setUploading(false); setNotice("Examen subido correctamente."); exams.reload(); }} /></Card> : null}
    <form className="filters" onSubmit={event => {
      event.preventDefault();
      if ((draft.from && !validClinicalDate(draft.from)) || (draft.to && !validClinicalDate(draft.to))) return setFilterError("Ingresa fechas válidas.");
      if (draft.from && draft.to && draft.from > draft.to) return setFilterError("Desde no puede ser posterior a Hasta.");
      const q = new URLSearchParams();
      if (draft.type) q.set("examTypeId", draft.type);
      if (draft.from) q.set("from", draft.from);
      if (draft.to) q.set("to", draft.to);
      setFilterError(""); setParams(q);
    }}>
      <label>Tipo de examen<select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}>
        <option value="">Todos los tipos</option>
        {type && !catalogue.data?.items.some(item => item.id === type) ? <option value={type}>Tipo seleccionado</option> : null}
        {catalogue.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Desde<input type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>Hasta<input type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
      <Button type="submit" variant="ghost">Aplicar filtros</Button>
      <Button type="button" variant="ghost" onClick={() => { setDraft({ type: "", from: "", to: "" }); setFilterError(""); setParams({}); }}>Limpiar filtros</Button>
    </form>
    {filterError || invalidQuery ? <FormBanner tone="error">{filterError || "Revisa las fechas de los filtros."}</FormBanner> : null}
    {catalogue.error ? <><FormBanner tone="error">No se pudo cargar el catálogo de tipos: {catalogue.error.message}</FormBanner><Button variant="ghost" onClick={catalogue.reload}>Reintentar tipos</Button></> : null}
    {exams.loading ? <p role="status">Cargando exámenes…</p> : null}
    {exams.error ? <><FormBanner tone="error">{exams.error.message}</FormBanner><Button onClick={exams.reload}>Reintentar exámenes</Button></> : null}
    {exams.data ? <>
      {exams.data.items.length === 0 ? <Card><p>No hay exámenes para mostrar{type || from || to ? " con estos filtros" : ""}.</p></Card> : null}
      <ul className="patient-exam-list">{exams.data.items.map(exam => <li key={exam.id}><Card className="exam-card">
        <div className="exam-top"><h2>{exam.title}</h2><span className="version-badge">{exam.examType.name}</span></div>
        <p>{formatDate(exam.examDate)} · {exam.latestVersion ? `Versión ${exam.latestVersion.versionNumber}` : "Sin versión disponible"}</p>
        <Link to={`/mis-examenes/${exam.id}${suffix}`} className="btn btn-ghost">Ver detalle</Link>
      </Card></li>)}</ul>
      <nav className="pager" aria-label="Páginas de exámenes"><span>{exams.data.total} exámenes · Página {Math.floor(offset / 20) + 1}</span>
        <div className="row-actions"><Button variant="ghost" disabled={offset === 0} onClick={() => paginate(Math.max(0, offset - 20))}>Anterior</Button>
          <Button variant="ghost" disabled={offset + 20 >= exams.data.total} onClick={() => paginate(offset + 20)}>Siguiente</Button></div>
      </nav>
    </> : null}
  </>;
}
