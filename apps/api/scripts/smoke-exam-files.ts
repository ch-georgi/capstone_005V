import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { detectMime } from '../src/modules/storage/file-inspection';

export interface SmokeConfig {
  apiUrl: string; email: string; password: string; clinicId: string; patientId: string; examTypeId: string; filePath: string;
}
type Log = (line: string) => void;
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** Recorrido completo contra una API en ejecución. Lanza Error con el primer paso que falle. */
export async function runSmoke(config: SmokeConfig, log: Log = console.log): Promise<void> {
  const api = config.apiUrl.replace(/\/$/, '');
  const expect = (cond: unknown, message: string) => { if (!cond) throw new Error(message); };
  // El cuerpo solo se lee cuando ya hay un fallo que explicar (leerlo antes lo consumiría).
  const detail = async (response: Response) => (await response.clone().text()).slice(0, 300);

  const data = await readFile(config.filePath);
  const mimeType = detectMime(data);
  expect(mimeType, 'El archivo debe ser PDF, JPEG o PNG.');
  const filename = basename(config.filePath);
  log(`Archivo: ${filename} (${data.length} bytes, ${mimeType}, sha256 ${sha(data).slice(0, 12)}…)`);

  const loginResponse = await fetch(`${api}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.password, clinicId: config.clinicId }),
  });
  expect(loginResponse.status === 200, `Login falló con HTTP ${loginResponse.status}. Revisa email, contraseña y clínica.`);
  const token = ((await loginResponse.json()) as { accessToken: string }).accessToken;
  const auth = { authorization: `Bearer ${token}` };
  log('1. Login correcto.');

  const upload = async (envelope: object) => {
    const form = new FormData();
    form.append('request', JSON.stringify(envelope));
    form.append('file', new Blob([data], { type: mimeType! }), filename);
    return fetch(`${api}/exams/uploads`, { method: 'POST', headers: auth, body: form });
  };
  const file = { filename, mimeType, sizeBytes: data.length, sha256: sha(data) };

  const examId = randomUUID(), versionId = randomUUID();
  const create = {
    operationId: randomUUID(), clinicId: config.clinicId, operation: 'CREATE_EXAM_WITH_VERSION',
    payload: { schemaVersion: 1, patientId: config.patientId, examId, versionId, title: 'Examen de prueba (smoke)', examDate: new Date().toISOString().slice(0, 10), examTypeId: config.examTypeId },
    ...file,
  };
  const created = await upload(create);
  if (created.status !== 201) throw new Error(`La carga devolvió HTTP ${created.status}: ${await detail(created)}`);
  const createdBody = (await created.json()) as { examId: string; versionNumber: number; replayed: boolean };
  expect(createdBody.examId === examId && createdBody.versionNumber === 1 && createdBody.replayed === false, 'Respuesta de carga inesperada.');
  log(`2. Examen creado (${examId}), versión 1.`);

  const replay = await upload(create);
  expect(replay.status === 200 && ((await replay.json()) as { replayed: boolean }).replayed === true, `Repetir la operación debía dar 200 con replayed:true (HTTP ${replay.status}).`);
  log('3. Repetir la misma operación es idempotente (200, replayed:true).');

  const conflict = await upload({ ...create, payload: { ...create.payload, title: 'Título distinto' } });
  expect(conflict.status === 409, `Mismo operationId con otro contenido debía dar 409 (HTTP ${conflict.status}).`);
  log('4. Mismo operationId con contenido distinto es rechazado (409).');

  for (const route of ['download', 'view'] as const) {
    const response = await fetch(`${api}/exams/${examId}/versions/${versionId}/${route}`, { headers: auth });
    if (response.status !== 200) throw new Error(`${route} devolvió HTTP ${response.status}: ${await detail(response)}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(sha(bytes) === sha(data), `El archivo de ${route} no es idéntico al subido.`);
    const disposition = response.headers.get('content-disposition') ?? '';
    expect(disposition.startsWith(route === 'download' ? 'attachment' : 'inline'), `Content-Disposition inesperado en ${route}: ${disposition}`);
    log(`${route === 'download' ? 5 : 6}. ${route} devuelve exactamente los mismos bytes (${disposition.split(';')[0]}).`);
  }

  const next = await upload({
    operationId: randomUUID(), clinicId: config.clinicId, operation: 'UPLOAD_VERSION',
    payload: { schemaVersion: 1, patientId: config.patientId, examId, versionId: randomUUID() }, ...file,
  });
  expect(next.status === 201 && ((await next.json()) as { versionNumber: number }).versionNumber === 2, `Nueva versión: HTTP ${next.status}.`);
  log('7. Nueva versión agregada (versión 2).');

  const audit = await fetch(`${api}/audit?examId=${examId}&limit=20`, { headers: auth });
  if (audit.status === 200) {
    const actions = ((await audit.json()) as { items: { action: string }[] }).items.map((i) => i.action).sort();
    log(`8. Auditoría del examen: ${actions.join(', ')} (esperado: CREATE, DOWNLOAD, NEW_VERSION, VIEW).`);
  } else {
    log(`8. No se pudo consultar /audit (HTTP ${audit.status}); el rol usado quizá no es CLINIC_ADMIN.`);
  }
  log('LISTO: la carga y descarga funcionan de extremo a extremo.');
}

/** Si faltan ids, los toma de la base de desarrollo (primer paciente de la clínica y primer tipo de examen activo). */
async function fromEnvironment(): Promise<SmokeConfig> {
  const need = (name: string) => { const v = process.env[name]; if (!v) throw new Error(`Falta la variable ${name}.`); return v; };
  const email = need('SMOKE_EMAIL'), password = need('SMOKE_PASSWORD');
  let { SMOKE_CLINIC_ID: clinicId, SMOKE_PATIENT_ID: patientId, SMOKE_EXAM_TYPE_ID: examTypeId } = process.env;
  if (!clinicId || !patientId || !examTypeId) {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    try {
      clinicId ??= (await db.userClinic.findFirst({ where: { user: { email: email.toLowerCase() }, isActive: true }, select: { clinicId: true } }))?.clinicId;
      if (!clinicId) throw new Error('No se encontró una clínica activa para ese usuario; define SMOKE_CLINIC_ID.');
      patientId ??= (await db.patient.findFirst({ where: { clinicId, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
      examTypeId ??= (await db.examType.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true } }))?.id;
    } finally { await db.$disconnect(); }
  }
  if (!patientId || !examTypeId) throw new Error('No se encontró paciente o tipo de examen; define SMOKE_PATIENT_ID y SMOKE_EXAM_TYPE_ID.');
  return {
    apiUrl: process.env.SMOKE_API_URL ?? 'http://localhost:3000/api/v1', email, password, clinicId, patientId, examTypeId,
    filePath: resolve(process.env.SMOKE_FILE ?? resolve(__dirname, '../../../database/fixtures/documento-demo.pdf')),
  };
}

if (require.main === module) {
  import('dotenv/config')
    .then(fromEnvironment)
    .then((config) => runSmoke(config))
    .catch((error) => { console.error(error instanceof Error ? `FALLÓ: ${error.message}` : 'FALLÓ: error desconocido.'); process.exitCode = 1; });
}
