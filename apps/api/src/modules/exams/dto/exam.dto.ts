import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { ExamTypeDto } from '../../exam-types/dto/exam-type.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListExamsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 50;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset: number = 0;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo exámenes de este tipo.' })
  @IsOptional() @IsUUID() examTypeId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Fecha del examen desde (inclusive), YYYY-MM-DD.' })
  @IsOptional() @Matches(DATE, { message: 'from debe tener formato YYYY-MM-DD' }) from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fecha del examen hasta (inclusive), YYYY-MM-DD.' })
  @IsOptional() @Matches(DATE, { message: 'to debe tener formato YYYY-MM-DD' }) to?: string;
}

export class PersonRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Nombre de presentación en esta clínica (null si ya no tiene membresía).' })
  displayName!: string | null;
}

export class ExamVersionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 1 }) versionNumber!: number;
  @ApiProperty({ example: 'hemograma.pdf' }) originalFilename!: string;
  @ApiProperty({ example: 'application/pdf', enum: ['application/pdf', 'image/jpeg', 'image/png'] }) mimeType!: string;
  @ApiProperty({ example: 1048576, description: 'Bytes (máximo 10.000.000).' }) sizeBytes!: number;
  @ApiProperty({ description: 'SHA-256 hexadecimal en minúsculas.' }) sha256!: string;
  @ApiProperty({ type: PersonRefDto }) uploadedBy!: PersonRefDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ExamSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) patientId!: string;
  @ApiProperty({ example: 'Hemograma de control' }) title!: string;
  @ApiProperty({ example: '2026-10-15', description: 'Fecha clínica YYYY-MM-DD.' }) examDate!: string;
  @ApiProperty({ nullable: true, type: String }) professionalName!: string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ type: ExamTypeDto }) examType!: ExamTypeDto;
  @ApiProperty({ example: 2 }) versionCount!: number;
  @ApiProperty({ type: ExamVersionDto, nullable: true, description: 'Versión más reciente; el archivo vigente.' }) latestVersion!: ExamVersionDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ExamDetailDto extends ExamSummaryDto {
  @ApiProperty({ type: PersonRefDto }) createdBy!: PersonRefDto;
  @ApiProperty({ type: [ExamVersionDto], description: 'Historial completo, de la más reciente a la más antigua.' })
  versions!: ExamVersionDto[];
}

export class ExamPageDto {
  @ApiProperty({ type: [ExamSummaryDto] }) items!: ExamSummaryDto[];
  @ApiProperty({ example: 12, description: 'Total que cumple los filtros (sin paginar).' }) total!: number;
  @ApiProperty({ example: 50 }) limit!: number;
  @ApiProperty({ example: 0 }) offset!: number;
}
