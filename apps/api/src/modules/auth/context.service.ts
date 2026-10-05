import { Injectable } from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext, SessionClaims } from '../../common/types/auth-context';
import { apiError } from '../../common/filters/api-error';

@Injectable()
export class ContextService {
  constructor(private readonly prisma: PrismaService) {}
  async resolve(session: SessionClaims, db: Prisma.TransactionClient = this.prisma): Promise<AuthContext> {
    const user = await db.user.findUnique({ where: { id: session.sub }, select: { id: true, email: true, passwordHash: true, isSystemAdmin: true } });
    if (!user?.email || !user.passwordHash) throw apiError(401, 'UNAUTHORIZED', 'Sesión no válida.');
    if (session.context === 'GLOBAL') {
      if (!user.isSystemAdmin) throw apiError(403, 'FORBIDDEN', 'Se requiere administrador global.');
      return { kind: 'GLOBAL', actorId: user.id };
    }
    const membership = await db.userClinic.findUnique({
      where: { userId_clinicId: { userId: user.id, clinicId: session.clinicId } },
      include: { clinic: { select: { isActive: true } }, patient: { select: { deletedAt: true } } },
    });
    if (!membership) throw apiError(403, 'TENANT_FORBIDDEN', 'No tienes acceso a esta clínica.');
    const active = membership.isActive && membership.clinic.isActive;
    const patient = membership.role === TenantRole.PATIENT;
    if (!active && !(patient && membership.patient)) {
      throw apiError(403, 'TENANT_INACTIVE', 'La membresía o la clínica está inactiva.');
    }
    const writable = active && (!patient || !!membership.patient && !membership.patient.deletedAt);
    return {
      kind: 'TENANT', actorId: user.id, clinicId: session.clinicId, role: membership.role,
      access: writable ? 'READ_WRITE' : 'READ_ONLY',
    };
  }
}
