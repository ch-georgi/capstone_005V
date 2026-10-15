import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
export class EmailDto {
  @ApiProperty({ format: "email", maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class MobileLoginDto extends EmailDto {
  @ApiProperty({
    format: "password",
    writeOnly: true,
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
export class TokenDto {
  @ApiProperty({ writeOnly: true, maxLength: 160 })
  @IsString()
  @Length(20, 160)
  refreshToken!: string;
}
export class SelectClinicDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Length(20, 160)
  selectionToken!: string;
  @ApiProperty({ format: "uuid" }) @IsUUID() clinicId!: string;
}
export class SwitchClinicDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() clinicId!: string;
}
export class VerifyCodeDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() challengeId!: string;
  @ApiProperty({ writeOnly: true, pattern: "^[0-9]{6}$" })
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;
}
export class ResetPasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Length(20, 160)
  resetToken!: string;
  @ApiProperty({
    format: "password",
    writeOnly: true,
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
