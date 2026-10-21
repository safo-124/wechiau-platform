// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // Guards against mistakes in web HTML; React Native text shows apostrophes as typed.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
