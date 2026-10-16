import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma, UploadOperation } from '@prisma/client';
import { apiError } from '../../common/filters/api-error';
import { requestHash } from '../../common/http/canonical-json';
import { isTransient } from '../../common/http/transient-error';
import { RequestInfo } from '../../common/http/request-info';
import { TenantContext } from '../../common/types/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { detectMime, MAX_FILE_BYTES, sha256OfBuffer } from '../storage/file-inspection';
import { buildStorageKey, StorageError, StorageService } from '../storage/storage.service';
import { UploadResultDto } from './dto/upload-envelope.dto';
import { parseUploadRequest } from './upload-request';

export interface UploadedFilePart { buffer: Buffer; originalname: string; size: number }
export interface UploadOutcome { status: 200 | 201; body: UploadResultDto }
type StoredResult = { examId: string; versionId: string; versionNumber: number };

const MAX_ATTEMPTS = 3;
// Una transacción interactiva incluye la subida a S3 (≤ 10 MB): se amplía el límite por defecto de 5 s.
const TX_OPTIONS = { maxWait: 5_000, timeout: 30_000 } as const;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(ctx: TenantContext, rawRequest: unknown, file: UploadedFilePart | undefined, info: RequestInfo): Promise<UploadOutcome> {
    if (!file?.buffer) throw apiError(400, 'FILE_REQUIRED', 'Falta el archivo en el campo "file".');
    const { envelope, plain } = await parseUploadRequest(rawRequest);

    if (envelope.clinicId !== ctx.clinicId) {
      throw apiError(400, 'CLINIC_MISMATCH', 'La clínica del sobre no coincide con la clínica de la sesión.');
    }
    // El backend no confía en lo declarado: recalcula tamaño, tipo real y hash (PB-037, PB-038, PB-039).
    const data = file.buffer;
    if (data.length < 1 || data.length > MAX_FILE_BYTES) {
      throw apiError(413, 'FILE_TOO_LARGE', `El archivo debe pesar entre 1 y ${MAX_FILE_BYTES} bytes.`);
    }
    const realMime = detectMime(data);
    if (!realMime) throw apiError(415, 'UNSUPPORTED_FILE_TYPE', 'Solo se aceptan archivos PDF, JPEG o PNG.');
    if (realMime !== envelope.mimeType) {
      throw apiError(400, 'MIME_TYPE_MISMATCH', 'El contenido del archivo no corresponde al tipo declarado.');
    }
    if (data.length !== envelope.sizeBytes) throw apiError(400, 'FILE_SIZE_MISMATCH', 'El tamaño declarado no coincide con el archivo recibido.');
    if (sha256OfBuffer(data) !== envelope.sha256) throw apiError(400, 'FILE_HASH_MISMATCH', 'El SHA-256 declarado no coincide con el archivo recibido.');

    const hash = requestHash(plain);
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => this.process(tx, ctx, envelope, data, hash, info), TX_OPTIONS);
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS || !isTransient(error)) throw this.translate(error);
        this.logger.warn(`Reintentando carga ${envelope.operationId} (intento ${attempt}) por conflicto transitorio.`);
      }
    }
  }

  private translate(error: unknown): unknown {
    if (error instanceof StorageError) {
      return error.kind === 'UNAVAILABLE'
        ? apiError(503, 'STORAGE_UNAVAILABLE', 'El almacenamiento de documentos no está disponible. Reintenta con la misma operación.')
        : apiError(502, 'STORAGE_ERROR', 'El almacenamiento de documentos rechazó la operación.');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(409, 'RESOURCE_ID_CONFLICT', 'El identificador del examen o de la versión ya fue utilizado.');
    }
    return error;
  }

  private async canWrite(tx: Prisma.TransactionClient, actorId: string, patientId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ ok: boolean }[]>`SELECT can_write_patient(${actorId}::uuid, ${patientId}::uuid) AS ok`;
    return rows[0]?.ok === true;
  }

  /** Paciente de la clínica de la sesión sobre el que el actor puede escribir; 404 si no (sin revelar existencia). */
  private async assertPatientWritable(tx: Prisma.TransactionClient, ctx: TenantContext, patientId: string): Promise<void> {
    const patient = await tx.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId, deletedAt: null }, select: { id: true } });
    if (!patient || !(await this.canWrite(tx, ctx.actorId, patientId))) {
      throw apiError(404, 'PATIENT_NOT_FOUND', 'El paciente no existe.');
    }
  }

  private async process(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    envelope: Awaited<ReturnType<typeof parseUploadRequest>>['envelope'],
    data: Buffer,
    hash: string,
    info: RequestInfo,
  ): Promise<UploadOutcome> {
    const { operationId, operation, payload } = envelope;
    const operationKey = `${ctx.actorId}:${ctx.clinicId}:${operationId}`;

    // 1. Serializa solicitudes de la MISMA operación (usuario+clínica+operationId) hasta el commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'upload:' + operationKey}, 0))`;

    // 2. Idempotencia: misma huella => resultado guardado; distinta => conflicto.
    const prior = await tx.idempotencyRecord.findUnique({
      where: { userId_clinicId_operationId: { userId: ctx.actorId, clinicId: ctx.clinicId, operationId } },
    });
    if (prior) {
      if (prior.requestHash !== hash) {
        throw apiError(409, 'IDEMPOTENCY_CONFLICT', 'Ya existe una operación con ese identificador y contenido distinto.');
      }
      await this.assertPatientWritable(tx, ctx, payload.patientId); // se revalida la autorización antes de responder
      return { status: 200, body: { ...(prior.response as StoredResult), replayed: true } };
    }

    // 3. Validaciones de negocio ANTES de tocar el almacenamiento (nunca se sobrescribe un objeto ajeno).
    await this.assertPatientWritable(tx, ctx, payload.patientId);
    const storageKey = buildStorageKey({ clinicId: ctx.clinicId, patientId: payload.patientId, examId: payload.examId, versionId: payload.versionId });
    const isCreate = operation === 'CREATE_EXAM_WITH_VERSION';

    if (isCreate) {
      const examType = await tx.examType.findUnique({ where: { id: payload.examTypeId! }, select: { isActive: true } });
      if (!examType) throw apiError(404, 'EXAM_TYPE_NOT_FOUND', 'El tipo de examen no existe.');
      if (!examType.isActive) throw apiError(409, 'EXAM_TYPE_INACTIVE', 'El tipo de examen está inactivo.');
      const examUsed = (await tx.exam.findUnique({ where: { id: payload.examId }, select: { id: true } }))
        ?? (await tx.syncChange.findFirst({ where: { entity: 'EXAM', entityId: payload.examId }, select: { entityId: true } }));
      if (examUsed) throw apiError(409, 'EXAM_ID_CONFLICT', 'El identificador del examen ya fue utilizado.');
    } else {
      const exam = await tx.exam.findFirst({
        where: { id: payload.examId, clinicId: ctx.clinicId, patientId: payload.patientId, deletedAt: null }, select: { id: true },
      });
      if (!exam) throw apiError(404, 'EXAM_NOT_FOUND', 'El examen no existe.');
    }
    const versionUsed = (await tx.examVersion.findFirst({ where: { OR: [{ id: payload.versionId }, { storageKey }] }, select: { id: true } }))
      ?? (await tx.storageDeletionJob.findFirst({ where: { OR: [{ versionId: payload.versionId }, { storageKey }] }, select: { id: true } }))
      ?? (await tx.syncChange.findFirst({ where: { entity: 'EXAM_VERSION', entityId: payload.versionId }, select: { entityId: true } }));
    if (versionUsed) throw apiError(409, 'VERSION_ID_CONFLICT', 'El identificador de la versión ya fue utilizado.');

    // 4. Almacena el objeto bajo la clave UUID. No se sobrescribe jamás: si existe, solo se reutiliza
    //    cuando es byte a byte la misma carga (reintento de una operación interrumpida antes del commit).
    const put = await this.storage.putIfAbsent(storageKey, data, envelope.mimeType);
    const created = put === 'CREATED';
    if (!created) {
      const existing = await this.storage.get(storageKey);
      if (!existing || existing.length !== data.length || sha256OfBuffer(existing) !== envelope.sha256) {
        throw apiError(409, 'STORAGE_KEY_CONFLICT', 'Ya existe en el almacenamiento un objeto distinto para esa versión.');
      }
    }

    try {
      // 5. Publicación: primero la clínica, después el examen (orden fijo para evitar deadlocks).
      await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${ctx.clinicId}::uuid FOR UPDATE`;
      let versionNumber = 1;
      if (isCreate) {
        await tx.exam.create({ data: {
          id: payload.examId, clinicId: ctx.clinicId, patientId: payload.patientId, examTypeId: payload.examTypeId!,
          title: payload.title!.trim(), examDate: new Date(`${payload.examDate}T00:00:00.000Z`),
          professionalName: payload.professionalName?.trim() || null, notes: payload.notes?.trim() || null, createdBy: ctx.actorId,
        } });
      } else {
        await tx.$queryRaw`SELECT id FROM exams WHERE id = ${payload.examId}::uuid FOR UPDATE`;
        const exam = await tx.exam.findFirst({ where: { id: payload.examId, clinicId: ctx.clinicId, deletedAt: null }, select: { id: true } });
        if (!exam) throw apiError(404, 'EXAM_NOT_FOUND', 'El examen no existe.');
        const last = await tx.examVersion.aggregate({ where: { examId: payload.examId }, _max: { versionNumber: true } });
        versionNumber = (last._max.versionNumber ?? 0) + 1;
      }
      await tx.examVersion.create({ data: {
        id: payload.versionId, examId: payload.examId, versionNumber, storageKey, originalFilename: envelope.filename,
        mimeType: envelope.mimeType, sizeBytes: BigInt(data.length), sha256: envelope.sha256, uploadedBy: ctx.actorId,
      } });
      await this.audit.record({
        clinicId: ctx.clinicId, actorId: ctx.actorId, patientId: payload.patientId, examId: payload.examId, examVersionId: payload.versionId,
        action: isCreate ? AuditAction.CREATE : AuditAction.NEW_VERSION,
        metadata: { operationId, operation, versionNumber }, ...info,
      }, tx);
      const result: StoredResult = { examId: payload.examId, versionId: payload.versionId, versionNumber };
      await tx.idempotencyRecord.create({ data: {
        userId: ctx.actorId, clinicId: ctx.clinicId, operationId, operation: UploadOperation[operation], requestHash: hash, response: result,
      } });
      return { status: 201, body: { ...result, replayed: false } };
    } catch (error) {
      // Seguimos bajo el lock de esta operación: nadie más puede estar usando este objeto recién creado.
      if (created) await this.storage.delete(storageKey).catch((cleanup) =>
        this.logger.error(`No se pudo limpiar ${storageKey} tras una carga fallida: ${(cleanup as Error).message}`));
      throw error;
    }
  }
}
