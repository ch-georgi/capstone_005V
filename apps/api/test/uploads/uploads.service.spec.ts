import { createHash, randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { TenantContext } from '../../src/common/types/auth-context';
import { InMemoryStorageAdapter } from '../../src/modules/storage/adapters/memory.adapter';
import { buildStorageKey } from '../../src/modules/storage/storage.service';
import { UploadsService } from '../../src/modules/uploads/uploads.service';
import { FakeDb, transientError } from './fakes';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('contenido sintético del examen')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('imagen')]);
const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => undefined, (e) => e);
  expect(error).toBeInstanceOf(HttpException);
  return (error as HttpException).getResponse() as { code: string };
};

describe('UploadsService (lógica con base de datos simulada)', () => {
  const clinicId = randomUUID(), actorId = randomUUID(), patientId = randomUUID(), examTypeId = randomUUID();
  const ctx: TenantContext = { kind: 'TENANT', actorId, clinicId, role: 'CLINIC_ADMIN' as TenantContext['role'], access: 'READ_WRITE' };
  let db: FakeDb, storage: InMemoryStorageAdapter, service: UploadsService;

  const envelope = (overrides: Record<string, unknown> = {}, payloadOverrides: Record<string, unknown> = {}, file: Buffer = PDF) => ({
    operationId: randomUUID(), clinicId, operation: 'CREATE_EXAM_WITH_VERSION',
    payload: { schemaVersion: 1, patientId, examId: randomUUID(), versionId: randomUUID(), title: ' Hemograma ', examDate: '2026-10-15', examTypeId, ...payloadOverrides },
    filename: 'hemograma.pdf', mimeType: 'application/pdf', sizeBytes: file.length, sha256: sha(file), ...overrides,
  });
  const upload = (body: Record<string, unknown>, file: Buffer | null = PDF) =>
    service.upload(ctx, JSON.stringify(body), file ? { buffer: file, originalname: 'x', size: file.length } : undefined, { ipAddress: '127.0.0.1', userAgent: 'jest' });

  beforeEach(() => {
    db = new FakeDb(); storage = new InMemoryStorageAdapter();
    db.patients.set(patientId, { id: patientId, clinicId, deletedAt: null });
    db.writable.add(`${actorId}:${patientId}`);
    db.examTypes.set(examTypeId, { isActive: true });
    service = new UploadsService(db.prisma, storage, db.audit as never);
  });

  it('creates an exam with version 1, stores the object under the contract key and audits CREATE', async () => {
    const body = envelope();
    const { payload } = body as { payload: { examId: string; versionId: string } };
    const result = await upload(body);
    expect(result).toEqual({ status: 201, body: { examId: payload.examId, versionId: payload.versionId, versionNumber: 1, replayed: false } });
    const key = buildStorageKey({ clinicId, patientId, examId: payload.examId, versionId: payload.versionId });
    expect(key).toBe(`clinics/${clinicId}/patients/${patientId}/exams/${payload.examId}/versions/${payload.versionId}`);
    expect(storage.objects.get(key)?.body.equals(PDF)).toBe(true);
    expect(db.exams.get(payload.examId)).toMatchObject({ title: 'Hemograma', createdBy: actorId, clinicId, patientId });
    expect(db.versions[0]).toMatchObject({ storageKey: key, versionNumber: 1, sha256: sha(PDF), sizeBytes: BigInt(PDF.length), uploadedBy: actorId });
    expect(db.audits).toEqual([expect.objectContaining({ action: 'CREATE', examVersionId: payload.versionId, patientId, examId: payload.examId, ipAddress: '127.0.0.1' })]);
    expect(db.idempotency).toHaveLength(1);
    expect(db.rawSql.some((s) => s.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(db.rawSql.findIndex((s) => s.includes('clinics')) ).toBeGreaterThan(db.rawSql.findIndex((s) => s.includes('pg_advisory_xact_lock')));
  });

  it('replays an identical operation without touching storage or the database again', async () => {
    const body = envelope();
    const first = await upload(body);
    const second = await upload(body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ...first.body, replayed: true });
    expect(db.versions).toHaveLength(1); expect(db.audits).toHaveLength(1); expect(storage.objects.size).toBe(1);
  });

  it('rejects the same operationId with different content (409) and keeps the original untouched', async () => {
    const body = envelope();
    await upload(body);
    const changed = { ...body, payload: { ...(body.payload as object), title: 'Otro título' } };
    expect((await codeOf(upload(changed))).code).toBe('IDEMPOTENCY_CONFLICT');
    expect(db.versions).toHaveLength(1);
  });

  it('revalidates authorization on replay', async () => {
    const body = envelope();
    await upload(body);
    db.writable.clear();
    expect((await codeOf(upload(body))).code).toBe('PATIENT_NOT_FOUND');
  });

  it('adds sequential versions to an existing exam with NEW_VERSION audit', async () => {
    const created = await upload(envelope());
    const examId = created.body.examId;
    const next = (file: Buffer) => envelope({ operation: 'UPLOAD_VERSION', mimeType: file === PNG ? 'image/png' : 'application/pdf', filename: file === PNG ? 'a.png' : 'a.pdf' },
      { examId, title: undefined, examDate: undefined, examTypeId: undefined }, file);
    const clean = (b: Record<string, any>) => { for (const k of ['title', 'examDate', 'examTypeId']) delete b.payload[k]; return b; };
    const v2 = await upload(clean(next(PNG)), PNG);
    const v3 = await upload(clean(next(PDF)), PDF);
    expect([v2.body.versionNumber, v3.body.versionNumber]).toEqual([2, 3]);
    expect(v2.status).toBe(201);
    expect(db.audits.map((a) => a.action)).toEqual(['CREATE', 'NEW_VERSION', 'NEW_VERSION']);
    expect(db.rawSql.filter((s) => s.includes('FROM exams') && s.includes('FOR UPDATE'))).toHaveLength(2);
  });

  it('refuses a new version for a missing exam, another patient’s exam or a deleted exam', async () => {
    const created = await upload(envelope());
    const base = (examId: string, patient = patientId) => {
      const b = envelope({ operation: 'UPLOAD_VERSION' }, { examId, patientId: patient }) as Record<string, any>;
      for (const k of ['title', 'examDate', 'examTypeId']) delete b.payload[k];
      return b;
    };
    expect((await codeOf(upload(base(randomUUID())))).code).toBe('EXAM_NOT_FOUND');
    const other = randomUUID();
    db.patients.set(other, { id: other, clinicId, deletedAt: null }); db.writable.add(`${actorId}:${other}`);
    expect((await codeOf(upload(base(created.body.examId, other)))).code).toBe('EXAM_NOT_FOUND');
    db.exams.get(created.body.examId).deletedAt = new Date();
    expect((await codeOf(upload(base(created.body.examId)))).code).toBe('EXAM_NOT_FOUND');
  });

  it.each([
    ['file missing', () => upload(envelope(), null), 'FILE_REQUIRED'],
    ['clinic of another tenant', () => upload(envelope({ clinicId: randomUUID() })), 'CLINIC_MISMATCH'],
    ['declared hash differs', () => upload(envelope({ sha256: 'a'.repeat(64) })), 'FILE_HASH_MISMATCH'],
    ['declared size differs', () => upload(envelope({ sizeBytes: PDF.length + 1 })), 'FILE_SIZE_MISMATCH'],
    ['declared type differs from real bytes', () => upload(envelope({ mimeType: 'image/png' })), 'MIME_TYPE_MISMATCH'],
    ['executable disguised as pdf', () => upload(envelope({}, {}, Buffer.from('MZ\x90\x00 programa')), Buffer.from('MZ\x90\x00 programa')), 'UNSUPPORTED_FILE_TYPE'],
    ['empty file', () => upload(envelope({ sizeBytes: 1 }), Buffer.alloc(0)), 'FILE_TOO_LARGE'],
    ['CREATE without title', () => upload(envelope({}, { title: undefined })), 'VALIDATION_ERROR'],
    ['UPLOAD_VERSION carrying exam metadata', () => upload(envelope({ operation: 'UPLOAD_VERSION' })), 'VALIDATION_ERROR'],
    ['null instead of omitted optional', () => upload(envelope({}, { notes: null })), 'VALIDATION_ERROR'],
    ['unknown property', () => upload(envelope({ extra: 1 })), 'VALIDATION_ERROR'],
    ['uppercase UUID', () => upload(envelope({ operationId: randomUUID().toUpperCase() })), 'VALIDATION_ERROR'],
    ['path in filename', () => upload(envelope({ filename: '../../etc/passwd' })), 'VALIDATION_ERROR'],
    ['impossible date', () => upload(envelope({}, { examDate: '2026-02-31' })), 'INVALID_EXAM_DATE'],
    ['oversized declared size', () => upload(envelope({ sizeBytes: 10_000_001 })), 'VALIDATION_ERROR'],
  ])('rejects invalid input before storing anything: %s', async (_name, run, code) => {
    expect((await codeOf(run())).code).toBe(code);
    expect(storage.objects.size).toBe(0); expect(db.transactions).toBe(0);
  });

  it('rejects malformed or missing request JSON', async () => {
    expect((await codeOf(service.upload(ctx, '{no json', { buffer: PDF, originalname: 'x', size: 1 }, {}))).code).toBe('INVALID_REQUEST_JSON');
    expect((await codeOf(service.upload(ctx, undefined, { buffer: PDF, originalname: 'x', size: 1 }, {}))).code).toBe('REQUEST_REQUIRED');
    expect((await codeOf(service.upload(ctx, '[1]', { buffer: PDF, originalname: 'x', size: 1 }, {}))).code).toBe('VALIDATION_ERROR');
  });

  it('answers 404 without touching storage when the actor cannot write the patient', async () => {
    db.writable.clear();
    expect((await codeOf(upload(envelope()))).code).toBe('PATIENT_NOT_FOUND');
    const foreign = randomUUID(); db.patients.set(foreign, { id: foreign, clinicId: randomUUID(), deletedAt: null }); db.writable.add(`${actorId}:${foreign}`);
    expect((await codeOf(upload(envelope({}, { patientId: foreign })))).code).toBe('PATIENT_NOT_FOUND');
    expect(storage.objects.size).toBe(0);
  });

  it('validates the exam type (missing 404, inactive 409)', async () => {
    expect((await codeOf(upload(envelope({}, { examTypeId: randomUUID() })))).code).toBe('EXAM_TYPE_NOT_FOUND');
    db.examTypes.set(examTypeId, { isActive: false });
    expect((await codeOf(upload(envelope()))).code).toBe('EXAM_TYPE_INACTIVE');
    expect(storage.objects.size).toBe(0);
  });

  it('never overwrites a published version: a new exam reusing an existing versionId is a 409 before any upload', async () => {
    const first = envelope();
    const { payload } = first as { payload: { examId: string; versionId: string } };
    await upload(first);
    const key = db.versions[0].storageKey;
    const before = Buffer.from(storage.objects.get(key)!.body);
    const reuse = envelope({ mimeType: 'image/png', sizeBytes: PNG.length, sha256: sha(PNG) }, { versionId: payload.versionId }, PNG);
    expect((await codeOf(upload(reuse, PNG))).code).toBe('VERSION_ID_CONFLICT');
    expect(storage.objects.size).toBe(1);
    expect(storage.objects.get(key)!.body.equals(before)).toBe(true);
    expect(db.exams.size).toBe(1);
  });

  it('flags a reused versionId on an existing exam and historical identifiers', async () => {
    const first = envelope();
    const created = await upload(first);
    const mk = (extra: Record<string, unknown>) => {
      const b = envelope({ operation: 'UPLOAD_VERSION' }, { examId: created.body.examId, ...extra }) as Record<string, any>;
      for (const k of ['title', 'examDate', 'examTypeId']) delete b.payload[k];
      return b;
    };
    const key = db.versions[0].storageKey;
    const original = Buffer.from(storage.objects.get(key)!.body);
    expect((await codeOf(upload(mk({ versionId: created.body.versionId })))).code).toBe('VERSION_ID_CONFLICT');
    expect(storage.objects.get(key)!.body.equals(original)).toBe(true);
    const historical = randomUUID(); db.syncChanges.push({ entity: 'EXAM_VERSION', entityId: historical });
    expect((await codeOf(upload(mk({ versionId: historical })))).code).toBe('VERSION_ID_CONFLICT');
    const jobbed = randomUUID(); db.jobs.push({ versionId: jobbed, storageKey: 'otra' });
    expect((await codeOf(upload(mk({ versionId: jobbed })))).code).toBe('VERSION_ID_CONFLICT');
    const purgedExam = randomUUID(); db.syncChanges.push({ entity: 'EXAM', entityId: purgedExam });
    expect((await codeOf(upload(envelope({}, { examId: purgedExam })))).code).toBe('EXAM_ID_CONFLICT');
  });

  it('removes the object it created when publication fails, and leaves no rows', async () => {
    db.failOn = 'examVersion.create';
    const error = await upload(envelope()).catch((e) => e);
    expect(error.message).toContain('BD simulada');
    expect(storage.objects.size).toBe(0); expect(db.exams.size).toBe(0); expect(db.idempotency).toHaveLength(0);
  });

  it('reuses an identical orphan object from an interrupted attempt, but rejects a different one without touching it', async () => {
    const body = envelope();
    const { payload } = body as { payload: { examId: string; versionId: string } };
    const key = buildStorageKey({ clinicId, patientId, examId: payload.examId, versionId: payload.versionId });
    await storage.putIfAbsent(key, PDF, 'application/pdf');
    expect((await upload(body)).status).toBe(201);
    expect(storage.objects.get(key)!.body.equals(PDF)).toBe(true);

    const other = envelope();
    const otherKey = buildStorageKey({ clinicId, patientId, examId: (other as any).payload.examId, versionId: (other as any).payload.versionId });
    await storage.putIfAbsent(otherKey, Buffer.from('%PDF-otro contenido'), 'application/pdf');
    expect((await codeOf(upload(other))).code).toBe('STORAGE_KEY_CONFLICT');
    expect(storage.objects.get(otherKey)!.body.toString()).toBe('%PDF-otro contenido');
  });

  it('does not delete a reused object when publication fails afterwards', async () => {
    const body = envelope();
    const { payload } = body as { payload: { examId: string; versionId: string } };
    const key = buildStorageKey({ clinicId, patientId, examId: payload.examId, versionId: payload.versionId });
    await storage.putIfAbsent(key, PDF, 'application/pdf');
    db.failOn = 'audit.record';
    await upload(body).catch(() => undefined);
    expect(storage.objects.has(key)).toBe(true);
  });

  it('maps storage outages to 503 and leaves the database clean', async () => {
    storage.unavailable = true;
    const error = await upload(envelope()).catch((e) => e);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse().code).toBe('STORAGE_UNAVAILABLE');
    expect(db.exams.size).toBe(0);
  });

  it('retries deadlocks / serialization failures up to three attempts with the same operationId', async () => {
    let calls = 0;
    const original = db.prisma.$transaction;
    db.prisma.$transaction = async (cb: any, opts: any) => { calls++; if (calls < 3) throw transientError(); return original(cb, opts); };
    const body = envelope();
    expect((await upload(body)).status).toBe(201);
    expect(calls).toBe(3);

    calls = -10; // siempre falla
    db.prisma.$transaction = async () => { calls++; throw transientError(); };
    await upload(envelope()).catch(() => undefined);
    expect(calls).toBe(-7);
  });

  it('lets a PATIENT upload for themselves through the same rules', async () => {
    const patientActor = randomUUID();
    db.writable.add(`${patientActor}:${patientId}`);
    const patientCtx = { ...ctx, actorId: patientActor, role: 'PATIENT' as TenantContext['role'] };
    const body = envelope();
    const result = await service.upload(patientCtx, JSON.stringify(body), { buffer: PDF, originalname: 'x', size: PDF.length }, {});
    expect(result.status).toBe(201);
    expect(db.exams.get((body.payload as any).examId).createdBy).toBe(patientActor);
  });
});
