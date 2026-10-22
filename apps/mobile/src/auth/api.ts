import { File } from "expo-file-system";
import Constants from "expo-constants";
import { Api, ApiError } from "./types";
import { demoMode } from "./mode";
const configuredUrl = Constants.expoConfig?.extra?.apiUrl;
const base = (
  typeof configuredUrl === "string"
    ? configuredUrl
    : "http://10.0.2.2:3000/api/v1"
).replace(/\/$/, "");
export const api: Api = {
  async upload<T>(request: unknown, uri: string, filename: string, mimeType: string, token: string): Promise<T> {
    if (demoMode) throw new ApiError(400,"DEMO_ONLY","Las cargas requieren conexión real.");
    const form = new FormData();
    form.append("request",JSON.stringify(request));
    // Expo 57 serializes bytes-capable file parts; React Native URI objects are rejected.
    // Pending files use UUID paths, so preserve the verified MIME and original name explicitly.
    const file = new File(uri);
    form.append("file", { name: filename, type: mimeType, bytes: () => file.bytes() } as unknown as Blob);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
    try {
      const response=await fetch(`${base}/exams/uploads`,{method:"POST",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},body:form,signal:controller.signal});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw new ApiError(response.status,result?.code??"UPLOAD_ERROR",typeof result?.message==="string"?result.message:"No se pudo subir el documento.");
      if(!result || typeof result.examId!=="string" || typeof result.versionId!=="string")throw new ApiError(0,"UNCERTAIN_UPLOAD","No pudimos confirmar la carga. Se comprobará con el mismo identificador.");
      return result as T;
    }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(0,"NETWORK_ERROR","Carga sin confirmar. Se reintentará sin duplicarla.");}finally{clearTimeout(timer);}
  },

  async file(path, token) {
    if (demoMode) throw new ApiError(400,"DEMO_ONLY","Los documentos requieren conexión real.");
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),30000);
    try {
      const response = await fetch(`${base}${path}`, { headers: { Authorization:`Bearer ${token}` }, signal:controller.signal });
      if(!response.ok) { const error=await response.json().catch(()=>null); throw new ApiError(response.status,error?.code??"FILE_ERROR",error?.code==="STORAGE_OBJECT_MISSING"?"El archivo no está disponible en el almacenamiento de la clínica. Solicita que lo vuelvan a cargar.":typeof error?.message==="string"?error.message:"No se pudo recuperar el documento."); }
      const size=Number(response.headers.get("content-length")??0);
      if(size>10000000) throw new ApiError(413,"FILE_TOO_LARGE","El documento supera el tamaño permitido.");
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length>10000000) throw new ApiError(413,"FILE_TOO_LARGE","El documento supera el tamaño permitido.");
      return {bytes,mimeType:(response.headers.get("content-type")??"").split(";")[0]};
    } catch(error) { if(error instanceof ApiError) throw error; throw new ApiError(0,"NETWORK_ERROR","No pudimos descargar. Revisa tu conexión."); } finally { clearTimeout(timeout); }
  },
  async request<T>(
    path: string,
    body?: unknown,
    token?: string,
    method?: string,
  ): Promise<T> {
    if (demoMode) throw new ApiError(400, "DEMO_ONLY", "En modo demostración no se realizan solicitudes a la API.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${base}${path}`, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status === 204) return undefined as T;
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new ApiError(
          response.status,
          result?.code ?? "API_ERROR",
          typeof result?.message === "string"
            ? result.message
            : "No pudimos completar la solicitud.",
        );
      return result as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "No pudimos conectar. Revisa tu conexión y vuelve a intentar.",
      );
    } finally {
      clearTimeout(timeout);
    }
  },
};
