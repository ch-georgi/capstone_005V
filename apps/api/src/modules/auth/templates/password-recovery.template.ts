import { wellqLogoBase64 } from './wellq-logo';

export const recoveryLogo = {
  filename: 'wellq-logo.png',
  contentId: 'wellq-logo.png',
  base64: wellqLogoBase64,
  contentType: 'image/png',
};

/** Edita aquí el asunto, los textos y los estilos del correo de recuperación.
 * Mantén el código y el vencimiento alineados con MobileAuthService.forgot.
 * Tablas y estilos inline para clientes de correo; logo adjunto mediante CID.
 */
export function renderPasswordRecoveryEmail(code: string, preview = false) {
  if (!/^\d{6}$/.test(code)) throw new Error('RECOVERY_CODE_MUST_BE_SIX_DIGITS');
  const logoSrc = preview
    ? `data:image/png;base64,${recoveryLogo.base64}`
    : `cid:${recoveryLogo.contentId}`;
  return {
    subject: 'Código de recuperación de WellQ',
    text: `Restablece tu contraseña de WellQ\n\nTu código de recuperación es ${code}.\nIngresa este código en la app de WellQ para continuar. Vence en 10 minutos.\n\nSi no solicitaste restablecer tu contraseña, ignora este correo.\nWellQ nunca te pedirá compartir tu contraseña ni este código.`,
    html: `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recuperación de contraseña · WellQ</title></head>
<body style="margin:0;padding:0;background-color:#F4F8F6;font-family:Arial,Helvetica,sans-serif;color:#14251E;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Usa tu código para restablecer tu contraseña de WellQ. Vence en 10 minutos.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F8F6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
        <tr><td align="center" bgcolor="#08150F" style="padding:30px 24px;border-radius:16px 16px 0 0;">
          <img src="${logoSrc}" alt="WellQ · Predict. Prevent. Perform." width="220" style="display:block;width:220px;max-width:100%;height:auto;border:0;color:#F5F7F8;">
        </td></tr>
        <tr><td bgcolor="#FFFFFF" style="padding:36px 28px;border:1px solid #CCDCD3;border-top:4px solid #20F3A2;border-radius:0 0 16px 16px;">
          <p style="margin:0 0 12px;font-size:12px;letter-spacing:2px;color:#087D52;font-weight:bold;">SEGURIDAD DE TU CUENTA</p>
          <h1 style="margin:0 0 24px;font-size:28px;line-height:1.25;color:#14251E;">Restablece tu contraseña</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Recibimos una solicitud para restablecer la contraseña de tu cuenta de WellQ.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Ingresa este código en la app para continuar:</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td align="center" bgcolor="#E0F5E9" style="padding:22px 12px;border:1px solid #CCDCD3;border-radius:10px;">
              <span style="font-family:Consolas,'Courier New',monospace;font-size:36px;font-weight:bold;letter-spacing:6px;color:#087D52;">${code}</span>
            </td></tr>
          </table>
          <p style="margin:20px 0 28px;font-size:14px;line-height:1.6;color:#4E6258;">Este código vence en <strong>10 minutos</strong>.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#4E6258;">WellQ nunca te pedirá compartir tu contraseña ni este código.</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 20px;color:#4E6258;font-size:12px;line-height:1.6;">Este es un correo automático de recuperación de cuenta de WellQ.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
