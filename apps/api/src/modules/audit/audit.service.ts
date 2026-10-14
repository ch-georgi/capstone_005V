import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAuditDto } from './dto/query-audit.dto';

export interface CreateAuditEntryParams {
  clinicId: string;
  actorId: string;
  action: AuditAction;
  patientId?: string;
  examId?: string;
  examVersionId?: string;
  fileMetadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento de auditoría.
   *
   * Pásale el `tx` de un `$transaction` para que el cambio y su auditoría se confirmen
   * (o se reviertan) juntos. Reglas que la BD (trigger protect_audit) hace cumplir:
   *  - VIEW, DOWNLOAD y NEW_VERSION exigen `examVersionId`. Una consulta a nivel de
   *    paciente (p. ej. la línea de tiempo) NO puede registrarse como VIEW.
   *  - Si envías `examId`, `patientId` debe ser el paciente de ese examen.
   *  - Si envías `examVersionId`, `examId` debe ser el examen de esa versión.
   *  - `fileMetadata` lo completa la BD a partir de la versión: no lo envíes.
   *  - El actor debe tener membresía en la clínica.
   */
  async record(data: CreateAuditEntryParams, client: Pick<Prisma.TransactionClient, 'auditLog'> = this.prisma) {
    return client.auditLog.create({
      data: {
        clinicId: data.clinicId,
        actorId: data.actorId,
        action: data.action,
        patientId: data.patientId,
        examId: data.examId,
        examVersionId: data.examVersionId,
        fileMetadata: data.fileMetadata,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Lista los eventos de auditoría filtrados por la clínica del token.
   */
  async findMany(clinicId: string, query: QueryAuditDto) {
    const where: Prisma.AuditLogWhereInput = {
      clinicId,
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.examId && { examId: query.examId }),
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.action && { action: query.action }),
    };

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          actor: {
            select: {
              id: true,
              email: true,
            },
          },
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              medicalRecordNumber: true,
            },
          },
          exam: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      limit: query.limit,
      offset: query.offset,
      items,
    };
  }
}