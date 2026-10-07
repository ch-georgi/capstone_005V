import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_POLICY, AccessPolicy, PUBLIC_ROUTE } from '../decorators/access';
import { AuthenticatedRequest } from '../types/auth-context';
import { apiError } from '../filters/api-error';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) return true;
    const policy = this.reflector.getAllAndOverride<AccessPolicy>(ACCESS_POLICY, targets);
    const auth = ctx.switchToHttp().getRequest<AuthenticatedRequest>().authContext;
    const allowed = policy && auth && (policy.global ? auth.kind === 'GLOBAL'
      : auth.kind === 'TENANT' && !!policy.roles?.includes(auth.role) && (!policy.write || auth.access === 'READ_WRITE'));
    if (!allowed) throw apiError(403, 'FORBIDDEN', 'No tienes permiso para esta operación.');
    return true;
  }
}
