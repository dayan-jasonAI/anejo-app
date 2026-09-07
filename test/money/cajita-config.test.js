import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCajitaConfiguration, extractCajitaConfiguration } from '../../functions/_lib/cajita-config.js';
import { onRequestPost } from '../../functions/api/leads.js';
import { makeD1 } from '../helpers/d1.js';

const config = {
  version: 1,
  variants: [
    { id: 'standard', name: 'Standard', quantity: 20, items: [{ id: 'sandwich', quantity: 1 }, { id: 'empanada', quantity: 1 }, { id: 'tres-leches', quantity: 0 }], theme: { preset: 'signature', name: 'Añejo', colors: { background: '#112233' }, pattern: 'none', pickShape: 'round' }, personalization: { labelText: 'Team', tagText: 'Thanks', pickText: '', artworks: [] } },
    { id: 'no-dessert', name: 'No dessert', quantity: 10, items: [{ id: 'sandwich', quantity: 1 }, { id: 'salad', quantity: 1 }, { id: 'tres-leches', quantity: 0 }], theme: { colors: { box: '#abcdef' } }, personalization: { artworks: [] } },
  ],
};

test('normalizes two variants and produces complete kitchen totals', () => {
  const out = normalizeCajitaConfiguration(config);
  assert.equal(out.ok, true);
  assert.match(out.summary, /Version Standard \(20 boxes\)/);
  assert.match(out.summary, /Version No dessert \(10 boxes\)/);
  assert.match(out.summary, /sandwich x30/);
  assert.match(out.json, /tres-leches/);
  assert.deepEqual(extractCajitaConfiguration(`Cajita configuration JSON: ${out.json}`).config, out.value);
});

test('rejects invented IDs, unsafe text, invalid counts, colors, and unclaimed artwork', () => {
  for (const bad of [
    { ...config, variants: [{ ...config.variants[0], items: [{ id: 'steak', quantity: 1 }] }] },
    { ...config, variants: [{ ...config.variants[0], quantity: 0 }] },
    { ...config, variants: [{ ...config.variants[0], theme: { colors: { box: 'red' } } }] },
    { ...config, variants: [{ ...config.variants[0], name: '<script>x</script>' }] },
    { ...config, variants: [{ ...config.variants[0], personalization: { artworks: [{ attachmentId: 'cat_missing', surface: 'box', x: 0, y: 0, scale: 1, rotation: 0 }] } }] },
  ]) assert.equal(normalizeCajitaConfiguration(bad).ok, false);
});

test('lead integration persists the complete config and escapes its owner notification', async () => {
  const DB = makeD1([[/INSERT INTO leads/i, () => 1], [/SELECT active FROM staff/i, () => null]]);
  const previous = globalThis.fetch;
  let email = '';
  globalThis.fetch = async (_url, init) => { email = JSON.parse(init.body).html; return { ok: true, json: async () => ({ id: 'mail_1' }) }; };
  try {
    const response = await onRequestPost({
      env: { DB, RESEND_API_KEY: 'test', LEADS_NOTIFY_TO: 'owner@example.test' },
      request: new Request('https://anejocateringco.com/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'catering', name: 'Host <x>', email: 'host@example.test', menu_options: ['Individual Cajitas'], guests: 30, event_date: '2030-01-01', event_type: 'Other', location: '33401', cajita_configuration: config }) }),
    });
    assert.equal(response.status, 200);
  } finally { globalThis.fetch = previous; }
  assert.match(email, /Version Standard/);
  assert.match(email, /sandwich x30/);
  assert.doesNotMatch(email, /Host <x>/);
});
