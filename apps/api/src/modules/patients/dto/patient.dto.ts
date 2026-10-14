import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
// Campos opcionales de contacto: texto vacío equivale a "sin dato" (null).
const trimOrNull = ({ value }: { value: unknown }) => typeof value === 'string' ? (value.trim() || null) : value;
const emailOrNull = ({ value }: { value: unknown }) => typeof value === 'string' ? (value.trim().toLowerCase() || null) : value;

export class CreatePatientDto {
  @ApiProperty({ format: 'uuid', description: 'Cuenta existente con membresía PATIENT en la clínica del JWT.' })
  @IsUUID() userId!: string;

  @ApiProperty({ example: 'María', minLength: 1, maxLength: 100 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) firstName!: string;

  @ApiProperty({ example: 'González', minLength: 1, maxLength: 100 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) lastName!: string;

  @ApiProperty({ example: '1990-05-17', description: 'Fecha YYYY-MM-DD, no futura.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth debe tener formato YYYY-MM-DD' }) dateOfBirth!: string;

  @ApiPropertyOptional({ format: 'email', nullable: true, description: 'Correo de contacto; no identifica la cuenta de login.' })
  @IsOptional() @Transform(emailOrNull) @IsEmail() @MaxLength(254) email?: string | null;

  @ApiPropertyOptional({ example: '+56912345678', nullable: true, maxLength: 30 })
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(30) phone?: string | null;

  @ApiPropertyOptional({ example: 'FICHA-0001', nullable: true, maxLength: 50, description: 'Único dentro de la clínica.' })
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50) medicalRecordNumber?: string | null;
}

// userId no se puede cambiar: la ficha pertenece a una membresía fija.
export class UpdatePatientDto extends PartialType(OmitType(CreatePatientDto, ['userId'] as const)) {}

export class ListPatientsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 50;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset: number = 0;

  @ApiPropertyOptional({ description: 'Busca por nombre, apellido o número de ficha.', maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
}

export class PatientDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ format: 'uuid' }) clinicId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ example: '1990-05-17' }) dateOfBirth!: string;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) medicalRecordNumber!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PatientPageDto {
  @ApiProperty({ type: [PatientDto] }) items!: PatientDto[];
  @ApiProperty({ example: 10 }) total!: number;
  @ApiProperty({ example: 50 }) limit!: number;
  @ApiProperty({ example: 0 }) offset!: number;
}

export class TimelineExamVersionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 1 }) versionNumber!: number;
  @ApiProperty({ example: 'informe_radiografia.pdf' }) originalFilename!: string;
  @ApiProperty({ example: 'application/pdf' }) mimeType!: string;
  @ApiProperty({ example: '1048576' }) sizeBytes!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class TimelineExamTypeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'RAYOS_X' }) code!: string;
  @ApiProperty({ example: 'Radiografía de Tórax' }) name!: string;
}

export class TimelineExamItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Radiografía de Tórax AP' }) title!: string;
  @ApiProperty({ example: '2026-05-10' }) examDate!: string;
  @ApiProperty({ nullable: true, type: String, example: 'Dr. Roberto Soto' }) professionalName!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Sin hallazgos patológicos relevantes' }) notes!: string | null;
  @ApiProperty({ type: TimelineExamTypeDto }) examType!: TimelineExamTypeDto;
  @ApiProperty({ type: [TimelineExamVersionDto] }) versions!: TimelineExamVersionDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PatientTimelineDto {
  @ApiProperty({ type: PatientDto }) patient!: PatientDto;
  @ApiProperty({ example: 3 }) totalExams!: number;
  @ApiProperty({ type: [TimelineExamItemDto] }) timeline!: TimelineExamItemDto[];
}