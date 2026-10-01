import { PrismaClient, TenantRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
const db = new PrismaClient();
// Stable UUIDs make the synthetic seed repeatable without deleting history.
const id = (group:number,n:number) => `${group.toString(16).padStart(8,'0')}-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
async function main() {
  const fixture=await readFile(resolve(__dirname,'../../../database/fixtures/documento-demo.pdf'));
  const sha256=createHash('sha256').update(fixture).digest('hex');
  const passwordHash=await argon2.hash('Demo1234!');
  const clinics=[id(1,1),id(1,2)];
  for (let i=0;i<2;i++) await db.clinic.upsert({where:{id:clinics[i]},update:{},create:{id:clinics[i],name:`Clínica ${i?'B':'A'}`,code:`CLINIC_${i?'B':'A'}`}});
  const codes=['LAB','IMAGING','MEDICAL_REPORT','REFERRAL','FUNCTIONAL','OTHER'];
  const names=['Laboratorio','Imagenología','Informe médico','Derivación','Evaluación funcional','Otro'];
  for(let i=0;i<codes.length;i++) await db.examType.upsert({where:{id:id(2,i+1)},update:{},create:{id:id(2,i+1),code:codes[i],name:names[i]}});
  const makeUser=async (uid:string,email:string|null)=>db.user.upsert({where:{id:uid},update:{},create:{id:uid,email,passwordHash:email?passwordHash:null}});
  const membership=async(uid:string,clinicId:string,role:TenantRole,displayName:string,isActive=true)=>db.userClinic.upsert({where:{userId_clinicId:{userId:uid,clinicId}},update:{},create:{userId:uid,clinicId,role,displayName,isActive}});
  await makeUser(id(3,99),'system@example.com');
  await db.user.update({where:{id:id(3,99)},data:{isSystemAdmin:true}});
  for(let i=0;i<2;i++) {
    await makeUser(id(3,i+1),`admin${i+1}@example.com`);
    await membership(id(3,i+1),clinics[i],TenantRole.CLINIC_ADMIN,`Administrador ${i+1}`);
  }
  // Same account: administrator in A, clinician in B, with independent activation.
  await membership(id(3,1),clinics[1],TenantRole.CLINICIAN,'Profesional compartido',false);
  for(let i=0;i<4;i++) {
    await makeUser(id(4,i+1),`clinician${i+1}@example.com`);
    await membership(id(4,i+1),clinics[Math.floor(i/2)],TenantRole.CLINICIAN,`Profesional ${i+1}`);
  }
  // Ten private patient records; the first person has separate records in A and B.
  for(let i=0;i<10;i++) {
    const clinicId=clinics[Math.floor(i/5)], patientId=id(6,i+1);
    const userId=id(5,i===5?1:i+1);
    await makeUser(userId,i===9?null:`patient${i===5?1:i+1}@example.com`);
    await membership(userId,clinicId,TenantRole.PATIENT,`Paciente ${i+1}`);
    await db.patient.upsert({where:{id:patientId},update:{},create:{id:patientId,userId,clinicId,firstName:i===5?'Nombre privado B':`Paciente ${i+1}`,lastName:'Sintético',dateOfBirth:new Date('1990-01-10T00:00:00Z'),email:`contacto-clinica-${i+1}@example.com`,phone:`+44000000${i}`,medicalRecordNumber:`MRN-${i+1}`}});
    const actor=id(4,Math.floor(i/5)*2+1);
    for(let j=0;j<2;j++) {
      const n=i*2+j+1,examId=id(7,n),versionId=id(8,n);
      if(await db.exam.findUnique({where:{id:examId}})) continue;
      await db.$transaction(async(tx)=>{
        // Clinic first, then exam: same lock order as the future backend.
        await tx.$queryRaw`SELECT id FROM clinics WHERE id=${clinicId}::uuid FOR UPDATE`;
        await tx.exam.create({data:{id:examId,clinicId,patientId,examTypeId:id(2,n%6+1),title:`Examen sintético ${n}`,examDate:new Date('2026-09-10T00:00:00Z'),professionalName:'Profesional demo',createdBy:actor}});
        await tx.examVersion.create({data:{id:versionId,examId,versionNumber:1,storageKey:`clinics/${clinicId}/patients/${patientId}/exams/${examId}/versions/${versionId}`,originalFilename:'documento-demo.pdf',mimeType:'application/pdf',sizeBytes:BigInt(fixture.length),sha256,uploadedBy:actor}});
        await tx.auditLog.create({data:{clinicId,actorId:actor,patientId,examId,examVersionId:versionId,action:'CREATE'}});
      });
    }
  }
  // Historical records: apply only after their original exams were published.
  await db.userClinic.update({where:{userId_clinicId:{userId:id(5,9),clinicId:clinics[1]}},data:{isActive:false}});
  const deleted=await db.patient.findUniqueOrThrow({where:{id:id(6,8)}});
  if(!deleted.deletedAt) await db.patient.update({where:{id:deleted.id},data:{deletedAt:new Date(),deletedBy:id(3,2)}});
  console.log('Seed: 2 clínicas, 10 fichas, 20 exámenes; cuenta pendiente y acceso histórico.');
  console.log('Archivos: ejecutar db:fixtures para cargar PDF reales al bucket antes de probar descargas.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
