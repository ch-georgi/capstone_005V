import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { PUBLIC_ROUTE } from '../decorators/access';
import { AuthenticatedRequest, SessionClaims } from '../types/auth-context';
import { apiError } from '../filters/api-error';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match) throw apiError(401, 'UNAUTHORIZED', 'Se requiere un token Bearer válido.');
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(match[1]);
      if (typeof payload.sub !== 'string' || !isUUID(payload.sub) ||
          typeof payload.exp !== 'number' || typeof payload.iat !== 'number' ||
          !['GLOBAL', 'TENANT'].includes(String(payload.context)) ||
          (payload.context === 'GLOBAL' && payload.clinicId !== undefined) ||
          (payload.context === 'TENANT' && (typeof payload.clinicId !== 'string' || !isUUID(payload.clinicId)))) throw new Error();
      req.session = (payload.context === 'GLOBAL'
        ? { sub: payload.sub, context: 'GLOBAL' }
        : { sub: payload.sub, context: 'TENANT', clinicId: payload.clinicId }) as SessionClaims;
      return true;
    } catch { throw apiError(401, 'UNAUTHORIZED', 'Token inválido o vencido.'); }
  }
}
