import {readFileSync,writeFileSync} from 'node:fs';
// Isolated ESM adaptation. Original license retained verbatim. No globals/polyfills.
let src=readFileSync(new URL('./node_modules/jpeg-js/lib/encoder.js',import.meta.url),'utf8');
src=src.replace(/if \(typeof module !== 'undefined'\) \{[\s\S]*?\n\}\n\nfunction encode/, 'function encode');
src=src.replace("if (typeof module === 'undefined') return new Uint8Array(byteout);\n      return Buffer.from(byteout);",'return new Uint8Array(byteout);');
src=src.slice(0,src.indexOf('// helper function to get the imageData'))+'\nexport { encode };\n';
writeFileSync(new URL('./jpeg-encoder.mjs',import.meta.url),src);
