import type { Config } from 'jest';

const config: Config = {
  // ts-jest lets Jest understand TypeScript natively — no separate build step.
  preset: 'ts-jest',

  // Node environment: we're testing Express/Node code, not a browser.
  testEnvironment: 'node',

  // Only look inside src/ for tests.
  roots: ['<rootDir>/src'],

  // Convention: test files live in __tests__/ and end in .test.ts
  testMatch: ['**/__tests__/**/*.test.ts'],

  // Reset all mocks between tests automatically.
  // This prevents mock state from leaking between test cases.
  clearMocks: true,

  // Show a summary line per test, not just per suite.
  verbose: true,
};

export default config;
