import { Prisma } from '@prisma/client';
import { UserMembersService } from '../../src/modules/users/user-members.service';

const ctx: any = { kind: 'TENANT', actorId: 'admin', clinicId: 'clinic', role: 'CLINIC_ADMIN', access: 'READ_WRITE' };
const info = { ipAddress: '10.0.0.1', userAgent: 'jest' };
const T = new Date('2026-10-15T12:00:00.000Z');
const row = (over: any = {}) => ({
  userId: 'u1', clinicId: 'clinic', role: 'CLINICIAN', isActive: true, displayName: 'Dra. Ana', createdAt: T, updatedAt: T,
  user: { email: 'ana@example.com', passwordHash: 'hash' }, patient: null, ...over,
});

function setup(opts: { member?: any; actorOk?: boolean; page?: any[]; total?: number } = {}) {
  const sql: string[] = [];
  const tx: any = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const q = strings.join('?'); sql.push(q);
      return q.includes("'CLINIC_ADMIN'") ? [{ ok: opts.actorOk ?? true }] : [];
    }),
    userClinic: {
      findUnique: jest.fn().mockResolvedValue('member' in opts ? opts.member : row()),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    $transaction: jest.fn((fn: any) => fn(tx)),
    userClinic: {
      count: jest.fn().mockResolvedValue(opts.total ?? 0),
      findMany: jest.fn().mockResolvedValue(opts.page ?? []),
      findUnique: jest.fn().mockResolvedValue('member' in opts ? opts.member : row()),
    },
  };
  const audit: any = { record: jest.fn().mockResolvedValue({}) };
  return { tx, prisma, audit, sql, service: new UserMembersService(prisma, audit) };
}

describe('UserMembersService.list/get', () => {
  it('lists members of the session clinic with a safe DTO (no password hash, no emails of others)', async () => {
    const { prisma, service } = setup({ page: [row(), row({ userId: 'p1', role: 'PATIENT', user: { email: null, passwordHash: null }, patient: { id: 'pat1' } })], total: 9 });
    const page = await service.list(ctx, { limit: 10, offset: 5 });
    expect(page).toMatchObject({ total: 9, limit: 10, offset: 5 });
    expect(page.items[0]).toEqual({
      id: 'u1', email: 'ana@example.com', displayName: 'Dra. Ana', role: 'CLINICIAN', isActive: true, hasCredentials: true, patientId: null,
      createdAt: T.toISOString(), updatedAt: T.toISOString(),
    });
    expect(page.items[1]).toMatchObject({ email: null, hasCredentials: false, patientId: 'pat1' });
    expect(JSON.stringify(page)).not.toContain('hash');
    const args = prisma.userClinic.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ clinicId: 'clinic' });
    expect(args).toMatchObject({ take: 10, skip: 5 });
  });

  it('applies role, status and text filters', async () => {
    const { prisma, service } = setup();
    await service.list(ctx, { limit: 50, offset: 0, role: 'PATIENT' as any, isActive: false, q: 'ana' });
    const where = prisma.userClinic.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ clinicId: 'clinic', role: 'PATIENT', isActive: false });
    expect(where.OR).toEqual([
      { displayName: { contains: 'ana', mode: 'insensitive' } },
      { user: { email: { contains: 'ana', mode: 'insensitive' } } },
    ]);
    expect(prisma.userClinic.count.mock.calls[0][0].where).toEqual(where);
  });

  it('gets a member by clinic-scoped key and answers 404 for others', async () => {
    const found = setup();
    await expect(found.service.get(ctx, 'u1')).resolves.toMatchObject({ id: 'u1' });
    expect(found.prisma.userClinic.findUnique.mock.calls[0][0].where).toEqual({ userId_clinicId: { userId: 'u1', clinicId: 'clinic' } });
    await expect(setup({ member: null }).service.get(ctx, 'zz')).rejects.toMatchObject({ status: 404 });
  });
});

