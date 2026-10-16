import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [AuditModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
