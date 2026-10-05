import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication, createOpenApiDocument } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import { CurrentContext, RequireAccess } from '../../src/common/decorators/access';
import { AuthContext } from '../../src/common/types/auth-context';

const actor = '00000003-0000-4000-8000-000000000001';
const clinic = '00000001-0000-4000-8000-000000000001';
const otherClinic = '00000001-0000-4000-8000-000000000002';
@Controller('test')
class ProbeController {
  @Get('clinical') @RequireAccess({ roles: Object.values(TenantRole) })
  read(@CurrentContext() context: AuthContext) { return context; }
  @Get('write') @RequireAccess({ roles: Object.values(TenantRole), write: true })
  write(@CurrentContext() context: AuthContext) { return context; }
  @Get('unconfigured') unconfigured() { return {}; }
}

describe('HTTP guards, DTOs and OpenAPI (database mocked)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let user: { id: string; email: string; passwordHash: string | null; isSystemAdmin: boolean };
  let membership: { role: TenantRole; isActive: boolean; clinic: { isActive: boolean }; patient: null | { deletedAt: Date | null } };
  const prisma = { user: { findUnique: jest.fn() }, userClinic: { findUnique: jest.fn() } };
  const login = (extra: Record<string, unknown> = {}) => request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: ' ADMIN@EXAMPLE.COM ', password: 'Demo1234!', clinicId: clinic, ...extra });
  const create = (token?: string, input: Record<string, unknown> = {}) => {
    const req = request(app.getHttpServer()).post('/api/v1/users');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ email: 'new@example.com', password: 'valid-password-12', displayName: 'New', role: 'CLINICIAN', ...input });
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    jwt = app.get(JwtService);
    user = { id: actor, email: 'admin@example.com', passwordHash: await new PasswordService().hash('Demo1234!'), isSystemAdmin: false };
  });
  beforeEach(() => {
    user.isSystemAdmin = false;
    membership = { role: TenantRole.CLINIC_ADMIN, isActive: true, clinic: { isActive: true }, patient: null };
    prisma.user.findUnique.mockImplementation(async ({ where }) => where.id === actor || where.email === user.email ? user : null);
    prisma.userClinic.findUnique.mockImplementation(async ({ where }) => where.userId_clinicId.clinicId === clinic ? membership : null);
  });
  afterAll(async () => { await app?.close(); });

  it('normalizes email and issues a clinic-bound token with 15 minute expiration', async () => {
    const response = await login().expect(200);
    expect(response.body).toEqual({ accessToken: expect.any(String), tokenType: 'Bearer', expiresIn: 900 });
    const payload = jwt.decode(response.body.accessToken);
    expect(payload).toMatchObject({ sub: actor, context: 'TENANT', clinicId: clinic, iss: 'wellq-test', aud: 'wellq-test-clients' });
    expect(payload.exp - payload.iat).toBe(900);
  });
  it('rejects wrong credentials and pending users with the same generic response', async () => {
    const wrong = await login({ password: 'wrong' }).expect(401);
    const unknown = await login({ email: 'unknown@example.com' }).expect(401);
    const hash = user.passwordHash;
    user.passwordHash = null;
    const pending = await login().expect(401);
    user.passwordHash = hash;
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body).toEqual(pending.body);
  });
  it('requires clinic selection for ordinary users and membership for any clinical session', async () => {
    expect((await login({ clinicId: undefined }).expect(400)).body.code).toBe('CLINIC_REQUIRED');
    await login({ clinicId: otherClinic }).expect(403);
    user.isSystemAdmin = true;
    await login({ clinicId: otherClinic }).expect(403);
    const global = await login({ clinicId: undefined }).expect(200);
    expect(jwt.decode(global.body.accessToken)).toMatchObject({ context: 'GLOBAL' });
    expect(jwt.decode(global.body.accessToken).clinicId).toBeUndefined();
  });
  it('blocks inactive staff; patients with a historical record retain read only access', async () => {
    membership.isActive = false;
    await login().expect(403);
    membership.isActive = true;
    membership.clinic.isActive = false;
    await login().expect(403);
    membership.role = TenantRole.PATIENT;
    membership.patient = { deletedAt: new Date() };
    const response = await login().expect(200);
    const token = response.body.accessToken;
    const read = await request(app.getHttpServer()).get('/api/v1/test/clinical').auth(token, { type: 'bearer' }).expect(200);
    expect(read.body.access).toBe('READ_ONLY');
    await request(app.getHttpServer()).get('/api/v1/test/write').auth(token, { type: 'bearer' }).expect(403);
    await create(token).expect(403);
  });
  it('rechecks role and activity on every request, and never trusts role claims', async () => {
    const token = (await login()).body.accessToken;
    membership.role = TenantRole.CLINICIAN;
    await create(token).expect(403);
    const forgedRole = await jwt.signAsync({ sub: actor, context: 'TENANT', clinicId: clinic, role: 'CLINIC_ADMIN' });
    await create(forgedRole).expect(403);
    membership.isActive = false;
    await request(app.getHttpServer()).get('/api/v1/test/clinical').auth(token, { type: 'bearer' }).expect(403);
  });
  it('global privilege does not bypass clinical permissions and is rechecked after revocation', async () => {
    user.isSystemAdmin = true;
    const token = (await login({ clinicId: undefined })).body.accessToken;
    await create(token).expect(403);
    await request(app.getHttpServer()).get('/api/v1/test/clinical').auth(token, { type: 'bearer' }).expect(403);
    user.isSystemAdmin = false;
    await request(app.getHttpServer()).post(`/api/v1/clinics/${clinic}/users`).auth(token, { type: 'bearer' }).send({}).expect(403);
  });
  it('rejects missing, tampered, expired, wrong issuer/audience/algorithm and malformed claims', async () => {
    await create().expect(401);
    const session = { sub: actor, context: 'TENANT', clinicId: clinic };
    const tokens = [
      'malformed', (await jwt.signAsync(session)) + 'tamper',
      await jwt.signAsync(session, { expiresIn: -1 }),
      await jwt.signAsync(session, { issuer: 'wrong' }),
      await jwt.signAsync(session, { audience: 'wrong' }),
      await jwt.signAsync(session, { algorithm: 'HS384' }),
      await jwt.signAsync({ ...session, sub: 'not-a-uuid' }),
      await jwt.signAsync({ ...session, context: 'GLOBAL' }),
      await jwt.signAsync(session, { noTimestamp: true }),
    ];
    for (const token of tokens) expect((await create(token).expect(401)).body.code).toBe('UNAUTHORIZED');
  });
  it('rejects extra fields, invalid roles, invalid passwords and blank names before writing', async () => {
    const token = (await login()).body.accessToken;
    for (const input of [{ isSystemAdmin: true }, { clinicId: otherClinic }, { role: 'SYSTEM_ADMIN' },
      { password: 'short' }, { password: 'a'.repeat(129) }, { displayName: '   ' }, { email: 'bad' }]) {
      const response = await create(token, input).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(response.body).sort()).toEqual(['code', 'message', 'statusCode']);
    }
    await login({ clinicId: null }).expect(400);
    await login({ unexpected: true }).expect(400);
  });
  it('denies protected routes without an explicit policy', async () => {
    const token = (await login()).body.accessToken;
    await request(app.getHttpServer()).get('/api/v1/test/unconfigured').auth(token, { type: 'bearer' }).expect(403);
  });
  it('serves Swagger and documents real paths, DTOs, statuses and bearer security', async () => {
    await request(app.getHttpServer()).get('/api/docs/').expect(200);
    const { body: document } = await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
    expect(document.info).toMatchObject({ title: 'WellQ API', version: '0.1.0' });
    expect(document.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    expect(document.paths['/api/v1/auth/login'].post.security ?? []).toEqual([]);
    expect(document.paths['/api/v1/users'].post.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/api/v1/users'].post.operationId).toBe('createTenantUser');
    for (const status of ['201', '400', '401', '403', '409']) expect(document.paths['/api/v1/users'].post.responses[status]).toBeDefined();
    expect(document.paths['/api/v1/clinics/{clinicId}/users'].post.responses['404']).toBeDefined();
    const schema = document.components.schemas.CreateUserDto;
    expect(schema.required.sort()).toEqual(['displayName', 'email', 'password', 'role']);
    expect(schema.properties.password).toMatchObject({ writeOnly: true, minLength: 12, maxLength: 128 });
    expect(document.components.schemas.TenantRole.enum.sort()).toEqual(Object.values(TenantRole).sort());
    expect(document.components.schemas.CreatedUserDto.properties.password).toBeUndefined();
    expect(JSON.stringify(document)).not.toContain('passwordHash');
    expect(createOpenApiDocument(app).paths).toHaveProperty('/api/v1/users');
  });
  it('does not expose UI or JSON when Swagger is disabled', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma).compile();
    const disabled = module.createNestApplication();
    disabled.get(ConfigService).set('SWAGGER_ENABLED', false);
    configureApplication(disabled);
    await disabled.init();
    try {
      await request(disabled.getHttpServer()).get('/api/docs/').expect(404);
      await request(disabled.getHttpServer()).get('/api/openapi.json').expect(404);
    } finally { await disabled.close(); }
  });
});
