import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const page = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const code = page.slice(page.indexOf("  var queueFilter = 'drafts';"), page.indexOf('  // datetime-local wants LOCAL parts.'));
function harness() {
  let cards = [], focused;
  const title = { scrollIntoView() {}, focus() { focused = 'title'; } };
  const buttons = ['drafts','scheduled','attention','live','all','archived'].map((filter) => ({ getAttribute: () => filter, setAttribute(k,v) { this[k] = v; }, classList: { toggle() {} } }));
  const nodes = { 'queue-count': {}, 'queue-empty': {}, 'post-queue-title': title };
  let loads=0;
  const ctx = { Array, URLSearchParams, DATA:{archived_view:false},load:()=>{loads++;}, history:{replaceState(_state,_title,url){ctx.location.hash=url;}}, location: { hash: '#create-instagram?filter=drafts&post=d2' }, window: { MarketingTabs: {} }, document: { querySelectorAll: (s) => s === '[data-queue-card]' ? cards : buttons, getElementById: (id) => nodes[id] } };
  vm.runInNewContext(code, ctx);
  function add(id, status) { const card = { text: 'unsaved caption', getAttribute: (a) => a === 'data-queue-card' ? id : status, scrollIntoView() {}, focus() { focused = id; } }; cards.push(card); return card; }
  return { ctx, add, buttons, nodes, get focused() { return focused; },get loads(){return loads;} };
}
test('deep link focuses requested card after asynchronous queue load', () => {
  const h = harness(); h.ctx.window.MarketingTabs.routeQueue();
  h.add('d1','draft'); const selected = h.add('d2','draft'); h.add('s1','scheduled');
  h.ctx.window.MarketingTabs.routeQueue();
  assert.equal(h.focused, 'd2'); assert.equal(selected.hidden, false);
});
test('filters hide cards without replacing unsaved edits and preserve attention distinctions', () => {
  const h = harness(), draft = h.add('d','draft'), failed = h.add('f','failed'), publishing = h.add('p','publishing'), scheduled = h.add('s','scheduled'), live = h.add('l','published');
  h.ctx.window.MarketingTabs.filterQueue('attention');
  assert.equal(failed.hidden, false); assert.equal(publishing.hidden, false); assert.equal(scheduled.hidden, true); assert.equal(live.hidden,true);
  h.ctx.window.MarketingTabs.filterQueue('drafts'); assert.equal(draft.text,'unsaved caption'); assert.equal(draft.hidden,false);
  assert.equal(h.buttons[0]['aria-pressed'], 'true');
  assert.doesNotMatch(code, /innerHTML|replaceChildren|Hub.api|fetch\(/);
});
test('absent target focuses queue heading instead of wrong post', () => {
  const h = harness(); h.add('other','draft'); h.ctx.window.MarketingTabs.routeQueue(); assert.equal(h.focused,'title');
});
test('advanced tools stay present under disclosure and full page scripts parse', () => {
  assert.match(page, /queue-advanced/); assert.match(page, /brandingTool\(p\) \+ carouselTool\(p\) \+ referenceVariantTool\(p\) \+ promptImageTool\(p\)/);
  for (const m of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  assert.match(page, /Latest 60 posts returned/);
});

test('a planner suggested date never reads as an approved schedule', () => {
  const c = {}; vm.runInNewContext(page.slice(page.indexOf('  function when(p)'),page.indexOf('  function whenLabel(')),c);
  assert.match(c.when({status:'draft',scheduled_at:Date.now()}),/Suggested time — not scheduled/);
  assert.match(c.when({status:'scheduled',scheduled_at:Date.now()}),/^Scheduled for/);
});

test('removed view loads separately and All never exposes archived drafts',()=>{
 const h=harness();const removed=h.add('r','archived');h.ctx.window.MarketingTabs.filterQueue('all');assert.equal(removed.hidden,true);
 h.ctx.window.MarketingTabs.filterQueue('archived');assert.equal(h.loads,1);assert.match(h.ctx.location.hash,/filter=archived/);
 h.ctx.DATA.archived_view=true;h.ctx.window.MarketingTabs.routeQueue();assert.equal(removed.hidden,false);
 h.ctx.window.MarketingTabs.filterQueue('drafts');assert.equal(h.loads,2);assert.match(h.ctx.location.hash,/filter=drafts/);
});

test('cold shell navigation is safe before the first queue response',()=>{
 const h=harness();h.ctx.DATA=null;assert.doesNotThrow(()=>h.ctx.window.MarketingTabs.routeQueue());assert.equal(h.loads,0);
 h.ctx.location.hash='#create-instagram?filter=archived';assert.doesNotThrow(()=>h.ctx.window.MarketingTabs.routeQueue());assert.equal(h.loads,0);
 h.ctx.DATA={archived_view:false};h.ctx.window.MarketingTabs.routeQueue();assert.equal(h.loads,1);
});
