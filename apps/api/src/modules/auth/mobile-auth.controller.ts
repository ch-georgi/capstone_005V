import { Body, Controller, Get, HttpCode, Patch, Post, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  getSchemaPath,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { TenantRole } from "@prisma/client";
import { Request } from "express";
import { Public, RequireAccess } from "../../common/decorators/access";
import { AuthenticatedRequest } from "../../common/types/auth-context";
import { ApiErrorDto } from "../../common/filters/api-error";
import { MobileAuthService } from "./mobile-auth.service";
import {
  UpdateMobileProfileDto,
  EmailDto,
  MobileLoginDto,
  TokenDto,
  SelectClinicDto,
  SwitchClinicDto,
  VerifyCodeDto,
  ResetPasswordDto,
} from "./dto/mobile.dto";
import {
  AuthenticatedDto,
  SelectionRequiredDto,
  MobileSessionDto,
  MobileProfileDto,
  RecoveryRequestedDto,
  RecoveryVerifiedDto,
} from "./dto/mobile-response.dto";
@ApiTags("Mobile authentication")
@ApiExtraModels(AuthenticatedDto, SelectionRequiredDto)
@ApiResponse({ status: 400, type: ApiErrorDto })
@ApiResponse({ status: 401, type: ApiErrorDto })
@ApiResponse({ status: 403, type: ApiErrorDto })
@ApiResponse({ status: 429, type: ApiErrorDto })
@Controller("auth")
export class MobileAuthController {
  constructor(private readonly auth: MobileAuthService) {}
  @Public()
  @Post("mobile/login")
  @HttpCode(200)
  @ApiOperation({
    summary: "Acceso Android: paciente y selección de clínica",
    description:
      "AUTHENTICATED con session o CLINIC_SELECTION_REQUIRED con selectionToken y clínicas autorizadas. Desafío de un uso y cinco minutos.",
  })
  @ApiResponse({
    status: 200,
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AuthenticatedDto) },
        { $ref: getSchemaPath(SelectionRequiredDto) },
      ],
    },
  })
  login(@Body() input: MobileLoginDto, @Req() req: Request) {
    return this.auth.login(input.email, input.password, req.ip ?? "unknown");
  }
  @Public()
  @Post("mobile/select-clinic")
  @HttpCode(200)
  @ApiOperation({ summary: "Canjear selección por sesión de 30 días" })
  @ApiResponse({ status: 200, type: MobileSessionDto })
  select(@Body() input: SelectClinicDto) {
    return this.auth.select(input.selectionToken, input.clinicId);
  }
  @Post("mobile/switch-clinic")
  @HttpCode(200)
  @ApiBearerAuth("bearer")
  @RequireAccess({ roles: [TenantRole.PATIENT] })
  @ApiOperation({ summary: "Cambiar clínica y revocar la sesión previa" })
  @ApiResponse({ status: 200, type: MobileSessionDto })
  switchClinic(
    @Body() input: SwitchClinicDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.auth.switchClinic(req.session!, input.clinicId);
  }
  @Get("me")
  @ApiBearerAuth("bearer")
  @RequireAccess({ roles: [TenantRole.PATIENT] })
  @ApiOperation({
    summary: "Perfil vigente de sesión móvil y clínicas autorizadas",
  })
  @ApiResponse({ status: 200, type: MobileProfileDto })
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(req.session!);
  }
  @Patch("me")
  @ApiBearerAuth("bearer")
  @RequireAccess({ roles: [TenantRole.PATIENT] })
  @ApiOperation({ summary: "Editar el nombre propio en la clínica actual" })
  @ApiResponse({ status: 200, type: MobileProfileDto })
  updateProfile(@Body() input: UpdateMobileProfileDto, @Req() req: AuthenticatedRequest) {
    return this.auth.updateProfile(req.session!, input.displayName);
  }
  @Public()
  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({
    summary: "Rotar refresh token sin extender los 30 días",
    description:
      "La reutilización de un token consumido revoca toda su sesión.",
  })
  @ApiResponse({ status: 200, type: MobileSessionDto })
  refresh(@Body() input: TokenDto) {
    return this.auth.refresh(input.refreshToken);
  }
  @Public()
  @Post("logout")
  @HttpCode(204)
  @ApiOperation({
    summary: "Revocar sesión mediante refresh token, incluso con JWT vencido",
  })
  logout(@Body() input: TokenDto) {
    return this.auth.logout(input.refreshToken);
  }
  @Public()
  @Post("password/forgot")
  @HttpCode(202)
  @ApiOperation({
    summary:
      "Solicitar código de recuperación sin revelar existencia de cuenta",
  })
  @ApiResponse({ status: 202, type: RecoveryRequestedDto })
  forgot(@Body() input: EmailDto, @Req() req: Request) {
    return this.auth.forgot(input.email, req.ip ?? "unknown");
  }
  @Public()
  @Post("password/verify")
  @HttpCode(200)
  @ApiOperation({
    summary: "Verificar código de seis dígitos; máximo cinco intentos",
  })
  @ApiResponse({ status: 200, type: RecoveryVerifiedDto })
  verify(@Body() input: VerifyCodeDto, @Req() req: Request) {
    return this.auth.verifyCode(
      input.challengeId,
      input.code,
      req.ip ?? "unknown",
    );
  }
  @Public()
  @Post("password/reset")
  @HttpCode(204)
  @ApiOperation({ summary: "Cambiar contraseña y revocar todas las sesiones" })
  reset(@Body() input: ResetPasswordDto, @Req() req: Request) {
    return this.auth.reset(
      input.resetToken,
      input.password,
      req.ip ?? "unknown",
    );
  }
}
