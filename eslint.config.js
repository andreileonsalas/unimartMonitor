import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', '.husky/**', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        Promise: 'readonly',
        Buffer: 'readonly',
        // Browser globals for viewer.js
        window: 'readonly',
        document: 'readonly',
        initSqlJs: 'readonly',
        fetch: 'readonly',
        db: 'writable',
        allProducts: 'writable'
      }
    },
    rules: {
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-unused-vars': ['warn'],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }
];
