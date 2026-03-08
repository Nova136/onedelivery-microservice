const { readFileSync } = require('fs');
const sharedConfig = require('../../jest.config.js');
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('../../tsconfig.json');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname + '/../../.env') });
const swcConfig = JSON.parse(readFileSync(path.resolve(__dirname + '/../../.swcrc'), 'utf-8'));

module.exports = {
  displayName: 'knowledge',
  ...sharedConfig,
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/../../',
  }),
  setupFilesAfterEnv: ['../../libs/utils/tests/initialization.ts'],
  globalSetup: '../../libs/utils/tests/global-setup.ts',
  globalTeardown: '../../libs/utils/tests/global-teardown.ts',
  rootDir: '.',
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest', { ...swcConfig }],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
};
