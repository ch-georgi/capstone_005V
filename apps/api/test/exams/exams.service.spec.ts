import { ExamsService } from '../../src/modules/exams/exams.service';
import { ExamTypesService } from '../../src/modules/exam-types/exam-types.service';

const ctx: any = { kind: 'TENANT', actorId: 'actor', clinicId: 'clinic', role: 'CLINICIAN', access: 'READ_ONLY' };
const T = new Date('2026-10-15T12:00:00.000Z');
const version = (n: number, by = 'u1') => ({ id: `v${n}`, examId: 'e1', versionNumber: n, originalFilename: `f${n}.pdf`, mimeType: 'application/pdf', sizeBytes: BigInt(1000 + n), sha256: 'a'.repeat(64), uploadedBy: by, createdAt: T });
const exam = (extra: any = {}) => ({
  id: 'e1', clinicId: 'clinic', patientId: 'p1', examTypeId: 't1', title: 'Hemograma', examDate: new Date('2026-10-01T00:00:00.000Z'),
  professionalName: null, notes: null, createdBy: 'u1', createdAt: T, updatedAt: T, deletedAt: null,
  examType: { id: 't1', code: 'HEMO', name: 'Hemograma' }, _count: { versions: 2 }, versions: [version(2), version(1, 'u2')], ...extra,
});

function setup(opts: { canRead?: boolean; patient?: boolean; exams?: any[]; total?: number; one?: any } = {}) {
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ ok: opts.canRead ?? true }]),
    patient: { findFirst: jest.fn().mockResolvedValue(opts.patient === false ? null : { id: 'p1' }) },
    exam: {
      count: jest.fn().mockResolvedValue(opts.total ?? (opts.exams?.length ?? 0)),
      findMany: jest.fn().mockResolvedValue(opts.exams ?? []),
      findFirst: jest.fn().mockResolvedValue(opts.one === undefined ? null : opts.one),
    },
    userClinic: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', displayName: 'Dra. Ana' }]) },
  };
  return { prisma, service: new ExamsService(prisma) };
}
const q = (extra: any = {}) => ({ limit: 50, offset: 0, ...extra });

describe('ExamsService.listForPatient', () => {
  it('returns a page with the latest version, numeric size and person names, scoped to clinic and not deleted', async () => {
    const e = exam({ versions: [version(2)] });
    const { prisma, service } = setup({ exams: [e], total: 7 });
    const page = await service.listForPatient(ctx, 'p1', q({ limit: 10, offset: 5 }));
    expect(page).toMatchObject({ total: 7, limit: 10, offset: 5 });
    expect(page.items[0]).toMatchObject({
      id: 'e1', examDate: '2026-10-01', versionCount: 2, professionalName: null, notes: null,
      latestVersion: { id: 'v2', versionNumber: 2, sizeBytes: 1002, uploadedBy: { id: 'u1', displayName: 'Dra. Ana' }, createdAt: T.toISOString() },
    });
    const args = prisma.exam.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ clinicId: 'clinic', patientId: 'p1', deletedAt: null });
    expect(args).toMatchObject({ take: 10, skip: 5 });
    expect(args.include.versions).toEqual({ orderBy: { versionNumber: 'desc' }, take: 1 });
    expect(prisma.userClinic.findMany.mock.calls[0][0].where).toEqual({ clinicId: 'clinic', userId: { in: ['u1'] } });
  });

  it('applies type and inclusive date filters', async () => {
    const { prisma, service } = setup();
    await service.listForPatient(ctx, 'p1', q({ examTypeId: 't9', from: '2026-01-01', to: '2026-12-31' }));
    const where = prisma.exam.findMany.mock.calls[0][0].where;
    expect(where.examTypeId).toBe('t9');
    expect(where.examDate).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-12-31T00:00:00.000Z') });
    expect(prisma.exam.count.mock.calls[0][0].where).toEqual(where);
  });

  it('returns an empty page without looking up people', async () => {
    const { prisma, service } = setup();
    await expect(service.listForPatient(ctx, 'p1', q())).resolves.toEqual({ items: [], total: 0, limit: 50, offset: 0 });
    expect(prisma.userClinic.findMany).not.toHaveBeenCalled();
  });

  it('answers null displayName when the uploader has no membership in the clinic', async () => {
    const { service } = setup({ exams: [exam({ versions: [version(2, 'gone')] })] });
    const page = await service.listForPatient(ctx, 'p1', q());
    expect(page.items[0].latestVersion?.uploadedBy).toEqual({ id: 'gone', displayName: null });
  });

  it.each([
    ['patient of another clinic or missing', { patient: false }],
    ['actor cannot read the patient', { canRead: false }],
  ])('answers 404 PATIENT_NOT_FOUND when %s, without querying exams', async (_n, opts) => {
    const { prisma, service } = setup(opts);
    await expect(service.listForPatient(ctx, 'p1', q())).rejects.toMatchObject({ status: 404 });
    expect(prisma.exam.findMany).not.toHaveBeenCalled();
  });

  it.each([['2026-02-30'], ['2026-13-01']])('rejects the impossible date %s with 400', async (bad) => {
    const { service } = setup();
    await expect(service.listForPatient(ctx, 'p1', q({ from: bad }))).rejects.toMatchObject({ status: 400 });
  });

  it('rejects from > to with 400', async () => {
    const { service } = setup();
    await expect(service.listForPatient(ctx, 'p1', q({ from: '2026-05-02', to: '2026-05-01' }))).rejects.toMatchObject({ status: 400 });
  });
});

describe('ExamsService.get', () => {
  it('returns the detail with the full history, newest first, and the creator', async () => {
    const { prisma, service } = setup({ one: exam() });
    const detail = await service.get(ctx, 'e1');
    expect(detail.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(detail.latestVersion?.id).toBe('v2');
    expect(detail.createdBy).toEqual({ id: 'u1', displayName: 'Dra. Ana' });
    expect(detail.versions[1].uploadedBy).toEqual({ id: 'u2', displayName: null });
    expect(prisma.exam.findFirst.mock.calls[0][0].where).toEqual({ id: 'e1', clinicId: 'clinic', deletedAt: null });
  });

  it.each([
    ['missing, deleted or other clinic', { one: null }],
    ['actor cannot read the patient', { one: exam(), canRead: false }],
  ])('answers 404 EXAM_NOT_FOUND when %s', async (_n, opts) => {
    const { service } = setup(opts as any);
    await expect(service.get(ctx, 'e1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('ExamTypesService', () => {
  it('lists only active types ordered by name', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 't1', code: 'A', name: 'A' }]);
    const out = await new ExamTypesService({ examType: { findMany } } as any).listActive();
    expect(out).toEqual({ items: [{ id: 't1', code: 'A', name: 'A' }] });
    expect(findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });
});
