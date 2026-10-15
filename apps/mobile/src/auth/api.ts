import Constants from "expo-constants";
import { Api, ApiError } from "./types";
const configuredUrl = Constants.expoConfig?.extra?.apiUrl;
const base = (
  typeof configuredUrl === "string"
    ? configuredUrl
    : "http://10.0.2.2:3000/api/v1"
).replace(/\/$/, "");
export const api: Api = {
  async request<T>(
    path: string,
    body?: unknown,
    token?: string,
    method?: string,
  ): Promise<T> {
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
