import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicListDto } from './dto/clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Solo clínicas activas: son las únicas que aceptan POST /clinics/:clinicId/users. */
  async listActive(): Promise<ClinicListDto> {
    const items = await this.prisma.clinic.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
    return { items };
  }
}
