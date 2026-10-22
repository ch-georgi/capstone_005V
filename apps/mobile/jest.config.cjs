module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/test/**/*.test.ts", "<rootDir>/test/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.cjs"],
  clearMocks: true,
  modulePaths: ["<rootDir>/node_modules"],
};
