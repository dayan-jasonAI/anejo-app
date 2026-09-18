import {readFileSync,writeFileSync} from 'node:fs';
import {initialize,render} from './core.mjs';
const read=p=>new Uint8Array(readFileSync(new URL(p,import.meta.url)));
const start=performance.now();await initialize(read('./node_modules/@resvg/resvg-wasm/index_bg.wasm'));
const initMs=performance.now()-start,results=[];
for(let i=0;i<5;i++){const t=performance.now();const r=render({source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font:read('./assets/CormorantGaramond.ttf')});results.push({ms:performance.now()-t,bytes:r.jpg.length,rss:process.memoryUsage().rss});if(i===0){writeFileSync(new URL('./output/cajita-editorial.jpg',import.meta.url),r.jpg);writeFileSync(new URL('./output/template.svg',import.meta.url),r.svg);}}
const report={runtime:process.version,initMs,runs:results,note:'Node RSS includes process baseline, not workerd isolate memory; timings are local wall time.'};writeFileSync(new URL('./output/node-benchmark.json',import.meta.url),JSON.stringify(report,null,2));console.log(report);
