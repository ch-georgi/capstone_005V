import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';

describe('Exam edit and soft delete API against disposable PostgreSQL', () => {
  let app: INestApplication; let db: PrismaService;
  const clinicA = randomUUID(), clinicB = randomUUID(), typeA = randomUUID(), typeB = randomUUID(), inactiveType = randomUUID();
  const adminA = randomUUID(), clinicianA = randomUUID(), adminB = randomUUID(), userP1 = randomUUID(), userP2 = randomUUID();
  const patient1 = randomUUID(), patient2 = randomUUID();
  const password = 'Integration-password-123';
  const email = (id: string) => `${id}@example.com`;
  const login = async (id: string, clinicId: string) =>
    (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email(id), password, clinicId }).expect(200)).body.accessToken as string;
  const api = (method: 'get' | 'patch' | 'delete', token: string, path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).auth(token, { type: 'bearer' });

  // Examen + versión en una transacción: la BD exige al menos una versión al confirmar.
  const makeExam = async (patientId: string, title: string) => {
    const examId = randomUUID(), versionId = randomUUID();
    await db.$transaction(async (tx) => {
      await tx.exam.create({ data: { id: examId, clinicId: clinicA, patientId, examTypeId: typeA, title, examDate: new Date('2026-10-01T00:00:00Z'), professionalName: 'Dr. Inicial', createdBy: adminA } });
      await tx.examVersion.create({ data: {
        id: versionId, examId, versionNumber: 1, originalFilename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(10), sha256: 'a'.repeat(64),
        storageKey: `clinics/${clinicA}/patients/${patientId}/exams/${examId}/versions/${versionId}`, uploadedBy: adminA,
      } });
    });
    return { examId, versionId };
  };

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_schema_test') || process.env.DATABASE_URL !== url) throw new Error('Disposable database required');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
    db = app.get(PrismaService);
    await db.clinic.createMany({ data: [clinicA, clinicB].map((id) => ({ id, name: 'Write synthetic clinic', code: id })) });
    const passwordHash = await new PasswordService().hash(password);
    await db.user.createMany({ data: [adminA, clinicianA, adminB, userP1, userP2].map((id) => ({ id, email: email(id), passwordHash })) });
    await db.userClinic.createMany({ data: [
      { userId: adminA, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin A' },
      { userId: clinicianA, clinicId: clinicA, role: TenantRole.CLINICIAN, displayName: 'Clinician A' },
      { userId: adminB, clinicId: clinicB, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin B' },
      { userId: userP1, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient 1' },
      { userId: userP2, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient 2' },
    ] });
    await db.patient.createMany({ data: [
      { id: patient1, userId: userP1, clinicId: clinicA, firstName: 'Ana', lastName: 'Uno', dateOfBirth: new Date('1990-01-01T00:00:00Z') },
      { id: patient2, userId: userP2, clinicId: clinicA, firstName: 'Beto', lastName: 'Dos', dateOfBirth: new Date('1991-01-01T00:00:00Z') },
    ] });
    await db.examType.createMany({ data: [
      { id: typeA, code: `WA-${typeA.slice(0, 8)}`, name: 'Write A' },
      { id: typeB, code: `WB-${typeB.slice(0, 8)}`, name: 'Write B' },
      { id: inactiveType, code: `WI-${inactiveType.slice(0, 8)}`, name: 'Write Inactivo', isActive: false },
    ] });
  });
  afterAll(async () => { await app?.close(); });

  it('edits fields, audits UPDATE with the changed field names and emits a sync change', async () => {
    const { examId } = await makeExam(patient1, 'Original');
    const clinician = await login(clinicianA, clinicA);
    const before = await db.exam.findUniqueOrThrow({ where: { id: examId } });
    const res = await api('patch', clinician, `/exams/${examId}`).send({ title: '  Editado  ', examDate: '2026-11-02', examTypeId: typeB, notes: 'Con ayuno', professionalName: null }).expect(200);
    expect(res.body).toMatchObject({ id: examId, title: 'Editado', examDate: '2026-11-02', notes: 'Con ayuno', professionalName: null, examType: { id: typeB }, versionCount: 1 });
    const after = await db.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    const audits = await db.auditLog.findMany({ where: { examId, action: 'UPDATE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: clinicianA, patientId: patient1, examVersionId: null, metadata: { changedFields: ['title', 'examDate', 'professionalName', 'notes', 'examTypeId'] } });
    expect(audits[0].ipAddress).toBeTruthy();
    const sync = await db.syncChange.findMany({ where: { clinicId: clinicA, entity: 'EXAM', entityId: examId }, orderBy: { revision: 'desc' }, take: 1 });
    expect(sync[0]).toMatchObject({ action: 'UPSERT', patientId: patient1 });
    expect(sync[0].payload).toMatchObject({ title: 'Editado' });
  });

  it('does not write or audit when nothing changes, and rejects empty or invalid input', async () => {
    const { examId } = await makeExam(patient1, 'Estable');
    const admin = await login(adminA, clinicA);
    const before = await db.exam.findUniqueOrThrow({ where: { id: examId } });
    await api('patch', admin, `/exams/${examId}`).send({ title: 'Estable', examDate: '2026-10-01' }).expect(200);
    const after = await db.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await db.auditLog.count({ where: { examId, action: 'UPDATE' } })).toBe(0);
    await api('patch', admin, `/exams/${examId}`).send({}).expect(400);
    await api('patch', admin, `/exams/${examId}`).send({ examDate: '2026-02-30' }).expect(400);
    await api('patch', admin, `/exams/${examId}`).send({ patientId: patient2 }).expect(400);
  });

  it('rejects inactive and unknown exam types', async () => {
    const { examId } = await makeExam(patient1, 'Tipos');
    const admin = await login(adminA, clinicA);
    expect((await api('patch', admin, `/exams/${examId}`).send({ examTypeId: inactiveType }).expect(409)).body.code).toBe('EXAM_TYPE_INACTIVE');
    expect((await api('patch', admin, `/exams/${examId}`).send({ examTypeId: randomUUID() }).expect(404)).body.code).toBe('EXAM_TYPE_NOT_FOUND');
  });

  it('lets a patient edit their own exam and hides other patients\' and other clinics\' exams with 404', async () => {
    const mine = await makeExam(patient1, 'Mío'), theirs = await makeExam(patient2, 'Ajeno');
    const p1 = await login(userP1, clinicA), other = await login(adminB, clinicB);
    await api('patch', p1, `/exams/${mine.examId}`).send({ notes: 'nota del paciente' }).expect(200);
    await api('patch', p1, `/exams/${theirs.examId}`).send({ notes: 'x' }).expect(404);
    await api('delete', p1, `/exams/${theirs.examId}`).expect(404);
    await api('patch', other, `/exams/${mine.examId}`).send({ notes: 'x' }).expect(404);
    await api('delete', other, `/exams/${mine.examId}`).expect(404);
    expect((await db.exam.findUniqueOrThrow({ where: { id: theirs.examId } })).notes).toBeNull();
  });

  it('soft-deletes: 204, hidden everywhere, rows kept, audited DELETE, sync DELETE, second delete 404', async () => {
    const { examId, versionId } = await makeExam(patient1, 'A borrar');
    const admin = await login(adminA, clinicA);
    await api('delete', admin, `/exams/${examId}`).expect(204);
    await api('get', admin, `/exams/${examId}`).expect(404);
    expect((await api('get', admin, `/patients/${patient1}/exams`).expect(200)).body.items.map((e: any) => e.id)).not.toContain(examId);
    await api('get', admin, `/exams/${examId}/versions/${versionId}/download`).expect(404);
    await api('patch', admin, `/exams/${examId}`).send({ title: 'revivir' }).expect(404);
    await api('delete', admin, `/exams/${examId}`).expect(404);

    const row = await db.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedBy).toBe(adminA);
    expect(await db.examVersion.count({ where: { examId } })).toBe(1);
    const audits = await db.auditLog.findMany({ where: { examId, action: 'DELETE' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: adminA, patientId: patient1, examVersionId: null });
    const sync = await db.syncChange.findMany({ where: { clinicId: clinicA, entity: 'EXAM', entityId: examId }, orderBy: { revision: 'desc' }, take: 1 });
    expect(sync[0].action).toBe('DELETE');
  });
});
