import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/application';
import { PrismaService } from '../../src/prisma/prisma.service';
import { S3StorageAdapter } from '../../src/modules/storage/adapters/s3.adapter';
import { createStorageService } from '../../src/modules/storage/storage.module';
import { StorageService } from '../../src/modules/storage/storage.service';

const fakeConfig = (values: Record<string, string>) => ({
  get: (key: string) => values[key],
  getOrThrow: (key: string) => { if (!values[key]) throw new Error(`${key} missing`); return values[key]; },
}) as unknown as ConfigService;

describe('storage selection', () => {
  const s3 = { S3_ENDPOINT: 'http://localhost:9222', S3_BUCKET: 'wellq-dev', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' };
  it('without S3_ENDPOINT every storage call answers 503 STORAGE_NOT_CONFIGURED', async () => {
    const storage = createStorageService(fakeConfig({}));
    expect(storage).not.toBeInstanceOf(S3StorageAdapter);
    for (const call of [() => storage.get('x'), () => storage.putIfAbsent('x', Buffer.alloc(1), 'application/pdf'), () => storage.delete('x')]) {
      await expect(call()).rejects.toMatchObject({ status: 503, response: { code: 'STORAGE_NOT_CONFIGURED' } });
    }
  });
  it('uses the S3/MinIO adapter when the S3 variables are present, and fails fast if one is missing', () => {
    expect(createStorageService(fakeConfig(s3))).toBeInstanceOf(S3StorageAdapter);
    expect(() => createStorageService(fakeConfig({ ...s3, S3_BUCKET: '' }))).toThrow('S3_BUCKET');
  });
});

/** Arranca AppModule completo (sin base de datos real) para detectar errores de inyección de dependencias. */
describe('application wiring', () => {
  it('boots with all modules, exposes the new routes and protects them with authentication', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({ $connect: async () => undefined, $disconnect: async () => undefined }).compile();
    const app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    try {
      expect(app.get(StorageService)).toBeInstanceOf(StorageService);
      const doc = (await request(app.getHttpServer()).get('/api/openapi.json').expect(200)).body;
      for (const path of ['/api/v1/exams/uploads', '/api/v1/exams/{examId}/versions/{versionId}/download', '/api/v1/exams/{examId}/versions/{versionId}/view']) {
        expect(doc.paths).toHaveProperty(path);
      }
      await request(app.getHttpServer()).post('/api/v1/exams/uploads').expect(401);
      await request(app.getHttpServer()).get('/api/v1/exams/a/versions/b/download').expect(401);
    } finally { await app.close(); }
  });
});
