import { INestApplication, Injectable } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configureApplication } from '../../src/config/application';
import { validateEnvironment } from '../../src/config/environment';
import { contentDisposition } from '../../src/common/http/content-disposition';
import { ExamFilesController } from '../../src/modules/exam-versions/exam-files.controller';
import { ExamFilesService } from '../../src/modules/exam-versions/exam-files.service';
import { UploadsController } from '../../src/modules/uploads/uploads.controller';
import { UploadsService } from '../../src/modules/uploads/uploads.service';

@Injectable() class FakeUploads { calls: any[] = []; status: 200 | 201 = 201;
  async upload(ctx: unknown, req: unknown, file: any, info: unknown) { this.calls.push({ ctx, req, file, info }); return { status: this.status, body: { examId: 'e', versionId: 'v', versionNumber: 1, replayed: this.status === 200 } }; } }
@Injectable() class FakeFiles { calls: any[] = []; filename = 'informe.pdf';
  async deliver(...args: unknown[]) { this.calls.push(args); return { data: Buffer.from('%PDF-1.4 hola'), mimeType: 'application/pdf', filename: this.filename }; } }

describe('HTTP layer of uploads and downloads (multipart real, sin base de datos)', () => {
  let app: INestApplication; const uploads = new FakeUploads(), files = new FakeFiles();
  const tenant = { kind: 'TENANT', actorId: 'actor', clinicId: 'clinic', role: 'CLINIC_ADMIN', access: 'READ_WRITE' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment })],
      controllers: [UploadsController, ExamFilesController],
      providers: [{ provide: UploadsService, useValue: uploads }, { provide: ExamFilesService, useValue: files }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => { req.authContext = tenant; next(); });
    configureApplication(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { uploads.calls = []; files.calls = []; uploads.status = 201; files.filename = 'informe.pdf'; });
  const post = () => request(app.getHttpServer()).post('/api/v1/exams/uploads');

  it('passes the JSON field and the file bytes to the service and answers 201', async () => {
    const bytes = Buffer.from('%PDF-1.4 binario \u0000\u0001ÿ');
    const res = await post().field('request', '{"a":1}').attach('file', bytes, { filename: 'a.pdf', contentType: 'application/pdf' }).expect(201);
    expect(res.body).toEqual({ examId: 'e', versionId: 'v', versionNumber: 1, replayed: false });
    expect(uploads.calls[0].req).toBe('{"a":1}');
    expect(uploads.calls[0].file.buffer.equals(bytes)).toBe(true);
    expect(uploads.calls[0].ctx).toEqual(tenant);
  });

  it('answers 200 for a replayed operation', async () => {
    uploads.status = 200;
    const res = await post().field('request', '{}').attach('file', Buffer.from('%PDF-x'), 'a.pdf').expect(200);
    expect(res.body.replayed).toBe(true);
  });

  it('accepts exactly 10.000.000 bytes and rejects one byte more with 413 PAYLOAD_TOO_LARGE', async () => {
    await post().field('request', '{}').attach('file', Buffer.alloc(10_000_000, 1), 'ok.pdf').expect(201);
    expect(uploads.calls[0].file.buffer.length).toBe(10_000_000);
    uploads.calls = [];
    const res = await post().field('request', '{}').attach('file', Buffer.alloc(10_000_001, 1), 'big.pdf').expect(413);
    expect(res.body).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
    expect(uploads.calls).toHaveLength(0);
  });

  it('rejects a second file and unexpected file fields', async () => {
    await post().field('request', '{}').attach('file', Buffer.from('a'), 'a.pdf').attach('file', Buffer.from('b'), 'b.pdf').expect(400);
    await post().field('request', '{}').attach('otro', Buffer.from('a'), 'a.pdf').expect(400);
    expect(uploads.calls).toHaveLength(0);
  });

  it('still reaches the service (which answers 400) when the file or the field is missing', async () => {
    await post().field('request', '{}').expect(201);
    expect(uploads.calls[0].file).toBeUndefined();
    await post().attach('file', Buffer.from('%PDF-x'), 'a.pdf').expect(201);
    expect(uploads.calls[1].req).toBeUndefined();
  });

  it.each(['download', 'view'])('serves /%s with safe, non-cacheable headers and the exact bytes', async (route) => {
    const examId = randomUUID(), versionId = randomUUID();
    const res = await request(app.getHttpServer()).get(`/api/v1/exams/${examId}/versions/${versionId}/${route}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-length']).toBe(String(Buffer.from('%PDF-1.4 hola').length));
    expect(res.headers['content-disposition']).toMatch(new RegExp(`^${route === 'download' ? 'attachment' : 'inline'}; filename="informe.pdf"`));
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect((res.body as Buffer).toString()).toBe('%PDF-1.4 hola');
    expect(files.calls[0].slice(1, 4)).toEqual([examId, versionId, route === 'download' ? 'DOWNLOAD' : 'VIEW']);
  });

  it('rejects non-UUID identifiers with 400 before reaching the service', async () => {
    await request(app.getHttpServer()).get('/api/v1/exams/no-uuid/versions/tampoco/download').expect(400);
    expect(files.calls).toHaveLength(0);
  });

  it('builds Content-Disposition safely for hostile and non-ASCII names', () => {
    expect(contentDisposition('attachment', 'Exámen niño.pdf')).toBe(`attachment; filename="Ex_men ni_o.pdf"; filename*=UTF-8''Ex%C3%A1men%20ni%C3%B1o.pdf`);
    const hostile = contentDisposition('inline', 'a"b\r\nX-Evil: 1\\c.pdf');
    expect(hostile).not.toMatch(/[\r\n]/);
    expect(hostile.split('"')).toHaveLength(3); // una sola comilla de apertura y cierre
    expect(contentDisposition('inline', '   ')).toContain('filename="documento"');
    expect(contentDisposition('inline', "o'brien (1)*.png")).toContain("filename*=UTF-8''o%27brien%20%281%29%2A.png");
  });

  it('documents both endpoints in OpenAPI, including the multipart body', async () => {
    const doc = (await request(app.getHttpServer()).get('/api/openapi.json').expect(200)).body;
    const op = doc.paths['/api/v1/exams/uploads'].post;
    expect(op.operationId).toBe('uploadExam');
    expect(op.requestBody.content['multipart/form-data'].schema.properties.file).toMatchObject({ type: 'string', format: 'binary' });
    expect(op.responses).toHaveProperty('201'); expect(op.responses).toHaveProperty('413');
    expect(doc.paths['/api/v1/exams/{examId}/versions/{versionId}/download'].get.operationId).toBe('downloadExamVersion');
    expect(doc.paths['/api/v1/exams/{examId}/versions/{versionId}/view'].get.operationId).toBe('viewExamVersion');
  });
});
