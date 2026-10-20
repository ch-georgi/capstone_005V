import { INestApplication, Injectable } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configureApplication } from '../../src/config/application';
import { validateEnvironment } from '../../src/config/environment';
import { UserMembersService } from '../../src/modules/users/user-members.service';
import { UsersController } from '../../src/modules/users/users.controller';
import { UsersService } from '../../src/modules/users/users.service';

@Injectable() class FakeMembers { calls: any[] = [];
  async list(...a: unknown[]) { this.calls.push(['list', ...a]); return { items: [], total: 0, limit: 0, offset: 0 }; }
  async get(...a: unknown[]) { this.calls.push(['get', ...a]); return { id: 'x' }; }
  async update(...a: unknown[]) { this.calls.push(['update', ...a]); return { id: 'x' }; } }

describe('HTTP layer of clinic member management (sin base de datos)', () => {
  let app: INestApplication; const members = new FakeMembers();
  const tenant = { kind: 'TENANT', actorId: 'actor', clinicId: 'clinic', role: 'CLINIC_ADMIN', access: 'READ_WRITE' };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment })],
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: {} }, { provide: UserMembersService, useValue: members }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => { req.authContext = tenant; next(); });
    configureApplication(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { members.calls = []; });
  const http = () => request(app.getHttpServer());
  const id = randomUUID();

  it('lists with defaults and converts query strings (including isActive=false)', async () => {
    await http().get('/api/v1/users').expect(200);
    expect(members.calls[0][2]).toMatchObject({ limit: 50, offset: 0 });
    await http().get('/api/v1/users?limit=5&offset=10&role=PATIENT&isActive=false&q=%20ana%20').expect(200);
    expect(members.calls[1][2]).toMatchObject({ limit: 5, offset: 10, role: 'PATIENT', isActive: false, q: 'ana' });
  });

  it.each(['limit=0', 'limit=101', 'offset=-1', 'role=ROOT', 'isActive=maybe', 'q=', 'foo=1'])('rejects list query %s with 400', async (qs) => {
    await http().get(`/api/v1/users?${qs}`).expect(400);
    expect(members.calls).toHaveLength(0);
  });

  it('GET and PATCH pass the context, the id and request info', async () => {
    await http().get(`/api/v1/users/${id}`).expect(200, { id: 'x' });
    expect(members.calls[0]).toEqual(['get', tenant, id]);
    await http().patch(`/api/v1/users/${id}`).send({ displayName: '  Nuevo  ', role: 'CLINICIAN', isActive: false }).expect(200);
    expect(members.calls[1].slice(0, 4)).toEqual(['update', tenant, id, { displayName: 'Nuevo', role: 'CLINICIAN', isActive: false }]);
    expect(members.calls[1][4]).toHaveProperty('userAgent');
  });

  it.each([
    ['PATIENT role', { role: 'PATIENT' }],
    ['unknown role', { role: 'ROOT' }],
    ['blank name', { displayName: '   ' }],
    ['name too long', { displayName: 'x'.repeat(101) }],
    ['non-boolean isActive', { isActive: 'false' }],
    ['unknown field', { email: 'otro@example.com' }],
    ['password field', { password: 'x'.repeat(14) }],
  ])('rejects PATCH with %s with 400', async (_n, body) => {
    await http().patch(`/api/v1/users/${id}`).send(body).expect(400);
    expect(members.calls).toHaveLength(0);
  });

  it('rejects malformed ids', async () => {
    await http().get('/api/v1/users/xyz').expect(400);
    await http().patch('/api/v1/users/xyz').send({ isActive: false }).expect(400);
    expect(members.calls).toHaveLength(0);
  });
});
