import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { campaignKeywordReply, CAMPAIGN_POLICY_KEY, CAMPAIGN_TEMPLATE_FAMILY_VERSION, campaignTemplateHash } from '../../functions/_lib/social_campaign_keywords.js';
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

async function approveTemplates(DB, patch = {}) {
  const value = {
    enabled: true,
    template_family_version: CAMPAIGN_TEMPLATE_FAMILY_VERSION,
    template_hash: await campaignTemplateHash(),
    owner_approval: {
      approver: 'Dayan', approved_at: new Date().toISOString(),
      scope: 'instagram_campaign_keyword_templates',
      exclusions: ['no provider send', 'exact keywords only'], source: 'direct-session test fixture',
    },
    ...patch,
  };
  DB.prepare('INSERT OR REPLACE INTO app_settings (key,value,updated_by,updated_at) VALUES (?,?,?,?)')
    .bind(CAMPAIGN_POLICY_KEY, JSON.stringify(value), 'test-fixture', Date.now()).run();
  return value;
}

test('campaign keyword feature defaults off and only accepts exact trimmed keywords', async () => {
  assert.equal(await campaignKeywordReply({}, { text: 'LUNCH' }), null);
  const DB = makeSqliteD1();
  try {
    await approveTemplates(DB);
  for (const text of ['LUNCH please', 'I need lunch', 'OFFICE refund', 'CAJITA complaint', 'what is LUNCH?', 'ALMUERZO hoy', 'FIT']) {
      assert.equal(await campaignKeywordReply({ DB }, { text }), null, `${text} stays with normal Aña logic`);
  }
    const match = await campaignKeywordReply({ DB }, { text: '  OFFICE  ' });
    assert.equal(match.keyword, 'OFFICE');
    const spanishLunch = await campaignKeywordReply({ DB }, { text: 'ALMUERZO' });
    const spanishOffice = await campaignKeywordReply({ DB }, { text: 'OFICINA' });
    assert.equal(spanishLunch.language, 'es');
    assert.equal(spanishOffice.language, 'es');
    assert.match(spanishLunch.draft, /almuerzo diario/);
    assert.match(spanishOffice.draft, /Para almuerzos de oficina/);
  } finally { DB.sqlite.close(); }
});

test('LUNCH uses current SQLite config and can report an available date without guessing one', async () => {
  const now = new Date();
  const DB = readyLunchDb(now);
  try {
    await approveTemplates(DB);
    const reply = await campaignKeywordReply({ DB }, { text: 'LUNCH', now });
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
    await approveTemplates(DB);
    const unavailable = await campaignKeywordReply({ DB }, { text: 'LUNCH' });
    assert.equal(unavailable.source_status, 'unavailable');
    assert.match(unavailable.draft, /can’t verify an available daily-lunch date/);
  } finally { DB.sqlite.close(); }
  const approvedValue = {
    enabled: true, template_family_version: CAMPAIGN_TEMPLATE_FAMILY_VERSION,
    template_hash: await campaignTemplateHash(),
    owner_approval: { approver: 'Dayan', approved_at: new Date().toISOString(), scope: 'instagram_campaign_keyword_templates', exclusions: ['exact only'], source: 'test fixture' },
  };
  let firstCalls = 0;
  const absentDB = { prepare: () => ({ bind: () => ({ first: async () => (firstCalls++ === 0 ? { value: JSON.stringify(approvedValue) } : null) }), all: async () => ({ results: [] }) }) };
  const unverified = await campaignKeywordReply({ DB: absentDB }, { text: 'LUNCH' });
  assert.equal(unverified.source_status, 'unverified');
  assert.match(unverified.draft, /can’t confirm the current daily-lunch schedule/);
});

test('OFFICE and CAJITA return bilingual, source-aligned draft previews', async () => {
  const DB = makeSqliteD1();
  try {
  await approveTemplates(DB);
  const officeEn = await campaignKeywordReply({ DB }, { text: 'OFFICE' });
  const officeEs = await campaignKeywordReply({ DB }, { text: 'OFICINA' });
  const cajitaBilingual = await campaignKeywordReply({ DB }, { text: 'CAJITA' });
  const cajitaExplicitEn = await campaignKeywordReply({ DB }, { text: 'CAJITA', language: 'en' });
  const cajitaEs = await campaignKeywordReply({ DB }, { text: 'CAJITA', language: 'es' });
  assert.match(officeEn.draft, /20\+ of each meal with 24 hours’ notice, up to 50 total/);
  assert.match(officeEn.draft, /order\?category=corporate/);
  assert.match(officeEn.draft, /more than 50, custom menus, or recurring service/);
  assert.match(officeEs.draft, /Para almuerzos de oficina/);
  assert.match(officeEs.draft, /occasion=corporate/);
  assert.match(cajitaBilingual.draft, /La Cajita quote \/ Cotización de La Cajita/);
  assert.match(cajitaBilingual.draft, /Se requieren al menos 48 horas/);
  assert.match(cajitaExplicitEn.draft, /Please allow at least 48 hours/);
  assert.match(cajitaExplicitEn.draft, /^(?!.*Cotización)/);
  assert.match(cajitaBilingual.draft, /cajita-builder/);
  assert.match(cajitaEs.draft, /al menos 48 horas/);
  } finally { DB.sqlite.close(); }
});

test('draftReply returns the gated template without Anthropic/provider use; normal send boundary remains intact', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('provider calls are forbidden in this test'); };
  try {
    const empty = makeSqliteD1();
    const off = await draftReply({ DB: empty }, { text: 'OFFICE' });
    assert.equal(off.ok, false, 'flag-off path retains ordinary model configuration requirement');
    await approveTemplates(empty);
    const on = await draftReply({ DB: empty }, { text: 'OFICINA' });
    assert.equal(on.ok, true);
    assert.equal(on.campaign_keyword, 'OFICINA');
    assert.match(on.draft, /Para almuerzos de oficina/);
    assert.equal(calls, 0);
    empty.sqlite.close();
  } finally { globalThis.fetch = originalFetch; }
  assert.ok(!/instagram_messaging|sendDirectMessage|replyToComment/.test(helper));
  assert.match(ana, /campaignKeywordReply\(env/);
  assert.match(helper, /SELECT value FROM app_settings WHERE key = \?/);
  assert.match(tick, /sendAnaDraft\(/, 'existing inbox draft/send path is not replaced');
});

test('stale or malformed approval does not enable changed template copy', async () => {
  const DB = makeSqliteD1();
  try {
    const bad = await approveTemplates(DB, { template_hash: 'old-template-hash' });
    const result = await campaignKeywordReply({ DB }, { text: 'OFFICE' });
    assert.equal(result, null);
    assert.equal(bad.template_hash, 'old-template-hash');
  } finally { DB.sqlite.close(); }
});
