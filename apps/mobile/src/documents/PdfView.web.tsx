import React, { useMemo } from "react";
import { pdfHtml } from "./html";
export default function PdfView({base64}:{base64:string;onError:()=>void;onReady?:()=>void}){const html=useMemo(()=>pdfHtml(base64),[base64]);return <iframe title="Visor PDF" sandbox="allow-scripts" srcDoc={html} style={{width:"100%",height:"100%",border:0}}/>;}
