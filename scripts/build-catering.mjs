import { build } from 'esbuild';
await build({ entryPoints: ['src/catering-products.js'], bundle: true, minify: true, target: ['es2022'], format: 'iife', outfile: 'public/assets/js/catering-products.js' });
