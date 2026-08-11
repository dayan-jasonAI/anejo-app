import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIG = readFileSync(new URL('../../migrations/0084_founder_legacy_today_only_promo_campaign.sql', import.meta.url), 'utf8');

test('Founder Legacy promo seed creates draft-only email campaign assets', () => {
  assert.match(MIG, /INSERT OR IGNORE INTO team_briefs/);
  assert.match(MIG, /INSERT INTO campaign_templates/);
  assert.match(MIG, /INSERT OR IGNORE INTO campaigns/);
  assert.match(MIG, /'founder_legacy_members'/);
  assert.match(MIG, /'draft'/);
  assert.doesNotMatch(MIG, /INSERT\s+(OR IGNORE\s+)?INTO\s+promo_codes/i);
  assert.doesNotMatch(MIG, /'scheduled'/);
  assert.doesNotMatch(MIG, /'sending'/);
});

test('Founder Legacy promo template keeps member, video, promo and compliance placeholders visible', () => {
  for (const token of [
    '{{first_name}}',
    '{{name}}',
    '{{promo_code}}',
    '{{promo_discount}}',
    '{{promo_expires_at}}',
    '{{promo_video_url}}',
    '{{unsubscribe_url}}',
    '{{postal_address}}',
  ]) {
    assert.ok(MIG.includes(token), `${token} should be present`);
  }
  assert.match(MIG, /Watch the 30-second thank-you video/);
  assert.match(MIG, /Valid until \{\{promo_expires_at\}\}/);
  assert.match(MIG, /any subscription plan/i);
});
