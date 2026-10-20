import React, { useEffect, useMemo, useRef } from "react";
import { pdfHtml } from "./html";
export default function PdfView({ base64, onError, onReady }: { base64: string; onError: () => void; onReady?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => pdfHtml(base64), [base64]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.wellqPdf !== true) return;
      if (event.data.error) onError();
      else if (event.data.ready) onReady?.();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onError, onReady]);
  return <iframe ref={frame} title="Visor PDF" sandbox="allow-scripts" srcDoc={html} style={{ width: "100%", height: "100%", border: 0 }} />;
}
