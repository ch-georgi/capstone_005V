import { PutResult, StorageError, StorageService } from '../storage.service';
import { encodeRfc3986, sha256Hex, signRequest } from './sigv4';

export interface S3Config {
  /** Origen del servicio, p. ej. http://localhost:9222 (MinIO local). Sin ruta ni query. */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/** Tope defensivo al leer un objeto a memoria (el límite funcional es 10.000.000 bytes). */
const MAX_OBJECT_BYTES = 11_000_000;
const TIMEOUT_MS = 20_000;
const EMPTY_HASH = sha256Hex('');

/**
 * Adaptador S3/MinIO (PB-035) con direccionamiento por ruta: {endpoint}/{bucket}/{key}.
 * Usa fetch + SigV4 propio. El hash real del cuerpo se firma en x-amz-content-sha256,
 * de modo que el almacén rechaza el PUT si los bytes recibidos no coinciden.
 */
export class S3StorageAdapter extends StorageService {
  constructor(
    private readonly config: S3Config,
    private readonly http: typeof fetch = fetch,
  ) {
    super();
    const endpoint = new URL(config.endpoint);
    if (endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
      throw new Error('S3_ENDPOINT must be an origin without path, query or hash');
    }
  }

  private urlFor(key: string): URL {
    const path = '/' + [this.config.bucket, ...key.split('/')].map(encodeRfc3986).join('/');
    return new URL(path, this.config.endpoint);
  }

  private async send(method: string, key: string, options: { body?: Buffer; headers?: Record<string, string> } = {}) {
    const url = this.urlFor(key);
    const payloadHash = options.body ? sha256Hex(options.body) : EMPTY_HASH;
    const headers = signRequest(
      { method, url, headers: options.headers ?? {}, payloadHash, date: new Date() },
      { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey, region: this.config.region },
    );
    try {
      return await this.http(url, { method, headers, body: options.body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new StorageError('UNAVAILABLE', 'No se pudo contactar al almacenamiento de documentos.');
    }
  }

  private unexpected(operation: string, status: number): StorageError {
    return new StorageError(status >= 500 ? 'UNAVAILABLE' : 'FAILED', `El almacenamiento respondió HTTP ${status} en ${operation}.`);
  }

  async putIfAbsent(key: string, body: Buffer, mimeType: string): Promise<PutResult> {
    // HEAD previo: protege incluso si el almacén ignora If-None-Match.
    const head = await this.send('HEAD', key);
    if (head.status === 200) return 'EXISTS';
    if (head.status !== 404) throw this.unexpected('HEAD', head.status);

    const put = await this.send('PUT', key, { body, headers: { 'content-type': mimeType, 'if-none-match': '*' } });
    if (put.status === 200 || put.status === 201) return 'CREATED';
    if (put.status === 412) return 'EXISTS';
    throw this.unexpected('PUT', put.status);
  }

  async get(key: string): Promise<Buffer | null> {
    const response = await this.send('GET', key);
    if (response.status === 404) return null;
    if (response.status !== 200) throw this.unexpected('GET', response.status);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_OBJECT_BYTES) throw new StorageError('FAILED', 'El objeto almacenado excede el tamaño permitido.');
    try {
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > MAX_OBJECT_BYTES) throw new StorageError('FAILED', 'El objeto almacenado excede el tamaño permitido.');
      return data;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('UNAVAILABLE', 'Se interrumpió la lectura desde el almacenamiento.');
    }
  }

  async delete(key: string): Promise<void> {
    const response = await this.send('DELETE', key);
    if (response.status === 200 || response.status === 204 || response.status === 404) return;
    throw this.unexpected('DELETE', response.status);
  }
}
