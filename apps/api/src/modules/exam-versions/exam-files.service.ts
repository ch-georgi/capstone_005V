import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { apiError } from '../../common/filters/api-error';
import { RequestInfo } from '../../common/http/request-info';
import { TenantContext } from '../../common/types/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { sha256OfBuffer } from '../storage/file-inspection';
import { StorageError, StorageService } from '../storage/storage.service';

export interface FileDelivery { data: Buffer; mimeType: string; filename: string }

@Injectable()
export class ExamFilesService {
  private readonly logger = new Logger(ExamFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Entrega el archivo de una versión y registra VIEW o DOWNLOAD.
   * Orden deliberado: autorizar -> leer y verificar el objeto -> auditar -> responder.
   * Si el archivo no se puede entregar íntegro, no se audita una entrega que no ocurrió.
   */
  async deliver(ctx: TenantContext, examId: string, versionId: string, action: 'VIEW' | 'DOWNLOAD', info: RequestInfo): Promise<FileDelivery> {
    const version = await this.prisma.examVersion.findFirst({
      where: { id: versionId, examId, exam: { clinicId: ctx.clinicId, deletedAt: null } },
      include: { exam: { select: { patientId: true } } },
    });
    // Misma respuesta si no existe, es de otra clínica o está eliminado: no se filtra existencia.
    if (!version) throw apiError(404, 'EXAM_VERSION_NOT_FOUND', 'La versión del examen no existe.');

    const rows = await this.prisma.$queryRaw<{ ok: boolean }[]>`SELECT can_read_patient(${ctx.actorId}::uuid, ${version.exam.patientId}::uuid) AS ok`;
    if (rows[0]?.ok !== true) throw apiError(404, 'EXAM_VERSION_NOT_FOUND', 'La versión del examen no existe.');

    let data: Buffer | null;
    try {
      data = await this.storage.get(version.storageKey);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error.kind === 'UNAVAILABLE'
          ? apiError(503, 'STORAGE_UNAVAILABLE', 'El almacenamiento de documentos no está disponible. Intenta nuevamente.')
          : apiError(502, 'STORAGE_ERROR', 'No se pudo leer el documento desde el almacenamiento.');
      }
      throw error;
    }
    if (!data) {
      this.logger.error(`Objeto ausente para la versión ${version.id} (${version.storageKey}).`);
      throw apiError(502, 'STORAGE_OBJECT_MISSING', 'El documento no está en el almacenamiento. Avisa al administrador.');
    }
    if (BigInt(data.length) !== version.sizeBytes || sha256OfBuffer(data) !== version.sha256) {
      this.logger.error(`Integridad fallida para la versión ${version.id}.`);
      throw apiError(502, 'STORAGE_INTEGRITY_ERROR', 'El documento almacenado no coincide con su registro. Avisa al administrador.');
    }

    await this.audit.record({
      clinicId: ctx.clinicId, actorId: ctx.actorId, patientId: version.exam.patientId, examId, examVersionId: version.id,
      action: action === 'VIEW' ? AuditAction.VIEW : AuditAction.DOWNLOAD,
      metadata: { versionNumber: version.versionNumber }, ...info,
    });
    return { data, mimeType: version.mimeType, filename: version.originalFilename };
  }
}
