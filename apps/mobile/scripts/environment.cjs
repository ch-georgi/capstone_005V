function productionApiUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Configura WELLQ_PRODUCTION_API_URL con la URL HTTPS de la API desplegada (incluye /api/v1)."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(host) ||
      host.endsWith(".local") || host.endsWith(".example") || host === "example.com" ||
      url.pathname.replace(/\/$/, "") !== "/api/v1") {
    throw new Error("Producción requiere una API HTTPS pública con ruta /api/v1, sin credenciales ni parámetros.");
  }
  return url.toString().replace(/\/$/, "");
}
module.exports = { productionApiUrl };
