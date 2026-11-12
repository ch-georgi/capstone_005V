import { recoveryLogo, renderPasswordRecoveryEmail } from '../src/modules/auth/templates/password-recovery.template';

describe('Plantilla de recuperación WellQ', () => {
  it('conserva ceros iniciales, vencimiento e instrucciones en HTML y texto', () => {
    const message = renderPasswordRecoveryEmail('001234');
    for (const body of [message.html, message.text]) {
      expect(body).toContain('001234');
      expect(body).toContain('10 minutos');
      expect(body).toContain('app');
      expect(body).toContain('nunca te pedirá compartir');
    }
    expect(message.html).toContain(`src="cid:${recoveryLogo.contentId}"`);
    expect(message.html).toContain('lang="es"');
    expect(Buffer.from(recoveryLogo.base64, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('incluye una imagen autónoma solo en la vista previa', () => {
    expect(renderPasswordRecoveryEmail('123456', true).html).toContain('src="data:image/png;base64,');
    expect(renderPasswordRecoveryEmail('123456').html).not.toContain('src="data:');
  });

  it.each(['12345', '1234567', '<img/>', 'abcdef'])('rechaza códigos inválidos: %s', code => {
    expect(() => renderPasswordRecoveryEmail(code)).toThrow('RECOVERY_CODE_MUST_BE_SIX_DIGITS');
  });
});
