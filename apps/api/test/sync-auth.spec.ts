import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { PrismaService } from '../src/prisma/prisma.service';

const userId = '00000003-0000-4000-8000-000000000001';
const clinicId = '00000001-0000-4000-8000-000000000001';
const sessionId = '00000004-0000-4000-8000-000000000001';

describe('Sync preserves authenticated claims after password recovery', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let device: { id: string; userId: string; clinicId: string; expiresAt: Date; revokedAt: Date | null };
  const membership = {
    role: 'PATIENT', isActive: true, clinic: { isActive: true }, patient: null,
    permissionRevision: 1n,
  };
  const tx = {
    user: { findUnique: jest.fn() },
    authSession: { findUnique: jest.fn() },
    userClinic: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
    clinic: { findUniqueOrThrow: jest.fn() },
    patient: { findMany: jest.fn() },
    exam: { findMany: jest.fn() },
    syncChange: { findMany: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (work) => work(tx)) };
  const claims = { sub: userId, context: 'TENANT', clinicId, sid: sessionId, credentialsVersion: 1 };
  const sync = (token: string, cursor?: string) => request(app.getHttpServer())
    .get('/api/v1/sync').query({ clinicId, ...(cursor ? { cursor } : {}) })
    .auth(token, { type: 'bearer' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app = module.createNestApplication();
    app.get(ConfigService).set('SYNC_CURSOR_SECRET', 'sync-test-secret-with-at-least-32-bytes');
    configureApplication(app);
    await app.init();
    jwt = app.get(JwtService);
  });
  beforeEach(() => {
    device = { id: sessionId, userId, clinicId, expiresAt: new Date(Date.now() + 86400000), revokedAt: null };
    tx.user.findUnique.mockResolvedValue({ id: userId, email: 'patient@example.com', passwordHash: 'present', credentialsVersion: 1 });
    tx.authSession.findUnique.mockImplementation(async () => device);
    tx.userClinic.findUnique.mockResolvedValue(membership);
    tx.userClinic.findUniqueOrThrow.mockResolvedValue(membership);
    tx.userClinic.findMany.mockResolvedValue([]);
    tx.clinic.findUniqueOrThrow.mockResolvedValue({ syncRevision: 0n });
    tx.patient.findMany.mockResolvedValue([]);
    tx.exam.findMany.mockResolvedValue([]);
    tx.syncChange.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (work) => work(tx));
  });
  afterAll(async () => { await app?.close(); });

  it('accepts a fresh mobile token after credentialsVersion increases and keeps it valid for delta sync', async () => {
    const token = await jwt.signAsync(claims);
    const first = await sync(token).expect(200);
    expect(first.body).toMatchObject({ mode: 'SNAPSHOT', changes: [], access: 'READ_ONLY' });
    await sync(token, first.body.nextCursor).expect(200);
    expect(tx.authSession.findUnique).toHaveBeenCalledTimes(4);
  });
  it('continues rejecting access tokens issued before password recovery', async () => {
    await sync(await jwt.signAsync({ ...claims, credentialsVersion: 0 })).expect(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rechecks mobile session revocation inside the synchronization transaction', async () => {
    prisma.$transaction.mockImplementation(async (work) => {
      device = { ...device, revokedAt: new Date() };
      return work(tx);
    });
    await sync(await jwt.signAsync(claims)).expect(401);
    expect(tx.authSession.findUnique).toHaveBeenCalledTimes(2);
  });
});
