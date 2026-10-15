import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { S3StorageAdapter } from '../../src/modules/storage/adapters/s3.adapter';
import { sha256Hex } from '../../src/modules/storage/adapters/sigv4';
import { StorageError } from '../../src/modules/storage/storage.service';

/** Servidor HTTP mínimo que imita lo que MinIO exige: firma presente, hash firmado = hash real, If-None-Match. */
describe('S3StorageAdapter against a local fake S3 server', () => {
  const objects = new Map<string, Buffer>();
  const seen: { method: string; url: string; headers: IncomingMessage['headers'] }[] = [];
  let server: Server;
  let adapter: S3StorageAdapter;
  let forceStatus: number | undefined;
  const key = 'clinics/c1/patients/p1/exams/e1/versions/v1';

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        seen.push({ method: req.method!, url: req.url!, headers: req.headers });
        const path = decodeURIComponent(req.url!.replace(/^\/wellq-test\//, ''));
        if (forceStatus) { res.writeHead(forceStatus).end(); return; }
        if (!String(req.headers.authorization).startsWith('AWS4-HMAC-SHA256 Credential=access/')) { res.writeHead(403).end(); return; }
        if (req.method === 'PUT') {
          if (req.headers['x-amz-content-sha256'] !== sha256Hex(body)) { res.writeHead(400).end(); return; }
          if (req.headers['if-none-match'] === '*' && objects.has(path)) { res.writeHead(412).end(); return; }
          objects.set(path, body); res.writeHead(200).end(); return;
        }
        const found = objects.get(path);
        if (req.method === 'HEAD') { res.writeHead(found ? 200 : 404).end(); return; }
        if (req.method === 'GET') { found ? res.writeHead(200, { 'content-length': found.length }).end(found) : res.writeHead(404).end(); return; }
        if (req.method === 'DELETE') { objects.delete(path); res.writeHead(204).end(); return; }
        res.writeHead(405).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    adapter = new S3StorageAdapter({ endpoint: `http://127.0.0.1:${port}`, bucket: 'wellq-test', accessKeyId: 'access', secretAccessKey: 'secret', region: 'us-east-1' });
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
  beforeEach(() => { objects.clear(); seen.length = 0; forceStatus = undefined; });

  it('stores, reads back and deletes an object, signing the real payload hash', async () => {
    const data = Buffer.from('%PDF-1.4 contenido');
    expect(await adapter.putIfAbsent(key, data, 'application/pdf')).toBe('CREATED');
    const put = seen.find((r) => r.method === 'PUT')!;
    expect(put.headers['x-amz-content-sha256']).toBe(sha256Hex(data));
    expect(put.headers['content-type']).toBe('application/pdf');
    expect(put.headers['if-none-match']).toBe('*');
    expect(String(put.headers.authorization)).toMatch(/SignedHeaders=content-type;host;if-none-match;x-amz-content-sha256;x-amz-date/);
    expect((await adapter.get(key))?.equals(data)).toBe(true);
    await adapter.delete(key);
    expect(await adapter.get(key)).toBeNull();
    await expect(adapter.delete(key)).resolves.toBeUndefined();
  });

  it('never overwrites an existing object', async () => {
    await adapter.putIfAbsent(key, Buffer.from('original'), 'application/pdf');
    expect(await adapter.putIfAbsent(key, Buffer.from('otro'), 'application/pdf')).toBe('EXISTS');
    expect((await adapter.get(key))?.toString()).toBe('original');
  });

  it('reports HTTP 412 from a conditional PUT as EXISTS even if HEAD missed the object', async () => {
    objects.set(key, Buffer.from('race'));
    const http = jest.fn(async (url: URL | string, init?: RequestInit) =>
      init?.method === 'HEAD' ? new Response(null, { status: 404 }) : fetch(url, init));
    const racing = new S3StorageAdapter({ endpoint: (adapter as unknown as { config: { endpoint: string } }).config.endpoint, bucket: 'wellq-test', accessKeyId: 'access', secretAccessKey: 'secret', region: 'us-east-1' }, http as unknown as typeof fetch);
    expect(await racing.putIfAbsent(key, Buffer.from('x'), 'image/png')).toBe('EXISTS');
  });

  it('classifies failures without leaking credentials', async () => {
    forceStatus = 500;
    await expect(adapter.get(key)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
    forceStatus = 403;
    const error = await adapter.get(key).catch((e) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.kind).toBe('FAILED');
    expect(error.message).not.toContain('secret');
    const dead = new S3StorageAdapter({ endpoint: 'http://127.0.0.1:1', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', region: 'us-east-1' });
    await expect(dead.get(key)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });

  it('requires an origin-only endpoint', () => {
    expect(() => new S3StorageAdapter({ endpoint: 'http://localhost:9222/bucket', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', region: 'r' })).toThrow('origin');
  });
});
