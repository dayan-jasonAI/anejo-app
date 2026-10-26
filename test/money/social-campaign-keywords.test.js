import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { campaignKeywordReply, CAMPAIGN_KEYWORD_FLAG } from '../../functions/_lib/social_campaign_keywords.js';
import { draftReply } from '../../functions/_lib/ana_social.js';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { etDateOf } from '../../functions/_lib/hub.js';

const helper = readFileSync(new URL('../../functions/_lib/social_campaign_keywords.js', import.meta.url), 'utf8');
const ana = readFileSync(new URL('../../functions/_lib/ana_social.js', import.meta.url), 'utf8');
const tick = readFileSync(new URL('../../functions/api/hub/admin/social-inbox-tick.js', import.meta.url), 'utf8');

function readyLunchDb(now = new Date()) {
  const DB = makeSqliteD1();
  const old = DB.one('SELECT config_json FROM daily_lunch_config WHERE id=1');
  const config = JSON.parse(old.config_json);
  const today = etDateOf(now.getTime());
  config.dates = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.parse(`${today}T12:00:00Z`) + (i + 1) * 86400000).toISOString().slice(0, 10),
    product_id: config.products[0].id,
    enabled: true,
    sold_out: false,
  }));
  DB.prepare('UPDATE daily_lunch_config SET config_json=? WHERE id=1').bind(JSON.stringify(config)).run();
  return DB;
}

test('campaign keyword feature defaults off and only accepts exact trimmed keywords', async () => {
  assert.equal(CAMPAIGN_KEYWORD_FLAG, 'SOCIAL_CAMPAIGN_KEYWORDS_ENABLED');
  assert.equal(await campaignKeywordReply({}, { text: 'LUNCH' }), null);
  for (const text of ['LUNCH please', 'I need lunch', 'OFFICE refund', 'CAJITA complaint', 'what is LUNCH?', 'FIT']) {
    assert.equal(await campaignKeywordReply({}, { text, enabled: true }), null, `${text} stays with normal Aña logic`);
  }
  const match = await campaignKeywordReply({}, { text: '  OFFICE  ', enabled: true });
  assert.equal(match.keyword, 'OFFICE');
});

test('LUNCH uses current SQLite config and can report an available date without guessing one', async () => {
  const now = new Date();
  const DB = readyLunchDb(now);
  try {
    const reply = await campaignKeywordReply({ DB }, { text: 'LUNCH', enabled: true, now });
    assert.equal(reply.source_status, 'available');
    assert.match(reply.draft, /date-based/);
    assert.match(reply.draft, /order\?category=daily/);
    assert.doesNotMatch(reply.draft, /\d{4}-\d{2}-\d{2}/);
  } finally { DB.sqlite.close(); }
});

test('unavailable and unconfigured lunch sources do not claim availability', async () => {
  const DB = makeSqliteD1();
  try {
    const current = DB.one('SELECT config_json FROM daily_lunch_config WHERE id=1');
    const config = JSON.parse(current.config_json);
    config.dates = [];
    DB.prepare('UPDATE daily_lunch_config SET config_json=? WHERE id=1').bind(JSON.stringify(config)).run();
    const unavailable = await campaignKeywordReply({ DB }, { text: 'LUNCH', enabled: true });
    assert.equal(unavailable.source_status, 'unavailable');
    assert.match(unavailable.draft, /can’t verify an available daily-lunch date/);
  } finally { DB.sqlite.close(); }
  const absentDB = { prepare: () => ({ first: async () => null, all: async () => ({ results: [] }) }) };
  const unverified = await campaignKeywordReply({ DB: absentDB }, { text: 'LUNCH', enabled: true });
  assert.equal(unverified.source_status, 'unverified');
  assert.match(unverified.draft, /can’t confirm the current daily-lunch schedule/);
});

test('OFFICE and CAJITA return bilingual, source-aligned draft previews', async () => {
  const officeEn = await campaignKeywordReply({}, { text: 'OFFICE', enabled: true });
  const officeEs = await campaignKeywordReply({}, { text: 'OFFICE', language: 'es', enabled: true });
  const cajitaEn = await campaignKeywordReply({}, { text: 'CAJITA', enabled: true });
  const cajitaEs = await campaignKeywordReply({}, { text: 'CAJITA', language: 'es', enabled: true });
  assert.match(officeEn.draft, /20\+ of each meal, up to 50 total/);
  assert.match(officeEn.draft, /order\?category=corporate/);
  assert.match(officeEn.draft, /more than 50, custom menus, or recurring service/);
  assert.match(officeEs.draft, /Para almuerzos de oficina/);
  assert.match(officeEs.draft, /occasion=corporate/);
  assert.match(cajitaEn.draft, /at least 48 hours/);
  assert.match(cajitaEn.draft, /cajita-builder/);
  assert.match(cajitaEs.draft, /al menos 48 horas/);
});

test('draftReply returns the gated template without Anthropic/provider use; normal send boundary remains intact', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('provider calls are forbidden in this test'); };
  try {
    const off = await draftReply({}, { text: 'OFFICE' });
    assert.equal(off.ok, false, 'flag-off path retains ordinary model configuration requirement');
    const on = await draftReply({ SOCIAL_CAMPAIGN_KEYWORDS_ENABLED: 'true' }, { text: 'OFFICE', language: 'es' });
    assert.equal(on.ok, true);
    assert.equal(on.campaign_keyword, 'OFFICE');
    assert.match(on.draft, /Para almuerzos de oficina/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
  assert.ok(!/instagram_messaging|sendDirectMessage|replyToComment/.test(helper));
  assert.match(ana, /SOCIAL_CAMPAIGN_KEYWORDS_ENABLED === 'true'/);
  assert.match(tick, /sendAnaDraft\(/, 'existing inbox draft/send path is not replaced');
});
