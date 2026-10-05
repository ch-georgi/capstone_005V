import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE } from '../decorators/access';
import { AuthenticatedRequest } from '../types/auth-context';
import { ContextService } from '../../modules/auth/context.service';
import { apiError } from '../filters/api-error';

@Injectable()
export class ContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly contexts: ContextService) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.session) throw apiError(401, 'UNAUTHORIZED', 'Sesión no válida.');
    req.authContext = await this.contexts.resolve(req.session);
    return true;
  }
}
