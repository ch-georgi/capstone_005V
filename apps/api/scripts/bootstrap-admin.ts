import 'reflect-metadata';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { bootstrapAdmin } from '../src/modules/users/bootstrap-admin';

const db = new PrismaClient();
async function main() {
  const result = await bootstrapAdmin(db, process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);
  console.log(result.created ? 'Superadmin creado sin membresías clínicas.' : 'Superadmin existente; credenciales conservadas.');
}
main().catch(error => {
  // Configuration/domain messages contain no credentials. Never print Prisma errors.
  console.error(error instanceof Error && !(error.name.startsWith('Prisma'))
    ? error.message : 'No se pudo crear el superadmin. Revisa la base de datos.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
