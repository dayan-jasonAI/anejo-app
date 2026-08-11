import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudience, SEGMENTS } from '../../functions/_lib/audience.js';
import { makeD1 } from '../helpers/d1.js';

test('Founder Legacy Members is a dedicated campaign segment', () => {
  assert.ok(SEGMENTS.founder_legacy_members);
  assert.match(SEGMENTS.founder_legacy_members.label, /Founder Legacy/);
});

test('Founder Legacy segment is launch-list members with paid-order evidence', async () => {
  const rows = [
    { name: 'Arianne Vega', email: 'arianne@example.com', phone: '+15615550101', consent: 1 },
  ];
  const DB = makeD1([
    [/FROM campaign_unsubscribes/, () => []],
    [/FROM leads l[\s\S]+EXISTS \([\s\S]+FROM orders o/, () => rows],
  ]);

  const audience = await resolveAudience({ DB }, { segment: 'founder_legacy_members', channel: 'email' });

  assert.equal(audience.recipients.length, 1);
  assert.deepEqual(audience.recipients[0], {
    address: 'arianne@example.com',
    name: 'Arianne Vega',
    source: 'founder_legacy_members',
  });

  const sql = DB.sqlLog().join('\n');
  assert.match(sql, /l\.kind='launch'/);
  assert.match(sql, /LOWER\(TRIM\(o\.customer_email\)\) = LOWER\(TRIM\(l\.email\)\)/);
  assert.match(sql, /o\.status IN \('paid','prep','ready','fulfilled'\)/);
});
