import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly config: ConfigService) {}
  async sendCode(email: string, code: string) {
    const apiKey = this.config.get<string>("SMTP2GO_API_KEY");
    if (apiKey) return this.sendViaApi(email, code, apiKey);
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
    } catch (error) {
      const details = error as { code?: string; responseCode?: number };
      this.logger.error(
        `No se pudo enviar el correo de recuperación. SMTP code=${details?.code ?? "UNKNOWN"} status=${details?.responseCode ?? "UNKNOWN"}`,
      );
      throw new Error("SMTP_DELIVERY_FAILED");
    } finally {
      transport.close();
    }
  }

  private async sendViaApi(email: string, code: string, apiKey: string) {
    try {
      const response = await fetch("https://api.smtp2go.com/v3/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Smtp2go-Api-Key": apiKey },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          sender: this.config.get<string>("SMTP_FROM") ?? "WellQ <no-reply@example.com>",
          to: [email],
          subject: "Código de recuperación de WellQ",
          text_body: `Tu código de recuperación es ${code}. Vence en 10 minutos. Si no lo solicitaste, ignora este correo. WellQ nunca te pedirá compartir tu contraseña.`,
          fastaccept: false,
        }),
      });
      const result = await response.json() as { data?: { succeeded?: number; failed?: number } };
      if (!response.ok || result.data?.succeeded !== 1 || result.data?.failed !== 0) {
        // Provider bodies can contain recipient or message data; log only the status.
        this.logger.error(`SMTP2GO HTTPS rechazó el envío. HTTP status=${response.status}`);
        throw new Error("MAIL_DELIVERY_FAILED");
      }
    } catch {
      this.logger.error("No se pudo enviar la recuperación mediante SMTP2GO HTTPS.");
      throw new Error("MAIL_DELIVERY_FAILED");
    }
  }
}
