// apps/api/prisma/seed.ts
//
// Seed data alineado al requisito OR-002 de la Propuesta de Redefinición:
//   Clínica A, Clínica B
//   2 administradores, 4 profesionales, 10 pacientes, 20 exámenes
//
// Uso:
//   npx ts-node prisma/seed.ts
//   (o configurar "prisma": { "seed": "ts-node prisma/seed.ts" } en
//    package.json para correrlo automáticamente con `npx prisma db seed`)

import { PrismaClient, UserRole } from "@prisma/client";
import * as argon2 from "argon2"; // RNF-001: hash seguro (Argon2)

const prisma = new PrismaClient();

const EXAM_TYPES = [
  { code: "LAB", name: "Examen de laboratorio" },
  { code: "IMAGING", name: "Estudio de imagenología" },
  { code: "MEDICAL_REPORT", name: "Informe médico" },
  { code: "REFERRAL", name: "Derivación" },
  { code: "FUNCTIONAL", name: "Evaluación funcional" },
  { code: "OTHER", name: "Otro" },
];

async function main() {
  console.log("Limpiando datos existentes...");
  await prisma.auditLog.deleteMany();
  await prisma.examVersion.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.patientClinic.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userClinic.deleteMany();
  await prisma.user.deleteMany();
  await prisma.examType.deleteMany();
  await prisma.clinic.deleteMany();

  // ---------- Catálogo de tipos de examen ----------
  console.log("Creando catálogo de tipos de examen...");
  const examTypes = await Promise.all(
    EXAM_TYPES.map((t) => prisma.examType.create({ data: t }))
  );

  // ---------- Clínicas ----------
  console.log("Creando clínicas...");
  const clinicA = await prisma.clinic.create({
    data: { name: "Clínica A - Riverside Physio", code: "CLINIC_A" },
  });
  const clinicB = await prisma.clinic.create({
    data: { name: "Clínica B - Northgate Rehab", code: "CLINIC_B" },
  });

  // ---------- Usuarios: 2 administradores (1 por clínica) ----------
  console.log("Creando administradores...");
  const passwordHash = await argon2.hash("Demo1234!");

  const adminA = await prisma.user.create({
    data: {
      email: "admin@riverside-physio.co.uk",
      passwordHash,
      firstName: "Jane",
      lastName: "Smith",
      role: UserRole.CLINIC_ADMIN,
      userClinics: { create: { clinicId: clinicA.id } },
    },
  });

  const adminB = await prisma.user.create({
    data: {
      email: "admin@northgate-rehab.co.uk",
      passwordHash,
      firstName: "Arjun",
      lastName: "Patel",
      role: UserRole.CLINIC_ADMIN,
      userClinics: { create: { clinicId: clinicB.id } },
    },
  });

  // ---------- Usuarios: 4 profesionales (2 por clínica) ----------
  console.log("Creando profesionales clínicos...");
  const cliniciansData = [
    { email: "j.taylor@riverside-physio.co.uk", first: "James", last: "Taylor", clinic: clinicA },
    { email: "e.brown@riverside-physio.co.uk", first: "Emily", last: "Brown", clinic: clinicA },
    { email: "r.khan@northgate-rehab.co.uk", first: "Raj", last: "Khan", clinic: clinicB },
    { email: "s.wilson@northgate-rehab.co.uk", first: "Sophie", last: "Wilson", clinic: clinicB },
  ];

  const clinicians = await Promise.all(
    cliniciansData.map((c) =>
      prisma.user.create({
        data: {
          email: c.email,
          passwordHash,
          firstName: c.first,
          lastName: c.last,
          role: UserRole.CLINICIAN,
          userClinics: { create: { clinicId: c.clinic.id } },
        },
      })
    )
  );

  // ---------- Pacientes: 10 (5 por clínica) ----------
  console.log("Creando pacientes...");
  const patientNames = [
    ["Emma", "Wilson"], ["Oliver", "Brown"], ["Sophie", "Turner"],
    ["Liam", "Davies"], ["Ava", "Robinson"], ["Noah", "Clarke"],
    ["Mia", "Edwards"], ["Jack", "Walker"], ["Isla", "Hughes"],
    ["Leo", "Baker"],
  ];

  const patients = [];
  for (let i = 0; i < patientNames.length; i++) {
    const [firstName, lastName] = patientNames[i];
    const clinic = i < 5 ? clinicA : clinicB;
    const patient = await prisma.patient.create({
      data: {
        firstName,
        lastName,
        dateOfBirth: new Date(1970 + i * 3, i % 12, (i % 27) + 1),
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        patientClinics: {
          create: {
            clinicId: clinic.id,
            medicalRecordNumber: `MRN-${clinic.code}-${1000 + i}`,
          },
        },
      },
    });
    patients.push({ patient, clinic });
  }

  // ---------- Exámenes: 20 (2 por paciente) ----------
  console.log("Creando exámenes de ejemplo...");
  let examCount = 0;
  for (const { patient, clinic } of patients) {
    const clinicianPool = clinicians.filter((_, idx) =>
      clinic.id === clinicA.id ? idx < 2 : idx >= 2
    );
    const creator = clinicianPool[examCount % clinicianPool.length];

    for (let v = 0; v < 2; v++) {
      const examType = examTypes[(examCount + v) % examTypes.length];

      const exam = await prisma.exam.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          examTypeId: examType.id,
          title: `${examType.name} - ${patient.firstName} ${patient.lastName}`,
          examDate: new Date(2026, (examCount + v) % 12, 10),
          professionalName: `${creator.firstName} ${creator.lastName}`,
          createdBy: creator.id,
        },
      });

      // Primera versión del documento (archivo simulado, no real)
      await prisma.examVersion.create({
        data: {
          examId: exam.id,
          versionNumber: 1,
          storageKey: `clinics/${clinic.id}/patients/${patient.id}/exams/${exam.id}/v1.pdf`,
          originalFilename: "documento-demo.pdf",
          mimeType: "application/pdf",
          sizeBytes: BigInt(102_400),
          sha256: "0".repeat(64), // placeholder: calcular real al subir archivo
          uploadedBy: creator.id,
        },
      });

      // Registro de auditoría de la creación (RF-022)
      await prisma.auditLog.create({
        data: {
          clinicId: clinic.id,
          actorId: creator.id,
          patientId: patient.id,
          examId: exam.id,
          action: "CREATE",
        },
      });

      examCount++;
    }
  }

  console.log(`\nSeed completado: 2 clínicas, 2 admins, 4 profesionales, ${patients.length} pacientes, ${examCount} exámenes.`);
  console.log(`\nCredenciales de prueba (todas usan la misma password): Demo1234!`);
  console.log(`  ${adminA.email}`);
  console.log(`  ${adminB.email}`);
  console.log(`\nCaso de prueba crítico (RF-004 / US-010):`);
  console.log(`  ${clinicians[0].email} (Clínica A) NO debe poder ver exámenes de pacientes de Clínica B.`);
}

main()
  .catch((e) => {
    console.error("Seed falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
