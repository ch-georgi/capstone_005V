import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, TenantRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBoolean = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class ListMembersQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 50;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset: number = 0;

  @ApiPropertyOptional({ enum: TenantRole, enumName: 'TenantRole' })
  @IsOptional() @IsIn(Object.values(TenantRole)) role?: TenantRole;

  @ApiPropertyOptional({ description: 'true: solo activos; false: solo inactivos.' })
  @IsOptional() @Transform(toBoolean) @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ maxLength: 100, description: 'Busca por nombre de presentación o correo (contiene, sin distinguir mayúsculas).' })
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) q?: string;
}

export class MemberDto {
  @ApiProperty({ format: 'uuid', description: 'Id de la cuenta de usuario.' }) id!: string;
  @ApiProperty({ nullable: true, type: String, format: 'email', description: 'null en una cuenta pendiente.' }) email!: string | null;
  @ApiProperty({ example: 'Dra. Ana Soto' }) displayName!: string;
  @ApiProperty({ enum: Gender, enumName: 'Gender' }) gender!: Gender;
  @ApiProperty({ enum: TenantRole, enumName: 'TenantRole' }) role!: TenantRole;
  @ApiProperty({ description: 'Membresía activa en esta clínica.' }) isActive!: boolean;
  @ApiProperty({ description: 'false si la cuenta aún no tiene credenciales (pendiente).' }) hasCredentials!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'uuid', description: 'Ficha de paciente asociada, si existe.' }) patientId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class MemberPageDto {
  @ApiProperty({ type: [MemberDto] }) items!: MemberDto[];
  @ApiProperty({ example: 12, description: 'Total que cumple los filtros (sin paginar).' }) total!: number;
  @ApiProperty({ example: 50 }) limit!: number;
  @ApiProperty({ example: 0 }) offset!: number;
}

/** Edición parcial de una membresía. El rol PATIENT no se asigna ni se cambia por esta ruta. */
export class UpdateMemberDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) @Matches(/\S/, { message: 'no puede estar en blanco' }) displayName?: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional() @IsEnum(Gender) gender?: Gender;

  @ApiPropertyOptional({ enum: [TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN], description: 'Solo entre roles de personal.' })
  @IsOptional() @IsIn([TenantRole.CLINIC_ADMIN, TenantRole.CLINICIAN]) role?: TenantRole;

  @ApiPropertyOptional({ description: 'false desactiva (no se elimina) la membresía; true la reactiva.' })
  @IsOptional() @IsBoolean() isActive?: boolean;
}