describe('UserMembersService.update', () => {
  it('changes only what differs, audits with field names and role transition, and returns the member', async () => {
    const { tx, audit, service } = setup();
    const out = await service.update(ctx, 'u1', { displayName: 'Dra. Ana Soto', role: 'CLINIC_ADMIN' as any, isActive: true }, info);
    expect(out).toMatchObject({ id: 'u1' });
    expect(tx.userClinic.update).toHaveBeenCalledWith({
      where: { userId_clinicId: { userId: 'u1', clinicId: 'clinic' } }, data: { displayName: 'Dra. Ana Soto', role: 'CLINIC_ADMIN' },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      clinicId: 'clinic', actorId: 'admin', action: 'UPDATE',
      metadata: { entity: 'USER_CLINIC', userId: 'u1', roleFrom: 'CLINICIAN', roleTo: 'CLINIC_ADMIN', changedFields: ['displayName', 'role'] }, ...info,
    }), tx);
  });

  it('locks the clinic before memberships and rechecks that the actor is still an active admin', async () => {
    const { sql, service } = setup();
    await service.update(ctx, 'u1', { isActive: false }, info);
    expect(sql[0]).toContain('FROM clinics');
    expect(sql[1]).toContain('FROM user_clinics');
    expect(sql[2]).toContain('FROM user_clinics');
  });

  it('deactivates a member and links the audit to the patient record when there is one', async () => {
    const { tx, audit, service } = setup({ member: row({ role: 'PATIENT', patient: { id: 'pat1' } }) });
    await service.update(ctx, 'u1', { isActive: false }, info);
    expect(tx.userClinic.update.mock.calls[0][0].data).toEqual({ isActive: false });
    expect(audit.record.mock.calls[0][0].patientId).toBe('pat1');
  });

  it('does nothing and audits nothing when values are identical', async () => {
    const { tx, audit, service } = setup();
    await service.update(ctx, 'u1', { displayName: 'Dra. Ana', role: 'CLINICIAN' as any, isActive: true }, info);
    expect(tx.userClinic.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects an empty update before opening a transaction', async () => {
    const { prisma, service } = setup();
    await expect(service.update(ctx, 'u1', {}, info)).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['role', { role: 'CLINICIAN' }],
    ['deactivation', { isActive: false }],
  ])('forbids changing your own %s with 409 but allows renaming yourself', async (_n, dto) => {
    const a = setup();
    await expect(a.service.update(ctx, 'admin', dto as any, info)).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'SELF_CHANGE_FORBIDDEN' }) });
    expect(a.prisma.$transaction).not.toHaveBeenCalled();
    const b = setup({ member: row({ userId: 'admin', role: 'CLINIC_ADMIN', displayName: 'Admin' }) });
    await b.service.update(ctx, 'admin', { displayName: 'Admin Nuevo' }, info);
    expect(b.tx.userClinic.update).toHaveBeenCalled();
  });

  it('never changes the role of a patient (409) and answers 404 for unknown members', async () => {
    const patient = setup({ member: row({ role: 'PATIENT' }) });
    await expect(patient.service.update(ctx, 'u1', { role: 'CLINICIAN' as any }, info)).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'PATIENT_ROLE_LOCKED' }) });
    expect(patient.tx.userClinic.update).not.toHaveBeenCalled();
    await expect(setup({ member: null }).service.update(ctx, 'u1', { isActive: false }, info)).rejects.toMatchObject({ status: 404 });
  });

  it('answers 403 when the actor stopped being an active admin', async () => {
    const { tx, audit, service } = setup({ actorOk: false });
    await expect(service.update(ctx, 'u1', { isActive: false }, info)).rejects.toMatchObject({ status: 403 });
    expect(tx.userClinic.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('retries transient conflicts up to 3 times', async () => {
    const transient = new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2034', clientVersion: 'x' });
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue(transient);
    await expect(service.update(ctx, 'u1', { isActive: false }, info)).rejects.toBe(transient);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
