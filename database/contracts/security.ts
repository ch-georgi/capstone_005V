import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import type {CursorClaims,UploadEnvelope} from './types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const revision=(x:unknown):x is string=>typeof x==='string' && /^(0|[1-9][0-9]{0,18})$/.test(x) && BigInt(x)<=9223372036854775807n;
export function canonicalJSON(value:unknown):string {
 if(value===null || typeof value==='string' || typeof value==='boolean') return JSON.stringify(value);
 if(typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
 if(Array.isArray(value)) return '['+value.map(canonicalJSON).join(',')+']';
 if(typeof value==='object' && Object.getPrototypeOf(value)===Object.prototype)
  return '{'+Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonicalJSON(v)).join(',')+'}';
 throw new Error('Canonical input must contain only JSON values; omit absent optional fields');
}
export const uploadRequestHash=(request:UploadEnvelope)=>createHash('sha256').update(canonicalJSON(request)).digest('hex');
function claimsValid(c:CursorClaims):boolean {
 return c?.version===1 && uuid.test(c.userId) && uuid.test(c.clinicId) && revision(c.permissionRevision) && BigInt(c.permissionRevision)>0n
 && revision(c.afterRevision) && revision(c.throughRevision) && BigInt(c.afterRevision)<=BigInt(c.throughRevision);
}
function keyValid(secret:Buffer):void {if(secret.length<32) throw new Error('Cursor signing key must contain at least 32 bytes');}
export function signCursor(claims:CursorClaims,secret:Buffer):string {
 keyValid(secret);if(!claimsValid(claims)) throw new Error('Invalid cursor claims');
 const body=Buffer.from(canonicalJSON(claims)).toString('base64url');
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
export function verifyCursor(token:string,secret:Buffer,expected:{userId:string,clinicId:string,permissionRevision:string}):CursorClaims {
 keyValid(secret);const parts=token.split('.');
 if(parts.length!==2 || parts.some(p=>!p || !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Invalid cursor');
 const actual=Buffer.from(parts[1],'base64url'),signature=createHmac('sha256',secret).update(parts[0]).digest();
 if(actual.length!==signature.length || !timingSafeEqual(actual,signature)) throw new Error('Invalid cursor signature');
 const c=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')) as CursorClaims;
 if(!claimsValid(c) || c.userId!==expected.userId || c.clinicId!==expected.clinicId || c.permissionRevision!==expected.permissionRevision) throw new Error('Cursor scope changed; snapshot required');
 return c;
}
