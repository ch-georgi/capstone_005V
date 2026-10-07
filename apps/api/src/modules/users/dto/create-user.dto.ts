import { ApiProperty } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ format: 'email', example: 'profesional@example.com', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;

  @ApiProperty({ format: 'password', writeOnly: true, minLength: 12, maxLength: 128 })
  @IsString() @MinLength(12) @MaxLength(128) password!: string;

  @ApiProperty({ example: 'Profesional de prueba', minLength: 1, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(100) displayName!: string;

  @ApiProperty({ enum: TenantRole, enumName: 'TenantRole', example: TenantRole.CLINICIAN })
  @IsEnum(TenantRole) role!: TenantRole;
}
export class CreatedUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email', example: 'profesional@example.com' }) email!: string;
  @ApiProperty({ format: 'uuid' }) clinicId!: string;
  @ApiProperty({ example: 'Profesional de prueba' }) displayName!: string;
  @ApiProperty({ enum: TenantRole, enumName: 'TenantRole' }) role!: TenantRole;
  @ApiProperty({ example: true }) isActive!: boolean;
  @ApiProperty({ format: 'date-time', example: '2026-10-05T12:00:00.000Z' }) createdAt!: string;
}
