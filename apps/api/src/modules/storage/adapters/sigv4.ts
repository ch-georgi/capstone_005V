import { createHash, createHmac } from 'node:crypto';

/** AWS Signature Version 4 para S3 (también válida para MinIO). Sin dependencias externas. */
export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export const sha256Hex = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, text: string): Buffer => createHmac('sha256', key).update(text).digest();

/** Codificación RFC 3986 exigida por SigV4 (encodeURIComponent deja sin codificar !'()*). */
export const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SignInput {
  method: string;
  /** URL absoluta, sin query string. El path debe venir ya codificado con encodeRfc3986. */
  url: URL;
  /** Cabeceras adicionales a firmar (content-type, if-none-match, etc.). */
  headers: Record<string, string>;
  /** SHA-256 hexadecimal del cuerpo (cadena vacía hasheada si no hay cuerpo). */
  payloadHash: string;
  date: Date;
}

/** Devuelve TODAS las cabeceras a enviar (incluida Authorization). */
export function signRequest(input: SignInput, credentials: SigV4Credentials): Record<string, string> {
  if (input.url.search) throw new Error('SigV4 signer does not support query strings');
  const amzDate = input.date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) headers[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ');
  headers.host = input.url.host;
  headers['x-amz-date'] = amzDate;
  headers['x-amz-content-sha256'] = input.payloadHash;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [input.method, input.url.pathname, '', canonicalHeaders, signedHeaders, input.payloadHash].join('\n');
  const scope = `${day}/${credentials.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), credentials.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}
