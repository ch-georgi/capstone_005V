import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('Patients API against disposable PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  const clinicA = randomUUID(), clinicB = randomUUID();
  const adminA = randomUUID(), clinicianA = randomUUID(), adminB = randomUUID(), superadmin = randomUUID();
  const accountA = randomUUID(), accountB = randomUUID(), accountOtherClinic = randomUUID(), notPatient = clinicianA;
  const password = 'Integration-password-123';
  const email = (id: string) => `${id}@example.com`;
  const login = async (id: string, clinicId?: string) => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email(id), password, clinicId }).expect(200);
    return response.body.accessToken as string;
  };
  const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, token: string) =>
    request(app.getHttpServer())[method](`/api/v1${path}`).auth(token, { type: 'bearer' });
  const patientBody = (userId: string, extra = {}) => ({
    userId, firstName: ' María ', lastName: 'González', dateOfBirth: '1990-05-17',
    medicalRecordNumber: `F-${randomUUID().slice(0, 8)}`, ...extra,
  });

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_schema_test') || process.env.DATABASE_URL !== url) throw new Error('Disposable database required');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    await db.clinic.createMany({ data: [clinicA, clinicB].map(id => ({ id, name: 'Patients synthetic clinic', code: id })) });
    const passwordHash = await new PasswordService().hash(password);
    const users = [adminA, clinicianA, adminB, superadmin, accountA, accountB, accountOtherClinic];
    await db.user.createMany({ data: users.map(id => ({ id, email: email(id), passwordHash, isSystemAdmin: id === superadmin })) });
    await db.userClinic.createMany({ data: [
      { userId: adminA, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin A' },
      { userId: clinicianA, clinicId: clinicA, role: TenantRole.CLINICIAN, displayName: 'Clinician A' },
      { userId: adminB, clinicId: clinicB, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin B' },
      { userId: accountA, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient A' },
      { userId: accountB, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient B' },
      { userId: accountOtherClinic, clinicId: clinicB, role: TenantRole.PATIENT, displayName: 'Patient of B' },
    ] });
  });
  afterAll(async () => { await app?.close(); });

  it('creates a patient record in the JWT clinic and normalizes input', async () => {
    const token = await login(adminA, clinicA);
    const response = await api('post', '/patients', token).send(patientBody(accountA, { email: ' MARIA@Example.com ', phone: '' })).expect(201);
    expect(response.body).toMatchObject({ userId: accountA, clinicId: clinicA, firstName: 'María', lastName: 'González',
      dateOfBirth: '1990-05-17', email: 'maria@example.com', phone: null });
    expect(Object.keys(response.body).sort()).toEqual(['id', 'userId', 'clinicId', 'firstName', 'lastName', 'dateOfBirth', 'email', 'phone', 'medicalRecordNumber', 'createdAt', 'updatedAt'].sort());
    expect(await db.patient.count({ where: { id: response.body.id, clinicId: clinicA } })).toBe(1);
  });

  it('rejects accounts that are not PATIENT members of the JWT clinic, without leaking other clinics', async () => {
    const token = await login(adminA, clinicA);
    await api('post', '/patients', token).send(patientBody(notPatient)).expect(404);
    await api('post', '/patients', token).send(patientBody(accountOtherClinic)).expect(404);
    await api('post', '/patients', token).send(patientBody(randomUUID())).expect(404);
  });

  it('rejects a second record for the same account and a duplicated medical record number', async () => {
    const token = await login(adminA, clinicA);
    const again = await api('post', '/patients', token).send(patientBody(accountA)).expect(409);
    expect(again.body.code).toBe('PATIENT_ALREADY_EXISTS');
    const first = patientBody(accountB, { medicalRecordNumber: 'DUP-001' });
    await api('post', '/patients', token).send(first).expect(201);
    const extraAccount = randomUUID();
    await db.user.create({ data: { id: extraAccount, email: email(extraAccount), passwordHash: 'x' } });
    await db.userClinic.create({ data: { userId: extraAccount, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Extra' } });
    const dup = await api('post', '/patients', token).send(patientBody(extraAccount, { medicalRecordNumber: 'DUP-001' })).expect(409);
    expect(dup.body.code).toBe('MEDICAL_RECORD_NUMBER_DUPLICATE');
  });

  it('validates input strictly', async () => {
    const token = await login(adminA, clinicA);
    await api('post', '/patients', token).send(patientBody(accountA, { clinicId: clinicB })).expect(400);
    await api('post', '/patients', token).send(patientBody(accountA, { dateOfBirth: '2999-01-01' })).expect(400);
    await api('post', '/patients', token).send(patientBody(accountA, { dateOfBirth: '1990-02-31' })).expect(400);
    await api('post', '/patients', token).send(patientBody(accountA, { firstName: '   ' })).expect(400);
  });

  it('lets clinicians read but not write; blocks the global admin and anonymous callers', async () => {
    const clinician = await login(clinicianA, clinicA);
    const list = await api('get', '/patients', clinician).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(2);
    expect(list.body.items.every((p: { clinicId: string }) => p.clinicId === clinicA)).toBe(true);
    await api('get', `/patients/${list.body.items[0].id}`, clinician).expect(200);
    await api('post', '/patients', clinician).send(patientBody(accountA)).expect(403);
    await api('patch', `/patients/${list.body.items[0].id}`, clinician).send({ phone: '1' }).expect(403);
    await api('delete', `/patients/${list.body.items[0].id}`, clinician).expect(403);
    await api('get', '/patients', await login(superadmin)).expect(403);
    await request(app.getHttpServer()).get('/api/v1/patients').expect(401);
  });

  it('filters by search and paginates in a stable order', async () => {
    const token = await login(adminA, clinicA);
    const page = await api('get', '/patients?limit=1&offset=0', token).expect(200);
    expect(page.body).toMatchObject({ limit: 1, offset: 0 });
    expect(page.body.items).toHaveLength(1);
    const found = await api('get', '/patients?search=DUP-001', token).expect(200);
    expect(found.body.total).toBe(1);
    await api('get', '/patients?limit=500', token).expect(400);
  });

  it('isolates clinics: admin of B cannot see, change or delete patients of A', async () => {
    const tokenA = await login(adminA, clinicA);
    const created = await api('get', '/patients', tokenA).expect(200);
    const target = created.body.items[0].id as string;
    const tokenB = await login(adminB, clinicB);
    await api('get', `/patients/${target}`, tokenB).expect(404);
    await api('patch', `/patients/${target}`, tokenB).send({ firstName: 'Hack' }).expect(404);
    await api('delete', `/patients/${target}`, tokenB).expect(404);
    const listB = await api('get', '/patients', tokenB).expect(200);
    expect(listB.body.items.some((p: { id: string }) => p.id === target)).toBe(false);
    expect((await db.patient.findFirstOrThrow({ where: { id: target } })).firstName).not.toBe('Hack');
  });

  it('updates partially, clears optional fields and rejects empty updates', async () => {
    const token = await login(adminA, clinicA);
    const target = (await api('get', '/patients?search=DUP-001', token).expect(200)).body.items[0].id as string;
    const updated = await api('patch', `/patients/${target}`, token).send({ phone: ' +56911112222 ', email: 'x@example.com' }).expect(200);
    expect(updated.body).toMatchObject({ phone: '+56911112222', email: 'x@example.com', lastName: 'González' });
    const cleared = await api('patch', `/patients/${target}`, token).send({ email: null }).expect(200);
    expect(cleared.body.email).toBeNull();
    expect((await api('patch', `/patients/${target}`, token).send({}).expect(400)).body.code).toBe('EMPTY_UPDATE');
    await api('patch', `/patients/${target}`, token).send({ userId: accountA }).expect(400);
  });

  it('deletes logically: hidden for staff but preserved in the database', async () => {
    const token = await login(adminA, clinicA);
    const target = (await api('get', '/patients?search=DUP-001', token).expect(200)).body.items[0].id as string;
    await api('delete', `/patients/${target}`, token).expect(204);
    await api('get', `/patients/${target}`, token).expect(404);
    await api('delete', `/patients/${target}`, token).expect(404);
    expect((await api('get', '/patients?search=DUP-001', token).expect(200)).body.total).toBe(0);
    const row = await db.patient.findFirstOrThrow({ where: { id: target } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedBy).toBe(adminA);
  });
});