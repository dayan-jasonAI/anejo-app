import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const page = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const fn = page.slice(page.indexOf('  function nextPostCard('), page.indexOf('  function renderToday()'));
const context = { window: {}, esc: (s) => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), Date };
vm.runInNewContext(fn, context);
const render = (posts, extra = {}) => context.nextPostCard({ ok: true, configured: true, connected: true, posts, ...extra }, 1789700000000);
test('next action prioritizes uncertain publication and failures before more content', () => {
  assert.match(render([{ status: 'draft' }, { status: 'publishing' }]), /Check publication/);
  assert.match(render([{ status: 'scheduled' }, { status: 'failed' }]), /Review failed posts/);
  assert.match(render([{ status: 'draft' }]), /Review drafts/);
});
test('scheduled is a saved state and never a verified live outcome', () => {
  const html = render([{ status: 'scheduled', scheduled_at: 1789800000000 }]);
  assert.match(html, /Saved for/); assert.match(html, /Publication is not yet verified/);
  assert.match(html, /latest 60 posts/); assert.match(html, /not proof of a running publisher/);
  assert.match(render([]), /href="#photos"/);
});
test('connection errors, unknown expiry and unavailable data remain explicit', () => {
  assert.match(render([], { connected: false }), /connection check failed/);
  assert.match(render([], { configured: false }), /not configured/);
  assert.match(render([]), /expiry is not recorded/);
  assert.match(render([], { token_expiry: { at: 1789800000000, status: 'warning' } }), /Recorded connection expiry/);
  assert.match(context.nextPostCard(null, 0), /Post status unavailable/);
  assert.doesNotMatch(context.nextPostCard(null, 0), /Choose a photo/);
});
test('statuses render bilingual and untrusted account labels are escaped', () => {
  assert.match(render([], { account: { username: '<img>' } }), /&lt;img&gt;/);
  context.window.AnejoLang = { get: () => 'es' };
  assert.match(render([{ status: 'draft' }]), /Revisar borradores/);
  delete context.window.AnejoLang;
});
