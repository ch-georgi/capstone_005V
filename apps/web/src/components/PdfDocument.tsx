import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "./ui/Button";
import { FormBanner } from "./ui/FormBanner";

GlobalWorkerOptions.workerSrc = workerUrl;
export default function PdfDocument({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof getDocument> | undefined;
    void blob.arrayBuffer().then(bytes => {
      if (!active) return;
      task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, enableXfa: false });
      return task.promise.then(pdf => { if (active) setDocument(pdf); });
    }).catch(() => { if (active) { setLoading(false); setError("No se pudo abrir este PDF. Puede estar dañado o protegido."); } });
    return () => { active = false; void task?.destroy(); };
  }, [blob]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width - 24)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    // A cada render le corresponde un canvas distinto: cancelar una página no
    // permite que el trabajo anterior pinte sobre el canvas de la siguiente.
    const target = canvas.current;
    void document.getPage(page).then(async pdfPage => {
      if (!active) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(width / base.width * zoom, Math.sqrt(4_000_000 / (base.width * base.height)), 3);
      const viewport = pdfPage.getViewport({ scale });
      target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
      task = pdfPage.render({ canvas: target, viewport });
      await task.promise;
      pdfPage.cleanup();
      if (active) setLoading(false);
    }).catch(() => { if (active) { setLoading(false); setError("No se pudo mostrar esta página del PDF."); } });
    return () => { active = false; task?.cancel(); };
  }, [document, page, zoom, width]);
  return <>
    <div className="document-controls"><Button variant="ghost" disabled={!document || page <= 1} onClick={() => { setLoading(true); setError(""); setPage(value => value - 1); }}>Página anterior</Button>
      <span>Página {page} / {document?.numPages ?? "…"}</span><Button variant="ghost" disabled={!document || page >= document.numPages} onClick={() => { setLoading(true); setError(""); setPage(value => value + 1); }}>Página siguiente</Button>
      <Button variant="ghost" disabled={zoom <= .5} onClick={() => { setLoading(true); setError(""); setZoom(value => Math.max(.5, value - .25)); }}>Reducir zoom</Button>
      <span>{Math.round(zoom * 100)}%</span><Button variant="ghost" disabled={zoom >= 3} onClick={() => { setLoading(true); setError(""); setZoom(value => Math.min(3, value + .25)); }}>Aumentar zoom</Button>
    </div>
    {loading ? <p role="status">Cargando página…</p> : null}
    {error ? <FormBanner tone="error">{error}</FormBanner> : null}
    <div className="document-scroll" ref={container}><canvas key={`${page}:${zoom}:${width}`} ref={canvas} aria-label={`Página ${page} del documento PDF`} /></div>
  </>;
}
