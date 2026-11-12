import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ClinicDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Clínica A' }) name!: string;
  @ApiProperty({ example: 'CLINIC_A' }) code!: string;
}

export class ClinicListDto {
  @ApiProperty({ type: [ClinicDto] }) items!: ClinicDto[];
}

export class CreateClinicDto {
  @ApiProperty({ example: 'Clínica Esperanza', minLength: 1, maxLength: 100, description: 'El código interno se genera automáticamente a partir del nombre.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
}
