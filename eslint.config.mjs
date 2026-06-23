import js from '@eslint/js';
import globals from 'globals';

// Lint config for the Añejo Functions. The `lint` script scopes ESLint to the auth surface
// (functions/api/auth + the auth _lib modules + test/auth). Workers + browser + node globals
// are all enabled since Functions run on the Cloudflare Workers runtime.
export default [
  { ignores: ['node_modules/**', 'public/**', '.wrangler/**', 'hub-app/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, ...globals.worker },
    },
    rules: {
      // Graceful-degradation `catch {}` is intentional throughout the Functions.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-useless-escape': 'warn',
    },
  },
];
