import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', '.husky/**', '*.config.js', 'db-worker.js', 'viewer-legacy.js'],
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
        allProducts: 'writable',
        // Global libraries from CDN
        pako: 'readonly',
        Chart: 'readonly',
        Worker: 'readonly'
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
  },
  // Web Worker specific config
  {
    files: ['db-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        self: 'readonly',
        importScripts: 'readonly',
        initSqlJs: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn'],
      'no-console': 'off',
      'no-case-declarations': 'off'  // Allow declarations in case blocks for workers
    }
  }
];
