import 'reflect-metadata';
import { config } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MailService } from '../src/modules/auth/mail.service';
import { renderPasswordRecoveryEmail } from '../src/modules/auth/templates/password-recovery.template';

async function main() {
  config({ path: resolve(__dirname, '../.env') });
  const args = process.argv.slice(2);
  const code = '123456'; // Demostración: no genera un desafío ni modifica cuentas.
  if (args.length === 1 && args[0] === '--preview') {
    const output = resolve(__dirname, '../.cache/password-recovery.html');
    await mkdir(resolve(__dirname, '../.cache'), { recursive: true });
    await writeFile(output, renderPasswordRecoveryEmail(code, true).html, 'utf8');
    console.log(`Vista previa: ${output}`);
    return;
  }
  if (args.length !== 2 || args[0] !== '--to' || !isEmail(args[1])) {
    throw new Error('Uso: npm run mail:preview | npm run mail:test -- --to tu-correo@ejemplo.com');
  }
  const receipt = await new MailService(new ConfigService()).sendCode(args[1], code);
  console.log(JSON.stringify(receipt, null, 2));
  console.log('El servidor aceptó el envío; la entrega a Gmail aún no está confirmada. En SMTP2GO revisa Reports > Activity por destinatario y hora, y consulta Timeline. El código es de demostración y no permite restablecer una contraseña.');
}

main().catch((error: unknown) => {
  // No mostrar errores crudos del proveedor ni configuración del entorno.
  const message = error instanceof Error && /^(Uso:|SMTP_NOT_CONFIGURED|SMTP_DELIVERY_FAILED|MAIL_DELIVERY_FAILED)/.test(error.message)
    ? error.message : 'No se pudo preparar el correo de prueba.';
  console.error(message);
  process.exitCode = 1;
});
