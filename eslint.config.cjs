const {
    defineConfig,
    globalIgnores,
} = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const noAsyncWithoutAwait = require("eslint-plugin-no-async-without-await");
const globals = require("globals");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        parser: tsParser,
        "ecmaVersion": "latest",
        "sourceType": "module",

        parserOptions: {
            "project": "tsconfig.json",
        },

        globals: {
            ...globals.node,
        },
    },

    plugins: {
        "no-async-without-await": noAsyncWithoutAwait,
    },

    extends: compat.extends(),

    "rules": {
        "security/detect-object-injection": "off",
        "no-async-without-await/no-async-without-await": 1,
    },
    ignores: [
      "**/dist/",
      "**/tests/",
      "**/coverage/",
      "**/.eslintrc.js",
      "**/node_modules/",
      "**/package-lock.json",
      "**/package.json",
      "**/tsconfig.json",
      "**/tsconfig.build.json",
      "**/*.seed.ts",
      "**/index.js",
      "**/jest.config.js",
      "**/eslint.config.cjs"
    ],
}, globalIgnores(["**/.eslintrc.json"]), globalIgnores([
    "**/dist/",
    "**/tests/",
    "**/coverage/",
    "**/.eslintrc.js",
    "**/node_modules/",
    "**/package-lock.json",
    "**/package.json",
    "**/tsconfig.json",
    "**/tsconfig.build.json",
    "**/*.seed.ts"

])]);
