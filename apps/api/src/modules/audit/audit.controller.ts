import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { TenantContext } from '../../common/types/auth-context';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN] })
  @ApiOperation({ operationId: 'listAuditLogs', summary: 'Consultar registro de auditoría de la clínica' })
  @ApiResponse({ status: 200, description: 'Listado de logs de auditoría.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'No autenticado.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'Requiere rol CLINIC_ADMIN.' })
  async findAll(
    @CurrentContext() context: TenantContext,
    @Query() query: QueryAuditDto,
  ) {
    return this.auditService.findMany(context.clinicId, query);
  }
}