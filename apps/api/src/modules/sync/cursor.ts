import { createHmac, timingSafeEqual } from 'node:crypto';
import { apiError } from '../../common/filters/api-error';
export interface CursorClaims { version: 1; userId: string; clinicId: string; permissionRevision: string; afterRevision: string; throughRevision: string }
const revision = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(v) && BigInt(v) <= 9223372036854775807n;
export function signCursor(claims: CursorClaims, secret: string): string {
 const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
export function readCursor(token:string, secret:string, expected:Pick<CursorClaims,'userId'|'clinicId'|'permissionRevision'>):CursorClaims {
 let c:CursorClaims;
 try {
  const parts=token.split('.'); if(parts.length!==2 || parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
  const actual=Buffer.from(parts[1],'base64url'), signature=createHmac('sha256',secret).update(parts[0]).digest();
  if(actual.length!==signature.length || !timingSafeEqual(actual,signature)) throw new Error();
  c=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')) as CursorClaims;
  if(c.version!==1 || typeof c.userId!=='string' || typeof c.clinicId!=='string' || !revision(c.permissionRevision) || !revision(c.afterRevision) || !revision(c.throughRevision) || BigInt(c.afterRevision)>BigInt(c.throughRevision)) throw new Error();
 } catch {throw apiError(400,'INVALID_CURSOR','El cursor no es válido.');}
 if(c.userId!==expected.userId || c.clinicId!==expected.clinicId || c.permissionRevision!==expected.permissionRevision) throw apiError(409,'SYNC_RESET_REQUIRED','Los permisos cambiaron. Actualiza la copia local.');
 return c;
}
