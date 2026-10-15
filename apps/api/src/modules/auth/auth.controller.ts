import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/access';
import { ApiErrorDto } from '../../common/filters/api-error';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { VerifyClinicsDto, VerifyClinicsResponseDto } from './dto/verify-clinics.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ operationId: 'login', summary: 'Iniciar sesión global o clínica', description: 'El JWT queda vinculado a la clínica elegida. Cambiar de clínica requiere otro login. Personal inactivo no obtiene sesión clínica; pacientes con ficha histórica conservan lectura propia, sin escritura. Para Android utilizar /auth/mobile/login y las rutas de sesión renovable; este login conserva su contrato original.' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Datos inválidos o CLINIC_REQUIRED.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'INVALID_CREDENTIALS: email o contraseña incorrectos, incluida cuenta pendiente.' })
  @ApiResponse({ status: 403, type: ApiErrorDto, description: 'TENANT_FORBIDDEN o TENANT_INACTIVE: clínica no autorizada o inactiva.' })
  login(@Body() input: LoginDto) { return this.auth.login(input); }

  @Public()
  @Post('clinics')
  @HttpCode(200)
  @ApiOperation({ operationId: 'verifyClinics', summary: 'Verificar credenciales y listar clínicas elegibles', description: 'Valida email y contraseña y devuelve las clínicas (nombre, no UUID) donde la cuenta tiene membresía activa en una clínica activa, más si corresponde sesión global de superadmin. No emite token: el frontend usa esto para armar el selector de clínica antes de llamar a /auth/login.' })
  @ApiResponse({ status: 200, type: VerifyClinicsResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, type: ApiErrorDto, description: 'INVALID_CREDENTIALS: email o contraseña incorrectos.' })
  verifyClinics(@Body() input: VerifyClinicsDto) { return this.auth.verifyClinics(input); }
}
