import { Prisma } from '@prisma/client';

/** Base de datos en memoria que imita SOLO las llamadas de Prisma que usan los servicios de archivos. */
export class FakeDb {
  patients = new Map<string, { id: string; clinicId: string; deletedAt: Date | null }>();
  writable = new Set<string>(); // "actor:patient" que can_write_patient aprueba
  readable = new Set<string>(); // "actor:patient" que can_read_patient aprueba
  examTypes = new Map<string, { isActive: boolean }>();
  exams = new Map<string, any>();
  versions: any[] = [];
  idempotency: any[] = [];
  syncChanges: { entity: string; entityId: string }[] = [];
  jobs: { versionId: string; storageKey: string }[] = [];
  audits: any[] = [];
  failOn: string | undefined; // p. ej. 'exam.create' para simular una falla de la BD
  transactions = 0;
  rawSql: string[] = [];

  private snapshot() {
    return structuredClone({ exams: [...this.exams], versions: this.versions, idempotency: this.idempotency, audits: this.audits });
  }
  private restore(s: ReturnType<FakeDb['snapshot']>) {
    this.exams = new Map(s.exams); this.versions = s.versions; this.idempotency = s.idempotency; this.audits = s.audits;
  }
  private maybeFail(op: string) { if (this.failOn === op) throw new Error(`BD simulada: falla en ${op}`); }

  readonly tx: any = {
    $executeRaw: async (strings: TemplateStringsArray) => { this.rawSql.push(strings.join('?')); return 0; },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      this.rawSql.push(sql);
      if (sql.includes('can_write_patient')) return [{ ok: this.writable.has(`${values[0]}:${values[1]}`) }];
      if (sql.includes('can_read_patient')) return [{ ok: this.readable.has(`${values[0]}:${values[1]}`) }];
      return [];
    },
    idempotencyRecord: {
      findUnique: async ({ where: { userId_clinicId_operationId: k } }: any) =>
        this.idempotency.find((r) => r.userId === k.userId && r.clinicId === k.clinicId && r.operationId === k.operationId) ?? null,
      create: async ({ data }: any) => { this.maybeFail('idempotency.create'); this.idempotency.push(structuredClone(data)); return data; },
    },
    patient: {
      findFirst: async ({ where }: any) => {
        const p = this.patients.get(where.id);
        return p && p.clinicId === where.clinicId && p.deletedAt === null ? { id: p.id } : null;
      },
    },
    examType: { findUnique: async ({ where }: any) => this.examTypes.get(where.id) ?? null },
    exam: {
      findUnique: async ({ where }: any) => this.exams.get(where.id) ?? null,
      findFirst: async ({ where }: any) => {
        const e = this.exams.get(where.id);
        return e && e.clinicId === where.clinicId && (!where.patientId || e.patientId === where.patientId) && e.deletedAt === null ? e : null;
      },
      create: async ({ data }: any) => { this.maybeFail('exam.create'); this.exams.set(data.id, { ...data, deletedAt: null }); return data; },
    },
    examVersion: {
      findFirst: async ({ where }: any) => this.versions.find((v) => where.OR.some((c: any) => (c.id && v.id === c.id) || (c.storageKey && v.storageKey === c.storageKey))) ?? null,
      aggregate: async ({ where }: any) => {
        const numbers = this.versions.filter((v) => v.examId === where.examId).map((v) => v.versionNumber);
        return { _max: { versionNumber: numbers.length ? Math.max(...numbers) : null } };
      },
      create: async ({ data }: any) => { this.maybeFail('examVersion.create'); this.versions.push(structuredClone(data)); return data; },
    },
    syncChange: { findFirst: async ({ where }: any) => this.syncChanges.find((c) => c.entity === where.entity && c.entityId === where.entityId) ?? null },
    storageDeletionJob: {
      findFirst: async ({ where }: any) => this.jobs.find((j) => where.OR.some((c: any) => (c.versionId && j.versionId === c.versionId) || (c.storageKey && j.storageKey === c.storageKey))) ?? null,
    },
  };

  /** Imita PrismaService: $transaction con rollback ante cualquier excepción. */
  readonly prisma: any = {
    ...this.tx,
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      this.transactions++;
      const before = this.snapshot();
      try { return await callback(this.tx); } catch (error) { this.restore(before); throw error; }
    },
    examVersion: {
      ...this.tx.examVersion,
      findFirst: async ({ where, include }: any) => {
        const v = this.versions.find((x) => x.id === where.id && x.examId === where.examId);
        const exam = v && this.exams.get(v.examId);
        if (!v || !exam || exam.clinicId !== where.exam.clinicId || exam.deletedAt !== null) return null;
        return include ? { ...v, exam: { patientId: exam.patientId } } : v;
      },
    },
  };

  readonly audit = {
    record: async (data: any) => { this.maybeFail('audit.record'); this.audits.push(structuredClone(data)); return data; },
  };
}

export const transientError = () => new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict', { code: 'P2034', clientVersion: '5.22.0' });
