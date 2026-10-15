import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../../common/filters/api-error';
import { S3StorageAdapter } from './adapters/s3.adapter';
import { PutResult, StorageService } from './storage.service';

/** Se usa cuando faltan las variables S3_*: la API arranca, pero las rutas de archivos responden 503. */
class UnconfiguredStorage extends StorageService {
  private fail(): never {
    throw apiError(503, 'STORAGE_NOT_CONFIGURED', 'El almacenamiento de documentos no está configurado (variables S3_*).');
  }
  async putIfAbsent(): Promise<PutResult> { return this.fail(); }
  async get(): Promise<Buffer | null> { return this.fail(); }
  async delete(): Promise<void> { return this.fail(); }
}

/** Elige el adaptador según las variables S3_*; sin S3_ENDPOINT, las rutas de archivos responden 503. */
export function createStorageService(config: Pick<ConfigService, 'get' | 'getOrThrow'>): StorageService {
  const endpoint = config.get<string>('S3_ENDPOINT');
  if (!endpoint) return new UnconfiguredStorage();
  return new S3StorageAdapter({
    endpoint,
    bucket: config.getOrThrow<string>('S3_BUCKET'),
    accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
    secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
    region: config.get<string>('S3_REGION') || 'us-east-1',
  });
}

@Global()
@Module({
  providers: [{ provide: StorageService, inject: [ConfigService], useFactory: createStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
