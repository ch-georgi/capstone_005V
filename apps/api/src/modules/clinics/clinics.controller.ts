import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { ClinicDto, ClinicListDto, CreateClinicDto } from './dto/clinic.dto';
import { ClinicsService } from './clinics.service';

@ApiTags('Clinics')
@ApiBearerAuth('bearer')
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get()
  @RequireAccess({ global: true })
  @ApiOperation({
    operationId: 'listClinics',
    summary: 'Listar clínicas activas (solo superadmin)',
    description: 'Requiere JWT GLOBAL. Úsalo para poblar el selector al crear un usuario de clínica como superadmin (POST /clinics/:clinicId/users).',
  })
  @ApiResponse({ status: 200, type: ClinicListDto })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'FORBIDDEN: requiere sesión global de superadmin.' })
  list(): Promise<ClinicListDto> {
    return this.clinics.listActive();
  }

  @Post()
  @RequireAccess({ global: true })
  @ApiOperation({
    operationId: 'createClinic',
    summary: 'Crear una clínica (solo superadmin)',
    description: 'Requiere JWT GLOBAL. Queda activa de inmediato; el código interno se genera automáticamente a partir del nombre.',
  })
  @ApiResponse({ status: 201, type: ClinicDto })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'VALIDATION_ERROR: datos inválidos o propiedades adicionales.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'FORBIDDEN: requiere sesión global de superadmin.' })
  create(@Body() input: CreateClinicDto): Promise<ClinicDto> {
    return this.clinics.create(input.name);
  }
}
