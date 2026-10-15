import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/filters/api-error';
import { TenantContext } from '../../common/types/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { ExamDetailDto, ExamPageDto, ExamSummaryDto, ExamVersionDto, ListExamsQueryDto, PersonRefDto } from './dto/exam.dto';

const examInclude = {
  examType: { select: { id: true, code: true, name: true } },
  _count: { select: { versions: true } },
} satisfies Prisma.ExamInclude;
type ExamRow = Prisma.ExamGetPayload<{ include: typeof examInclude }>;
type VersionRow = Prisma.ExamVersionGetPayload<object>;

const toDate = (value: string): Date | null => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mismo criterio que la descarga: can_read_patient (personal activo de la clínica o el propio paciente). */
  private async canRead(ctx: TenantContext, patientId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ ok: boolean }[]>`SELECT can_read_patient(${ctx.actorId}::uuid, ${patientId}::uuid) AS ok`;
    return rows[0]?.ok === true;
  }

  /** Nombres de presentación en la clínica de la sesión; nunca se exponen correos. */
  private async people(ctx: TenantContext, ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const rows = await this.prisma.userClinic.findMany({
      where: { clinicId: ctx.clinicId, userId: { in: unique } }, select: { userId: true, displayName: true },
    });
    return new Map(rows.map((row) => [row.userId, row.displayName]));
  }

  private ref(names: Map<string, string>, id: string): PersonRefDto {
    return { id, displayName: names.get(id) ?? null };
  }

  private version(row: VersionRow, names: Map<string, string>): ExamVersionDto {
    return {
      id: row.id, versionNumber: row.versionNumber, originalFilename: row.originalFilename, mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes), sha256: row.sha256, uploadedBy: this.ref(names, row.uploadedBy), createdAt: row.createdAt.toISOString(),
    };
  }

  private summary(exam: ExamRow, latest: ExamVersionDto | null): ExamSummaryDto {
    return {
      id: exam.id, patientId: exam.patientId, title: exam.title, examDate: exam.examDate.toISOString().slice(0, 10),
      professionalName: exam.professionalName ?? null, notes: exam.notes ?? null, examType: exam.examType,
      versionCount: exam._count.versions, latestVersion: latest,
      createdAt: exam.createdAt.toISOString(), updatedAt: exam.updatedAt.toISOString(),
    };
  }

  /** PB-031: exámenes no eliminados de un paciente, del más reciente al más antiguo, con su versión vigente. */
  async listForPatient(ctx: TenantContext, patientId: string, query: ListExamsQueryDto): Promise<ExamPageDto> {
    const from = query.from ? toDate(query.from) : undefined;
    const to = query.to ? toDate(query.to) : undefined;
    if (from === null || to === null) throw apiError(400, 'INVALID_DATE_FILTER', 'Las fechas de filtro no son válidas.');
    if (from && to && from > to) throw apiError(400, 'INVALID_DATE_RANGE', '"from" no puede ser posterior a "to".');

    // El paciente debe ser de la clínica de la sesión y legible por el actor. Sin pistas sobre su existencia.
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId }, select: { id: true } });
    if (!patient || !(await this.canRead(ctx, patientId))) throw apiError(404, 'PATIENT_NOT_FOUND', 'El paciente no existe.');

    const where: Prisma.ExamWhereInput = {
      clinicId: ctx.clinicId, patientId, deletedAt: null,
      ...(query.examTypeId && { examTypeId: query.examTypeId }),
      ...((from || to) && { examDate: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    };
    const [total, exams] = await Promise.all([
      this.prisma.exam.count({ where }),
      this.prisma.exam.findMany({
        where, take: query.limit, skip: query.offset,
        orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        include: { ...examInclude, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      }),
    ]);
    const latestRows = exams.map((exam) => exam.versions[0]).filter((row): row is VersionRow => !!row);
    const names = await this.people(ctx, latestRows.map((row) => row.uploadedBy));
    return {
      total, limit: query.limit, offset: query.offset,
      items: exams.map((exam) => this.summary(exam, exam.versions[0] ? this.version(exam.versions[0], names) : null)),
    };
  }

  /** PB-032 y PB-065: detalle del examen con su historial completo de versiones. */
  async get(ctx: TenantContext, examId: string): Promise<ExamDetailDto> {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, clinicId: ctx.clinicId, deletedAt: null },
      include: { ...examInclude, versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!exam || !(await this.canRead(ctx, exam.patientId))) throw apiError(404, 'EXAM_NOT_FOUND', 'El examen no existe.');
    const names = await this.people(ctx, [exam.createdBy, ...exam.versions.map((row) => row.uploadedBy)]);
    const versions = exam.versions.map((row) => this.version(row, names));
    return { ...this.summary(exam, versions[0] ?? null), createdBy: this.ref(names, exam.createdBy), versions };
  }
}
