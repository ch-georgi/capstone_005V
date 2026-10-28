import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Gender, TenantRole } from '@prisma/client';

export class VerifyClinicsDto {
  @ApiProperty({ example: 'admin1@example.com', format: 'email', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;

  @ApiProperty({ format: 'password', writeOnly: true, minLength: 1, maxLength: 128 })
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

export class ClinicOptionDto {
  @ApiProperty({ format: 'uuid' }) clinicId!: string;
  @ApiProperty({ example: 'Clínica A' }) clinicName!: string;
  @ApiProperty({ enum: TenantRole, enumName: 'TenantRole' }) role!: TenantRole;
  @ApiProperty({ example: 'Dra. Ana Soto', description: 'Nombre de presentación de la membresía en esta clínica.' }) displayName!: string;
}

export class VerifyClinicsResponseDto {
  @ApiProperty({ description: 'true si la cuenta tiene sesión global de superadmin disponible.' })
  isSystemAdmin!: boolean;

  @ApiProperty({ enum: Gender, enumName: 'Gender', description: 'Género de la cuenta, usado para personalizar saludos.' })
  gender!: Gender;

  @ApiProperty({ type: [ClinicOptionDto], description: 'Clínicas activas donde esta cuenta tiene membresía activa.' })
  clinics!: ClinicOptionDto[];
}
