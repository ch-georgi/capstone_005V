import { Injectable } from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { ContextService } from '../auth/context.service';
import { AuthContext, SessionClaims } from '../../common/types/auth-context';
import { apiError } from '../../common/filters/api-error';
import { CreatedUserDto, CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService,
    private readonly contexts: ContextService) {}

  async create(context: AuthContext, input: CreateUserDto, targetClinicId?: string): Promise<CreatedUserDto> {
    if (context.kind === 'TENANT' && (targetClinicId !== undefined || context.role !== TenantRole.CLINIC_ADMIN || context.access !== 'READ_WRITE')) {
      throw apiError(403, 'FORBIDDEN', 'Se requiere administrador activo de la clínica.');
    }
    const clinicId = context.kind === 'TENANT' ? context.clinicId : targetClinicId;
    if (!clinicId) throw apiError(400, 'CLINIC_REQUIRED', 'Debes indicar la clínica destino.');
    const email = input.email.trim().toLowerCase();
    // Hash outside the transaction: do not hold database locks during expensive hashing.
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.$transaction(async tx => {
        // Clinic first, matching the existing data contract. Recheck activity/permissions
        // while holding locks so deactivation cannot interleave with creation.
        const clinics = await tx.$queryRaw<{ is_active: boolean }[]>`SELECT is_active FROM clinics WHERE id=${clinicId}::uuid FOR UPDATE`;
        if (!clinics.length) throw apiError(404, 'CLINIC_NOT_FOUND', 'La clínica no existe.');
        if (!clinics[0].is_active) throw apiError(403, 'TENANT_INACTIVE', 'La clínica está inactiva.');
        await tx.$queryRaw`SELECT id FROM users WHERE id=${context.actorId}::uuid FOR SHARE`;
        if (context.kind === 'TENANT') {
          await tx.$queryRaw`SELECT user_id FROM user_clinics WHERE user_id=${context.actorId}::uuid AND clinic_id=${clinicId}::uuid FOR UPDATE`;
        }
        const session: SessionClaims = context.kind === 'GLOBAL'
          ? { sub: context.actorId, context: 'GLOBAL' }
          : { sub: context.actorId, context: 'TENANT', clinicId };
        const current = await this.contexts.resolve(session, tx);
        if (current.kind === 'TENANT' && (current.role !== TenantRole.CLINIC_ADMIN || current.access !== 'READ_WRITE')) {
          throw apiError(403, 'FORBIDDEN', 'Se requiere administrador activo de la clínica.');
        }
        const user = await tx.user.create({ data: { email, passwordHash, isSystemAdmin: false }, select: { id: true, email: true, createdAt: true } });
        const membership = await tx.userClinic.create({ data: {
          userId: user.id, clinicId, role: input.role, displayName: input.displayName.trim(), isActive: true,
        } });
        return { id: user.id, email: user.email!, clinicId, displayName: membership.displayName,
          role: membership.role, isActive: membership.isActive, createdAt: user.createdAt.toISOString() };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw apiError(409, 'EMAIL_DUPLICATE', 'El email ya está registrado.');
      }
      throw error;
    }
  }
}
