import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const page = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const block = page.slice(page.indexOf('  var EXPIRY_MSG ='), page.indexOf('  // Owner-entered only'));
const ctx = { esc: String, Date, recordControl: () => '<button>Record expiry date</button>' };
vm.runInNewContext(block, ctx);
const token = status => ({ status, at: Date.UTC(2026,8,20), days_left: status === 'expired' ? -5 : 5, swap_doc: 'docs/INSTAGRAM_TOKEN_SWAP.md' });
test('past manually recorded expiry never overrides live connection evidence with an outage claim', () => {
 const html = ctx.expiryBanner({ connected: true, followers: 80, token_expiry: token('expired') });
 assert.match(html,/Recorded Instagram token expiry has passed/);
 assert.match(html,/may be outdated/);assert.match(html,/does not prove/);assert.match(html,/renew if needed/);
 assert.doesNotMatch(html,/are down until|token expired |never expires/);
 assert.match(html,/Record expiry date/);
});
test('future and absent expiry remain reminders rather than credential validation', () => {
 for(const state of ['ok','warning','urgent']) {
  const html=ctx.expiryBanner({token_expiry:token(state)});
  assert.match(html,/Recorded Instagram token expiry/);assert.match(html,/does not establish live access/);
  assert.doesNotMatch(html,/never expires|stop working with no warning/);
 }
 const unknown=ctx.expiryBanner({});assert.match(unknown,/expiry not recorded/);assert.match(unknown,/does not check/);
});
test('Today explains that a passed date is only the recorded reminder',()=>{
 const context={window:{},esc:String,Date};
 vm.runInNewContext(page.slice(page.indexOf('  function nextPostCard('),page.indexOf('  function renderToday()')),context);
 const html=context.nextPostCard({ok:true,configured:true,connected:true,posts:[],token_expiry:token('expired')},Date.UTC(2026,8,25));
 assert.match(html,/recorded date has passed; verify current access/);assert.doesNotMatch(html,/\(expired\)|insights are down/);
});
test('edited inline marketing scripts still parse',()=>{
 for(const script of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
