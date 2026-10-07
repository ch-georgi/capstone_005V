import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ operationId: 'login', summary: 'Iniciar sesión global o clínica', description: 'El JWT queda vinculado a la clínica elegida. Cambiar de clínica requiere otro login. Personal inactivo no obtiene sesión clínica; pacientes con ficha histórica conservan lectura propia, sin escritura. No hay refresh ni logout en esta entrega.' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Datos inválidos o CLINIC_REQUIRED.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'INVALID_CREDENTIALS: email o contraseña incorrectos, incluida cuenta pendiente.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'TENANT_FORBIDDEN o TENANT_INACTIVE: clínica no autorizada o inactiva.' })
  login(@Body() input: LoginDto) { return this.auth.login(input); }
}
