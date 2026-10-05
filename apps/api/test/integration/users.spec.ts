import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import { UsersService } from '../../src/modules/users/users.service';
import { bootstrapAdmin } from '../../src/modules/users/bootstrap-admin';

describe('API creation and bootstrap against disposable PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let jwt: JwtService;
  const clinicA = randomUUID(), clinicB = randomUUID();
  const admin = randomUUID(), superadmin = randomUUID(), clinician = randomUUID(), patient = randomUUID();
  const password = 'Integration-password-123';
  const email = (id: string) => `${id}@example.com`;
  const body = (extra = {}) => ({ email: email(randomUUID()), password, displayName: ' Profesional de prueba ', role: 'CLINICIAN', ...extra });
  const login = async (id: string, clinicId?: string, accountEmail = email(id)) => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: accountEmail, password, clinicId }).expect(200);
    return response.body.accessToken as string;
  };
  const post = (path: string, token: string, data: ReturnType<typeof body>) => request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(data);
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_schema_test') || process.env.DATABASE_URL !== url) throw new Error('Disposable database required');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    jwt = app.get(JwtService);
    await db.clinic.createMany({ data: [clinicA, clinicB].map(id => ({ id, name: 'API synthetic clinic', code: id })) });
    const passwordHash = await new PasswordService().hash(password);
    await db.user.createMany({ data: [admin, superadmin, clinician, patient].map(id => ({ id, email: email(id), passwordHash, isSystemAdmin: id === superadmin })) });
    await db.userClinic.createMany({ data: [
      { userId: admin, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin A' },
      { userId: clinician, clinicId: clinicA, role: TenantRole.CLINICIAN, displayName: 'Clinician A' },
      { userId: patient, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient A' },
    ] });
  });
  beforeEach(async () => {
    await db.clinic.updateMany({ where: { id: { in: [clinicA, clinicB] } }, data: { isActive: true } });
    await db.userClinic.update({ where: { userId_clinicId: { userId: admin, clinicId: clinicA } }, data: { isActive: true, role: TenantRole.CLINIC_ADMIN } });
    await db.user.update({ where: { id: superadmin }, data: { isSystemAdmin: true } });
  });
  afterAll(async () => { await app?.close(); });

  it.each(Object.values(TenantRole))('creates %s atomically within the JWT clinic without a patient record', async role => {
    const input = body({ role });
    const response = await post('/api/v1/users', await login(admin, clinicA), { ...input, email: ` ${input.email.toUpperCase()} ` }).expect(201);
    expect(response.body).toMatchObject({ email: input.email, clinicId: clinicA, role, displayName: 'Profesional de prueba', isActive: true });
    expect(Object.keys(response.body).sort()).toEqual(['id', 'email', 'clinicId', 'displayName', 'role', 'isActive', 'createdAt'].sort());
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    const user = await db.user.findUniqueOrThrow({ where: { id: response.body.id }, include: { userClinics: true } });
    expect(user.isSystemAdmin).toBe(false);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await new PasswordService().verify(user.passwordHash!, password)).toBe(true);
    expect(user.userClinics).toHaveLength(1);
    expect(await db.patient.count({ where: { userId: user.id } })).toBe(0);
    await login(user.id, clinicA, input.email);
  });
  it('rejects duplicates globally after email normalization', async () => {
    const input = body();
    const token = await login(admin, clinicA);
    await post('/api/v1/users', token, input).expect(201);
    const response = await post(`/api/v1/clinics/${clinicB}/users`, await login(superadmin), { ...input, email: ` ${input.email.toUpperCase()} ` }).expect(409);
    expect(response.body.code).toBe('EMAIL_DUPLICATE');
    expect(await db.user.count({ where: { email: input.email } })).toBe(1);
  });
  it('allows only one concurrent request for the same email across clinics', async () => {
    const input = body();
    const token = await login(superadmin);
    const responses = await Promise.all([clinicA, clinicB].map(id => post(`/api/v1/clinics/${id}/users`, token, input)));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const user = await db.user.findUniqueOrThrow({ where: { email: input.email }, include: { userClinics: true } });
    expect(user.userClinics).toHaveLength(1);
  });
  it('rolls back User if membership creation fails', async () => {
    const input = body();
    await expect(app.get(UsersService).create({ kind: 'TENANT', actorId: admin, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, access: 'READ_WRITE' },
      { ...input, role: 'INVALID' as TenantRole })).rejects.toThrow();
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
  });
  it('rejects clinician and patient creation, cross-tenant targeting, and forged body privileges', async () => {
    for (const id of [clinician, patient]) await post('/api/v1/users', await login(id, clinicA), body()).expect(403);
    const token = await login(admin, clinicA);
    await post(`/api/v1/clinics/${clinicB}/users`, token, body()).expect(403);
    for (const extra of [{ clinicId: clinicB }, { isSystemAdmin: true }, { role: 'SYSTEM_ADMIN' }]) {
      const input = body(extra);
      await post('/api/v1/users', token, input).expect(400);
      expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
    }
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email(admin), password, clinicId: clinicB }).expect(403);
  });
  it('applies role/activity changes to existing tokens and rejects stale service contexts', async () => {
    const token = await login(admin, clinicA);
    await db.userClinic.update({ where: { userId_clinicId: { userId: admin, clinicId: clinicA } }, data: { role: TenantRole.CLINICIAN } });
    await post('/api/v1/users', token, body()).expect(403);
    const input = body();
    await expect(app.get(UsersService).create({ kind: 'TENANT', actorId: admin, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, access: 'READ_WRITE' },
      { ...input, role: TenantRole.CLINICIAN })).rejects.toMatchObject({ status: 403 });
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
    await db.userClinic.update({ where: { userId_clinicId: { userId: admin, clinicId: clinicA } }, data: { role: TenantRole.CLINIC_ADMIN, isActive: false } });
    await post('/api/v1/users', token, body()).expect(403);
  });
  it('superadmin administers A and B without memberships and cannot use the tenant route', async () => {
    const token = await login(superadmin);
    expect(await db.userClinic.count({ where: { userId: superadmin } })).toBe(0);
    for (const clinic of [clinicA, clinicB]) await post(`/api/v1/clinics/${clinic}/users`, token, body()).expect(201);
    await post('/api/v1/users', token, body()).expect(403);
    await post(`/api/v1/clinics/${randomUUID()}/users`, token, body()).expect(404);
    await post('/api/v1/clinics/not-a-uuid/users', token, body()).expect(400);
    await db.clinic.update({ where: { id: clinicB }, data: { isActive: false } });
    await post(`/api/v1/clinics/${clinicB}/users`, token, body()).expect(403);
    await db.user.update({ where: { id: superadmin }, data: { isSystemAdmin: false } });
    await post(`/api/v1/clinics/${clinicA}/users`, token, body()).expect(403);
  });
  it('persists historical patient read-only login with an inactive clinic and membership', async () => {
    const patientId = randomUUID();
    await db.patient.create({ data: { id: patientId, userId: patient, clinicId: clinicA, firstName: 'Synthetic', lastName: 'Patient', dateOfBirth: new Date('2000-01-01') } });
    await db.patient.update({ where: { id: patientId }, data: { deletedAt: new Date(), deletedBy: admin } });
    await db.userClinic.update({ where: { userId_clinicId: { userId: patient, clinicId: clinicA } }, data: { isActive: false } });
    await db.clinic.update({ where: { id: clinicA }, data: { isActive: false } });
    const token = await login(patient, clinicA);
    expect(jwt.decode(token)).toMatchObject({ context: 'TENANT', clinicId: clinicA });
    await post('/api/v1/users', token, body()).expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email(admin), password, clinicId: clinicA }).expect(403);
  });
  it('bootstraps without membership, repeats without password change and rejects promotion of ordinary accounts', async () => {
    const newEmail = email(randomUUID());
    const created = await bootstrapAdmin(db, ` ${newEmail.toUpperCase()} `, password);
    expect(created.created).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(user.isSystemAdmin).toBe(true);
    expect(await db.userClinic.count({ where: { userId: user.id } })).toBe(0);
    const repeated = await bootstrapAdmin(db, newEmail, 'another-password-123');
    expect(repeated).toEqual({ id: user.id, created: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(user.passwordHash);
    await expect(bootstrapAdmin(db, email(admin), password)).rejects.toThrow('no se promueve');
    expect((await db.user.findUniqueOrThrow({ where: { id: admin } })).isSystemAdmin).toBe(false);
    await login(user.id, undefined, newEmail);
  });
});
