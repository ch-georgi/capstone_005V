import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly config: ConfigService) {}
  async sendCode(email: string, code: string) {
    const host = this.config.get<string>("SMTP_HOST");
    if (!host) throw new Error("SMTP_NOT_CONFIGURED");
    const user = this.config.get<string>("SMTP_USER");
    const transport = createTransport({
      host,
      port: Number(this.config.get("SMTP_PORT") ?? 1025),
      secure: this.config.get("SMTP_SECURE") === "true",
      ...(user
        ? { auth: { user, pass: this.config.get<string>("SMTP_PASSWORD") } }
        : {}),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    try {
      await transport.sendMail({
        from:
          this.config.get<string>("SMTP_FROM") ??
          "WellQ <no-reply@example.com>",
        to: email,
        subject: "Código de recuperación de WellQ",
        text: `Tu código de recuperación es ${code}. Vence en 10 minutos. Si no lo solicitaste, ignora este correo. WellQ nunca te pedirá compartir tu contraseña.`,
      });
    } catch {
      this.logger.error(
        "No se pudo enviar el correo de recuperación. Revisar SMTP.",
      );
      throw new Error("SMTP_DELIVERY_FAILED");
    } finally {
      transport.close();
    }
  }
}
