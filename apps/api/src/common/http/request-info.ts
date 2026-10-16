import { isIP } from 'node:net';
import { Request } from 'express';

export interface RequestInfo { ipAddress?: string; userAgent?: string }

/** Datos de la petición para auditoría. La IP solo se guarda si es válida (columna inet). */
export function requestInfo(req: Request): RequestInfo {
  const userAgent = req.headers['user-agent'];
  return {
    ipAddress: req.ip && isIP(req.ip) ? req.ip : undefined,
    userAgent: typeof userAgent === 'string' && userAgent ? userAgent.slice(0, 512) : undefined,
  };
}
