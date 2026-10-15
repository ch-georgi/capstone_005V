import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { TenantContext } from '../../common/types/auth-context';
import { ExamDetailDto, ExamPageDto, ListExamsQueryDto } from './dto/exam.dto';
import { ExamsService } from './exams.service';

const ALL_ROLES = [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN, TenantRole.PATIENT];
const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Exams')
@ApiBearerAuth()
@Controller()
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

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
}
