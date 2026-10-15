import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from '../common/filters/api-error';

export function createOpenApiDocument(app: INestApplication) {
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('WellQ API').setVersion('0.1.0')
    .setDescription('API académica multitenant. JWT clínico vinculado a clinicId; sesión GLOBAL solo para administración explícita. El superadmin no obtiene acceso clínico automático. Pacientes históricos conservan lectura propia. Sesión Android renovable durante 30 días, selección de clínica y recuperación por correo.')
    .addTag('Auth', 'Login global o por clínica.')
    .addTag('Users', 'Creación controlada de cuentas y membresías.')
    .addTag('Patients', 'Fichas de pacientes por clínica.')
    .addTag('Audit', 'Registro y consulta de auditoría clínica.')
    .addTag('Exam types', 'Catálogo de tipos de examen activos.')
    .addTag('Exams', 'Consulta de exámenes de un paciente y su historial de versiones.')
    .addTag('Uploads', 'Carga idempotente de exámenes y nuevas versiones (multipart).')
    .addTag('Exam files', 'Descarga y visualización de archivos de una versión, con auditoría.')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build());
  for (const name of ['CreateUserDto', 'LoginDto', 'EmailDto', 'MobileLoginDto', 'TokenDto', 'SelectClinicDto', 'SwitchClinicDto', 'VerifyCodeDto', 'ResetPasswordDto', 'CreatePatientDto', 'UpdatePatientDto']) {
    const schema = document.components?.schemas?.[name];
    if (schema && !('$ref' in schema)) schema.additionalProperties = false;
  }
  return document;
}

export function configureApplication(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  if (app.get(ConfigService).get<boolean>('SWAGGER_ENABLED')) {
    SwaggerModule.setup('api/docs', app, () => createOpenApiDocument(app), {
      jsonDocumentUrl: '/api/openapi.json', raw: ['json'],
      swaggerOptions: { persistAuthorization: false },
    });
  }
}
