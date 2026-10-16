import { Injectable } from '@nestjs/common';
import { AuditAction, Patient, Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/types/auth-context';
import { apiError } from '../../common/filters/api-error';
import {
  CreatePatientDto,
  ListPatientsQueryDto,
  PatientDto,
  PatientPageDto,
  PatientTimelineDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { AuditService } from '../audit/audit.service';

function toDto(p: Patient): PatientDto {
  return {
    id: p.id,
    userId: p.userId,
    clinicId: p.clinicId,
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
    email: p.email,
    phone: p.phone,
    medicalRecordNumber: p.medicalRecordNumber,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function parseBirthDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getTime() > Date.now()) {
    throw apiError(400, 'INVALID_BIRTH_DATE', 'La fecha de nacimiento no es válida.');
  }
  return date;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Ficha visible para el personal clínico: de su clínica, no eliminada y con membresía activa. */
  private activeWhere(ctx: TenantContext, id?: string): Prisma.PatientWhereInput {
    return { ...(id ? { id } : {}), clinicId: ctx.clinicId, deletedAt: null, membership: { isActive: true } };
  }

  private duplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = JSON.stringify(error.meta?.target ?? '');
      if (target.includes('medical_record_number') || target.includes('medicalRecordNumber')) {
        throw apiError(409, 'MEDICAL_RECORD_NUMBER_DUPLICATE', 'Ya existe un paciente con ese número de ficha en la clínica.');
      }
      throw apiError(409, 'PATIENT_ALREADY_EXISTS', 'Esa cuenta ya tiene una ficha en la clínica.');
    }
    throw error;
  }

  private async findActive(ctx: TenantContext, id: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({ where: this.activeWhere(ctx, id) });
    if (!patient) throw apiError(404, 'PATIENT_NOT_FOUND', 'El paciente no existe.');
    return patient;
  }

  async create(ctx: TenantContext, input: CreatePatientDto): Promise<PatientDto> {
    const dateOfBirth = parseBirthDate(input.dateOfBirth);
    const account = await this.prisma.userClinic.findUnique({
      where: { userId_clinicId: { userId: input.userId, clinicId: ctx.clinicId } },
      select: { role: true, isActive: true },
    });
    if (!account || account.role !== TenantRole.PATIENT) {
      throw apiError(404, 'PATIENT_ACCOUNT_NOT_FOUND', 'La cuenta no existe en esta clínica con rol de paciente.');
    }
    if (!account.isActive) throw apiError(409, 'PATIENT_ACCOUNT_INACTIVE', 'La cuenta del paciente está inactiva.');

    try {
      // Ficha y auditoría en la misma transacción: si la auditoría falla, la ficha no queda creada.
      const created = await this.prisma.$transaction(async (tx) => {
        const patient = await tx.patient.create({
          data: {
            userId: input.userId,
            clinicId: ctx.clinicId,
            firstName: input.firstName,
            lastName: input.lastName,
            dateOfBirth,
            email: input.email ?? null,
            phone: input.phone ?? null,
            medicalRecordNumber: input.medicalRecordNumber ?? null,
          },
        });
        await this.auditService.record(
          { clinicId: ctx.clinicId, actorId: ctx.actorId, action: AuditAction.CREATE, patientId: patient.id },
          tx,
        );
        return patient;
      });

      return toDto(created);
    } catch (error) {
      return this.duplicate(error);
    }
  }

  async list(ctx: TenantContext, query: ListPatientsQueryDto): Promise<PatientPageDto> {
    const search = query.search?.trim();
    const where: Prisma.PatientWhereInput = {
      ...this.activeWhere(ctx),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    return { items: rows.map(toDto), total, limit: query.limit, offset: query.offset };
  }

  async get(ctx: TenantContext, id: string): Promise<PatientDto> {
    return toDto(await this.findActive(ctx, id));
  }

  async update(ctx: TenantContext, id: string, input: UpdatePatientDto): Promise<PatientDto> {
    const data: Prisma.PatientUpdateInput = {
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      dateOfBirth: input.dateOfBirth !== undefined ? parseBirthDate(input.dateOfBirth) : undefined,
      email: input.email,
      phone: input.phone,
      medicalRecordNumber: input.medicalRecordNumber,
    };
    if (Object.values(data).every((value) => value === undefined)) {
      throw apiError(400, 'EMPTY_UPDATE', 'Debes enviar al menos un campo para actualizar.');
    }
    await this.findActive(ctx, id);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const patient = await tx.patient.update({
          where: { id_clinicId: { id, clinicId: ctx.clinicId } },
          data,
        });
        await this.auditService.record(
          { clinicId: ctx.clinicId, actorId: ctx.actorId, action: AuditAction.UPDATE, patientId: patient.id },
          tx,
        );
        return patient;
      });

      return toDto(updated);
    } catch (error) {
      return this.duplicate(error);
    }
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.findActive(ctx, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id_clinicId: { id, clinicId: ctx.clinicId } },
        data: { deletedAt: new Date(), deletedBy: ctx.actorId },
      });
      await this.auditService.record(
        { clinicId: ctx.clinicId, actorId: ctx.actorId, action: AuditAction.DELETE, patientId: id },
        tx,
      );
    });
  }

  async getTimeline(ctx: TenantContext, patientId: string): Promise<PatientTimelineDto> {
    const patient = await this.findActive(ctx, patientId);

    const exams = await this.prisma.exam.findMany({
      where: {
        patientId: patient.id,
        clinicId: ctx.clinicId,
        deletedAt: null,
      },
      orderBy: [
        { examDate: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        examType: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });

    // Sin auditoría aquí a propósito: la BD exige una versión concreta para VIEW/DOWNLOAD.
    // Esas acciones se registran cuando alguien abre o descarga un archivo (módulo de exámenes).

    return {
      patient: toDto(patient),
      totalExams: exams.length,
      timeline: exams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        examDate: exam.examDate.toISOString().slice(0, 10),
        professionalName: exam.professionalName ?? null,
        notes: exam.notes ?? null,
        examType: exam.examType,
        versions: exam.versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          originalFilename: v.originalFilename,
          mimeType: v.mimeType,
          sizeBytes: v.sizeBytes.toString(),
          createdAt: v.createdAt.toISOString(),
        })),
        createdAt: exam.createdAt.toISOString(),
      })),
    };
  }
}