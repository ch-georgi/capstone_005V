import { TenantRole } from '@prisma/client';
import { Request } from 'express';

export type SessionClaims =
  | { sub: string; context: 'GLOBAL' }
  | { sub: string; context: 'TENANT'; clinicId: string };
export interface GlobalAdminContext { kind: 'GLOBAL'; actorId: string }
export interface TenantContext {
  kind: 'TENANT'; actorId: string; clinicId: string; role: TenantRole;
  access: 'READ_ONLY' | 'READ_WRITE';
}
export type AuthContext = GlobalAdminContext | TenantContext;
export interface AuthenticatedRequest extends Request {
  session?: SessionClaims;
  authContext?: AuthContext;
}
