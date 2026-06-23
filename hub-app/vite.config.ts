import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Añejo HUB — Creative Studio SPA.
// In dev, /api is proxied to `wrangler pages dev` so this React app talks to the REAL
// Cloudflare Functions (magic-link/PIN auth, D1, R2, and the streaming Studio endpoint).
// base './' keeps it mountable under /hub/ on the existing Pages project later.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
