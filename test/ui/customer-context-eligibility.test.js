// Owner-facing opt-in for the shared customer Ana context. These checks pin the rendered
// controls and their save contract because this project has no browser DOM harness for these
// inline HUB modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const KNOWLEDGE = readFileSync(new URL('../../public/hub/owner/knowledge.html', import.meta.url), 'utf8');
const MARKETING = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

test('saved rules and documents are internal until an owner explicitly applies eligibility', () => {
  assert.match(KNOWLEDGE, /Number\(it\.customer_eligible\) === 1/);
  assert.match(MARKETING, /Number\(r\.customer_eligible\) === 1/);
  assert.match(KNOWLEDGE, /data-save-customer=[\s\S]{0,120}disabled>Apply eligibility/);
  assert.match(MARKETING, /data-save-rule-customer=[\s\S]{0,120}disabled>Apply eligibility/);
  assert.match(KNOWLEDGE, /d\.can_manage_customer_context === true/);
  assert.match(MARKETING, /d\.can_manage_customer_context === true/);
  assert.match(KNOWLEDGE, /it\.status === 'ready'/, 'documents need a complete index before the owner can enable them');
  assert.match(KNOWLEDGE, /checked \|\| it\.status === 'ready'/, 'owners can revoke eligibility after a document is no longer ready');
  assert.match(KNOWLEDGE, /function findByData/);
  assert.match(MARKETING, /function findByData/);
});

test('both owner surfaces explain scope and state that enabling does not send or publish', () => {
  for (const source of [KNOWLEDGE, MARKETING]) {
    assert.match(source, /Use in Ana customer answers \(website and Instagram\)/);
    assert.match(source, /This makes the saved content available for answers; it does not send or publish anything\./);
    assert.match(source, /Off — internal HUB/);
  }
  assert.match(KNOWLEDGE, /Review the complete saved source before enabling/);
  assert.match(KNOWLEDGE, /excerpts do not prove the full source was reviewed/);
  assert.doesNotMatch(MARKETING.slice(MARKETING.indexOf('function exampleCard'), MARKETING.indexOf('function post(body)', MARKETING.indexOf('function exampleCard'))), /customer-toggle|Apply eligibility/,
    'reference photos remain internal marketing examples');
});

test('eligibility saves carry the loaded updated_at and reload after success, conflict, or failure', () => {
  for (const source of [KNOWLEDGE, MARKETING]) {
    assert.match(source, /op:'set_customer_eligibility', id:[^,]+, customer_eligible:!!input\.checked, expected_updated_at:Number\(/);
    assert.match(source, /_status === 409/);
    assert.match(source, /return load\(\)/, 'the saved state is read back instead of optimistically claimed');
    assert.match(source, /review (?:its returned|the returned|the current) state before retrying/);
    assert.match(source, /el\.disabled = true/);
  }
});

test('new rule and document submissions do not opt into customer answers', () => {
  assert.match(MARKETING, /post\(\{ op: 'add_rule', text: t \}\)/);
  assert.match(KNOWLEDGE, /post\(\{ op:'upload', file: dataUrl, filename: f\.name, title: label, source_kind: kind \}\)/);
  assert.doesNotMatch(MARKETING, /op: 'add_rule',[^}]*customer_eligible/);
  assert.doesNotMatch(KNOWLEDGE, /op:'upload',[^}]*customer_eligible/);
});
