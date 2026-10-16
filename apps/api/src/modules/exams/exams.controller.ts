import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { requestInfo } from '../../common/http/request-info';
import { TenantContext } from '../../common/types/auth-context';
import { ExamDetailDto, ExamPageDto, ListExamsQueryDto } from './dto/exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamManagementService } from './exam-management.service';
import { ExamsService } from './exams.service';

const ALL_ROLES = [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN, TenantRole.PATIENT];
const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Exams')
@ApiBearerAuth()
@Controller()
export class ExamsController {
  constructor(private readonly exams: ExamsService, private readonly management: ExamManagementService) {}

  @Get('patients/:patientId/exams')
  @RequireAccess({ roles: ALL_ROLES })
  @ApiOperation({
    operationId: 'listPatientExams',
    summary: 'Listar los exámenes de un paciente (paginado, con su versión vigente)',
    description: 'No incluye exámenes eliminados. El personal accede a los pacientes activos de su clínica; un paciente, solo a su propia ficha. '
      + 'Consultar un listado no genera auditoría: VIEW y DOWNLOAD se registran al abrir o descargar un archivo.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiResponse({ status: 200, type: ExamPageDto })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Parámetros o fechas inválidos.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Paciente inexistente o sin acceso.' })
  listForPatient(
    @CurrentContext() context: TenantContext,
    @Param('patientId', uuid()) patientId: string,
    @Query() query: ListExamsQueryDto,
  ): Promise<ExamPageDto> {
    return this.exams.listForPatient(context, patientId, query);
  }

  @Get('exams/:examId')
  @RequireAccess({ roles: ALL_ROLES })
  @ApiOperation({
    operationId: 'getExam',
    summary: 'Detalle de un examen con el historial completo de versiones',
    description: 'Cada versión trae sus metadatos; el archivo se obtiene con /download o /view.',
  })
  @ApiParam({ name: 'examId', format: 'uuid' })
  @ApiResponse({ status: 200, type: ExamDetailDto })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Examen inexistente, eliminado o sin acceso.' })
  get(@CurrentContext() context: TenantContext, @Param('examId', uuid()) examId: string): Promise<ExamDetailDto> {
    return this.exams.get(context, examId);
  }

  @Patch('exams/:examId')
  @RequireAccess({ roles: ALL_ROLES, write: true })
  @ApiOperation({
    operationId: 'updateExam',
    summary: 'Editar los datos de un examen',
    description: 'Edición parcial de título, fecha, tipo, profesional y notas; `null` borra profesional o notas. '
      + 'No modifica archivos (para eso se sube una versión nueva) ni al paciente. Un cambio real genera auditoría `UPDATE` '
      + 'con los nombres de los campos modificados; si nada cambia, no se escribe ni se audita. Devuelve el detalle actualizado.',
  })
  @ApiParam({ name: 'examId', format: 'uuid' })
  @ApiResponse({ status: 200, type: ExamDetailDto })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Cuerpo vacío o inválido, fecha imposible.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Sesión de solo lectura o paciente que ya no admite escritura.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Examen o tipo de examen inexistente, eliminado o sin acceso.' })
  @ApiResponse({ status: 409, type: ApiErrorDto, description: 'Tipo de examen inactivo.' })
  update(
    @CurrentContext() context: TenantContext,
    @Param('examId', uuid()) examId: string,
    @Body() body: UpdateExamDto,
    @Req() req: Request,
  ): Promise<ExamDetailDto> {
    return this.management.update(context, examId, body, requestInfo(req));
  }

  @Delete('exams/:examId')
  @HttpCode(204)
  @RequireAccess({ roles: ALL_ROLES, write: true })
  @ApiOperation({
    operationId: 'deleteExam',
    summary: 'Eliminar un examen (borrado lógico)',
    description: 'Marca el examen como eliminado con fecha y actor y registra auditoría `DELETE`. Sus versiones y archivos se conservan '
      + 'hasta una purga definitiva. Desaparece de los listados y su detalle y descargas responden 404.',
  })
  @ApiParam({ name: 'examId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Examen eliminado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Sesión de solo lectura o paciente que ya no admite escritura.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Examen inexistente, ya eliminado o sin acceso.' })
  async remove(@CurrentContext() context: TenantContext, @Param('examId', uuid()) examId: string, @Req() req: Request): Promise<void> {
    await this.management.remove(context, examId, requestInfo(req));
  }
}
