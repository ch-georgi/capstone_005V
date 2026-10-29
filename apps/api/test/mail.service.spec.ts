import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MailService } from '../src/modules/auth/mail.service';
import { validateEnvironment } from '../src/config/environment';

describe('SMTP2GO HTTPS recovery delivery', () => {
  afterEach(() => jest.restoreAllMocks());
  const service = () => new MailService(new ConfigService({ SMTP2GO_API_KEY: 'test-api-key', SMTP_HOST: 'unused.example.com', SMTP_FROM: 'WellQ <sender@example.com>' }));

  it('selects HTTPS ahead of SMTP and submits the recovery message', async () => {
    const request = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { succeeded: 1, failed: 0 } }) } as Response);
    await service().sendCode('recipient@example.com', '123456');
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://api.smtp2go.com/v3/email/send');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json', 'X-Smtp2go-Api-Key': 'test-api-key' });
    expect(JSON.parse(options?.body as string)).toMatchObject({ sender: 'WellQ <sender@example.com>', to: ['recipient@example.com'], text_body: expect.stringContaining('123456'), fastaccept: false });
  });

  it.each([
    [200, { succeeded: 0, failed: 1, failures: ['sensitive details'] }],
    [401, { error: 'sensitive details' }],
    [200, {}],
  ])('rejects unsuccessful provider responses (%s) without logging private content', async (status, data) => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: status === 200, status, json: async () => ({ data }) } as Response);
    await expect(service().sendCode('recipient@example.com', '123456')).rejects.toThrow('MAIL_DELIVERY_FAILED');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/sensitive details|recipient@example.com|123456|test-api-key/);
  });

  it('handles network failures without leaking provider errors', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private request data'));
    await expect(service().sendCode('recipient@example.com', '123456')).rejects.toThrow('MAIL_DELIVERY_FAILED');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private request data');
  });

  it('requires a recovery secret for HTTPS delivery without SMTP', () => {
    expect(() => validateEnvironment({ DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'x'.repeat(32), JWT_ISSUER: 'test', JWT_AUDIENCE: 'test', SMTP2GO_API_KEY: 'test-key' })).toThrow('PASSWORD_RESET_SECRET');
  });
});
