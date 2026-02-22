const { name } = require('./package.json');
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  displayName: name,
  roots: ['.'],
  preset: 'ts-jest',
  testMatch: [
    "**/+(*.)+(spec|e2e-spec|e2e-test).+(ts)"
  ],
  coveragePathIgnorePatterns: ['index.ts', 'node_modules', 'jest.config.js'],
  setupFilesAfterEnv: ['./libs/utils/tests/initialization.ts'],
  globalSetup: './libs/utils/tests/global-setup.ts',
  globalTeardown: './libs/utils/tests/global-teardown.ts',
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/./'
  }),
  rootDir: '.',
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts']
};