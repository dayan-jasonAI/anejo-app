import js from '@eslint/js';
import globals from 'globals';

// Lint config for the Añejo Functions. The `lint` script covers ALL of functions/ + test/ —
// it used to be scoped to the auth surface only, which left the money path (checkout, promo,
// rewards, webhooks) unlinted. Workers + browser + node globals are all enabled since Functions
// run on the Cloudflare Workers runtime.
export default [
  { ignores: ['node_modules/**', 'public/**', '.wrangler/**', 'hub-app/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // HTMLRewriter is Cloudflare-specific and absent from `globals.worker`; the legal-page
      // override streams through it at the edge.
      globals: { ...globals.node, ...globals.browser, ...globals.worker, HTMLRewriter: 'readonly' },
    },
    rules: {
      // Graceful-degradation `catch {}` is intentional throughout the Functions.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-useless-escape': 'warn',
    },
  },
];
