import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"..");
const compile=async (name)=>(await build({entryPoints:[resolve(root,`node_modules/pdfjs-dist/legacy/build/${name}.mjs`)],bundle:true,write:false,format:"esm",platform:"browser",target:"es2022",minify:true,external:["node:*"],logLevel:"warning"})).outputFiles[0].text;
const [main,worker]=await Promise.all([compile("pdf"),compile("pdf.worker")]);
await mkdir(resolve(root,"src/documents"),{recursive:true});
await writeFile(resolve(root,"src/documents/pdf-runtime.generated.ts"),`// Generated from the locked pdfjs-dist dependency.
export const pdfMain=${JSON.stringify(main)};
export const pdfWorker=${JSON.stringify(worker)};
`);
console.log("PDF.js local generado");
