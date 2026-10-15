import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { ExamTypeListDto } from './dto/exam-type.dto';
import { ExamTypesService } from './exam-types.service';

@ApiTags('Exam types')
@ApiBearerAuth()
@Controller('exam-types')
export class ExamTypesController {
  constructor(private readonly examTypes: ExamTypesService) {}

  @Get()
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN, TenantRole.PATIENT] })
  @ApiOperation({
    operationId: 'listExamTypes',
    summary: 'Listar los tipos de examen activos',
    description: 'Úsalo para poblar el selector de tipo al cargar un examen (`examTypeId` de POST /exams/uploads).',
  })
  @ApiResponse({ status: 200, type: ExamTypeListDto })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Sin sesión de clínica.' })
  list(): Promise<ExamTypeListDto> {
    return this.examTypes.listActive();
  }
}
