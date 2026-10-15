import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExamTypeListDto } from './dto/exam-type.dto';

@Injectable()
export class ExamTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo global (no pertenece a una clínica). Solo activos: son los únicos admitidos al crear exámenes. */
  async listActive(): Promise<ExamTypeListDto> {
    const items = await this.prisma.examType.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true },
    });
    return { items };
  }
}
