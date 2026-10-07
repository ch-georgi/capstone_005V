import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { AuthenticatedRequest } from '../types/auth-context';

export const PUBLIC_ROUTE = 'wellq:public';
export const ACCESS_POLICY = 'wellq:access';
export interface AccessPolicy { global?: boolean; roles?: TenantRole[]; write?: boolean }
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const RequireAccess = (policy: AccessPolicy) => SetMetadata(ACCESS_POLICY, policy);
export const CurrentContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().authContext);
