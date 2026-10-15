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
import { ExamsService } from '../../src/modules/exams/exams.service';

@Injectable() class FakeExams { calls: any[] = [];
  async listForPatient(...a: unknown[]) { this.calls.push(['list', ...a]); return { items: [], total: 0, limit: 0, offset: 0 }; }
  async get(...a: unknown[]) { this.calls.push(['get', ...a]); return { id: 'x' }; } }
@Injectable() class FakeTypes { async listActive() { return { items: [] }; } }

describe('HTTP layer of exam reads (sin base de datos)', () => {
  let app: INestApplication; const exams = new FakeExams();
  const tenant = { kind: 'TENANT', actorId: 'actor', clinicId: 'clinic', role: 'PATIENT', access: 'READ_ONLY' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment })],
      controllers: [ExamsController, ExamTypesController],
      providers: [{ provide: ExamsService, useValue: exams }, { provide: ExamTypesService, useValue: new FakeTypes() }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => { req.authContext = tenant; next(); });
    configureApplication(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { exams.calls = []; });
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
});
