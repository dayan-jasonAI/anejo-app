import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {LANGUAGE_ASSET_REVISION} from '../../functions/_lib/language_asset_version.js';
import {buildLanguageVersion} from '../../scripts/build-language-version.mjs';
import { onRequest } from '../../functions/_middleware.js';

class HTMLRewriterFixture {
  on(selector, handler) { if(selector==='head') this.handler=handler; else { assert.equal(selector,'script[src]'); this.scriptHandler=handler; } return this; }
  async transform(response) {
    let insert = '';
    this.handler.element({ append(text, options) { assert.equal(options.html, true); insert += text; } });
    let html=await response.text();
    html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{let removed=false;this.scriptHandler.element({getAttribute:k=>k==='src'?src:null,remove(){removed=true;}});return removed?'':tag;});
    return new Response(html.replace('</head>', insert + '</head>'), response);
  }
}
async function request(path, type = 'text/html', method = 'GET', disposition = '') {
  return onRequest({ request: new Request('https://anejocateringco.com' + path, { method }), env: {},
    next: async () => new Response('<html><head></head><body>Fixture<script src="/assets/js/i18n.js"></script></body></html>', { headers: { 'Content-Type': type, 'Content-Disposition': disposition } }) });
}
test('every HTML page gets first-party language bootstrap regardless of authored script tags', async () => {
  globalThis.HTMLRewriter = HTMLRewriterFixture;
  for (const path of ['/hub/owner/menu', '/hub/kitchen/recipes', '/studio/', '/client/dashboard', '/es/', '/catering/wellington', '/login']) {
    const response = await request(path);
    const html=await response.text();
    assert.match(html, /data-anejo-language-bootstrap/);
    assert.equal((html.match(/assets\/js\/i18n\.js/g)||[]).length,1);
    assert.doesNotMatch(html,/defer data-anejo-language-bootstrap/);
  }
});
test('bootstrap never rewrites API responses, file downloads, assets or POST results', async () => {
  globalThis.HTMLRewriter = HTMLRewriterFixture;
  for (const args of [['/api/quote'], ['/order', 'application/json'], ['/assets/logo.svg', 'image/svg+xml'], ['/order', 'text/html', 'POST'], ['/quote.pdf', 'text/html', 'GET', 'attachment']]) {
    assert.doesNotMatch(await (await request(...args)).text(), /data-anejo-language-bootstrap/);
  }
});

const assetPaths=[
  'public/assets/js/i18n.js',
  'public/assets/js/public-i18n-coverage.js',
  'public/hub/assets/hub-i18n.js',
  'public/hub/assets/hub-i18n-coverage.js',
];
function independentlyComputedRevision(){
  const hash=createHash('sha256');
  for(const path of assetPaths){
    hash.update(path,'utf8');hash.update(Buffer.from([0]));
    hash.update(readFileSync(new URL('../../'+path,import.meta.url)));hash.update(Buffer.from([0]));
  }
  return 'i18n-'+hash.digest('hex').slice(0,16);
}
function engineDictionaryURLs(scriptURL){
  const scripts=[];
  const document={body:null,title:'Fixture',readyState:'loading',documentElement:{lang:'en'},
    baseURI:'https://anejocateringco.com/hub/owner/',currentScript:scriptURL?{src:scriptURL}:null,
    createElement:()=>({}),getElementById:()=>null,addEventListener(){},head:{appendChild:script=>scripts.push(script)}};
  const context={document,window:{},URL,location:{pathname:'/hub/owner/catering-service'},
    localStorage:{getItem:()=>null,setItem(){}}};
  vm.runInNewContext(readFileSync(new URL('../../public/assets/js/i18n.js',import.meta.url),'utf8'),context);
  return scripts.map(script=>script.src);
}

test('generated revision independently binds all four ordered language asset paths and bytes',()=>{
  assert.equal(LANGUAGE_ASSET_REVISION,independentlyComputedRevision(),'Run npm run build:language after editing any language asset.');
  assert.match(LANGUAGE_ASSET_REVISION,/^i18n-[0-9a-f]{16}$/);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/build-language-version.mjs',import.meta.url)),'--check'],{cwd:tmpdir(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout.trim(),LANGUAGE_ASSET_REVISION);
});
test('bootstrap uses generated revision and current engine forwards it to every dictionary',async()=>{
  globalThis.HTMLRewriter=HTMLRewriterFixture;
  const html=await(await request('/hub/owner/catering-service')).text();
  const src=html.match(/src="([^"]+)"[^>]*data-anejo-language-bootstrap/)?.[1];
  assert.equal(src,'/assets/js/i18n.js?v='+LANGUAGE_ASSET_REVISION);
  assert.deepEqual(engineDictionaryURLs('https://anejocateringco.com'+src),[
    '/assets/js/public-i18n-coverage.js?v='+LANGUAGE_ASSET_REVISION,
    '/hub/assets/hub-i18n.js?v='+LANGUAGE_ASSET_REVISION,
    '/hub/assets/hub-i18n-coverage.js?v='+LANGUAGE_ASSET_REVISION,
  ]);
  const worker=readFileSync(new URL('../../public/hub/sw.js',import.meta.url),'utf8');
  assert.match(worker,/const CACHE = 'anejo-hub-v14'/);
  assert.doesNotMatch(worker,/const CACHE = 'anejo-hub-v(?:12|13)'/);
  assert.match(worker,/fetch\(req, \{ cache: 'no-cache' \}\)/);
});
test('engine inherits the executing script query rather than an embedded release key',()=>{
  const revision='fixture revision+value';
  const urls=engineDictionaryURLs('https://anejocateringco.com/assets/js/i18n.js?other=x&v='+encodeURIComponent(revision)+'#ignored');
  assert.equal(urls.length,3);
  for(const url of urls)assert.equal(new URL(url,'https://anejocateringco.com').searchParams.get('v'),revision);
  assert.deepEqual(engineDictionaryURLs(),[
    '/assets/js/public-i18n-coverage.js?v=local','/hub/assets/hub-i18n.js?v=local','/hub/assets/hub-i18n-coverage.js?v=local',
  ]);
  const engine=readFileSync(new URL('../../public/assets/js/i18n.js',import.meta.url),'utf8');
  assert.doesNotMatch(engine,/20261027-bilingual/);
});
test('check mode rejects edited assets without overwriting the generated module',async()=>{
  const root=mkdtempSync(join(tmpdir(),'anejo-language-version-'));
  for(const path of assetPaths){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),'// fixture '+path+'\n');}
  mkdirSync(join(root,'functions/_lib'),{recursive:true});
  const first=await buildLanguageVersion({root});
  assert.match(first,/^i18n-[0-9a-f]{16}$/);
  assert.equal(await buildLanguageVersion({root,check:true}),first);
  const module=join(root,'functions/_lib/language_asset_version.js'),before=readFileSync(module,'utf8');
  writeFileSync(join(root,assetPaths[3]),'// changed dictionary fixture\n');
  await assert.rejects(buildLanguageVersion({root,check:true}),/fingerprint is stale/);
  assert.equal(readFileSync(module,'utf8'),before,'--check must never rewrite stale output');
  const regenerated=await buildLanguageVersion({root});
  assert.notEqual(regenerated,first);
  assert.equal(await buildLanguageVersion({root,check:true}),regenerated);
});
