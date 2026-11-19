import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ApiError, apiBlob, fileUrlPath, type DocumentVersion } from "../lib/api";
import { formatBytes, formatDate, verifyDocument } from "../lib/exams";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { FormBanner } from "./ui/FormBanner";

const PdfDocument = lazy(() => import("./PdfDocument"));
type Viewer = { blob: Blob; url: string; name: string; mime: string };
export function ExamDocuments({ token, examId, examTitle, versions, latestId }: {
  token: string; examId: string; examTitle: string; versions: DocumentVersion[]; latestId?: string;
}) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => { if (viewer) { URL.revokeObjectURL(viewer.url); urls.current.delete(viewer.url); } setViewer(null); };
  useEffect(() => {
    const activeUrls = urls.current, activeTimers = timers.current;
    return () => { request.current?.abort(); activeUrls.forEach(url => URL.revokeObjectURL(url)); activeTimers.forEach(clearTimeout); activeUrls.clear(); };
  }, [token, examId]);
  useEffect(() => { if (viewer) dialog.current?.showModal(); }, [viewer]);
  const open = async (version: DocumentVersion, mode: "view" | "download") => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(""); setBusy(true);
    try {
      const blob = await apiBlob(fileUrlPath(examId, version.id, mode), token, controller.signal);
      await verifyDocument(blob, version);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      if (mode === "view") { setZoom(1); setViewer({ blob, url, name: version.originalFilename, mime: version.mimeType }); }
      else {
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = version.originalFilename; anchor.click();
        const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); timers.current.delete(timer); }, 1000);
        timers.current.add(timer);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof ApiError && failure.status === 404 ? "El archivo no está disponible o ya no tienes acceso."
          : failure instanceof ApiError && failure.status >= 500 ? `No se pudo obtener el documento del almacenamiento. ${failure.message}`
          : failure instanceof Error ? failure.message : "No se pudo abrir el archivo.");
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <>
    {error ? <FormBanner tone="error">{error}</FormBanner> : null}
    {busy ? <p role="status">Obteniendo y verificando documento…</p> : null}
    {!versions.length ? <p>No hay una versión disponible.</p> : null}
    <ul className="patient-exam-list">{versions.map(version => <li key={version.id}><Card className="exam-card">
      <h2>Versión {version.versionNumber} <span className="version-badge">{version.id === latestId ? "Versión vigente" : "Versión anterior"}</span></h2>
      <p>{version.originalFilename}</p><p className="muted">{formatDate(version.createdAt)} · {version.mimeType} · {formatBytes(version.sizeBytes)}</p>
      <p>Responsable: {version.uploadedBy.displayName || "No informado"}</p>
      <div className="row-actions"><Button variant="ghost" disabled={busy} onClick={() => void open(version, "view")}>Ver versión {version.versionNumber}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void open(version, "download")}>Descargar versión {version.versionNumber}</Button></div>
    </Card></li>)}</ul>
    {viewer ? <dialog ref={dialog} className="document-dialog" aria-labelledby="document-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className="viewer-bar"><div><h2 id="document-title">{examTitle}</h2><p>{viewer.name}</p></div><Button variant="ghost" onClick={close}>Cerrar visor</Button></div>
      {viewer.mime === "application/pdf" ? <Suspense fallback={<p role="status">Preparando visor PDF…</p>}><PdfDocument key={viewer.url} blob={viewer.blob} /></Suspense> : <>
        <div className="document-controls"><Button variant="ghost" disabled={zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}>Reducir zoom</Button><span>{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}>Aumentar zoom</Button></div>
        <div className="document-scroll"><img alt={viewer.name} src={viewer.url} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} onError={() => { close(); setError("No se pudo mostrar la imagen. Puede estar dañada."); }} /></div>
      </>}
    </dialog> : null}
  </>;
}
