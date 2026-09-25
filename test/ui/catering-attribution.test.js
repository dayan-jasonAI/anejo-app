import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const script=readFileSync(new URL('../../public/assets/js/attribution.js',import.meta.url),'utf8');
function load(search='',stored=null,fail=false){const window={location:{search}};let saved;const sessionStorage={getItem(){if(fail)throw Error('blocked');return stored;},setItem(k,v){if(fail)throw Error('blocked');assert.equal(k,'anejo:attr');saved=v;}};vm.runInNewContext(script,{window,sessionStorage,URLSearchParams});return {read:()=>JSON.parse(JSON.stringify(window.AnejoAttribution.read())),saved};}
test('explicit campaign survives with session convention and overrides older campaign',()=>{
 const a=load('?utm_source=instagram&utm_medium=bio&utm_campaign=ig-catering',JSON.stringify({utm_campaign:'older'}));assert.deepEqual(a.read(),{utm_source:'instagram',utm_medium:'bio',utm_campaign:'ig-catering'});assert.equal(JSON.parse(a.saved).utm_campaign,'ig-catering');assert.deepEqual(load('',a.saved).read(),a.read());
});
test('direct traffic and corrupt or non-scalar saved inputs never invent attribution',()=>{
 for(const stored of [null,'broken','[]','{"utm_source":{"secret":"x"},"email":"private"}'])assert.equal(load('',stored).read(),null);
 assert.equal(load('',null,true).read(),null);assert.deepEqual(load('?utm_source=source',null,true).read(),{utm_source:'source'});
 assert.equal(load('?src='+ 'x'.repeat(100)).read().src.length,64);
});
test('click tags follow existing order convention without overwriting explicit UTM',()=>{
 assert.deepEqual(load('?gclid=opaque').read(),{utm_source:'google',utm_medium:'cpc'});
 assert.deepEqual(load('?fbclid=opaque&utm_source=instagram&utm_medium=bio').read(),{utm_source:'instagram',utm_medium:'bio'});
});
test('catering actual payload block attaches sanitized attribution only when present',()=>{
 const html=readFileSync(new URL('../../public/catering.html',import.meta.url),'utf8');
 const block=html.slice(html.indexOf('    var attribution=window.AnejoAttribution'),html.indexOf('    var locked=pendingLocks'));
 assert.match(block,/if\(attribution\)data.attribution=attribution/);
 for(const value of [null,{utm_campaign:'ig-catering'}]){const data={};vm.runInNewContext(block,{window:{AnejoAttribution:{read:()=>value}},data});assert.deepEqual(data,value?{attribution:value}:{});}
 assert.ok(html.indexOf('/assets/js/attribution.js')<html.indexOf('var attribution=window.AnejoAttribution'));
});
test('conditional migration changes only active legacy catering target and is idempotent',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE tracked_links(code TEXT,active INTEGER,dest_url TEXT,updated_at INTEGER,utm_campaign TEXT);');
 for(const row of [['ig-catering',1,'/#tasting'],['ig-catering',0,'/#tasting'],['ig-catering',1,'/custom'],['other',1,'/#tasting']])db.prepare('INSERT INTO tracked_links VALUES (?,?,?,1,?)').run(...row,'original');
 const sql=readFileSync(new URL('../../migrations/0129_catering_bio_destination.sql',import.meta.url),'utf8');db.exec(sql);const rows=db.prepare('SELECT * FROM tracked_links ORDER BY rowid').all();assert.equal(rows[0].dest_url,'/catering#quote');assert.deepEqual(rows.slice(1).map(r=>r.dest_url),['/#tasting','/custom','/#tasting']);assert.ok(rows.every(r=>r.utm_campaign==='original'));db.exec(sql);assert.deepEqual(db.prepare('SELECT * FROM tracked_links ORDER BY rowid').all(),rows);db.close();
});
