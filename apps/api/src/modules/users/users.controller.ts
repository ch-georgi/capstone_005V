import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { GlobalAdminContext, TenantContext } from '../../common/types/auth-context';
import { CreatedUserDto, CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('bearer')
@ApiResponse({ status: 201, type: CreatedUserDto, description: 'Cuenta y membresía creadas conjuntamente. No crea ficha Patient.' })
@ApiResponse({ status: 400, type: ApiErrorDto, description: 'VALIDATION_ERROR: datos inválidos o propiedades adicionales.' })
@ApiResponse({ status: 401, type: ApiErrorDto, description: 'UNAUTHORIZED: token ausente, inválido o vencido.' })
@ApiResponse({ status: 403, type: ApiErrorDto, description: 'FORBIDDEN, TENANT_FORBIDDEN o TENANT_INACTIVE: contexto, rol o actividad no autorizados.' })
@ApiResponse({ status: 409, type: ApiErrorDto, description: 'EMAIL_DUPLICATE: email global ya registrado, incluso con mayúsculas o espacios.' })
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Post('users')
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN], write: true })
  @ApiOperation({ operationId: 'createTenantUser', summary: 'Crear usuario en la clínica del JWT', description: 'CLINIC_ADMIN activo puede asignar CLINIC_ADMIN, CLINICIAN o PATIENT. No acepta clinicId ni isSystemAdmin en el body. El token global no autoriza esta ruta.' })
  create(@CurrentContext() context: TenantContext, @Body() input: CreateUserDto) {
    return this.users.create(context, input);
  }
  @Post('clinics/:clinicId/users')
  @RequireAccess({ global: true })
  @ApiOperation({ operationId: 'createGlobalAdminUser', summary: 'Crear usuario de clínica como superadmin', description: 'Requiere JWT GLOBAL e isSystemAdmin vigente, sin membresía obligatoria. La clínica destino debe estar activa. No concede acceso a pacientes ni documentos, ni permite crear otros superadmins.' })
  @ApiParam({ name: 'clinicId', type: String, format: 'uuid', description: 'Clínica destino para la operación administrativa global.' })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'CLINIC_NOT_FOUND: clínica destino inexistente.' })
  createAsGlobal(@CurrentContext() context: GlobalAdminContext,
    @Param('clinicId', new ParseUUIDPipe()) clinicId: string, @Body() input: CreateUserDto) {
    return this.users.create(context, input, clinicId);
  }
}
