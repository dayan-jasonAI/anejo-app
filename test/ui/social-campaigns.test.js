import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('../../public/hub/owner/assets/social-campaigns.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../public/hub/owner/social-campaigns.html', import.meta.url), 'utf8');
function harness(response = { ok: true, campaigns: [] }) {
  const nodes = Object.fromEntries(['owner-root', 'campaign-feedback', 'campaign-reload'].map(id => [id, { innerHTML: '', textContent: '', setAttribute(k, v) { this[k] = v; }, addEventListener() {} }]));
  const calls = [], listeners = {};
  const ctx = { Hub: { esc: v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), api: async u => { calls.push(u); return response; } }, Owner: { init(_view, fn) { ctx.start = fn; } }, document: { getElementById: id => nodes[id] }, window: { addEventListener(k, fn) { listeners[k] = fn; } }, location: { origin: 'https://example.test', search: '' }, URL, URLSearchParams, Intl, Date, Object, Array, Number, String };
  vm.runInNewContext(code, ctx);
  return { api: ctx.window.CampaignReview, start: () => ctx.start(), nodes, calls, listeners, ctx };
}
test('post readiness counts use explicit current API records including unfilled slots', () => {
  const h = harness();
  assert.deepEqual({ ...h.api.counts([{ slot_id: 'empty' }, { post_id: 'draft', post_status: 'draft' }, { post_id: 'ready', ready: true }, { post_id: 'audit-failed', ready: true, blockers: ['audit stale'] }, { post_id: 'scheduled', post_status: 'scheduled' }, { post_id: 'published', post_status: 'published' }]) }, { ready: 1, draft: 1, blocked: 2, scheduled: 1, published: 1 });
});
test('read-only review cannot approve, schedule, or publish', () => {
  assert.doesNotMatch(code, /method\s*:\s*['"](?:POST|PUT|DELETE|PATCH)|approve_schedule|fetch\(/);
  assert.match(code, /approval: null/);
  assert.match(code, /source_preview_digest: cycle.preview_digest/);
  assert.match(code, /requires_new_server_preview: dirty\(\)/);
});
test('URLs reject active schemes, invalid origins, and embedded credentials', () => {
  const h = harness();
  assert.equal(h.api.safeUrl('javascript:alert(1)'), '');
  assert.equal(h.api.safeUrl('data:text/html,hello'), '');
  assert.equal(h.api.safeUrl('https://user:secret@example.test'), '');
  assert.equal(h.api.safeUrl('/api/hub/media/example'), 'https://example.test/api/hub/media/example');
});
test('empty and error states remain distinct after cold navigation', async () => {
  const empty = harness(); await empty.start();
  assert.match(empty.nodes['owner-root'].innerHTML, /No campaign has been drafted/);
  const failed = harness({ ok: false, error: 'Campaign storage unavailable' }); await failed.start();
  assert.match(failed.nodes['owner-root'].innerHTML, /Campaign could not load/);
  assert.doesNotMatch(failed.nodes['owner-root'].innerHTML, /No campaign has been drafted/);
});
test('unsaved caption suggestions block reload and browser exit without mutating server', async () => {
  const h = harness(); h.api.state.edits.slot = 'Unsent local caption'; await h.start();
  assert.equal(h.calls.length, 0); assert.match(h.nodes['campaign-feedback'].textContent, /unsaved caption/);
  let prevented = false; const event = { preventDefault() { prevented = true; } }; h.listeners.beforeunload(event);
  assert.equal(prevented, true); assert.equal(event.returnValue, '');
});
test('owner auth, untranslated captions, and review disclosures are present', () => {
  assert.match(code, /Owner.init\('marketing', load\)/);
  assert.match(code, /translate="no" dir="auto"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(code, /Dates marked suggested have not been scheduled/);
  assert.match(code, /audit_current === true/);
  assert.match(page, /Loading campaign/);
});
