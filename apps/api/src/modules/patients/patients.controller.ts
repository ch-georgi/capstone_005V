import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { TenantContext } from '../../common/types/auth-context';
import {
  CreatePatientDto,
  ListPatientsQueryDto,
  PatientDto,
  PatientPageDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('Patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN], write: true })
  @ApiOperation({ operationId: 'createPatient', summary: 'Crear ficha de paciente en la clínica' })
  @ApiResponse({ status: 201, type: PatientDto, description: 'Ficha creada.' })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Requiere rol CLINIC_ADMIN.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Cuenta no encontrada en la clínica.' })
  @ApiResponse({ status: 409, type: ApiErrorDto, description: 'Paciente o número de ficha duplicado.' })
  async create(
    @CurrentContext() context: TenantContext,
    @Body() input: CreatePatientDto,
  ): Promise<PatientDto> {
    return this.patientsService.create(context, input);
  }

  @Get()
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN] })
  @ApiOperation({ operationId: 'listPatients', summary: 'Listar pacientes de la clínica' })
  @ApiResponse({ status: 200, type: PatientPageDto, description: 'Página de pacientes.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'No autorizado.' })
  async list(
    @CurrentContext() context: TenantContext,
    @Query() query: ListPatientsQueryDto,
  ): Promise<PatientPageDto> {
    return this.patientsService.list(context, query);
  }

  @Get(':patientId')
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN] })
  @ApiOperation({ operationId: 'getPatient', summary: 'Consultar ficha de paciente' })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiResponse({ status: 200, type: PatientDto, description: 'Ficha encontrada.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'No autorizado.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Paciente no encontrado.' })
  async get(
    @CurrentContext() context: TenantContext,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ): Promise<PatientDto> {
    return this.patientsService.get(context, patientId);
  }

  @Get(':patientId/timeline')
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN] })
  @ApiOperation({ operationId: 'getPatientTimeline', summary: 'Obtener la línea de tiempo clínica de un paciente' })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Línea de tiempo con exámenes y versiones.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'No autorizado.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Paciente no encontrado.' })
  async getTimeline(
    @CurrentContext() context: TenantContext,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ) {
    return this.patientsService.getTimeline(context, patientId);
  }

  @Patch(':patientId')
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN], write: true })
  @ApiOperation({ operationId: 'updatePatient', summary: 'Actualizar parcialmente la ficha' })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiResponse({ status: 200, type: PatientDto, description: 'Ficha actualizada.' })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Requiere rol CLINIC_ADMIN.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Paciente no encontrado.' })
  @ApiResponse({ status: 409, type: ApiErrorDto, description: 'Número de ficha duplicado.' })
  async update(
    @CurrentContext() context: TenantContext,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Body() input: UpdatePatientDto,
  ): Promise<PatientDto> {
    return this.patientsService.update(context, patientId, input);
  }

  @Delete(':patientId')
  @HttpCode(204)
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN], write: true })
  @ApiOperation({ operationId: 'deletePatient', summary: 'Eliminación lógica de ficha' })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Ficha eliminada lógicamente.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Requiere rol CLINIC_ADMIN.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'Paciente no encontrado.' })
  async remove(
    @CurrentContext() context: TenantContext,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ): Promise<void> {
    await this.patientsService.remove(context, patientId);
  }
}