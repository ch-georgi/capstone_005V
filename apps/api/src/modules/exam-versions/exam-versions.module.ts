import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExamFilesController } from './exam-files.controller';
import { ExamFilesService } from './exam-files.service';

@Module({
  imports: [AuditModule],
  controllers: [ExamFilesController],
  providers: [ExamFilesService],
})
export class ExamVersionsModule {}
