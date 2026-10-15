import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_BLANK = { message: 'no puede estar en blanco' };

/**
 * Edición parcial de los datos clínicos de un examen. Lo omitido no cambia;
 * `professionalName` y `notes` aceptan `null` para borrar el valor.
 * El paciente, el autor y los archivos no se pueden modificar aquí (los archivos son versiones nuevas).
 */
export class UpdateExamDto {
  @ApiPropertyOptional({ example: 'Hemograma de control', minLength: 1, maxLength: 200 })
  @ValidateIf((o: UpdateExamDto) => o.title !== undefined) @IsString() @Length(1, 200) @Matches(/\S/, NOT_BLANK) title?: string;

  @ApiPropertyOptional({ example: '2026-10-15', description: 'Fecha clínica YYYY-MM-DD.' })
  @ValidateIf((o: UpdateExamDto) => o.examDate !== undefined) @IsString() @Matches(DATE, { message: 'examDate debe tener formato YYYY-MM-DD' }) examDate?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo tipos activos.' })
  @ValidateIf((o: UpdateExamDto) => o.examTypeId !== undefined) @IsUUID('4') examTypeId?: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 200, description: '`null` borra el valor.' })
  @IsOptional() @IsString() @Length(1, 200) @Matches(/\S/, NOT_BLANK) professionalName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 2000, description: '`null` borra el valor.' })
  @IsOptional() @IsString() @Length(1, 2000) @Matches(/\S/, NOT_BLANK) notes?: string | null;
}
