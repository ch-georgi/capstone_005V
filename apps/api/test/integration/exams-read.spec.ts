import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';

const sha = (n: number) => String(n).padStart(64, 'a');

describe('Exam read API against disposable PostgreSQL', () => {
  let app: INestApplication; let db: PrismaService;
  const clinicA = randomUUID(), clinicB = randomUUID(), typeA = randomUUID(), typeB = randomUUID(), inactive = randomUUID();
  const adminA = randomUUID(), adminB = randomUUID(), userP1 = randomUUID(), userP2 = randomUUID();
  const patient1 = randomUUID(), patient2 = randomUUID();
  const exam1 = randomUUID(), exam2 = randomUUID(), exam3 = randomUUID(), deleted = randomUUID();
  const password = 'Integration-password-123';
  const email = (id: string) => `${id}@example.com`;
  const login = async (id: string, clinicId: string) =>
    (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email(id), password, clinicId }).expect(200)).body.accessToken as string;
  const get = (token: string, path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).auth(token, { type: 'bearer' });

  // La BD exige que un examen tenga al menos una versión al confirmar (trigger diferido) y que no se
  // agreguen versiones a un examen eliminado: todo va en una transacción y el borrado lógico va al final.
  const makeExam = (id: string, patientId: string, examTypeId: string, title: string, date: string, versions: number, softDeleted = false) =>
    db.$transaction(async (tx) => {
      await tx.exam.create({ data: { id, clinicId: clinicA, patientId, examTypeId, title, examDate: new Date(`${date}T00:00:00Z`), createdBy: adminA } });
      for (let n = 1; n <= versions; n++) {
        const versionId = randomUUID();
        await tx.examVersion.create({ data: {
          id: versionId, examId: id, versionNumber: n, originalFilename: `${title}-${n}.pdf`, mimeType: 'application/pdf', sizeBytes: BigInt(100 + n), sha256: sha(n),
          storageKey: `clinics/${clinicA}/patients/${patientId}/exams/${id}/versions/${versionId}`, uploadedBy: adminA,
        } });
      }
      if (softDeleted) await tx.exam.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: adminA } });
    });

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_schema_test') || process.env.DATABASE_URL !== url) throw new Error('Disposable database required');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
    db = app.get(PrismaService);
    await db.clinic.createMany({ data: [clinicA, clinicB].map((id) => ({ id, name: 'Read synthetic clinic', code: id })) });
    const passwordHash = await new PasswordService().hash(password);
    await db.user.createMany({ data: [adminA, adminB, userP1, userP2].map((id) => ({ id, email: email(id), passwordHash })) });
    await db.userClinic.createMany({ data: [
      { userId: adminA, clinicId: clinicA, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin A' },
      { userId: adminB, clinicId: clinicB, role: TenantRole.CLINIC_ADMIN, displayName: 'Admin B' },
      { userId: userP1, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient 1' },
      { userId: userP2, clinicId: clinicA, role: TenantRole.PATIENT, displayName: 'Patient 2' },
    ] });
    await db.patient.createMany({ data: [
      { id: patient1, userId: userP1, clinicId: clinicA, firstName: 'Ana', lastName: 'Uno', dateOfBirth: new Date('1990-01-01T00:00:00Z') },
      { id: patient2, userId: userP2, clinicId: clinicA, firstName: 'Beto', lastName: 'Dos', dateOfBirth: new Date('1991-01-01T00:00:00Z') },
    ] });
    await db.examType.createMany({ data: [
      { id: typeA, code: `ZZA-${typeA.slice(0, 8)}`, name: 'ZZ Tipo A' },
      { id: typeB, code: `ZZB-${typeB.slice(0, 8)}`, name: 'ZZ Tipo B' },
      { id: inactive, code: `ZZI-${inactive.slice(0, 8)}`, name: 'ZZ Inactivo', isActive: false },
    ] });
    await makeExam(exam1, patient1, typeA, 'Antiguo', '2026-01-10', 1);
    await makeExam(exam2, patient1, typeB, 'Reciente', '2026-09-10', 2);
    await makeExam(exam3, patient2, typeA, 'Ajeno', '2026-05-05', 1);
    await makeExam(deleted, patient1, typeA, 'Borrado', '2026-10-01', 1, true);
  });
  afterAll(async () => { await app?.close(); });

  it('lists only active exam types, ordered by name, for any role', async () => {
    const patient = await login(userP1, clinicA);
    const names = (await get(patient, '/exam-types').expect(200)).body.items.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['ZZ Tipo A', 'ZZ Tipo B']));
    expect(names).not.toContain('ZZ Inactivo');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    await request(app.getHttpServer()).get('/api/v1/exam-types').expect(401);
  });

  it('lists a patient\'s exams newest first with the latest version, without deleted ones', async () => {
    const admin = await login(adminA, clinicA);
    const res = await get(admin, `/patients/${patient1}/exams`).expect(200);
    expect(res.body).toMatchObject({ total: 2, limit: 50, offset: 0 });
    expect(res.body.items.map((e: any) => e.id)).toEqual([exam2, exam1]);
    expect(res.body.items[0]).toMatchObject({ examDate: '2026-09-10', versionCount: 2, examType: { id: typeB }, latestVersion: { versionNumber: 2, sizeBytes: 102, uploadedBy: { displayName: 'Admin A' } } });
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });

  it('filters by type and dates and paginates', async () => {
    const admin = await login(adminA, clinicA);
    expect((await get(admin, `/patients/${patient1}/exams?examTypeId=${typeA}`).expect(200)).body.items.map((e: any) => e.id)).toEqual([exam1]);
    expect((await get(admin, `/patients/${patient1}/exams?from=2026-02-01&to=2026-09-10`).expect(200)).body.items.map((e: any) => e.id)).toEqual([exam2]);
    const page = (await get(admin, `/patients/${patient1}/exams?limit=1&offset=1`).expect(200)).body;
    expect(page).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.items.map((e: any) => e.id)).toEqual([exam1]);
    await get(admin, `/patients/${patient1}/exams?from=2026-05-02&to=2026-05-01`).expect(400);
  });

  it('lets a patient see only their own exams and hides other patients and clinics with 404', async () => {
    const p1 = await login(userP1, clinicA), adminOther = await login(adminB, clinicB);
    await get(p1, `/patients/${patient1}/exams`).expect(200);
    await get(p1, `/patients/${patient2}/exams`).expect(404);
    await get(adminOther, `/patients/${patient1}/exams`).expect(404);
  });

  it('returns exam detail with the full version history and 404 for deleted, foreign or unknown exams', async () => {
    const admin = await login(adminA, clinicA), p1 = await login(userP1, clinicA), p2 = await login(userP2, clinicA), other = await login(adminB, clinicB);
    const detail = (await get(admin, `/exams/${exam2}`).expect(200)).body;
    expect(detail.versions.map((v: any) => v.versionNumber)).toEqual([2, 1]);
    expect(detail).toMatchObject({ id: exam2, createdBy: { displayName: 'Admin A' }, latestVersion: { versionNumber: 2 } });
    await get(p1, `/exams/${exam2}`).expect(200);
    await get(p2, `/exams/${exam2}`).expect(404);
    await get(other, `/exams/${exam2}`).expect(404);
    await get(admin, `/exams/${deleted}`).expect(404);
    await get(admin, `/exams/${randomUUID()}`).expect(404);
  });
});
