import { SyncModule } from './modules/sync/sync.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { AuditModule } from './modules/audit/audit.module';
import { StorageModule } from './modules/storage/storage.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ExamVersionsModule } from './modules/exam-versions/exam-versions.module';
import { ExamTypesModule } from './modules/exam-types/exam-types.module';
import { ExamsModule } from './modules/exams/exams.module';

@Module({ imports: [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
  SyncModule, PrismaModule, StorageModule, AuthModule, UsersModule, PatientsModule, AuditModule,
  UploadsModule, ExamVersionsModule, ExamTypesModule, ExamsModule,
] })
export class AppModule {}
