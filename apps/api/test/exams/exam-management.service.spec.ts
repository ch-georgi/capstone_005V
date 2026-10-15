import { Prisma } from '@prisma/client';
import { ExamManagementService } from '../../src/modules/exams/exam-management.service';

const ctx: any = { kind: 'TENANT', actorId: 'actor', clinicId: 'clinic', role: 'CLINICIAN', access: 'READ_WRITE' };
const info = { ipAddress: '10.0.0.1', userAgent: 'jest' };
const baseExam = () => ({
  id: 'e1', clinicId: 'clinic', patientId: 'p1', examTypeId: 't1', title: 'Hemograma', examDate: new Date('2026-10-01T00:00:00.000Z'),
  professionalName: 'Dr. Pérez', notes: null, createdBy: 'u1', deletedAt: null,
});

function setup(opts: { exam?: any; read?: boolean; write?: boolean; type?: any } = {}) {
  const sql: string[] = [];
  const tx: any = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const q = strings.join('?'); sql.push(q);
      if (q.includes('can_read_patient')) return [{ ok: opts.read ?? true }];
      if (q.includes('can_write_patient')) return [{ ok: opts.write ?? true }];
      return [];
    }),
    exam: { findFirst: jest.fn().mockResolvedValue('exam' in opts ? opts.exam : baseExam()), update: jest.fn().mockResolvedValue({}) },
    examType: { findUnique: jest.fn().mockResolvedValue('type' in opts ? opts.type : { isActive: true }) },
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const audit: any = { record: jest.fn().mockResolvedValue({}) };
  const detail = { id: 'e1', title: 'nuevo' };
  const exams: any = { get: jest.fn().mockResolvedValue(detail) };
  return { tx, prisma, audit, exams, sql, detail, service: new ManagementCtor(prisma, audit, exams) };
}
const ManagementCtor = ExamManagementService;

describe('ExamManagementService.update', () => {
  it('updates only the changed fields, audits UPDATE with their names and returns the fresh detail', async () => {
    const { tx, audit, exams, detail, service } = setup();
    const out = await service.update(ctx, 'e1', { title: '  Perfil lipídico ', notes: ' Ayuno 12 h ', professionalName: 'Dr. Pérez' }, info);
    expect(out).toBe(detail);
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { title: 'Perfil lipídico', notes: 'Ayuno 12 h' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      clinicId: 'clinic', actorId: 'actor', patientId: 'p1', examId: 'e1', action: 'UPDATE', metadata: { changedFields: ['title', 'notes'] }, ...info,
    }), tx);
    expect(exams.get).toHaveBeenCalledWith(ctx, 'e1');
  });

  it('locks the clinic before the exam', async () => {
    const { sql, service } = setup();
    await service.update(ctx, 'e1', { title: 'otro' }, info);
    expect(sql[0]).toContain('FROM clinics');
    expect(sql[1]).toContain('FROM exams');
  });

  it('clears professionalName and notes with null', async () => {
    const { tx, service } = setup({ exam: { ...baseExam(), notes: 'algo' } });
    await service.update(ctx, 'e1', { professionalName: null, notes: null }, info);
    expect(tx.exam.update.mock.calls[0][0].data).toEqual({ professionalName: null, notes: null });
  });

  it('changes the date and type, validating that the new type is active', async () => {
    const { tx, service } = setup();
    await service.update(ctx, 'e1', { examDate: '2026-11-02', examTypeId: 't2' }, info);
    expect(tx.exam.update.mock.calls[0][0].data).toEqual({ examDate: new Date('2026-11-02T00:00:00.000Z'), examTypeId: 't2' });
  });

  it('does nothing and audits nothing when the values are identical', async () => {
    const { tx, audit, exams, service } = setup();
    await service.update(ctx, 'e1', { title: 'Hemograma', examDate: '2026-10-01', examTypeId: 't1', professionalName: ' Dr. Pérez ', notes: null }, info);
    expect(tx.exam.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(exams.get).toHaveBeenCalled();
  });

  it.each([
    ['empty body', {}, 400, 'EMPTY_UPDATE'],
    ['impossible date', { examDate: '2026-02-30' }, 400, 'INVALID_EXAM_DATE'],
  ])('rejects %s before opening a transaction', async (_n, dto, status, code) => {
    const { prisma, service } = setup();
    await expect(service.update(ctx, 'e1', dto as any, info)).rejects.toMatchObject({ status, response: expect.objectContaining({ code }) });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown type', { type: null }, 404, 'EXAM_TYPE_NOT_FOUND'],
    ['inactive type', { type: { isActive: false } }, 409, 'EXAM_TYPE_INACTIVE'],
  ])('rejects an %s without writing', async (_n, opts, status, code) => {
    const { tx, audit, service } = setup(opts);
    await expect(service.update(ctx, 'e1', { examTypeId: 't9' }, info)).rejects.toMatchObject({ status, response: expect.objectContaining({ code }) });
    expect(tx.exam.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['missing, deleted or foreign exam', { exam: null }, 404],
    ['actor cannot read the patient', { read: false }, 404],
    ['actor can read but not write', { write: false }, 403],
  ])('answers %s with %i', async (_n, opts, status) => {
    const { tx, audit, service } = setup(opts as any);
    await expect(service.update(ctx, 'e1', { title: 'x' }, info)).rejects.toMatchObject({ status });
    expect(tx.exam.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the session clinic and non-deleted exams', async () => {
    const { tx, service } = setup();
    await service.update(ctx, 'e1', { title: 'x' }, info);
    expect(tx.exam.findFirst).toHaveBeenCalledWith({ where: { id: 'e1', clinicId: 'clinic', deletedAt: null } });
  });

  it('retries up to 3 times on a transient conflict and then gives up', async () => {
    const transient = new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2034', clientVersion: 'x' });
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(transient);
    await expect(service.update(ctx, 'e1', { title: 'x' }, info)).rejects.toBe(transient);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(new Error('boom'));
    await expect(service.update(ctx, 'e1', { title: 'x' }, info)).rejects.toThrow('boom');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('ExamManagementService.remove', () => {
  it('soft-deletes with date and actor and audits DELETE without a version', async () => {
    const { tx, audit, service } = setup();
    await service.remove(ctx, 'e1', info);
    const arg = tx.exam.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'e1' });
    expect(arg.data.deletedBy).toBe('actor');
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    const entry = audit.record.mock.calls[0][0];
    expect(entry).toMatchObject({ action: 'DELETE', examId: 'e1', patientId: 'p1', clinicId: 'clinic', actorId: 'actor' });
    expect(entry.examVersionId).toBeUndefined();
  });

  it.each([
    ['already deleted or foreign', { exam: null }, 404],
    ['unreadable', { read: false }, 404],
    ['read-only', { write: false }, 403],
  ])('answers %s with %i and changes nothing', async (_n, opts, status) => {
    const { tx, audit, service } = setup(opts as any);
    await expect(service.remove(ctx, 'e1', info)).rejects.toMatchObject({ status });
    expect(tx.exam.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
