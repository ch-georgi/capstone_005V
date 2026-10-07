import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApplication } from './config/application';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}
void bootstrap().catch(() => {
  console.error('No se pudo iniciar la API. Revisa configuración y conexión a PostgreSQL.');
  process.exitCode = 1;
});
