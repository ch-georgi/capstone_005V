import { createHash } from 'node:crypto';

/**
 * JSON canónico del contrato (idéntico a database/contracts/security.ts): claves ordenadas
 * recursivamente, sin espacios, solo valores JSON; los opcionales ausentes se omiten.
 * Debe producir exactamente los mismos bytes que el cliente para que la huella coincida.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonicalJSON(v)).join(',') + '}';
  }
  throw new Error('Canonical input must contain only JSON values; omit absent optional fields');
}

export const requestHash = (value: unknown): string => createHash('sha256').update(canonicalJSON(value)).digest('hex');
