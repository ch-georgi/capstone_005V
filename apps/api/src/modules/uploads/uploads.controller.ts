import { Body, Controller, HttpCode, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { Request, Response } from 'express';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { requestInfo } from '../../common/http/request-info';
import { TenantContext } from '../../common/types/auth-context';
import { MAX_FILE_BYTES } from '../storage/file-inspection';
import { UploadResultDto } from './dto/upload-envelope.dto';
import { UploadedFilePart, UploadsService } from './uploads.service';

const EXAMPLE_REQUEST = JSON.stringify({
  operationId: '11111111-1111-4111-8111-111111111111',
  clinicId: '<clinicId del token>',
  operation: 'CREATE_EXAM_WITH_VERSION',
  payload: {
    schemaVersion: 1, patientId: '<id del paciente>', examId: '22222222-2222-4222-8222-222222222222',
    versionId: '33333333-3333-4333-8333-333333333333', title: 'Hemograma', examDate: '2026-10-15', examTypeId: '<id del tipo>',
  },
  filename: 'hemograma.pdf', mimeType: 'application/pdf', sizeBytes: 12345, sha256: '<sha-256 del archivo en minúsculas>',
});

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('exams')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('uploads')
  @HttpCode(201)
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN, TenantRole.PATIENT], write: true })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4, fieldSize: 64 * 1024, parts: 6 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['request', 'file'], properties: {
    request: { type: 'string', description: 'UploadEnvelope en JSON (database/contracts/types.ts).', example: EXAMPLE_REQUEST },
    file: { type: 'string', format: 'binary', description: 'PDF, JPEG o PNG de 1 a 10.000.000 bytes.' },
  } } })
  @ApiOperation({
    operationId: 'uploadExam',
    summary: 'Cargar un examen nuevo o una nueva versión (idempotente por operationId)',
    description: 'CREATE_EXAM_WITH_VERSION crea el examen con su versión 1; UPLOAD_VERSION agrega la siguiente versión de un examen existente. '
      + 'Repetir la misma operación con el mismo contenido devuelve 200 con replayed:true; con contenido distinto, 409 IDEMPOTENCY_CONFLICT.',
  })
  @ApiResponse({ status: 201, type: UploadResultDto, description: 'Carga publicada.' })
  @ApiResponse({ status: 200, type: UploadResultDto, description: 'Operación repetida: resultado guardado (replayed:true).' })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Sobre inválido, hash/tamaño/tipo no coinciden con el archivo.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Sesión sin permiso de escritura.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Paciente, examen o tipo de examen inexistente.' })
  @ApiResponse({ status: 409, type: ApiErrorDto, description: 'Conflicto de idempotencia o identificadores ya utilizados.' })
  @ApiResponse({ status: 413, type: ApiErrorDto, description: 'Archivo mayor a 10.000.000 bytes.' })
  @ApiResponse({ status: 415, type: ApiErrorDto, description: 'Tipo de archivo no permitido.' })
  @ApiResponse({ status: 503, type: ApiErrorDto, description: 'Almacenamiento no disponible o sin configurar.' })
  async upload(
    @CurrentContext() context: TenantContext,
    @Body('request') request: unknown,
    @UploadedFile() file: UploadedFilePart | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UploadResultDto> {
    const outcome = await this.uploads.upload(context, request, file, requestInfo(req));
    res.status(outcome.status);
    return outcome.body;
  }
}
