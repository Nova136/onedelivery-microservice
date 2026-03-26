const { readFileSync } = require('fs');
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('../../tsconfig.json');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname + '/../../.env') });
const swcConfig = JSON.parse(readFileSync(path.resolve(__dirname + '/../../.swcrc'), 'utf-8'));

module.exports = {
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/../../' }),
    // memory.service.ts has a direct node_modules path import; redirect to the proper package
    'node_modules/@langchain/core/dist/prompts/index.cjs': '@langchain/core/prompts',
  },
  setupFilesAfterEnv: ['./test/setup-unit.ts'],
  rootDir: '.',
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest', { ...swcConfig }],
  },
  testEnvironment: 'node',
  testMatch: ['**/+(*.)+(spec).+(ts)'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  coveragePathIgnorePatterns: ['index.ts', 'node_modules', 'jest.config.js', '.seed.ts', 'main.ts'],
  coverageProvider: 'v8',
};
