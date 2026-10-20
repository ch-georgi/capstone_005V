import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentContext, RequireAccess } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { requestInfo } from '../../common/http/request-info';
import { GlobalAdminContext, TenantContext } from '../../common/types/auth-context';
import { CreatedUserDto, CreateUserDto } from './dto/create-user.dto';
import { ListMembersQueryDto, MemberDto, MemberPageDto, UpdateMemberDto } from './dto/member.dto';
import { UserMembersService } from './user-members.service';
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
  constructor(private readonly users: UsersService, private readonly members: UserMembersService) {}
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

  @Get('users')
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN] })
  @ApiOperation({ operationId: 'listClinicMembers', summary: 'Listar los miembros de la clínica del JWT', description: 'Paginado, con filtros por rol, estado y búsqueda por nombre o correo. Solo CLINIC_ADMIN activo de esa clínica.' })
  @ApiResponse({ status: 200, type: MemberPageDto })
  list(@CurrentContext() context: TenantContext, @Query() query: ListMembersQueryDto) {
    return this.members.list(context, query);
  }
  @Get('users/:userId')
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN] })
  @ApiOperation({ operationId: 'getClinicMember', summary: 'Ver un miembro de la clínica del JWT' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, type: MemberDto })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'USER_NOT_FOUND: no existe o pertenece a otra clínica.' })
  getMember(@CurrentContext() context: TenantContext, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string) {
    return this.members.get(context, userId);
  }
  @Patch('users/:userId')
  @RequireAccess({ roles: [TenantRole.CLINIC_ADMIN], write: true })
  @ApiOperation({ operationId: 'updateClinicMember', summary: 'Editar un miembro de la clínica del JWT',
    description: 'Cambia el nombre de presentación, el rol (solo entre CLINIC_ADMIN y CLINICIAN) o el estado activo. Las membresías no se eliminan: se desactivan. '
      + 'No puedes cambiar tu propio rol ni desactivarte (409 SELF_CHANGE_FORBIDDEN) y el rol de un paciente no cambia (409 PATIENT_ROLE_LOCKED). Los cambios reales se auditan como UPDATE.' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, type: MemberDto })
  @ApiResponse({ status: 404, type: ApiErrorDto, description: 'USER_NOT_FOUND: no existe o pertenece a otra clínica.' })
  updateMember(@CurrentContext() context: TenantContext, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() input: UpdateMemberDto, @Req() req: Request) {
    return this.members.update(context, userId, input, requestInfo(req));
  }
}
