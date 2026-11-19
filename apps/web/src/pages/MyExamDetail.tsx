import { useState } from "react";
import { Link, useLocation, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, type ExamDetail, type ExamType } from "../lib/api";
import { useExamResource } from "../lib/useExamResource";
import { formatDate } from "../lib/exams";
import { ExamDocuments } from "../components/ExamDocuments";
import { ExamUpload } from "../components/ExamUpload";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormBanner } from "../components/ui/FormBanner";

export function MyExamDetail({ history = false }: { history?: boolean }) {
  const { examId = "" } = useParams();
  const { search } = useLocation();
  const { session, refreshPatientProfile } = useAuth();
  const profile = session!.patientProfile!;
  const { accessVerified } = useOutletContext<{ accessVerified: boolean }>();
  const token = session!.accessToken;
  const resource = useExamResource<ExamDetail>(`/exams/${examId}`, token);
  const catalogue = useExamResource<{ items: ExamType[] }>(!history ? "/exam-types" : null, token);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const data = resource.data;
  const canWrite = profile.access === "READ_WRITE" && accessVerified;
  return <>
    <Link to={history ? `/mis-examenes/${examId}${search}` : `/mis-examenes${search}`} className="back-link">{history ? "Volver al detalle" : "Volver a mis exámenes"}</Link>
    <div className="clinical-head"><h1>{history ? "Historial de versiones" : "Detalle del examen"}</h1>
      <Button variant="ghost" disabled={uploading} onClick={resource.reload}>Actualizar</Button></div>
    {resource.loading ? <p role="status">Cargando examen…</p> : null}
    {resource.error ? <><FormBanner tone="error">{resource.error instanceof ApiError && resource.error.status === 404 ? "El examen no está disponible o no tienes acceso." : resource.error.message}</FormBanner><Button onClick={resource.reload}>Reintentar examen</Button></> : null}
    {notice ? <FormBanner tone="success">{notice}</FormBanner> : null}
    {data ? <>
      <Card className="exam-card"><h2>{data.title}</h2><p>{data.examType.name} · {formatDate(data.examDate)}</p>
        {!history ? <><p>Profesional: {data.professionalName || "No informado"}</p><p className="exam-notes">{data.notes || "Sin notas adicionales"}</p></> : null}
      </Card>
      {!history && canWrite && !uploading ? <Button onClick={() => { setUploading(true); setNotice(""); }}>Subir nueva versión</Button> : null}
      {uploading ? <Card><ExamUpload token={token} clinicId={profile.clinic.id} patientId={profile.patientId!} examId={data.id}
        examTypes={catalogue.data?.items ?? []} canWrite={canWrite} onPermissionDenied={refreshPatientProfile}
        onCancel={() => setUploading(false)} onDone={() => { setUploading(false); setNotice("Nueva versión subida correctamente."); resource.reload(); }} /></Card> : null}
      <ExamDocuments key={`${data.id}:${history}`} token={token} examId={data.id} examTitle={data.title}
        versions={history ? data.versions : data.latestVersion ? [data.latestVersion] : []} latestId={data.latestVersion?.id} />
      {!history ? <Link className="btn btn-ghost" to={`/mis-examenes/${data.id}/versiones${search}`}>Historial de versiones ({data.versionCount})</Link> : null}
    </> : null}
  </>;
}
