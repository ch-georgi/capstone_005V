/**
 * Datos de demostración (PB-109): 6 pacientes sintéticos en Clínica A con exámenes de todos los
 * tipos, varias versiones, documentos reales (PDF/PNG generados aquí) y un historial de auditoría.
 *
 * Es idempotente: los UUID son estables y lo ya creado se omite. Se ejecuta después de `db:seed`:
 *   npm run db:seed-demo
 * Sube los archivos al bucket si S3_* está configurado (en el entorno o en apps/api/.env).
 * Todos los datos son ficticios.
 */
import { PrismaClient, TenantRole, AuditAction } from '@prisma/client';
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------- .env mínimo (no sobreescribe variables ya definidas) ----------
const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const db = new PrismaClient();
const id = (group: number, n: number) =>
  `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const CLINIC_A = id(1, 1);
const ADMIN_A = id(3, 1);
const CLINICIAN_1 = id(4, 1);
const CLINICIAN_2 = id(4, 2);
const TYPES = ['LAB', 'IMAGING', 'MEDICAL_REPORT', 'REFERRAL', 'FUNCTIONAL', 'OTHER'];

// ---------- Generación de archivos ----------
export function pdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) =>
    Array.from(Buffer.from(s, 'latin1'))
      .map((b) => (b > 126 || b < 32 ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b)))
      .join('')
      .replace(/([()])/g, '\\$1');
  let y = 790;
  let content = `BT /F2 18 Tf 56 ${y} Td (${esc(title)}) Tj ET\n`;
  y -= 34;
  for (const l of lines) {
    content += `BT /F1 11 Tf 56 ${y} Td (${esc(l)}) Tj ET\n`;
    y -= 18;
  }
  content += `BT /F1 8 Tf 56 40 Td (${esc('Documento sintético de demostración - WellQ. No corresponde a un paciente real.')}) Tj ET\n`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (out += `${o.toString().padStart(10, '0')} 00000 n \n`));
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** PNG RGB 480x320 con un degradado y un círculo; la semilla cambia el color. */
export function png(seed: number): Buffer {
  const w = 480, h = 320;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const d = Math.hypot(x - w / 2, y - h / 2);
      const ring = d < 110 && d > 90 ? 70 : 0;
      raw[o] = Math.min(255, 20 + ((x * 80) / w) + ((seed * 37) % 90) + ring);
      raw[o + 1] = Math.min(255, 30 + ((y * 120) / h) + ring);
      raw[o + 2] = Math.min(255, 60 + ((seed * 53) % 120) + ring);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Datos ----------
const PATIENTS = [
  { first: 'Camila', last: 'Rojas Fuentes', dob: '1988-03-14', phone: '+56 9 5555 0001' },
  { first: 'Matías', last: 'Soto Araya', dob: '1975-11-02', phone: '+56 9 5555 0002' },
  { first: 'Valentina', last: 'Muñoz Pino', dob: '1996-07-21', phone: '+56 9 5555 0003' },
  { first: 'José', last: 'Tapia Vera', dob: '1962-01-30', phone: '+56 9 5555 0004' },
  { first: 'Francisca', last: 'Díaz Lagos', dob: '1991-09-09', phone: '+56 9 5555 0005' },
  { first: 'Ignacio', last: 'Pérez Ortiz', dob: '1983-05-18', phone: '+56 9 5555 0006' },
];

type V = { file: string; kind: 'pdf' | 'png'; note?: string };
type E = { p: number; type: string; title: string; date: string; prof: string; notes?: string; by?: string; v: V[] };
const EXAMS: E[] = [
  { p: 0, type: 'LAB', title: 'Hemograma completo', date: '2026-03-12', prof: 'Dra. Paula Reyes', notes: 'Valores dentro de rango.', v: [{ file: 'hemograma-camila.pdf', kind: 'pdf' }] },
  { p: 0, type: 'IMAGING', title: 'Resonancia de rodilla derecha', date: '2026-06-02', prof: 'Dr. Roberto Soto', notes: 'Lesión meniscal leve.', v: [{ file: 'resonancia-rodilla.png', kind: 'png' }] },
  { p: 0, type: 'FUNCTIONAL', title: 'Evaluación funcional inicial', date: '2026-08-20', prof: 'Klga. Andrea Vidal', v: [{ file: 'eval-funcional-v1.pdf', kind: 'pdf' }, { file: 'eval-funcional-v2.pdf', kind: 'pdf', note: 'Se agregan mediciones de rango articular.' }] },
  { p: 1, type: 'LAB', title: 'Perfil lipídico', date: '2026-02-18', prof: 'Dra. Paula Reyes', notes: 'Colesterol LDL elevado.', v: [{ file: 'perfil-lipidico.pdf', kind: 'pdf' }] },
  { p: 1, type: 'MEDICAL_REPORT', title: 'Informe de control cardiológico', date: '2026-05-07', prof: 'Dr. Felipe Contreras', v: [{ file: 'informe-cardiologico-v1.pdf', kind: 'pdf' }, { file: 'informe-cardiologico-v2.pdf', kind: 'pdf', note: 'Corrección de dosis.' }, { file: 'informe-cardiologico-v3.pdf', kind: 'pdf', note: 'Firma del especialista.' }] },
  { p: 1, type: 'IMAGING', title: 'Radiografía de tórax AP', date: '2026-09-15', prof: 'Dr. Roberto Soto', notes: 'Sin hallazgos patológicos relevantes.', v: [{ file: 'rx-torax.png', kind: 'png' }] },
  { p: 1, type: 'REFERRAL', title: 'Derivación a kinesiología', date: '2026-09-28', prof: 'Dra. Paula Reyes', by: 'c2', v: [{ file: 'derivacion-kinesiologia.pdf', kind: 'pdf' }] },
  { p: 2, type: 'LAB', title: 'Glicemia en ayunas', date: '2026-04-03', prof: 'Dra. Camila Ibáñez', v: [{ file: 'glicemia.pdf', kind: 'pdf' }] },
  { p: 2, type: 'IMAGING', title: 'Ecografía abdominal', date: '2026-07-11', prof: 'Dr. Álvaro Núñez', notes: 'Control en 6 meses.', v: [{ file: 'ecografia-abdominal.png', kind: 'png' }] },
  { p: 2, type: 'OTHER', title: 'Certificado médico', date: '2026-10-01', prof: 'Dra. Camila Ibáñez', by: 'c2', v: [{ file: 'certificado-medico.pdf', kind: 'pdf' }] },
  { p: 3, type: 'FUNCTIONAL', title: 'Test de marcha de 6 minutos', date: '2026-01-27', prof: 'Klgo. Mauricio Salas', v: [{ file: 'test-marcha.pdf', kind: 'pdf' }] },
  { p: 3, type: 'MEDICAL_REPORT', title: 'Epicrisis hospitalización', date: '2026-03-30', prof: 'Dr. Felipe Contreras', v: [{ file: 'epicrisis-v1.pdf', kind: 'pdf' }, { file: 'epicrisis-v2.pdf', kind: 'pdf', note: 'Se adjunta tratamiento al alta.' }] },
  { p: 3, type: 'LAB', title: 'Examen de orina completo', date: '2026-08-05', prof: 'Dra. Paula Reyes', v: [{ file: 'orina-completa.pdf', kind: 'pdf' }] },
  { p: 3, type: 'IMAGING', title: 'Radiografía de columna lumbar', date: '2026-10-08', prof: 'Dr. Roberto Soto', v: [{ file: 'rx-columna.png', kind: 'png' }] },
  { p: 4, type: 'LAB', title: 'Perfil tiroideo', date: '2026-05-22', prof: 'Dra. Camila Ibáñez', v: [{ file: 'perfil-tiroideo.pdf', kind: 'pdf' }] },
  { p: 4, type: 'REFERRAL', title: 'Derivación a endocrinología', date: '2026-06-10', prof: 'Dra. Camila Ibáñez', v: [{ file: 'derivacion-endocrinologia.pdf', kind: 'pdf' }] },
  { p: 4, type: 'MEDICAL_REPORT', title: 'Informe de evolución', date: '2026-09-02', prof: 'Dr. Felipe Contreras', by: 'c2', v: [{ file: 'informe-evolucion.pdf', kind: 'pdf' }] },
  { p: 5, type: 'IMAGING', title: 'TAC de cráneo', date: '2026-02-09', prof: 'Dr. Álvaro Núñez', v: [{ file: 'tac-craneo.png', kind: 'png' }] },
  { p: 5, type: 'FUNCTIONAL', title: 'Evaluación de equilibrio', date: '2026-07-30', prof: 'Klga. Andrea Vidal', v: [{ file: 'eval-equilibrio-v1.pdf', kind: 'pdf' }, { file: 'eval-equilibrio-v2.pdf', kind: 'pdf', note: 'Reevaluación a 4 semanas.' }] },
  { p: 5, type: 'LAB', title: 'Hemoglobina glicosilada', date: '2026-09-21', prof: 'Dra. Paula Reyes', v: [{ file: 'hba1c.pdf', kind: 'pdf' }] },
  { p: 5, type: 'OTHER', title: 'Consentimiento informado', date: '2026-10-12', prof: 'Dr. Felipe Contreras', v: [{ file: 'consentimiento.pdf', kind: 'pdf' }] },
];
const DELETED_TITLE = 'Examen cargado por error';

// ---------- Subida a S3 (misma firma que upload-fixtures) ----------
const hash = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
const hmac = (key: string | Buffer, text: string) => createHmac('sha256', key).update(text).digest();
async function put(storageKey: string, data: Buffer, mime: string) {
  const endpoint = new URL(process.env.S3_ENDPOINT!);
  const bucket = process.env.S3_BUCKET!, key = process.env.S3_ACCESS_KEY_ID!, secret = process.env.S3_SECRET_ACCESS_KEY!;
  const region = process.env.S3_REGION || 'us-east-1';
  const sha = hash(data);
  const url = new URL('/' + [bucket, ...storageKey.split('/')].map(encodeURIComponent).join('/'), endpoint);
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), day = date.slice(0, 8);
  const headers = { 'content-type': mime, host: url.host, 'x-amz-content-sha256': sha, 'x-amz-date': date };
  const signed = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonical = ['PUT', url.pathname, '', Object.entries(headers).map(([k, v]) => `${k}:${v}\n`).join(''), signed, sha].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secret, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(['AWS4-HMAC-SHA256', date, scope, hash(canonical)].join('\n')).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  const res = await fetch(url, { method: 'PUT', headers: { ...headers, authorization }, body: new Uint8Array(data) });
  if (!res.ok) throw new Error(`Subida fallida (${res.status}) para ${storageKey}`);
}

function content(e: E, v: V, n: number, patientName: string): { data: Buffer; mime: string } {
  if (v.kind === 'png') return { data: png(e.p * 10 + n), mime: 'image/png' };
  const lines = [
    `Paciente: ${patientName}`,
    `Tipo de examen: ${e.type}`,
    `Fecha del examen: ${e.date}`,
    `Profesional: ${e.prof}`,
    `Versión: ${n}${v.note ? ` - ${v.note}` : ''}`,
    ...(e.notes ? ['', `Observaciones: ${e.notes}`] : []),
  ];
  return { data: pdf(e.title, lines), mime: 'application/pdf' };
}

async function main() {
  const canUpload = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].every((k) => process.env[k]);
  if (!canUpload) console.warn('Aviso: S3_* no está configurado; se crean los registros pero NO los archivos.');

  const admin = await db.userClinic.findUnique({ where: { userId_clinicId: { userId: ADMIN_A, clinicId: CLINIC_A } } });
  if (!admin) throw new Error('Falta el seed base. Ejecuta primero: npm run db:seed');

  // Pacientes: cuenta sin credenciales + membresía PATIENT + ficha.
  const patientIds: string[] = [];
  for (let i = 0; i < PATIENTS.length; i++) {
    const p = PATIENTS[i], userId = id(20, i + 1), patientId = id(21, i + 1);
    patientIds.push(patientId);
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: null, passwordHash: null } });
    await db.userClinic.upsert({
      where: { userId_clinicId: { userId, clinicId: CLINIC_A } }, update: {},
      create: { userId, clinicId: CLINIC_A, role: TenantRole.PATIENT, displayName: `${p.first} ${p.last}` },
    });
    await db.patient.upsert({
      where: { id: patientId }, update: {},
      create: {
        id: patientId, userId, clinicId: CLINIC_A, firstName: p.first, lastName: p.last,
        dateOfBirth: new Date(`${p.dob}T00:00:00Z`), email: `contacto.demo${i + 1}@example.com`,
        phone: p.phone, medicalRecordNumber: `DEMO-${String(i + 1).padStart(3, '0')}`,
      },
    });
  }

  let created = 0, uploaded = 0;
  const allExams = [...EXAMS.map((e, i) => ({ e, n: i + 1, deleted: false })),
    { e: { p: 3, type: 'OTHER', title: DELETED_TITLE, date: '2026-09-01', prof: 'Dr. Felipe Contreras', v: [{ file: 'cargado-por-error.pdf', kind: 'pdf' as const }] } as E, n: EXAMS.length + 1, deleted: true }];

  for (const { e, n, deleted } of allExams) {
    const examId = id(22, n), patientId = patientIds[e.p], patientName = `${PATIENTS[e.p].first} ${PATIENTS[e.p].last}`;
    const actor = e.by === 'c2' ? CLINICIAN_2 : CLINICIAN_1;
    const base = new Date(`${e.date}T13:00:00Z`);
    const files = e.v.map((v, k) => {
      const versionId = id(23, n * 10 + k + 1);
      const c = content(e, v, k + 1, patientName);
      return { v, k, versionId, ...c, sha: hash(c.data),
        key: `clinics/${CLINIC_A}/patients/${patientId}/exams/${examId}/versions/${versionId}`,
        at: new Date(base.getTime() + k * 4 * 86_400_000) };
    });

    if (!(await db.exam.findUnique({ where: { id: examId } }))) {
      await db.$transaction(async (tx) => {
        // Mismo orden de bloqueo que la API: clínica primero, luego examen.
        await tx.$queryRaw`SELECT id FROM clinics WHERE id=${CLINIC_A}::uuid FOR UPDATE`;
        await tx.exam.create({
          data: {
            id: examId, clinicId: CLINIC_A, patientId, examTypeId: id(2, TYPES.indexOf(e.type) + 1),
            title: e.title, examDate: new Date(`${e.date}T00:00:00Z`), professionalName: e.prof,
            notes: e.notes ?? null, createdBy: actor, createdAt: base, updatedAt: base,
          },
        });
        for (const f of files) {
          await tx.examVersion.create({
            data: {
              id: f.versionId, examId, versionNumber: f.k + 1, storageKey: f.key, originalFilename: f.v.file,
              mimeType: f.mime, sizeBytes: BigInt(f.data.length), sha256: f.sha, uploadedBy: actor, createdAt: f.at,
            },
          });
          await tx.auditLog.create({
            data: {
              clinicId: CLINIC_A, actorId: actor, patientId, examId, examVersionId: f.versionId,
              action: f.k === 0 ? AuditAction.CREATE : AuditAction.NEW_VERSION, createdAt: f.at,
              ipAddress: '127.0.0.1', userAgent: 'seed-demo',
            },
          });
        }
        if (deleted) {
          const when = new Date('2026-09-02T15:30:00Z');
          await tx.exam.update({ where: { id: examId }, data: { deletedAt: when, deletedBy: ADMIN_A } });
          await tx.auditLog.create({
            data: { clinicId: CLINIC_A, actorId: ADMIN_A, patientId, examId, action: AuditAction.DELETE, createdAt: when, ipAddress: '127.0.0.1', userAgent: 'seed-demo' },
          });
        }
      });
      created++;
    }
    if (canUpload) for (const f of files) { await put(f.key, f.data, f.mime); uploaded++; }
  }

  // Actividad de consulta reciente (VIEW/DOWNLOAD) para que el panel de auditoría tenga movimiento.
  const already = await db.auditLog.count({ where: { clinicId: CLINIC_A, userAgent: 'seed-demo-actividad' } });
  if (!already) {
    const picks = [1, 2, 5, 6, 9, 12, 15, 18, 20];
    let hoursAgo = 2;
    for (const n of picks) {
      const e = EXAMS[n - 1], examId = id(22, n), patientId = patientIds[e.p];
      const last = e.v.length;
      const versionId = id(23, n * 10 + last);
      const actor = n % 2 ? CLINICIAN_1 : CLINICIAN_2;
      await db.auditLog.create({ data: { clinicId: CLINIC_A, actorId: actor, patientId, examId, examVersionId: versionId, action: AuditAction.VIEW, createdAt: new Date(Date.now() - hoursAgo++ * 3_600_000), ipAddress: '127.0.0.1', userAgent: 'seed-demo-actividad' } });
      if (n % 3 === 0) await db.auditLog.create({ data: { clinicId: CLINIC_A, actorId: ADMIN_A, patientId, examId, examVersionId: versionId, action: AuditAction.DOWNLOAD, createdAt: new Date(Date.now() - hoursAgo++ * 3_600_000), ipAddress: '127.0.0.1', userAgent: 'seed-demo-actividad' } });
    }
  }

  console.log(`Demo: ${PATIENTS.length} pacientes, ${created} exámenes nuevos (${allExams.length} en total, 1 eliminado), ${uploaded} archivos subidos.`);
}
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
}
