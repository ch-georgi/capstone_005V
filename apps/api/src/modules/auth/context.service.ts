import { Injectable } from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext, SessionClaims } from '../../common/types/auth-context';
import { apiError } from '../../common/filters/api-error';

@Injectable()
export class ContextService {
  constructor(private readonly prisma: PrismaService) {}
  async resolve(session: SessionClaims, db: Prisma.TransactionClient = this.prisma): Promise<AuthContext> {
    const user = await db.user.findUnique({ where: { id: session.sub }, select: { id: true, email: true, passwordHash: true, isSystemAdmin: true, credentialsVersion: true } });
    if (!user?.email || !user.passwordHash) throw apiError(401, 'UNAUTHORIZED', 'Sesión no válida.');
    if ((user.credentialsVersion ?? 0) !== (session.credentialsVersion ?? 0)) throw apiError(401, 'UNAUTHORIZED', 'Las credenciales cambiaron. Inicia sesión nuevamente.');
    if (session.sid) {
      const device = await db.authSession.findUnique({ where: { id: session.sid } });
      if (!device || device.userId !== user.id || device.revokedAt || device.expiresAt <= new Date() || session.context !== 'TENANT' || device.clinicId !== session.clinicId) throw apiError(401, 'UNAUTHORIZED', 'Sesión revocada o vencida.');
    }
    if (session.context === 'GLOBAL') {
      if (!user.isSystemAdmin) throw apiError(403, 'FORBIDDEN', 'Se requiere administrador global.');
      return { kind: 'GLOBAL', actorId: user.id };
    }
    const membership = await db.userClinic.findUnique({
      where: { userId_clinicId: { userId: user.id, clinicId: session.clinicId } },
      include: { clinic: { select: { isActive: true } }, patient: { select: { deletedAt: true } } },
    });
    if (!membership) throw apiError(403, 'TENANT_FORBIDDEN', 'No tienes acceso a esta clínica.');
    if (session.sid && membership.role !== TenantRole.PATIENT) throw apiError(403, 'MOBILE_PATIENT_REQUIRED', 'Utiliza el portal web de tu clínica.');
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
