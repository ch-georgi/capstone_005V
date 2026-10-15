/**
 * Cabecera Content-Disposition segura (RFC 6266 / 5987): versión ASCII de respaldo más
 * filename* en UTF-8. Elimina comillas, barras y caracteres de control para impedir
 * inyección de cabeceras.
 */
export function contentDisposition(type: 'attachment' | 'inline', filename: string): string {
  const clean = filename.replace(/[\u0000-\u001f\u007f"\\/]/g, '_').trim() || 'documento';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_').replace(/%/g, '_');
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
