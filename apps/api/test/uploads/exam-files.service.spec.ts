import { createHash, randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { TenantContext } from '../../src/common/types/auth-context';
import { ExamFilesService } from '../../src/modules/exam-versions/exam-files.service';
import { InMemoryStorageAdapter } from '../../src/modules/storage/adapters/memory.adapter';
import { FakeDb } from './fakes';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('documento clínico sintético')]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => undefined, (e) => e);
  expect(error).toBeInstanceOf(HttpException);
  return { status: (error as HttpException).getStatus(), code: ((error as HttpException).getResponse() as { code: string }).code };
};

describe('ExamFilesService (descarga y visualización)', () => {
  const clinicId = randomUUID(), actorId = randomUUID(), patientId = randomUUID(), examId = randomUUID(), versionId = randomUUID();
  const ctx: TenantContext = { kind: 'TENANT', actorId, clinicId, role: 'CLINICIAN' as TenantContext['role'], access: 'READ_WRITE' };
  const key = `clinics/${clinicId}/patients/${patientId}/exams/${examId}/versions/${versionId}`;
  let db: FakeDb, storage: InMemoryStorageAdapter, service: ExamFilesService;

  beforeEach(async () => {
    db = new FakeDb(); storage = new InMemoryStorageAdapter();
    db.exams.set(examId, { id: examId, clinicId, patientId, deletedAt: null });
    db.versions.push({ id: versionId, examId, versionNumber: 2, storageKey: key, originalFilename: 'informe.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(PDF.length), sha256: sha(PDF) });
    db.readable.add(`${actorId}:${patientId}`);
    await storage.putIfAbsent(key, PDF, 'application/pdf');
    service = new ExamFilesService(db.prisma, storage, db.audit as never);
  });

  it.each(['DOWNLOAD', 'VIEW'] as const)('delivers the verified file and records a %s audit with the exact version', async (action) => {
    const file = await service.deliver(ctx, examId, versionId, action, { ipAddress: '10.0.0.1', userAgent: 'jest' });
    expect(file).toEqual({ data: PDF, mimeType: 'application/pdf', filename: 'informe.pdf' });
    expect(db.audits).toEqual([expect.objectContaining({ action, clinicId, actorId, patientId, examId, examVersionId: versionId, ipAddress: '10.0.0.1', metadata: { versionNumber: 2 } })]);
  });

  it('answers 404 for unknown, cross-clinic, deleted or unreadable versions, without auditing or reading storage', async () => {
    const spy = jest.spyOn(storage, 'get');
    expect(await codeOf(service.deliver(ctx, examId, randomUUID(), 'VIEW', {}))).toEqual({ status: 404, code: 'EXAM_VERSION_NOT_FOUND' });
    expect(await codeOf(service.deliver(ctx, randomUUID(), versionId, 'VIEW', {}))).toEqual({ status: 404, code: 'EXAM_VERSION_NOT_FOUND' });
    expect(await codeOf(service.deliver({ ...ctx, clinicId: randomUUID() }, examId, versionId, 'VIEW', {}))).toEqual({ status: 404, code: 'EXAM_VERSION_NOT_FOUND' });
    db.readable.clear();
    expect(await codeOf(service.deliver(ctx, examId, versionId, 'DOWNLOAD', {}))).toEqual({ status: 404, code: 'EXAM_VERSION_NOT_FOUND' });
    db.readable.add(`${actorId}:${patientId}`);
    db.exams.get(examId).deletedAt = new Date();
    expect(await codeOf(service.deliver(ctx, examId, versionId, 'DOWNLOAD', {}))).toEqual({ status: 404, code: 'EXAM_VERSION_NOT_FOUND' });
    expect(spy).not.toHaveBeenCalled(); expect(db.audits).toHaveLength(0);
  });

  it('fails with 502 and does not audit when the object is missing or corrupted', async () => {
    await storage.delete(key);
    expect(await codeOf(service.deliver(ctx, examId, versionId, 'DOWNLOAD', {}))).toEqual({ status: 502, code: 'STORAGE_OBJECT_MISSING' });
    storage.objects.set(key, { body: Buffer.from('%PDF-alterado'), mimeType: 'application/pdf' });
    expect(await codeOf(service.deliver(ctx, examId, versionId, 'DOWNLOAD', {}))).toEqual({ status: 502, code: 'STORAGE_INTEGRITY_ERROR' });
    storage.objects.set(key, { body: Buffer.from(PDF.toString().replace('sintético', 'sintetico')), mimeType: 'application/pdf' });
    expect((await codeOf(service.deliver(ctx, examId, versionId, 'DOWNLOAD', {}))).code).toBe('STORAGE_INTEGRITY_ERROR');
    expect(db.audits).toHaveLength(0);
  });

  it('maps a storage outage to 503 and does not audit', async () => {
    storage.unavailable = true;
    expect(await codeOf(service.deliver(ctx, examId, versionId, 'VIEW', {}))).toEqual({ status: 503, code: 'STORAGE_UNAVAILABLE' });
    expect(db.audits).toHaveLength(0);
  });

  it('does not deliver the file when the audit record cannot be written', async () => {
    db.failOn = 'audit.record';
    await expect(service.deliver(ctx, examId, versionId, 'DOWNLOAD', {})).rejects.toThrow('BD simulada');
  });
});
