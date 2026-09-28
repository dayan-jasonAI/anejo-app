// Local harness only. Not an application route or deployable public service.
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import source from './assets/source.jpg';
import emblem from './assets/emblem.png';
import font from './assets/CormorantGaramond.ttf';
import kickerFont from '../cardgen/fonts/JosefinSans.ttf';
import {initialize} from './core.mjs';
import {renderEditorial} from './editorial.mjs';
export default {async fetch(request){
 await initialize(wasm);
 const templateId=new URL(request.url).searchParams.get('template')||'reposado-cajita';
 const result=renderEditorial({source:new Uint8Array(source),emblem:new Uint8Array(emblem),font:new Uint8Array(font),kickerFont:new Uint8Array(kickerFont),title:'Your Cajita.',kicker:'AÑEJO CATERING',templateId});
 return new Response(result.jpg,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store'}});
}};
