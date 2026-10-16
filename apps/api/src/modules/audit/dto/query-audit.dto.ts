import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AuditAction } from '@prisma/client';

export class QueryAuditDto {
  @ApiPropertyOptional({ description: 'Cantidad máxima de registros a retornar', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Desplazamiento para paginación', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({ description: 'Filtrar por paciente', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por examen', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  examId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por actor / usuario', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por tipo de acción', enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;
}