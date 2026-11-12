import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({ format: 'password', writeOnly: true, minLength: 9, maxLength: 128 })
  @IsString() @MinLength(9) @MaxLength(128) password!: string;
}
