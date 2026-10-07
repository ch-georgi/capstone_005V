const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_schema_test')) {
  throw new Error('Use TEST_DATABASE_URL pointing to a disposable database ending in _schema_test');
}
process.env.DATABASE_URL = testUrl;
module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30000,
  maxWorkers: 1,
};
