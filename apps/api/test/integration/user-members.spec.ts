import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('Clinic member management API against disposable PostgreSQL', () => {
  let app: INestApplication; let db: PrismaService;
  const clinicA = randomUUID(), clinicB = randomUUID();
  const adminA = randomUUID(), adminA2 = randomUUID(), clinicianA = randomUUID(), clinicianA2 = randomUUID(), adminB = randomUUID(), userP1 = randomUUID();
  const patient1 = randomUUID();
  const password = 'Integration-password-123';
  const email = (id: string) => `${id}@example.com`;
  const login = async (id: string, clinicId: string) =>
    (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email(id), password, clinicId }).expect(200)).body.accessToken as string;
  const api = (method: 'get' | 'patch', token: string, path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).auth(token, { type: 'bearer' });

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_schema_test') || process.env.DATABASE_URL !== url) throw new Error('Disposable database required');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
    db = app.get(PrismaService);
    await db.clinic.createMany({ data: [clinicA, clinicB].map((id) => ({ id, name: 'Members synthetic clinic', code: id })) });
    const passwordHash = await new PasswordService().hash(password);
    await db.user.createMany({ data: [adminA, adminA2, clinicianA, clinicianA2, adminB, userP1].map((id) => ({ id, email: email(id), passwordHash })) });
    await db.userClinic.createMany({ data: [
      { userId: adminA, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, displayName: 'Zeta Admin' },
      { userId: adminA2, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, displayName: 'Alfa Admin Dos' },
      { userId: clinicianA, clinicId: clinicA, role: TenantRole.CLINICIAN, displayName: 'Clinico Uno' },
      { userId: clinicianA2, clinicId: clinicA, role: TenantRole.CLINICIAN, displayName: 'Clinico Dos' },
      { userId: adminB, clinicId: clinicB, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin B' },
      { userId: userP1, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Paciente Uno' },
    ] });
    await db.patient.create({ data: { id: patient1, userId: userP1, clinicId: clinicA, firstName: 'Ana', lastName: 'Uno', dateOfBirth: new Date('1990-01-01T00:00:00Z') } });
  });
  afterAll(async () => { await app?.close(); });

  it('lists only the clinic\'s members, sorted by name, with filters, and never leaks credentials', async () => {
    const admin = await login(adminA, clinicA);
    const all = (await api('get', admin, '/users').expect(200)).body;
    expect(all.total).toBe(5);
    const names = all.items.map((m: any) => m.displayName);
    expect(names).toEqual([...names].sort((x: string, y: string) => x.localeCompare(y)));
    expect(all.items.every((m: any) => m.hasCredentials === true)).toBe(true);
    expect(JSON.stringify(all)).not.toMatch(/password|hash/i);
    expect(all.items.map((m: any) => m.id)).not.toContain(adminB);
    const patientRow = all.items.find((m: any) => m.id === userP1);
    expect(patientRow).toMatchObject({ role: 'PATIENT', patientId: patient1 });
    expect((await api('get', admin, '/users?role=CLINICIAN').expect(200)).body.total).toBe(2);
    expect((await api('get', admin, '/users?q=alfa').expect(200)).body.items.map((m: any) => m.id)).toEqual([adminA2]);
    expect((await api('get', admin, `/users?q=${email(clinicianA).slice(0, 8)}`).expect(200)).body.items.map((m: any) => m.id)).toEqual([clinicianA]);
    expect((await api('get', admin, '/users?limit=2&offset=1').expect(200)).body).toMatchObject({ total: 5, limit: 2, offset: 1 });
  });

  it('is reserved to clinic admins and isolated per clinic', async () => {
    const clinician = await login(clinicianA, clinicA), patient = await login(userP1, clinicA), other = await login(adminB, clinicB);
    await api('get', clinician, '/users').expect(403);
    await api('get', patient, '/users').expect(403);
    await api('patch', clinician, `/users/${clinicianA2}`).send({ isActive: false }).expect(403);
    await api('get', other, `/users/${clinicianA}`).expect(404);
    await api('patch', other, `/users/${clinicianA}`).send({ isActive: false }).expect(404);
    expect((await api('get', other, '/users').expect(200)).body.total).toBe(1);
  });

  it('renames and changes role between staff roles, bumping the permission revision and auditing', async () => {
    const admin = await login(adminA, clinicA);
    const before = await db.userClinic.findUniqueOrThrow({ where: { userId_clinicId: { userId: clinicianA2, clinicId: clinicA } } });
    const res = await api('patch', admin, `/users/${clinicianA2}`).send({ displayName: '  Clinica Renombrada ', role: 'CLINIC_ADMIN' }).expect(200);
    expect(res.body).toMatchObject({ id: clinicianA2, displayName: 'Clinica Renombrada', role: 'CLINIC_ADMIN', isActive: true });
    const after = await db.userClinic.findUniqueOrThrow({ where: { userId_clinicId: { userId: clinicianA2, clinicId: clinicA } } });
    expect(after.permissionRevision > before.permissionRevision).toBe(true);
    const audits = await db.auditLog.findMany({ where: { clinicId: clinicA, action: 'UPDATE', actorId: adminA, metadata: { path: ['userId'], equals: clinicianA2 } } });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toMatchObject({ entity: 'USER_CLINIC', roleFrom: 'CLINICIAN', roleTo: 'CLINIC_ADMIN', changedFields: ['displayName', 'role'] });
    expect(audits[0].ipAddress).toBeTruthy();
    // sin cambios reales: no se audita de nuevo
    await api('patch', admin, `/users/${clinicianA2}`).send({ displayName: 'Clinica Renombrada' }).expect(200);
    expect(await db.auditLog.count({ where: { clinicId: clinicA, action: 'UPDATE', metadata: { path: ['userId'], equals: clinicianA2 } } })).toBe(1);
  });

  it('deactivates a member (access cut immediately) and reactivates it, never deleting the membership', async () => {
    const admin = await login(adminA, clinicA), clinician = await login(clinicianA, clinicA);
    await api('get', clinician, '/exam-types').expect(200);
    const off = await api('patch', admin, `/users/${clinicianA}`).send({ isActive: false }).expect(200);
    expect(off.body.isActive).toBe(false);
    expect((await api('get', clinician, '/exam-types').expect(403)).body.code).toBe('TENANT_INACTIVE');
    expect((await api('get', admin, '/users?isActive=false').expect(200)).body.items.map((m: any) => m.id)).toContain(clinicianA);
    await api('patch', admin, `/users/${clinicianA}`).send({ isActive: true }).expect(200);
    await api('get', clinician, '/exam-types').expect(200);
    expect(await db.userClinic.count({ where: { userId: clinicianA, clinicId: clinicA } })).toBe(1);
  });

  it('forbids self role change/deactivation, keeps patient roles fixed and rejects PATIENT as a target role', async () => {
    const admin = await login(adminA, clinicA);
    expect((await api('patch', admin, `/users/${adminA}`).send({ role: 'CLINICIAN' }).expect(409)).body.code).toBe('SELF_CHANGE_FORBIDDEN');
    expect((await api('patch', admin, `/users/${adminA}`).send({ isActive: false }).expect(409)).body.code).toBe('SELF_CHANGE_FORBIDDEN');
    await api('patch', admin, `/users/${adminA}`).send({ displayName: 'Zeta Admin' }).expect(200);
    expect((await api('patch', admin, `/users/${userP1}`).send({ role: 'CLINICIAN' }).expect(409)).body.code).toBe('PATIENT_ROLE_LOCKED');
    await api('patch', admin, `/users/${clinicianA}`).send({ role: 'PATIENT' }).expect(400);
    await api('patch', admin, `/users/${clinicianA}`).send({}).expect(400);
  });

  it('deactivating a patient member keeps their record and emits a PATIENT sync change with the audit tied to the record', async () => {
    const admin = await login(adminA, clinicA);
    await api('patch', admin, `/users/${userP1}`).send({ isActive: false }).expect(200);
    const sync = await db.syncChange.findMany({ where: { clinicId: clinicA, entity: 'PATIENT', entityId: patient1 }, orderBy: { revision: 'desc' }, take: 1 });
    expect(sync[0].payload).toMatchObject({ is_active: false });
    const audit = await db.auditLog.findFirst({ where: { clinicId: clinicA, patientId: patient1, action: 'UPDATE', metadata: { path: ['userId'], equals: userP1 } } });
    expect(audit).not.toBeNull();
    expect((await db.patient.findUniqueOrThrow({ where: { id: patient1 } })).deletedAt).toBeNull();
    await api('patch', admin, `/users/${userP1}`).send({ isActive: true }).expect(200);
  });
});
