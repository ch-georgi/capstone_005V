import { validateEnvironment } from '../src/config/environment';
import { PasswordService } from '../src/modules/auth/password.service';

const valid = { DATABASE_URL: 'postgresql://test:test@localhost/db', JWT_SECRET: 'x'.repeat(32), JWT_ISSUER: 'wellq', JWT_AUDIENCE: 'clients' };
describe('configuration and passwords', () => {
  it('validates mandatory values, ports and boolean settings without exposing credentials', () => {
    for (const key of Object.keys(valid)) expect(() => validateEnvironment({ ...valid, [key]: '' })).toThrow(key);
    expect(() => validateEnvironment({ ...valid, JWT_SECRET: 'short' })).toThrow('32 bytes');
    expect(() => validateEnvironment({ ...valid, DATABASE_URL: 'https://example.com' })).toThrow('PostgreSQL');
    expect(() => validateEnvironment({ ...valid, PORT: '1.5' })).toThrow('PORT');
    expect(() => validateEnvironment({ ...valid, SWAGGER_ENABLED: 'yes' })).toThrow('SWAGGER_ENABLED');
  });
  it('accepts missing S3 settings but requires all of them once one is set, with an origin-only endpoint', () => {
    expect(() => validateEnvironment({ ...valid })).not.toThrow();
    const s3 = { S3_ENDPOINT: 'http://localhost:9222', S3_BUCKET: 'wellq-dev', S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret' };
    expect(() => validateEnvironment({ ...valid, ...s3 })).not.toThrow();
    for (const key of Object.keys(s3)) expect(() => validateEnvironment({ ...valid, ...s3, [key]: '' })).toThrow(key === 'S3_ENDPOINT' ? 'S3_ENDPOINT' : key);
    expect(() => validateEnvironment({ ...valid, ...s3, S3_ENDPOINT: 'http://localhost:9222/wellq-dev' })).toThrow('origin');
    expect(() => validateEnvironment({ ...valid, ...s3, S3_ENDPOINT: 'ftp://host' })).toThrow('origin');
    expect(() => validateEnvironment({ ...valid, S3_BUCKET: 'solo-el-bucket' })).toThrow('S3_ENDPOINT');
  });
  it('defaults Swagger off in production and on in development; supports explicit override', () => {
    expect(validateEnvironment({ ...valid }).SWAGGER_ENABLED).toBe(true);
    expect(validateEnvironment({ ...valid, NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(false);
    expect(validateEnvironment({ ...valid, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
  });
  it('uses salted Argon2id hashes, preserving whitespace in the password', async () => {
    const passwords = new PasswordService();
    const hash = await passwords.hash('  valid-password  ');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify(hash, '  valid-password  ')).toBe(true);
    expect(await passwords.verify(hash, 'valid-password')).toBe(false);
    expect(await passwords.verify('invalid-hash', 'anything')).toBe(false);
    expect(await passwords.hash('  valid-password  ')).not.toBe(hash);
  });
});
