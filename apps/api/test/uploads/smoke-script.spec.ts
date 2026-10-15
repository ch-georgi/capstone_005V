import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { runSmoke } from '../../scripts/smoke-exam-files';

/** Comprueba la mecánica del script (multipart, hash, pasos) contra una API simulada mínima. */
describe('smoke-exam-files script', () => {
  let server: Server; let base: string; let mode: 'ok' | 'bad-download' | 'bad-login' = 'ok';
  const seen: string[] = [];
  const config = () => ({ apiUrl: base, email: 'a@b.cl', password: 'x', clinicId: 'c', patientId: 'p', examTypeId: 't',
    filePath: resolve(__dirname, '../../../../database/fixtures/documento-demo.pdf') });

  beforeAll(async () => {
    const stored = new Map<string, Buffer>(); const ops = new Map<string, string>();
    server = createServer((req, res) => {
      const chunks: Buffer[] = []; req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks); seen.push(`${req.method} ${req.url}`);
        const json = (status: number, value: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
        if (req.url === '/auth/login') return mode === 'bad-login' ? json(401, {}) : json(200, { accessToken: 't' });
        if (req.url === '/exams/uploads') {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
          expect(req.headers.authorization).toBe('Bearer t');
          const text = body.toString('latin1');
          const envelope = JSON.parse(/name="request"\r\n\r\n([\s\S]*?)\r\n--/.exec(text)![1]);
          expect(text).toContain('name="file"; filename="documento-demo.pdf"');
          expect(text).toContain('Content-Type: application/pdf');
          expect(envelope.sha256).toMatch(/^[0-9a-f]{64}$/);
          const prior = ops.get(envelope.operationId); const canonical = JSON.stringify(envelope);
          if (prior) return prior === canonical ? json(200, { examId: envelope.payload.examId, versionNumber: 1, replayed: true }) : json(409, {});
          ops.set(envelope.operationId, canonical);
          stored.set(envelope.payload.examId, body.subarray(body.indexOf('%PDF-'), body.lastIndexOf('\r\n--')));
          return json(201, { examId: envelope.payload.examId, versionNumber: envelope.operation === 'UPLOAD_VERSION' ? 2 : 1, replayed: false });
        }
        const match = /^\/exams\/([^/]+)\/versions\/[^/]+\/(download|view)$/.exec(req.url!);
        if (match) {
          const data = mode === 'bad-download' ? Buffer.from('%PDF-otro') : stored.get(match[1])!;
          return void res.writeHead(200, { 'content-disposition': `${match[2] === 'download' ? 'attachment' : 'inline'}; filename="x.pdf"` }).end(data);
        }
        if (req.url!.startsWith('/audit')) return json(200, { items: [{ action: 'CREATE' }] });
        json(404, {});
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise((r) => server.close(r)); });
  beforeEach(() => { mode = 'ok'; seen.length = 0; });

  it('completes every step against a well-behaved API', async () => {
    const lines: string[] = [];
    await runSmoke(config(), (l) => lines.push(l));
    expect(lines.at(-1)).toContain('LISTO');
    expect(seen.filter((s) => s === 'POST /exams/uploads')).toHaveLength(4); // crear, repetir, conflicto, nueva versión
  });
  it('fails with a readable message when the downloaded bytes differ', async () => {
    mode = 'bad-download';
    await expect(runSmoke(config(), () => undefined)).rejects.toThrow('no es idéntico');
  });
  it('fails clearly on bad credentials', async () => {
    mode = 'bad-login';
    await expect(runSmoke(config(), () => undefined)).rejects.toThrow('Login falló');
  });
});
