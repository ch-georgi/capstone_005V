import { Controller, Get, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { Request, Response } from 'express';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { contentDisposition } from '../../common/http/content-disposition';
import { requestInfo } from '../../common/http/request-info';
import { TenantContext } from '../../common/types/auth-context';
import { ExamFilesService, FileDelivery } from './exam-files.service';

const ALL_ROLES = [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN, TenantRole.PATIENT];
const uuid = () => new ParseUUIDPipe({ version: '4' });

function send(res: Response, file: FileDelivery, disposition: 'attachment' | 'inline') {
  res.status(200).set({
    'Content-Type': file.mimeType,
    'Content-Length': String(file.data.length),
    'Content-Disposition': contentDisposition(disposition, file.filename),
    'X-Content-Type-Options': 'nosniff',
    // Documentos clínicos: ningún caché compartido ni del navegador.
    'Cache-Control': 'private, no-store',
  }).end(file.data);
}

@ApiTags('Exam files')
@ApiBearerAuth()
@Controller('exams/:examId/versions/:versionId')
export class ExamFilesController {
  constructor(private readonly files: ExamFilesService) {}

  @Get('download')
  @RequireAccess({ roles: ALL_ROLES })
  @ApiOperation({ operationId: 'downloadExamVersion', summary: 'Descargar el archivo de una versión (registra auditoría DOWNLOAD)' })
  @ApiParam({ name: 'examId', format: 'uuid' }) @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({ status: 200, description: 'Archivo como adjunto (Content-Disposition: attachment).' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Versión inexistente, eliminada o sin acceso.' })
  @ApiResponse({ status: 502, type: ApiErrorDto, description: 'Objeto ausente o corrupto en el almacenamiento.' })
  @ApiResponse({ status: 503, type: ApiErrorDto, description: 'Almacenamiento no disponible.' })
  async download(
    @CurrentContext() context: TenantContext,
    @Param('examId', uuid()) examId: string,
    @Param('versionId', uuid()) versionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.files.deliver(context, examId, versionId, 'DOWNLOAD', requestInfo(req)), 'attachment');
  }

  @Get('view')
  @RequireAccess({ roles: ALL_ROLES })
  @ApiOperation({ operationId: 'viewExamVersion', summary: 'Visualizar el archivo de una versión en línea (registra auditoría VIEW)' })
  @ApiParam({ name: 'examId', format: 'uuid' }) @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({ status: 200, description: 'Archivo para mostrar en el navegador (Content-Disposition: inline).' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Versión inexistente, eliminada o sin acceso.' })
  @ApiResponse({ status: 502, type: ApiErrorDto, description: 'Objeto ausente o corrupto en el almacenamiento.' })
  @ApiResponse({ status: 503, type: ApiErrorDto, description: 'Almacenamiento no disponible.' })
  async view(
    @CurrentContext() context: TenantContext,
    @Param('examId', uuid()) examId: string,
    @Param('versionId', uuid()) versionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.files.deliver(context, examId, versionId, 'VIEW', requestInfo(req)), 'inline');
  }
}
