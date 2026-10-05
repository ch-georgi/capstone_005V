import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin1@example.com', format: 'email', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;

  @ApiProperty({ format: 'password', writeOnly: true, minLength: 1, maxLength: 128 })
  @IsString() @MinLength(1) @MaxLength(128) password!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatoria para sesión clínica. Omitir únicamente para login global del superadmin.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID() clinicId?: string;
}
export class LoginResponseDto {
  @ApiProperty({ description: 'JWT de acceso; no se incluyen tokens reales en ejemplos.' }) accessToken!: string;
  @ApiProperty({ enum: ['Bearer'] }) tokenType!: 'Bearer';
  @ApiProperty({ example: 900 }) expiresIn!: number;
}
