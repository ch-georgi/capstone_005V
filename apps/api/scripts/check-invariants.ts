import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const api=resolve(__dirname,'..');
const migration=readFileSync(resolve(api,'prisma/migrations/20261001030827_init/migration.sql'),'utf8');
const invariants=readFileSync(resolve(api,'../../database/postgresql/invariants.sql'),'utf8');
assert.ok(migration.endsWith(invariants),'Custom SQL migration is out of sync');
console.log('Custom PostgreSQL SQL is synchronized with the migration.');
