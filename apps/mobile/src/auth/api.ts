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
