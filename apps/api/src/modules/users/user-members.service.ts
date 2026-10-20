import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma, TenantRole } from '@prisma/client';
import { apiError } from '../../common/filters/api-error';
import { RequestInfo } from '../../common/http/request-info';
import { isTransient } from '../../common/http/transient-error';
import { TenantContext } from '../../common/types/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListMembersQueryDto, MemberDto, MemberPageDto, UpdateMemberDto } from './dto/member.dto';

const memberInclude = {
  user: { select: { email: true, passwordHash: true } },
  patient: { select: { id: true } },
} satisfies Prisma.UserClinicInclude;
type MemberRow = Prisma.UserClinicGetPayload<{ include: typeof memberInclude }>;

const MAX_ATTEMPTS = 3;
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

export const toMember = (row: MemberRow): MemberDto => ({
  id: row.userId, email: row.user.email ?? null, displayName: row.displayName, role: row.role, isActive: row.isActive,
  hasCredentials: !!row.user.passwordHash, patientId: row.patient?.id ?? null,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

/** Gestión de los miembros de la clínica de la sesión (solo CLINIC_ADMIN). Las membresías se desactivan, nunca se eliminan. */
@Injectable()
export class UserMembersService {
  private readonly logger = new Logger(UserMembersService.name);

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(ctx: TenantContext, query: ListMembersQueryDto): Promise<MemberPageDto> {
    const where: Prisma.UserClinicWhereInput = {
      clinicId: ctx.clinicId,
      ...(query.role && { role: query.role }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.q && { OR: [
        { displayName: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
      ] }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.userClinic.count({ where }),
      this.prisma.userClinic.findMany({
        where, include: memberInclude, take: query.limit, skip: query.offset,
        orderBy: [{ displayName: 'asc' }, { userId: 'asc' }],
      }),
    ]);
    return { items: rows.map(toMember), total, limit: query.limit, offset: query.offset };
  }

  async get(ctx: TenantContext, userId: string): Promise<MemberDto> {
    const row = await this.prisma.userClinic.findUnique({
      where: { userId_clinicId: { userId, clinicId: ctx.clinicId } }, include: memberInclude,
    });
    if (!row) throw apiError(404, 'USER_NOT_FOUND', 'El usuario no pertenece a esta clínica.');
    return toMember(row);
  }

  async update(ctx: TenantContext, userId: string, dto: UpdateMemberDto, info: RequestInfo): Promise<MemberDto> {
    if (dto.displayName === undefined && dto.role === undefined && dto.isActive === undefined) {
      throw apiError(400, 'EMPTY_UPDATE', 'Indica al menos un campo para modificar.');
    }
    const self = userId === ctx.actorId;
    if (self && ((dto.role !== undefined) || dto.isActive === false)) {
      // Evita que la clínica se quede sin administrador activo y que alguien se bloquee a sí mismo.
      throw apiError(409, 'SELF_CHANGE_FORBIDDEN', 'No puedes cambiar tu propio rol ni desactivarte.');
    }

    for (let attempt = 1; ; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Orden fijo (clínica → membresías) para no provocar deadlocks.
          await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${ctx.clinicId}::uuid FOR UPDATE`;
          const [actor] = await tx.$queryRaw<{ ok: boolean }[]>`
            SELECT (role = 'CLINIC_ADMIN' AND is_active) AS ok FROM user_clinics
            WHERE user_id = ${ctx.actorId}::uuid AND clinic_id = ${ctx.clinicId}::uuid FOR SHARE`;
          if (!actor?.ok) throw apiError(403, 'FORBIDDEN', 'Se requiere administrador activo de la clínica.');
          await tx.$queryRaw`SELECT user_id FROM user_clinics WHERE user_id = ${userId}::uuid AND clinic_id = ${ctx.clinicId}::uuid FOR UPDATE`;
          const row = await tx.userClinic.findUnique({
            where: { userId_clinicId: { userId, clinicId: ctx.clinicId } }, include: memberInclude,
          });
          if (!row) throw apiError(404, 'USER_NOT_FOUND', 'El usuario no pertenece a esta clínica.');
          if (dto.role !== undefined && dto.role !== row.role && row.role === TenantRole.PATIENT) {
            throw apiError(409, 'PATIENT_ROLE_LOCKED', 'El rol de un paciente no se puede cambiar.');
          }

          const data: Prisma.UserClinicUpdateInput = {};
          const changed: string[] = [];
          const metadata: Record<string, string | string[]> = { entity: 'USER_CLINIC', userId };
          if (dto.displayName !== undefined && dto.displayName !== row.displayName) { data.displayName = dto.displayName; changed.push('displayName'); }
          if (dto.role !== undefined && dto.role !== row.role) {
            data.role = dto.role; changed.push('role'); metadata.roleFrom = row.role; metadata.roleTo = dto.role;
          }
          if (dto.isActive !== undefined && dto.isActive !== row.isActive) { data.isActive = dto.isActive; changed.push('isActive'); }
          if (!changed.length) return; // Sin cambios reales: no se escribe ni se audita.

          await tx.userClinic.update({ where: { userId_clinicId: { userId, clinicId: ctx.clinicId } }, data });
          await this.audit.record({
            clinicId: ctx.clinicId, actorId: ctx.actorId, action: AuditAction.UPDATE, patientId: row.patient?.id,
            metadata: { ...metadata, changedFields: changed }, ...info,
          }, tx);
        }, TX_OPTIONS);
        return this.get(ctx, userId);
      } catch (error) {
        if (!isTransient(error) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(`Reintentando edición de miembro (intento ${attempt}) por conflicto transitorio.`);
      }
    }
  }
}
