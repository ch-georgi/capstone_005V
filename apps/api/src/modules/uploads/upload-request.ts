import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { apiError } from '../../common/filters/api-error';
import { UploadEnvelopeDto } from './dto/upload-envelope.dto';

export interface ParsedUploadRequest {
  envelope: UploadEnvelopeDto;
  /** JSON tal como lo envió el cliente (ya validado): es lo que se canoniza para la huella. */
  plain: Record<string, unknown>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

function hasNull(value: unknown): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.some(hasNull);
  return isPlainObject(value) && Object.values(value).some(hasNull);
}

function describe(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => `${path}: ${message}`);
    return [...own, ...describe(error.children ?? [], path)];
  });
}

function realDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Parsea y valida el campo `request` del multipart. Nunca devuelve valores enviados por el cliente en el error. */
export async function parseUploadRequest(raw: unknown): Promise<ParsedUploadRequest> {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw apiError(400, 'REQUEST_REQUIRED', 'Falta el campo "request" con el sobre JSON de la carga.');
  }
  let plain: unknown;
  try { plain = JSON.parse(raw); } catch { throw apiError(400, 'INVALID_REQUEST_JSON', 'El campo "request" no es JSON válido.'); }
  if (!isPlainObject(plain)) throw apiError(400, 'VALIDATION_ERROR', 'El campo "request" debe ser un objeto JSON.');
  // El contrato omite los opcionales ausentes; un null cambiaría la huella canónica.
  if (hasNull(plain)) throw apiError(400, 'VALIDATION_ERROR', 'request: los campos opcionales ausentes deben omitirse, no enviarse como null.');

  const envelope = plainToInstance(UploadEnvelopeDto, plain);
  const errors = await validate(envelope, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw apiError(400, 'VALIDATION_ERROR', describe(errors).join('; '));

  const { payload, operation } = envelope;
  const metadata = ['title', 'examDate', 'examTypeId', 'professionalName', 'notes'] as const;
  if (operation === 'CREATE_EXAM_WITH_VERSION') {
    const missing = (['title', 'examDate', 'examTypeId'] as const).filter((key) => payload[key] === undefined);
    if (missing.length) throw apiError(400, 'VALIDATION_ERROR', `payload: CREATE_EXAM_WITH_VERSION requiere ${missing.join(', ')}.`);
    if (!realDate(payload.examDate!)) throw apiError(400, 'INVALID_EXAM_DATE', 'La fecha del examen no es válida.');
  } else {
    const extra = metadata.filter((key) => payload[key] !== undefined);
    if (extra.length) throw apiError(400, 'VALIDATION_ERROR', `payload: UPLOAD_VERSION no admite ${extra.join(', ')}.`);
  }
  return { envelope, plain };
}
