export function validateEnvironment(env: Record<string, unknown>) {
  const required = (key: string): string => {
    const value = env[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`);
    return value;
  };
  const databaseUrl = required('DATABASE_URL');
  try {
    if (!['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) throw new Error();
  } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  const secret = required('JWT_SECRET');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
  const issuer = required('JWT_ISSUER');
  const audience = required('JWT_AUDIENCE');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  const swagger = env.SWAGGER_ENABLED;
  if (swagger !== undefined && swagger !== 'true' && swagger !== 'false') {
    throw new Error('SWAGGER_ENABLED must be true or false');
  }
  return {
    ...env, DATABASE_URL: databaseUrl, JWT_SECRET: secret, JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience, PORT: port,
    SWAGGER_ENABLED: swagger === undefined ? env.NODE_ENV !== 'production' : swagger === 'true',
  };
}
