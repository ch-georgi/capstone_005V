import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { ContextService } from './context.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { SessionClaims } from '../../common/types/auth-context';
import { apiError } from '../../common/filters/api-error';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService,
    private readonly contexts: ContextService, private readonly jwt: JwtService) {}
  async login(input: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!user?.passwordHash || !await this.passwords.verify(user.passwordHash, input.password)) {
      throw apiError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }
    if (!input.clinicId && !user.isSystemAdmin) throw apiError(400, 'CLINIC_REQUIRED', 'Debes indicar clinicId para iniciar sesión clínica.');
    const session: SessionClaims = input.clinicId
      ? { sub: user.id, context: 'TENANT', clinicId: input.clinicId }
      : { sub: user.id, context: 'GLOBAL' };
    await this.contexts.resolve(session);
    return { accessToken: await this.jwt.signAsync(session), tokenType: 'Bearer', expiresIn: 900 };
  }
}
