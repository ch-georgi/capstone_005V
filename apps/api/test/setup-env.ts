import 'reflect-metadata';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'wellq-test-secret-with-at-least-32-bytes';
process.env.JWT_ISSUER = 'wellq-test';
process.env.JWT_AUDIENCE = 'wellq-test-clients';
process.env.SWAGGER_ENABLED = 'true';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/unused_schema_test';
