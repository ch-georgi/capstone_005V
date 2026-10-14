import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({ imports: [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
  PrismaModule, AuthModule, UsersModule, PatientsModule, AuditModule,
] })
export class AppModule {}
