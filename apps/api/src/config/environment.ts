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
  if (env.PASSWORD_RESET_SECRET !== undefined && (typeof env.PASSWORD_RESET_SECRET !== 'string' || Buffer.byteLength(env.PASSWORD_RESET_SECRET) < 32)) throw new Error('PASSWORD_RESET_SECRET must contain at least 32 bytes');
  if ((env.SMTP_HOST || env.SMTP2GO_API_KEY) && !env.PASSWORD_RESET_SECRET) throw new Error('PASSWORD_RESET_SECRET is required when email delivery is configured');
  if (env.SYNC_CURSOR_SECRET !== undefined && (typeof env.SYNC_CURSOR_SECRET !== 'string' || Buffer.byteLength(env.SYNC_CURSOR_SECRET) < 32)) throw new Error('SYNC_CURSOR_SECRET must contain at least 32 bytes');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  const swagger = env.SWAGGER_ENABLED;
  if (swagger !== undefined && swagger !== 'true' && swagger !== 'false') {
    throw new Error('SWAGGER_ENABLED must be true or false');
  }
  // Almacenamiento S3/MinIO: opcional (la API arranca sin él y las rutas de archivos responden 503),
  // pero si se configura una variable deben estar todas las obligatorias.
  const s3Keys = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  if (s3Keys.some((key) => typeof env[key] === 'string' && (env[key] as string).trim())) {
    s3Keys.forEach(required);
    try {
      const endpoint = new URL(env.S3_ENDPOINT as string);
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error();
    } catch { throw new Error('S3_ENDPOINT must be an http(s) origin without path or query'); }
  }


  // Allowlist explícita de orígenes para CORS (frontend web). Sin valor: en
  // producción no se acepta ningún origen hasta configurarla; fuera de
  // producción, application.ts acepta cualquier puerto de localhost/127.0.0.1
  //
  const corsOrigins = typeof env.CORS_ORIGINS === 'string' && env.CORS_ORIGINS.trim()
    ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : null;
  return {
    ...env, DATABASE_URL: databaseUrl, JWT_SECRET: secret, JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience, PORT: port,
    SWAGGER_ENABLED: swagger === undefined ? env.NODE_ENV !== 'production' : swagger === 'true',
    CORS_ORIGINS: corsOrigins,
  };
}
