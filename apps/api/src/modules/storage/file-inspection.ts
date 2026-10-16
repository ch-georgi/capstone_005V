import { createHash } from 'node:crypto';

/** Límite exacto del contrato de datos: 10.000.000 bytes, mínimo 1. */
export const MAX_FILE_BYTES = 10_000_000;
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export const sha256OfBuffer = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Detecta el tipo REAL por firma ("magic bytes"); ignora lo que declare el cliente
 * (PB-037). Devuelve null si no es PDF, JPEG ni PNG.
 */
export function detectMime(data: Buffer): AllowedMime | null {
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  return null;
}
