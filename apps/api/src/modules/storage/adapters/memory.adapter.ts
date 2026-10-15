import { PutResult, StorageError, StorageService } from '../storage.service';

/** Adaptador en memoria para pruebas. No usar en ejecución real. */
export class InMemoryStorageAdapter extends StorageService {
  readonly objects = new Map<string, { body: Buffer; mimeType: string }>();
  /** Si es true, toda operación falla como si el almacén estuviera caído. */
  unavailable = false;

  private ensureAvailable() {
    if (this.unavailable) throw new StorageError('UNAVAILABLE', 'Almacenamiento simulado no disponible.');
  }
  async putIfAbsent(key: string, body: Buffer, mimeType: string): Promise<PutResult> {
    this.ensureAvailable();
    if (this.objects.has(key)) return 'EXISTS';
    this.objects.set(key, { body: Buffer.from(body), mimeType });
    return 'CREATED';
  }
  async get(key: string): Promise<Buffer | null> {
    this.ensureAvailable();
    const found = this.objects.get(key);
    return found ? Buffer.from(found.body) : null;
  }
  async delete(key: string): Promise<void> {
    this.ensureAvailable();
    this.objects.delete(key);
  }
}
