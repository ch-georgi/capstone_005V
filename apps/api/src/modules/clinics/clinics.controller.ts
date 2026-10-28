import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { ClinicListDto } from './dto/clinic.dto';
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
}
