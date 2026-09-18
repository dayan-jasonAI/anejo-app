import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import source from './assets/source.jpg';
import emblem from './assets/emblem.png';
import font from './assets/CormorantGaramond.ttf';
import {initialize,render} from './core.mjs';
export default {async fetch(){const t=performance.now();await initialize(wasm);const r=render({source:new Uint8Array(source),emblem:new Uint8Array(emblem),font:new Uint8Array(font)});return new Response(r.jpg,{headers:{'Content-Type':'image/jpeg','X-Render-Wall-Ms':String(performance.now()-t),'Cache-Control':'no-store'}});}};
