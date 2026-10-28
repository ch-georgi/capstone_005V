import { ApiProperty } from '@nestjs/swagger';

export class ClinicDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Clínica A' }) name!: string;
  @ApiProperty({ example: 'CLINIC_A' }) code!: string;
}

export class ClinicListDto {
  @ApiProperty({ type: [ClinicDto] }) items!: ClinicDto[];
}
