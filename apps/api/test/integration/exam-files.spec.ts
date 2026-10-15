import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { TenantRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import { InMemoryStorageAdapter } from '../../src/modules/storage/adapters/memory.adapter';
import { StorageService } from '../../src/modules/storage/storage.service';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('examen sintético de integración')]);
const PDF2 = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('segunda versión del examen')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('imagen')]);

describe('Exam upload and download API against disposable PostgreSQL', () => {
  let app: INestApplication; let db: PrismaService; const storage = new InMemoryStorageAdapter();
  const clinicA = randomUUID(), clinicB = randomUUID(), examTypeId = randomUUID();
  const adminA = randomUUID(), clinicianA = randomUUID(), adminB = randomUUID();
  const userP1 = randomUUID(), userP2 = randomUUID(), patient1 = randomUUID(), patient2 = randomUUID();
  const password = 'Integration-password-123';
  const email = (id: string) => `${id}@example.com`;
  const login = async (id: string, clinicId: string) =>
    (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: email(id), password, clinicId }).expect(200)).body.accessToken as string;

  const envelope = (file: Buffer, over: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) => ({
    operationId: randomUUID(), clinicId: clinicA, operation: 'CREATE_EXAM_WITH_VERSION',
    payload: { schemaVersion: 1, patientId: patient1, examId: randomUUID(), versionId: randomUUID(), title: 'Hemograma', examDate: '2026-10-15', examTypeId, ...payload },
    filename: 'hemograma.pdf', mimeType: 'application/pdf', sizeBytes: file.length, sha256: sha(file), ...over,
  });
  const versionEnvelope = (examId: string, file: Buffer, over: Record<string, unknown> = {}, patientId = patient1) => ({
    operationId: randomUUID(), clinicId: clinicA, operation: 'UPLOAD_VERSION',
    payload: { schemaVersion: 1, patientId, examId, versionId: randomUUID() },
    filename: 'v.pdf', mimeType: 'application/pdf', sizeBytes: file.length, sha256: sha(file), ...over,
  });
  const upload = (token: string, body: unknown, file: Buffer) =>
    request(app.getHttpServer()).post('/api/v1/exams/uploads').auth(token, { type: 'bearer' })
      .field('request', JSON.stringify(body)).attach('file', file, { filename: 'f.bin', contentType: 'application/octet-stream' });
  const get = (token: string, examId: string, versionId: string, route: 'download' | 'view') =>
    request(app.getHttpServer()).get(`/api/v1/exams/${examId}/versions/${versionId}/${route}`).auth(token, { type: 'bearer' })
      .buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_schema_test') || process.env.DATABASE_URL !== url) throw new Error('Disposable database required');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(StorageService).useValue(storage).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    await db.clinic.createMany({ data: [clinicA, clinicB].map((id) => ({ id, name: 'Files synthetic clinic', code: id })) });
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
    await db.examType.create({ data: { id: examTypeId, code: `HEMO-${examTypeId.slice(0, 8)}`, name: 'Hemograma' } });
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { storage.unavailable = false; });

  it('runs the full flow: create, replay, conflict, new version, download, view and audit', async () => {
    const admin = await login(adminA, clinicA), clinician = await login(clinicianA, clinicA);
    const body = envelope(PDF);
    const { examId, versionId } = body.payload as { examId: string; versionId: string };

    const created = await upload(admin, body, PDF).expect(201);
    expect(created.body).toEqual({ examId, versionId, versionNumber: 1, replayed: false });
    const key = `clinics/${clinicA}/patients/${patient1}/exams/${examId}/versions/${versionId}`;
    expect(storage.objects.get(key)?.body.equals(PDF)).toBe(true);
    expect(await db.examVersion.findUnique({ where: { id: versionId } })).toMatchObject({ storageKey: key, versionNumber: 1, sha256: sha(PDF), uploadedBy: adminA });

    const replay = await upload(admin, body, PDF).expect(200);
    expect(replay.body).toEqual({ examId, versionId, versionNumber: 1, replayed: true });
    expect(await db.examVersion.count({ where: { examId } })).toBe(1);

    const changed = { ...body, payload: { ...body.payload, title: 'Otro título' } };
    expect((await upload(admin, changed, PDF).expect(409)).body.code).toBe('IDEMPOTENCY_CONFLICT');

    const v2Body = versionEnvelope(examId, PDF2);
    const v2 = await upload(clinician, v2Body, PDF2).expect(201);
    expect(v2.body).toMatchObject({ examId, versionNumber: 2, replayed: false });

    const download = await get(clinician, examId, versionId, 'download').expect(200);
    expect((download.body as Buffer).equals(PDF)).toBe(true);
    expect(download.headers['content-disposition']).toMatch(/^attachment; filename="hemograma.pdf"/);
    expect(download.headers['cache-control']).toBe('private, no-store');
    const view = await get(clinician, examId, v2.body.versionId, 'view').expect(200);
    expect((view.body as Buffer).equals(PDF2)).toBe(true);
    expect(view.headers['content-disposition']).toMatch(/^inline;/);

    const audits = await db.auditLog.findMany({ where: { examId }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((a) => a.action)).toEqual(['CREATE', 'NEW_VERSION', 'DOWNLOAD', 'VIEW']);
    expect(audits.map((a) => a.examVersionId)).toEqual([versionId, v2.body.versionId, versionId, v2.body.versionId]);
    expect(audits.map((a) => a.actorId)).toEqual([adminA, clinicianA, clinicianA, clinicianA]);
    expect(audits[0].ipAddress).toBeTruthy(); // columna inet: confirma que Prisma acepta la IP de la petición
    expect(audits[0].fileMetadata).toMatchObject({ original_filename: 'hemograma.pdf', mime_type: 'application/pdf', version_number: 1 });
  });

  it('keeps patients and clinics isolated', async () => {
    const admin = await login(adminA, clinicA);
    const body = envelope(PNG, { filename: 'foto.png', mimeType: 'image/png' });
    const { examId, versionId } = body.payload as { examId: string; versionId: string };
    await upload(admin, body, PNG).expect(201);

    const owner = await login(userP1, clinicA), other = await login(userP2, clinicA), foreign = await login(adminB, clinicB);
    expect(((await get(owner, examId, versionId, 'download').expect(200)).body as Buffer).equals(PNG)).toBe(true);
    await get(other, examId, versionId, 'download').expect(404);
    await get(foreign, examId, versionId, 'view').expect(404);

    // El paciente puede agregar versiones a SU examen, pero no a uno ajeno.
    await upload(owner, versionEnvelope(examId, PDF), PDF).expect(201);
    await upload(other, versionEnvelope(examId, PDF), PDF).expect(404);
    await upload(other, envelope(PDF, {}, { patientId: patient1 }), PDF).expect(404);
    // Otra clínica no puede cargar usando el sobre de la clínica A ni escribir sobre su paciente.
    await upload(foreign, envelope(PDF), PDF).expect(400);
    await upload(foreign, envelope(PDF, { clinicId: clinicB }), PDF).expect(404);
  });

  it('rejects tampered or disallowed files and unauthenticated calls without storing anything', async () => {
    const admin = await login(adminA, clinicA);
    const before = storage.objects.size;
    expect((await upload(admin, envelope(PDF, { sha256: 'a'.repeat(64) }), PDF).expect(400)).body.code).toBe('FILE_HASH_MISMATCH');
    expect((await upload(admin, envelope(PDF, { mimeType: 'image/png' }), PDF).expect(400)).body.code).toBe('MIME_TYPE_MISMATCH');
    const exe = Buffer.from('MZ\x90\x00 no es un documento');
    expect((await upload(admin, envelope(exe, { filename: 'a.pdf' }), exe).expect(415)).body.code).toBe('UNSUPPORTED_FILE_TYPE');
    await request(app.getHttpServer()).post('/api/v1/exams/uploads').field('request', '{}').attach('file', PDF, 'a.pdf').expect(401);
    await request(app.getHttpServer()).get(`/api/v1/exams/${randomUUID()}/versions/${randomUUID()}/download`).expect(401);
    expect(storage.objects.size).toBe(before);
  });

  it('leaves no exam behind when storage is down, and succeeds when the same operation is retried', async () => {
    const admin = await login(adminA, clinicA);
    const body = envelope(PDF);
    const { examId } = body.payload as { examId: string };
    storage.unavailable = true;
    expect((await upload(admin, body, PDF).expect(503)).body.code).toBe('STORAGE_UNAVAILABLE');
    expect(await db.exam.count({ where: { id: examId } })).toBe(0);
    storage.unavailable = false;
    await upload(admin, body, PDF).expect(201);
    expect(await db.exam.count({ where: { id: examId } })).toBe(1);
  });

  it('hides deleted exams from download and from new versions', async () => {
    const admin = await login(adminA, clinicA);
    const body = envelope(PDF);
    const { examId, versionId } = body.payload as { examId: string; versionId: string };
    await upload(admin, body, PDF).expect(201);
    await db.exam.update({ where: { id: examId }, data: { deletedAt: new Date(), deletedBy: adminA } });
    await get(admin, examId, versionId, 'download').expect(404);
    await upload(admin, versionEnvelope(examId, PDF), PDF).expect(404);
  });

  it('answers 502 and audits nothing when the stored object is corrupted', async () => {
    const admin = await login(adminA, clinicA);
    const body = envelope(PDF);
    const { examId, versionId } = body.payload as { examId: string; versionId: string };
    await upload(admin, body, PDF).expect(201);
    const key = `clinics/${clinicA}/patients/${patient1}/exams/${examId}/versions/${versionId}`;
    storage.objects.set(key, { body: Buffer.from('%PDF-manipulado'), mimeType: 'application/pdf' });
    expect((await get(admin, examId, versionId, 'download').expect(502)).body.toString()).toContain('STORAGE_INTEGRITY_ERROR');
    expect(await db.auditLog.count({ where: { examId, action: 'DOWNLOAD' } })).toBe(0);
  });
});
