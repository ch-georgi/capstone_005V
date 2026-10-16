import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { apiError } from '../../common/filters/api-error';
import { isTransient } from '../../common/http/transient-error';
import { RequestInfo } from '../../common/http/request-info';
import { TenantContext } from '../../common/types/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExamDetailDto } from './dto/exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamsService } from './exams.service';

const MAX_ATTEMPTS = 3;
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;
const EDITABLE = ['title', 'examDate', 'examTypeId', 'professionalName', 'notes'] as const;

const parseDate = (value: string): Date | null => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

/** PB-033 (editar) y PB-068 a 070 (eliminación lógica). La lectura vive en ExamsService. */
@Injectable()
export class ExamManagementService {
  private readonly logger = new Logger(ExamManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly exams: ExamsService,
  ) {}

  async update(ctx: TenantContext, examId: string, dto: UpdateExamDto, info: RequestInfo): Promise<ExamDetailDto> {
    if (!EDITABLE.some((key) => dto[key] !== undefined)) {
      throw apiError(400, 'EMPTY_UPDATE', 'Indica al menos un campo para modificar.');
    }
    const date = dto.examDate === undefined ? undefined : parseDate(dto.examDate);
    if (date === null) throw apiError(400, 'INVALID_EXAM_DATE', 'La fecha del examen no es válida.');

    await this.run(() => this.prisma.$transaction(async (tx) => {
      const exam = await this.lockWritable(tx, ctx, examId);
      const data: Prisma.ExamUncheckedUpdateInput = {};
      const changed: string[] = [];
      const set = <K extends keyof Prisma.ExamUncheckedUpdateInput>(key: K, field: string, value: Prisma.ExamUncheckedUpdateInput[K], differs: boolean) => {
        if (differs) { data[key] = value; changed.push(field); }
      };
      if (dto.title !== undefined) set('title', 'title', dto.title.trim(), dto.title.trim() !== exam.title);
      if (date) set('examDate', 'examDate', date, date.getTime() !== exam.examDate.getTime());
      if (dto.professionalName !== undefined) {
        const next = dto.professionalName === null ? null : dto.professionalName.trim();
        set('professionalName', 'professionalName', next, next !== (exam.professionalName ?? null));
      }
      if (dto.notes !== undefined) {
        const next = dto.notes === null ? null : dto.notes.trim();
        set('notes', 'notes', next, next !== (exam.notes ?? null));
      }
      if (dto.examTypeId !== undefined && dto.examTypeId !== exam.examTypeId) {
        const type = await tx.examType.findUnique({ where: { id: dto.examTypeId }, select: { isActive: true } });
        if (!type) throw apiError(404, 'EXAM_TYPE_NOT_FOUND', 'El tipo de examen no existe.');
        if (!type.isActive) throw apiError(409, 'EXAM_TYPE_INACTIVE', 'El tipo de examen está inactivo.');
        set('examTypeId', 'examTypeId', dto.examTypeId, true);
      }
      if (!changed.length) return; // Sin cambios reales: no se escribe, no se audita, no se emite sincronización.
      await tx.exam.update({ where: { id: examId }, data });
      await this.audit.record({
        clinicId: ctx.clinicId, actorId: ctx.actorId, patientId: exam.patientId, examId, action: AuditAction.UPDATE,
        metadata: { changedFields: changed }, ...info,
      }, tx);
    }, TX_OPTIONS));

    return this.exams.get(ctx, examId);
  }

  /** Eliminación lógica: el examen y sus versiones se conservan; la purga definitiva es otro proceso. */
  async remove(ctx: TenantContext, examId: string, info: RequestInfo): Promise<void> {
    await this.run(() => this.prisma.$transaction(async (tx) => {
      const exam = await this.lockWritable(tx, ctx, examId);
      await tx.exam.update({ where: { id: examId }, data: { deletedAt: new Date(), deletedBy: ctx.actorId } });
      await this.audit.record({
        clinicId: ctx.clinicId, actorId: ctx.actorId, patientId: exam.patientId, examId, action: AuditAction.DELETE, ...info,
      }, tx);
    }, TX_OPTIONS));
  }

  /**
   * Orden de bloqueo fijo (clínica → examen), el mismo de las cargas, para no provocar deadlocks.
   * 404 si el examen no existe, está eliminado, es de otra clínica o el actor no puede leerlo;
   * 403 si puede leerlo pero no modificarlo (p. ej. paciente inactivo).
   */
  private async lockWritable(tx: Prisma.TransactionClient, ctx: TenantContext, examId: string) {
    await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${ctx.clinicId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM exams WHERE id = ${examId}::uuid FOR UPDATE`;
    const exam = await tx.exam.findFirst({ where: { id: examId, clinicId: ctx.clinicId, deletedAt: null } });
    const read = exam && (await tx.$queryRaw<{ ok: boolean }[]>`SELECT can_read_patient(${ctx.actorId}::uuid, ${exam.patientId}::uuid) AS ok`)[0]?.ok === true;
    if (!exam || !read) throw apiError(404, 'EXAM_NOT_FOUND', 'El examen no existe.');
    const write = (await tx.$queryRaw<{ ok: boolean }[]>`SELECT can_write_patient(${ctx.actorId}::uuid, ${exam.patientId}::uuid) AS ok`)[0]?.ok === true;
    if (!write) throw apiError(403, 'EXAM_READ_ONLY', 'No tienes permiso para modificar este examen.');
    return exam;
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (!isTransient(error) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(`Reintentando operación sobre examen (intento ${attempt}) por conflicto transitorio.`);
      }
    }
  }
}
