import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticationGuard } from '../../common/guards/authentication.guard';
import { ContextGuard } from '../../common/guards/context.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ContextService } from './context.service';
import { PasswordService } from './password.service';

@Module({
  imports: [JwtModule.registerAsync({
    inject: [ConfigService], useFactory: (config: ConfigService) => ({
      secret: config.getOrThrow<string>('JWT_SECRET'),
      signOptions: { algorithm: 'HS256', expiresIn: 900, issuer: config.getOrThrow<string>('JWT_ISSUER'), audience: config.getOrThrow<string>('JWT_AUDIENCE') },
      verifyOptions: { algorithms: ['HS256'], issuer: config.getOrThrow<string>('JWT_ISSUER'), audience: config.getOrThrow<string>('JWT_AUDIENCE') },
    }),
  })],
  controllers: [AuthController],
  providers: [AuthService, ContextService, PasswordService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: ContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard }],
  exports: [ContextService, PasswordService, JwtModule],
})
export class AuthModule {}
