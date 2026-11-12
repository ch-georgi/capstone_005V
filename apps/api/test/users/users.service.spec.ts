import { UsersService } from '../../src/modules/users/users.service';

function setup(opts: { user?: { id: string } | null } = {}) {
  const tx: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue('user' in opts ? opts.user : { id: 'u1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    authSession: { updateMany: jest.fn().mockResolvedValue({}) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const passwords: any = { hash: jest.fn().mockResolvedValue('hashed') };
  const contexts: any = {};
  return { tx, prisma, service: new UsersService(prisma, passwords, contexts) };
}

describe('UsersService.setPasswordAsGlobal', () => {
  it('hashes the password, bumps credentialsVersion and revokes active sessions/refresh tokens', async () => {
    const { tx, service } = setup();
    await service.setPasswordAsGlobal('u1', 'brand-new-password');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { passwordHash: 'hashed', credentialsVersion: { increment: 1 } } });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('answers 404 when the user does not exist, without writing anything', async () => {
    const { tx, service } = setup({ user: null });
    await expect(service.setPasswordAsGlobal('missing', 'brand-new-password')).rejects.toMatchObject({ status: 404, response: expect.objectContaining({ code: 'USER_NOT_FOUND' }) });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
