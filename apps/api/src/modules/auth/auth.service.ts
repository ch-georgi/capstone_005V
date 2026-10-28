import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { ContextService } from './context.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { VerifyClinicsDto, VerifyClinicsResponseDto } from './dto/verify-clinics.dto';
import { SessionClaims } from '../../common/types/auth-context';
import { apiError } from '../../common/filters/api-error';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService,
    private readonly contexts: ContextService, private readonly jwt: JwtService) {}

  private async verifyCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user?.passwordHash || !await this.passwords.verify(user.passwordHash, password)) {
      throw apiError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }
    return user;
  }

  async login(input: LoginDto): Promise<LoginResponseDto> {
    const user = await this.verifyCredentials(input.email, input.password);
    if (!input.clinicId && !user.isSystemAdmin) throw apiError(400, 'CLINIC_REQUIRED', 'Debes indicar clinicId para iniciar sesión clínica.');
    const session: SessionClaims = input.clinicId
      ? { sub: user.id, context: 'TENANT', clinicId: input.clinicId }
      : { sub: user.id, context: 'GLOBAL' };
    await this.contexts.resolve({ ...session, credentialsVersion: user.credentialsVersion ?? 0 });
    return { accessToken: await this.jwt.signAsync({ ...session, credentialsVersion: user.credentialsVersion ?? 0 }), tokenType: 'Bearer', expiresIn: 900 };
  }

  /**
   * Verifica credenciales y devuelve las clínicas elegibles (nombre, no UUID
   * a ciegas) para que el frontend arme el selector sin pedirle el ID al
   * usuario. No emite token: el login real sigue pasando por login().
   */
  async verifyClinics(input: VerifyClinicsDto): Promise<VerifyClinicsResponseDto> {
    const user = await this.verifyCredentials(input.email, input.password);
    const memberships = await this.prisma.userClinic.findMany({
      where: { userId: user.id, isActive: true, clinic: { isActive: true } },
      select: { clinicId: true, role: true, displayName: true, clinic: { select: { name: true } } },
      orderBy: { clinic: { name: 'asc' } },
    });
    return {
      isSystemAdmin: user.isSystemAdmin,
      gender: user.gender,
      clinics: memberships.map((m) => ({ clinicId: m.clinicId, clinicName: m.clinic.name, role: m.role, displayName: m.displayName })),
    };
  }
}
