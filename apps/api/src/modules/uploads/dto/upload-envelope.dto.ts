import { Type } from 'class-transformer';
import { Equals, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ALLOWED_MIME_TYPES, AllowedMime, MAX_FILE_BYTES } from '../../storage/file-inspection';

export const UPLOAD_OPERATIONS = ['CREATE_EXAM_WITH_VERSION', 'UPLOAD_VERSION'] as const;
export type UploadOperationName = (typeof UPLOAD_OPERATIONS)[number];

/** UUID en minúsculas, igual que database/contracts/security.ts. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = () => Matches(UUID_PATTERN, { message: 'must be a lowercase UUID' });

export class UploadPayloadDto {
  @Equals(1) schemaVersion!: 1;
  @uuid() patientId!: string;
  @uuid() examId!: string;
  @uuid() versionId!: string;
  @IsOptional() @IsString() @Length(1, 200) @Matches(/\S/, { message: 'title must not be blank' }) title?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'examDate must be YYYY-MM-DD' }) examDate?: string;
  @IsOptional() @uuid() examTypeId?: string;
  @IsOptional() @IsString() @Length(1, 200) professionalName?: string;
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
}

/** UploadEnvelope de database/contracts/types.ts: campo JSON `request` del multipart. */
export class UploadEnvelopeDto {
  @uuid() operationId!: string;
  @uuid() clinicId!: string;
  @IsIn(UPLOAD_OPERATIONS) operation!: UploadOperationName;
  @ValidateNested() @Type(() => UploadPayloadDto) payload!: UploadPayloadDto;
  // Sin separadores de ruta ni caracteres de control: el nombre se reutiliza en cabeceras de descarga.
  @IsString() @Length(1, 255) @Matches(/^[^/\\\u0000-\u001f\u007f]+$/, { message: 'filename must not contain path separators or control characters' })
  @Matches(/\S/, { message: 'filename must not be blank' })
  filename!: string;
  @IsIn(ALLOWED_MIME_TYPES) mimeType!: AllowedMime;
  @IsInt() @Min(1) @Max(MAX_FILE_BYTES) sizeBytes!: number;
  @Matches(/^[0-9a-f]{64}$/, { message: 'sha256 must be 64 lowercase hexadecimal characters' }) sha256!: string;
}

export class UploadResultDto {
  examId!: string;
  versionId!: string;
  versionNumber!: number;
  /** true cuando la operación ya se había procesado y se devuelve el resultado guardado. */
  replayed!: boolean;
}
