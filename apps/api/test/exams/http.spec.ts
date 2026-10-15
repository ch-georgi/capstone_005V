import { INestApplication, Injectable } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configureApplication } from '../../src/config/application';
import { validateEnvironment } from '../../src/config/environment';
import { ExamTypesController } from '../../src/modules/exam-types/exam-types.controller';
import { ExamTypesService } from '../../src/modules/exam-types/exam-types.service';
import { ExamsController } from '../../src/modules/exams/exams.controller';
import { ExamManagementService } from '../../src/modules/exams/exam-management.service';
import { ExamsService } from '../../src/modules/exams/exams.service';

@Injectable() class FakeExams { calls: any[] = [];
  async listForPatient(...a: unknown[]) { this.calls.push(['list', ...a]); return { items: [], total: 0, limit: 0, offset: 0 }; }
  async get(...a: unknown[]) { this.calls.push(['get', ...a]); return { id: 'x' }; } }
@Injectable() class FakeManagement { calls: any[] = [];
  async update(...a: unknown[]) { this.calls.push(['update', ...a]); return { id: 'x' }; }
  async remove(...a: unknown[]) { this.calls.push(['remove', ...a]); } }
@Injectable() class FakeTypes { async listActive() { return { items: [] }; } }

describe('HTTP layer of exam reads (sin base de datos)', () => {
  let app: INestApplication; const exams = new FakeExams(), management = new FakeManagement();
  const tenant = { kind: 'TENANT', actorId: 'actor', clinicId: 'clinic', role: 'PATIENT', access: 'READ_ONLY' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment })],
      controllers: [ExamsController, ExamTypesController],
      providers: [{ provide: ExamsService, useValue: exams }, { provide: ExamManagementService, useValue: management }, { provide: ExamTypesService, useValue: new FakeTypes() }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => { req.authContext = tenant; next(); });
    configureApplication(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { exams.calls = []; management.calls = []; });
  const http = () => request(app.getHttpServer());
  const pid = randomUUID();

  it('GET /exam-types answers 200', async () => {
    await http().get('/api/v1/exam-types').expect(200, { items: [] });
  });

  it('applies default pagination and converts numeric query strings', async () => {
    await http().get(`/api/v1/patients/${pid}/exams`).expect(200);
    expect(exams.calls[0].slice(2, 4)).toEqual([pid, expect.objectContaining({ limit: 50, offset: 0 })]);
    await http().get(`/api/v1/patients/${pid}/exams?limit=5&offset=10&from=2026-01-01`).expect(200);
    expect(exams.calls[1][3]).toMatchObject({ limit: 5, offset: 10, from: '2026-01-01' });
  });

  it.each(['limit=0', 'limit=101', 'offset=-1', 'limit=abc', 'examTypeId=nope', 'from=2026-1-1', 'to=hoy', 'foo=1'])(
    'rejects query %s with 400', async (qs) => {
      await http().get(`/api/v1/patients/${pid}/exams?${qs}`).expect(400);
      expect(exams.calls).toHaveLength(0);
    });

  it('rejects malformed ids with 400 before reaching the service', async () => {
    await http().get('/api/v1/patients/xyz/exams').expect(400);
    await http().get('/api/v1/exams/xyz').expect(400);
    expect(exams.calls).toHaveLength(0);
  });

  it('GET /exams/:id passes the tenant context and id', async () => {
    const id = randomUUID();
    await http().get(`/api/v1/exams/${id}`).expect(200, { id: 'x' });
    expect(exams.calls[0]).toEqual(['get', tenant, id]);
  });

  describe('PATCH and DELETE /exams/:id', () => {
    const id = randomUUID();
    const patch = (body: unknown) => http().patch(`/api/v1/exams/${id}`).send(body as object);

    it('passes a valid partial body (including null to clear) and answers 200', async () => {
      await patch({ title: 'Nuevo', examDate: '2026-10-15', professionalName: null, notes: 'ok' }).expect(200, { id: 'x' });
      expect(management.calls[0].slice(0, 4)).toEqual(['update', tenant, id, { title: 'Nuevo', examDate: '2026-10-15', professionalName: null, notes: 'ok' }]);
      expect(management.calls[0][4]).toHaveProperty('userAgent');
    });

    it.each([
      ['unknown field', { patientId: randomUUID() }],
      ['null title', { title: null }],
      ['blank title', { title: '   ' }],
      ['title too long', { title: 'x'.repeat(201) }],
      ['null examDate', { examDate: null }],
      ['bad examDate format', { examDate: '15-10-2026' }],
      ['bad examTypeId', { examTypeId: 'nope' }],
      ['blank notes', { notes: '  ' }],
      ['notes too long', { notes: 'x'.repeat(2001) }],
      ['non-string professionalName', { professionalName: 5 }],
    ])('rejects %s with 400 before the service', async (_n, body) => {
      await patch(body).expect(400);
      expect(management.calls).toHaveLength(0);
    });

    it('rejects a malformed id', async () => {
      await http().patch('/api/v1/exams/xyz').send({ title: 'a' }).expect(400);
      await http().delete('/api/v1/exams/xyz').expect(400);
      expect(management.calls).toHaveLength(0);
    });

    it('DELETE answers 204 with an empty body', async () => {
      const res = await http().delete(`/api/v1/exams/${id}`).expect(204);
      expect(res.text).toBe('');
      expect(management.calls[0].slice(0, 3)).toEqual(['remove', tenant, id]);
    });
  });
});
