import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExamManagementService } from './exam-management.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({ imports: [AuditModule], controllers: [ExamsController], providers: [ExamsService, ExamManagementService] })
export class ExamsModule {}
