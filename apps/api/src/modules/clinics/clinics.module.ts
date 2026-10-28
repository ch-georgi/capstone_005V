import { Module } from '@nestjs/common';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({ controllers: [ClinicsController], providers: [ClinicsService] })
export class ClinicsModule {}
