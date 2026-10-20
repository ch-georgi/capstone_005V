import { ApiProperty } from "@nestjs/swagger";
export class ClinicOptionDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ["READ_ONLY", "READ_WRITE"] }) access!:
    | "READ_ONLY"
    | "READ_WRITE";
  @ApiProperty() patientRecordPending!: boolean;
}
export class ProfileUserDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "email" }) email!: string;
}
export class ProfileClinicDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
}
export class MobileProfileDto {
  @ApiProperty({ type: String, format: "uuid", nullable: true }) patientId!: string | null;
  @ApiProperty({ type: ProfileUserDto }) user!: ProfileUserDto;
  @ApiProperty({ type: ProfileClinicDto }) clinic!: ProfileClinicDto;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ["PATIENT"] }) role!: "PATIENT";
  @ApiProperty({ enum: ["READ_ONLY", "READ_WRITE"] }) access!:
    | "READ_ONLY"
    | "READ_WRITE";
  @ApiProperty() patientRecordPending!: boolean;
  @ApiProperty({ type: [ClinicOptionDto] }) clinics!: ClinicOptionDto[];
}
export class MobileSessionDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ enum: ["Bearer"] }) tokenType!: "Bearer";
  @ApiProperty({ maximum: 900 }) expiresIn!: number;
  @ApiProperty({ format: "date-time" }) sessionExpiresAt!: string;
  @ApiProperty({ type: MobileProfileDto }) profile!: MobileProfileDto;
}
export class AuthenticatedDto {
  @ApiProperty({ enum: ["AUTHENTICATED"] }) status!: "AUTHENTICATED";
  @ApiProperty({ type: MobileSessionDto }) session!: MobileSessionDto;
}
export class SelectionRequiredDto {
  @ApiProperty({ enum: ["CLINIC_SELECTION_REQUIRED"] })
  status!: "CLINIC_SELECTION_REQUIRED";
  @ApiProperty() selectionToken!: string;
  @ApiProperty({ type: [ClinicOptionDto] }) clinics!: ClinicOptionDto[];
}
export class RecoveryRequestedDto {
  @ApiProperty({ format: "uuid" }) challengeId!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ example: 60 }) resendAfter!: number;
}
export class RecoveryVerifiedDto {
  @ApiProperty() resetToken!: string;
  @ApiProperty({ example: 300 }) expiresIn!: number;
}
