import js from '@eslint/js';
import globals from 'globals';

// Kalite kapısı: hatalar CI'ı düşürür; "warn" olanlar bilinen teknik borcu görünür tutar (app.js ve birkaç büyük işlev).
const common = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-shadow': 'off',
  'max-lines': ['warn', { max: 450, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
};

export default [
  { ignores: ['data/**', 'data.js', 'store/**', 'ara/**', 'sunum/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: common,
  },
  {
    files: ['test/browser.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['app.js', 'app/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: globals.browser },
    rules: common,
  },
];
