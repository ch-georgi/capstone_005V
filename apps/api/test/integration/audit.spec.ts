import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { AuditAction, TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('Audit and Timeline API against disposable PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  const clinicA = randomUUID(), clinicB = randomUUID();
  const adminA = randomUUID(), clinicianA = randomUUID(), adminB = randomUUID(), superadmin = randomUUID();
  const patientUserA = randomUUID(), patientUserB = randomUUID();
  let patientAId: string;
  let examTypeId: string;

  const password = 'Integration-password-123';
  const email = (id: string) => `${id}@example.com`;

  const login = async (id: string, clinicId?: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: email(id), password, clinicId })
      .expect(200);
    return response.body.accessToken as string;
  };

  const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, token: string) =>
    request(app.getHttpServer())[method](`/api/v1${path}`).auth(token, { type: 'bearer' });

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_schema_test') || process.env.DATABASE_URL !== url) {
      throw new Error('Disposable database required');
    }

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);

    await db.clinic.createMany({
      data: [
        { id: clinicA, name: 'Audit Synthetic Clinic A', code: clinicA },
        { id: clinicB, name: 'Audit Synthetic Clinic B', code: clinicB },
      ],
    });

    const passwordHash = await new PasswordService().hash(password);
    const users = [adminA, clinicianA, adminB, superadmin, patientUserA, patientUserB];
    await db.user.createMany({
      data: users.map((id) => ({
        id,
        email: email(id),
        passwordHash,
        isSystemAdmin: id === superadmin,
      })),
    });

    await db.userClinic.createMany({
      data: [
        { userId: adminA, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin A' },
        { userId: clinicianA, clinicId: clinicA, role: TenantRole.CLINICIAN, displayName: 'Clinician A' },
        { userId: adminB, clinicId: clinicB, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin B' },
        { userId: patientUserA, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient User A' },
        { userId: patientUserB, clinicId: clinicB, role: TenantRole.PATIENT, displayName: 'Patient User B' },
      ],
    });

    const examType = await db.examType.create({
      data: {
        code: `ET-${randomUUID().slice(0, 6)}`,
        name: 'Radiografía de Control',
      },
    });
    examTypeId = examType.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('records audit log automatically when creating, updating, and deleting a patient', async () => {
    const token = await login(adminA, clinicA);

    const resCreate = await api('post', '/patients', token)
      .send({
        userId: patientUserA,
        firstName: 'Carlos',
        lastName: 'Prueba',
        dateOfBirth: '1985-04-12',
        medicalRecordNumber: `MED-${randomUUID().slice(0, 6)}`,
      })
      .expect(201);

    patientAId = resCreate.body.id;

    const createLogs = await db.auditLog.findMany({
      where: { clinicId: clinicA, patientId: patientAId, action: AuditAction.CREATE },
    });
    expect(createLogs).toHaveLength(1);
    expect(createLogs[0].actorId).toBe(adminA);

    await api('patch', `/patients/${patientAId}`, token)
      .send({ firstName: 'Carlos Modificado' })
      .expect(200);

    const updateLogs = await db.auditLog.findMany({
      where: { clinicId: clinicA, patientId: patientAId, action: AuditAction.UPDATE },
    });
    expect(updateLogs).toHaveLength(1);
    expect(updateLogs[0].actorId).toBe(adminA);

    await api('delete', `/patients/${patientAId}`, token).expect(204);

    const deleteLogs = await db.auditLog.findMany({
      where: { clinicId: clinicA, patientId: patientAId, action: AuditAction.DELETE },
    });
    expect(deleteLogs).toHaveLength(1);
    expect(deleteLogs[0].actorId).toBe(adminA);
  });

  it('allows CLINIC_ADMIN to query audit logs with pagination and filters', async () => {
    const token = await login(adminA, clinicA);

    const list = await api('get', '/audit?limit=10&offset=0', token).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(3);
    expect(list.body.items.length).toBeGreaterThanOrEqual(3);
    expect(list.body.items.every((log: { clinicId: string }) => log.clinicId === clinicA)).toBe(true);

    const queryUrl = `/audit?action=${AuditAction.CREATE}&patientId=${patientAId}`;
    const filtered = await api('get', queryUrl, token).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].action).toBe(AuditAction.CREATE);
    expect(filtered.body.items[0].patientId).toBe(patientAId);
  });

  it('restricts GET /audit to CLINIC_ADMIN only; blocks CLINICIAN, superadmin and anonymous', async () => {
    const clinicianToken = await login(clinicianA, clinicA);
    await api('get', '/audit', clinicianToken).expect(403);

    const superadminToken = await login(superadmin);
    await api('get', '/audit', superadminToken).expect(403);

    await request(app.getHttpServer()).get('/api/v1/audit').expect(401);
  });

  it('isolates audit logs strictly between clinics', async () => {
    const tokenB = await login(adminB, clinicB);
    const listB = await api('get', '/audit', tokenB).expect(200);
    expect(listB.body.items.some((log: { patientId: string }) => log.patientId === patientAId)).toBe(false);
  });

  it('fetches patient timeline in chronological order without creating a VIEW audit (needs a concrete version)', async () => {
    await db.patient.update({
      where: { id: patientAId },
      data: { deletedAt: null, deletedBy: null },
    });

    // 1. Examen antiguo
    const exam1Id = randomUUID();
    const version1Id = randomUUID();
    const storageKey1 = `clinics/${clinicA}/patients/${patientAId}/exams/${exam1Id}/versions/${version1Id}`;

    const exam1 = await db.exam.create({
      data: {
        id: exam1Id,
        clinicId: clinicA,
        patientId: patientAId,
        examTypeId,
        title: 'Examen Antiguo',
        examDate: new Date('2025-01-10T00:00:00.000Z'),
        createdBy: adminA,
        versions: {
          create: {
            id: version1Id,
            versionNumber: 1,
            storageKey: storageKey1,
            originalFilename: 'antiguo.pdf',
            mimeType: 'application/pdf',
            sizeBytes: BigInt(2048),
            sha256: 'a'.repeat(64),
            uploadedBy: adminA,
          },
        },
      },
    });

    // 2. Examen reciente
    const exam2Id = randomUUID();
    const version2Id = randomUUID();
    const storageKey2 = `clinics/${clinicA}/patients/${patientAId}/exams/${exam2Id}/versions/${version2Id}`;

    const exam2 = await db.exam.create({
      data: {
        id: exam2Id,
        clinicId: clinicA,
        patientId: patientAId,
        examTypeId,
        title: 'Examen Reciente',
        examDate: new Date('2026-03-15T00:00:00.000Z'),
        createdBy: clinicianA,
        versions: {
          create: {
            id: version2Id,
            versionNumber: 1,
            storageKey: storageKey2,
            originalFilename: 'reciente.pdf',
            mimeType: 'application/pdf',
            sizeBytes: BigInt(4096),
            sha256: 'b'.repeat(64),
            uploadedBy: clinicianA,
          },
        },
      },
    });

    const tokenClinician = await login(clinicianA, clinicA);
    const timelineRes = await api('get', `/patients/${patientAId}/timeline`, tokenClinician).expect(200);

    expect(timelineRes.body.totalExams).toBe(2);
    expect(timelineRes.body.timeline[0].id).toBe(exam2.id); // Más reciente primero
    expect(timelineRes.body.timeline[1].id).toBe(exam1.id);
    expect(timelineRes.body.timeline[1].versions).toHaveLength(1);
    expect(timelineRes.body.timeline[1].versions[0].sizeBytes).toBe('2048');

    // La BD (protect_audit) exige examVersionId para VIEW/DOWNLOAD/NEW_VERSION, así que
    // consultar la línea de tiempo no genera VIEW. Esas acciones se auditan al abrir/descargar un archivo.
    const viewLogs = await db.auditLog.count({
      where: { clinicId: clinicA, patientId: patientAId, action: AuditAction.VIEW },
    });
    expect(viewLogs).toBe(0);
  });

  it('blocks access to timeline across different clinics (404)', async () => {
    const tokenB = await login(adminB, clinicB);
    await api('get', `/patients/${patientAId}/timeline`, tokenB).expect(404);
  });

  it('rejects at the database level a VIEW audit without a concrete version', async () => {
    await expect(
      db.auditLog.create({ data: { clinicId: clinicA, actorId: adminA, action: AuditAction.VIEW, patientId: patientAId } }),
    ).rejects.toThrow();
  });
});
