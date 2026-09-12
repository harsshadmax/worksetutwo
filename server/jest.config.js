const tsJestTransform = { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }] };

/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 45000,
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      rootDir: __dirname,
      testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
      transform: tsJestTransform,
      setupFilesAfterEnv: ["<rootDir>/tests/unit/jest.setup.ts"]
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      rootDir: __dirname,
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
      transform: tsJestTransform,
      globalSetup: "<rootDir>/tests/integration/global-setup.js",
      globalTeardown: "<rootDir>/tests/integration/global-teardown.js",
      setupFilesAfterEnv: ["<rootDir>/tests/integration/jest.setup.ts"]
    }
  ]
};
