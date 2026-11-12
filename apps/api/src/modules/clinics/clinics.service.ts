import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { apiError } from '../../common/filters/api-error';
import { ClinicDto, ClinicListDto } from './dto/clinic.dto';

const MAX_CODE_ATTEMPTS = 20;

/** Código interno legible a partir del nombre: mayúsculas, sin acentos, solo A-Z0-9 y guión bajo. */
const toCode = (name: string) => {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return base || 'CLINICA';
};

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

  async create(name: string): Promise<ClinicDto> {
    const base = toCode(name);
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = attempt === 0 ? base : `${base}_${attempt + 1}`;
      try {
        return await this.prisma.clinic.create({ data: { name, code }, select: { id: true, name: true, code: true } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    throw apiError(500, 'CODE_GENERATION_FAILED', 'No se pudo generar un código único para la clínica.');
  }
}
