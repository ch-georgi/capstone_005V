import { Prisma } from '@prisma/client';

/** Deadlock / fallo de serialización de PostgreSQL: la operación puede reintentarse completa. */
export function isTransient(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const sqlState = String((error.meta as { code?: unknown } | undefined)?.code ?? '');
  return error.code === 'P2034' || ['40001', '40P01'].includes(sqlState);
}
