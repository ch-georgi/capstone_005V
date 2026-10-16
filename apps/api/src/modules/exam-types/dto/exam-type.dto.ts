import { ApiProperty } from '@nestjs/swagger';

export class ExamTypeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'HEMOGRAMA', description: 'Código estable del tipo.' }) code!: string;
  @ApiProperty({ example: 'Hemograma' }) name!: string;
}

export class ExamTypeListDto {
  @ApiProperty({ type: [ExamTypeDto], description: 'Solo tipos activos, ordenados por nombre. Los inactivos no admiten exámenes nuevos.' })
  items!: ExamTypeDto[];
}
