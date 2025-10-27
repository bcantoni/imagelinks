module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/main.js', '!src/preload.js'],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
};
