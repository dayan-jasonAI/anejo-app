// The media slots: an owner-settable video per self-serve section, and — far more importantly —
// what the pages do while every one of them is EMPTY, which is the state they will be in until
// Dayan actually records something. A slot has to be invisible when unset, refuse a URL it cannot
// safely put in a src, and never autoplay at a prospect who opened a link in a clinic corridor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, setting } from '../helpers/sales-fixture.js';
import { OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestGet as landing } from '../../functions/for/[token].js';
import { onRequestGet as settingsGet, onRequestPost as settingsPost } from '../../functions/api/hub/owner/sales/settings.js';
import { safeMediaUrl, validateMedia, mediaSlot, mediaSlotHtml, MEDIA_SLOTS } from '../../functions/_lib/sales/media.js';

const tokenOf = (env, oppId) => env.DB.one('SELECT landing_token FROM sales_opportunities WHERE id = ?', oppId).landing_token;
const open = (env, token) => landing({ env, params: { token }, request: new Request(`https://anejocateringco.com/for/${token}`) });
const post = (env, body) => settingsPost({ env, request: new Request('https://anejocateringco.com/api/hub/owner/sales/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE }, body: JSON.stringify(body) }) });
const get = (env) => settingsGet({ env, request: new Request('https://anejocateringco.com/api/hub/owner/sales/settings', { headers: { Cookie: OWNER_COOKIE } }) });

const VIDEO = 'https://media.anejocateringco.com/orientation.mp4';

test('only an https URL or a same-origin path can reach a src attribute', () => {
  assert.equal(safeMediaUrl(VIDEO), VIDEO);
  assert.equal(safeMediaUrl('/assets/video/how.mp4'), '/assets/video/how.mp4');
  for (const bad of [
    'javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'http://media.example.com/v.mp4',
    '//media.example.com/v.mp4', 'https://media.example.com/../../etc/passwd', 'https://nohost',
    'https://media.example.com/a b.mp4', '/assets/v.mp4" onerror="x', '',
  ]) assert.equal(safeMediaUrl(bad), '', `${bad} must not be usable as a source`);
});

test('a save is refused with a sentence the owner can act on, never silently dropped', () => {
  assert.equal(validateMedia({ how_it_works: { url: VIDEO } }), null);
  assert.match(validateMedia({ how_it_work: { url: VIDEO } }), /Unknown media slot/);
  assert.match(validateMedia({ faq: { url: 'http://x.example/v.mp4' } }), /https:\/\/ address or a path/);
  // WebVTT is the only thing <track> reads; an .srt would store fine and then fail in the browser
  // where nobody would ever see it.
  assert.match(validateMedia({ faq: { url: VIDEO, captions_url: 'https://x.example/c.srt' } }), /WebVTT/);
  assert.match(validateMedia({ faq: { url: VIDEO, captions_lang: 'fr' } }), /Captions language/);
  assert.match(validateMedia({ faq: { poster: '/assets/img/p.jpg' } }), /render nothing/);
  assert.match(validateMedia({ faq: { url: VIDEO, caption: 'x'.repeat(301) } }), /caption is too long/);
  assert.match(validateMedia(['how_it_works']), /must be an object/);
});

test('a slot with no video renders literally nothing, and a stored-but-unusable URL is not live', () => {
  for (const slot of Object.keys(MEDIA_SLOTS)) assert.equal(mediaSlotHtml({}, slot), '');
  assert.equal(mediaSlotHtml({ faq: { url: '', poster: '/assets/img/p.jpg' } }, 'faq'), '');
  assert.equal(mediaSlot({ faq: { url: 'http://x.example/v.mp4' } }, 'faq'), null);
  assert.equal(mediaSlotHtml(null, 'faq'), '');
});

test('a configured video is poster-framed, click-to-play, captionable, and never autoplays', () => {
  const html = mediaSlotHtml({
    orientation: {
      url: VIDEO, poster: '/assets/img/orientation.jpg', caption: 'Two minutes on how a day works',
      captions_url: 'https://media.anejocateringco.com/orientation.vtt', captions_lang: 'es',
    },
  }, 'orientation');
  assert.match(html, /<video controls playsinline preload="none" poster="\/assets\/img\/orientation\.jpg"/);
  assert.match(html, /<source src="https:\/\/media\.anejocateringco\.com\/orientation\.mp4" type="video\/mp4">/);
  assert.match(html, /<track kind="captions" src="[^"]+\.vtt" srclang="es" label="Español" default>/);
  assert.match(html, /Two minutes on how a day works/);
  // The three attributes that would make this page hostile on a phone.
  assert.doesNotMatch(html, /autoplay/);
  assert.doesNotMatch(html, /preload="auto"|preload="metadata"/);
  assert.doesNotMatch(html, /\bloop\b/);
});

test('slot text is escaped — a caption is owner input like any other', () => {
  const html = mediaSlotHtml({ faq: { url: VIDEO, caption: '<script>alert(1)</script>' } }, 'faq');
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('the landing page carries no player until one is configured, then carries exactly one per section', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const token = tokenOf(env, oppId);

  let html = await (await open(env, token)).text();
  assert.doesNotMatch(html, /<video/, 'an unset slot must leave no trace on the page');
  assert.match(html, /How it works|How .* works/, 'the section is the page with or without a video');

  setting(env, 'sales.media', { how_it_works: { url: VIDEO, poster: '/assets/img/how.jpg' } });
  html = await (await open(env, token)).text();
  assert.equal(html.match(/<video/g).length, 1);
  assert.match(html, /<section id="how">[\s\S]*<video[\s\S]*?<ol>/, 'the video sits above the steps it illustrates');
  assert.doesNotMatch(html, /autoplay/);

  setting(env, 'sales.media', { how_it_works: { url: VIDEO }, faq: { url: VIDEO } });
  html = await (await open(env, token)).text();
  assert.equal(html.match(/<video/g).length, 2);
});

test('the owner can list and save the slots, and a bad URL is refused rather than stored', async () => {
  const { env } = await readyEnv();

  let body = await (await get(env)).json();
  assert.equal(body.ok, true);
  assert.equal(body.media.length, Object.keys(MEDIA_SLOTS).length);
  for (const m of body.media) {
    assert.equal(m.live, false);
    assert.ok(m.where, 'each slot says where it renders, so a video is never uploaded into a void');
  }

  const bad = await post(env, { op: 'save', key: 'sales.media', value: { orientation: { url: 'javascript:alert(1)' } } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /https:\/\/ address or a path/);
  assert.equal((await (await get(env)).json()).media.find((m) => m.slot === 'orientation').live, false);

  const ok = await post(env, { op: 'save', key: 'sales.media', value: { orientation: { url: VIDEO, caption: 'Orientation' } } });
  assert.equal(ok.status, 200);
  body = await (await get(env)).json();
  const orientation = body.media.find((m) => m.slot === 'orientation');
  assert.equal(orientation.live, true);
  assert.equal(orientation.url, VIDEO);
  // A partial save must not wipe the slots it did not mention.
  await post(env, { op: 'save', key: 'sales.media', value: { faq: { url: VIDEO } } });
  const after = (await (await get(env)).json()).media;
  assert.equal(after.find((m) => m.slot === 'faq').live, true);
  assert.equal(after.find((m) => m.slot === 'orientation').live, true);

  // And clearing one slot stays possible, and stays a deliberate act.
  await post(env, { op: 'save', key: 'sales.media', value: { orientation: { url: '' } } });
  const cleared = (await (await get(env)).json()).media;
  assert.equal(cleared.find((m) => m.slot === 'orientation').live, false);
  assert.equal(cleared.find((m) => m.slot === 'faq').live, true);
});

test('the media settings are owner-only', async () => {
  const { env } = await readyEnv();
  const asKitchen = await settingsGet({ env, request: new Request('https://anejocateringco.com/api/hub/owner/sales/settings', { headers: { Cookie: 'anejo_sess=tok-kitchen' } }) });
  assert.equal(asKitchen.status >= 400, true);
});
