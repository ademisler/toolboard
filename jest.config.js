export default {
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/test/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/extension/core/**/*.js'
  ],
  coverageThreshold: {
    global: {
      statements: 38,
      lines: 38,
      functions: 50,
      branches: 30
    }
  },
  // preset: 'jest-preset-default', // Removed: preset not found
  transform: {}
};
