// Local visual review artifact. Never publishes or calls an image provider.
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initialize} from './core.mjs';
import {renderEditorial} from './editorial.mjs';
const read=p=>new Uint8Array(readFileSync(new URL(p,import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
await initialize(read('./node_modules/@resvg/resvg-wasm/index_bg.wasm'));
const input={source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font:read('./assets/CormorantGaramond.ttf'),kickerFont:read('../cardgen/fonts/JosefinSans.ttf')};
const output=mkdtempSync('/tmp/anejo-editorial-preview-');
const samples=[];
for(const [templateId,title] of [['reposado-wide','Catering, beautifully.'],['reposado-cajita','Your Cajita.']]){
 const started=performance.now();
 const result=renderEditorial({...input,templateId,title,kicker:'AÑEJO CATERING'});
 writeFileSync(`${output}/${templateId}.jpg`,result.jpg);
 writeFileSync(`${output}/${templateId}.svg`,result.svg);
 const {jpg,svg,...metadata}=result;
 samples.push({templateId,title,output:`${output}/${templateId}.jpg`,sha256:hash(jpg),svg_sha256:hash(svg),wallMs:performance.now()-started,metadata});
}
const evidence={recordedAt:new Date().toISOString(),sourceProvenance:'Existing website theme asset; not verified documentary event photography.',inputHashes:Object.fromEntries(Object.entries(input).map(([k,v])=>[k,hash(v)])),samples,limitations:'Local Node rendering only; visual review and production resource proof remain required.'};
writeFileSync(`${output}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(output);
