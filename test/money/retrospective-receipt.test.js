import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { buildRetrospective, renderRetrospective, retrospectiveReceipt } from '../../functions/_lib/retrospective.js';
import { buildSpine, renderSpine } from '../../functions/_lib/team_lead.js';
import { persistInferenceReceipt } from '../../functions/_lib/inference_receipt.js';

const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const DB = makeSqliteD1();
  DB.exec("UPDATE team_briefs SET status='archived'");
  t.after(() => DB.sqlite.close());
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Provider access forbidden'); });
  return { DB };
}
const states = receipt => Object.fromEntries(receipt.documents.filter(d => d.id.startsWith('query:')).map(d => [d.id.slice(6), d.read_status]));
function failRead(env, pattern) {
  const original = env.DB.prepare;
  env.DB.prepare = sql => {
    if (pattern.test(sql)) throw Error('Injected query failure');
    return original(sql);
  };
}

test('real empty reads remain distinct from opaque signal coverage and exact supplied-text receipt persists', async t => {
  const env = fixture(t);
  const spine = await buildSpine(env);
  const receipt = spine.input_components.retrospective;
  assert.deepEqual(states(receipt), { signals: 'unknown', briefs: 'empty', brief_performance: 'empty', attribution: 'ok', audit_flags: 'empty', outcomes: 'ok' });
  assert.equal(receipt.read_status, 'partial');
  assert.deepEqual(spine.coverage.retrospective, receipt);
  const supplied = renderRetrospective(spine.retro);
  assert.equal(receipt.rendered_sha256, hash(supplied));
  assert.equal(receipt.supplied_chars, supplied.length);
  assert.ok(renderSpine(spine).includes(supplied));
  assert.equal(spine.retro.outcomes.revenue, null);
  assert.equal(spine.retro.outcomes.quoteBookings, null);
  assert.equal(spine.retro.outcomes.roas, null);
  const requestJson = JSON.stringify({ model: 'fixture-model', max_tokens: 10, system: renderSpine(spine), messages: [{ role: 'user', content: 'Private rehearsal only' }] });
  const saved = await persistInferenceReceipt(env, { surface: 'team_lead', requestJson, components: spine.input_components });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const retained = env.DB.one('SELECT * FROM inference_receipts WHERE id=?', saved.receipt_id);
  assert.equal(retained.request_json, requestJson);
  assert.deepEqual(JSON.parse(retained.components_json).retrospective, receipt);
});

test('selected brief and audited-post identities/timestamps are bounded; truncation hashes only supplied text', async t => {
  const env = fixture(t);
  env.DB.exec("INSERT INTO team_briefs(id,title,objective,success_metric,status,created_at,updated_at) VALUES('brief','Recorded goal','Private','Recorded metric','draft',10,20)");
  for (let i = 0; i < 45; i++) {
    env.DB.sqlite.prepare("INSERT INTO social_posts(id,status,caption,public_token,created_at,updated_at,audit_flags) VALUES(?,'draft','Private fixture',?,?,?,?)").run('post_' + i, 'token_' + i, i + 100, i + 200, '[{"type":"claim"}]');
  }
  env.DB.exec("UPDATE social_posts SET status='published',audit_at=400 WHERE id='post_44'; INSERT INTO post_provenance(post_id,brief_id,created_at,updated_at) VALUES('post_44','brief',100,200); INSERT INTO ig_media_metrics(media_id,capture_date,post_id,reach,saved,captured_at) VALUES('media','2026-10-03','post_44',100,5,300)");
  const retro = await buildRetrospective(env);
  assert.equal(states(retro.receipt).briefs, 'ok');
  assert.equal(states(retro.receipt).audit_flags, 'ok');
  assert.ok(retro.receipt.documents.some(d => d.id === 'briefs:brief' && d.updated_at === 20));
  assert.ok(retro.receipt.documents.some(d => d.id === 'brief_performance:brief' && d.updated_at === '2026-10-03'));
  assert.equal(states(retro.receipt).brief_performance, 'ok');
  assert.equal(retro.briefs[0].reach, 100);
  const auditDocs = retro.receipt.documents.filter(d => d.id.startsWith('audit_flags:'));
  assert.equal(auditDocs.length, 40);
  assert.ok(auditDocs.some(d => d.id === 'audit_flags:post_44' && d.updated_at === 400));
  assert.ok(!auditDocs.some(d => d.id === 'audit_flags:post_0'));
  const small = await retrospectiveReceipt(retro, { maxChars: 100 });
  assert.equal(small.rendered_sha256, hash(renderRetrospective(retro, { maxChars: 100 })));
  assert.equal(small.truncated, true);
  assert.ok(small.original_chars > small.supplied_chars);
  assert.notEqual(small.rendered_sha256, retro.receipt.rendered_sha256);
});

test('partial performance/attribution read failure cannot manufacture zero-post or zero-coverage facts', async t => {
  const env = fixture(t);
  env.DB.exec("INSERT INTO team_briefs(id,title,objective,status,created_at,updated_at) VALUES('brief','Existing brief','Private','draft',1,2)");
  failRead(env, /GROUP BY pp\.brief_id|AS published/);
  const retro = await buildRetrospective(env);
  assert.equal(retro.receipt.read_status, 'partial');
  assert.equal(states(retro.receipt).briefs, 'ok');
  assert.equal(states(retro.receipt).brief_performance, 'unavailable');
  assert.equal(states(retro.receipt).attribution, 'unavailable');
  assert.equal(retro.briefs[0].posts, null);
  assert.deepEqual(retro.coverage, { published: null, attributed: null });
  const text = renderRetrospective(retro);
  assert.match(text, /attributed performance unavailable; do not infer zero posts/);
  assert.doesNotMatch(text, /NO published post carries/);
  assert.equal(retro.receipt.rendered_sha256, hash(text));
});

test('complete database outage stays unavailable and never claims an empty board; malformed response is unavailable', async t => {
  const env = fixture(t);
  failRead(env, /./);
  const retro = await buildRetrospective(env);
  assert.equal(retro.receipt.read_status, 'unavailable');
  assert.equal(states(retro.receipt).signals, 'unknown', 'detector catches its own failed reads');
  for (const section of ['briefs', 'brief_performance', 'attribution', 'audit_flags', 'outcomes']) assert.equal(states(retro.receipt)[section], 'unavailable');
  assert.match(renderRetrospective(retro), /Brief records unavailable/);
  assert.doesNotMatch(renderRetrospective(retro), /No briefs on the board yet/);
  const other = fixture(t), prepare = other.DB.prepare;
  other.DB.prepare = sql => sql.includes('FROM team_briefs') ? { bind: () => ({ all: async () => ({}) }) } : prepare(sql);
  assert.equal(states((await buildRetrospective(other)).receipt).briefs, 'unavailable');
});

test('unreadable outcome records and malformed flag content remain explicit uncertainty', async t => {
  const env = fixture(t);
  env.DB.exec("INSERT INTO social_posts(id,status,public_token,created_at,updated_at,audit_flags) VALUES('post','draft','token',1,1,'not json')");
  failRead(env, /WITH outcomes AS/);
  const retro = await buildRetrospective(env);
  assert.equal(states(retro.receipt).audit_flags, 'partial');
  assert.equal(states(retro.receipt).outcomes, 'unavailable');
  assert.equal(retro.outcomes.status, 'unknown');
  assert.match(renderRetrospective(retro), /Sales outcomes: unknown/);
  assert.equal(retro.outcomes.revenue, null);
});

test('published attributed posts without metric captures are counted with unknown reach, not invented absence', async t => {
  const env = fixture(t);
  env.DB.exec("INSERT INTO team_briefs(id,title,objective,status,created_at,updated_at) VALUES('brief','Published brief','Private','draft',1,2); INSERT INTO social_posts(id,status,public_token,created_at,updated_at) VALUES('post','published','token',3,4); INSERT INTO post_provenance(post_id,brief_id,created_at,updated_at) VALUES('post','brief',3,4)");
  const retro = await buildRetrospective(env);
  assert.equal(retro.briefs[0].posts, 1);
  assert.equal(retro.briefs[0].reach, null);
  assert.equal(retro.briefs[0].saved, null);
  assert.match(renderRetrospective(retro), /delivered: 1 post/);
  assert.doesNotMatch(renderRetrospective(retro), /NO published post carries|0 reach|0 saves/);
  assert.ok(retro.receipt.documents.some(d => d.id === 'brief_performance:brief' && d.updated_at === 4));
});

test('failed all responses with results and malformed attribution counters never claim successful evidence', async t => {
  for (const counters of [{}, { published: null, attributed: null }, { published: -1, attributed: 0 }, { published: Infinity, attributed: 0 }, { published: 1, attributed: 2 }]) {
    const env = fixture(t), prepare = env.DB.prepare;
    env.DB.prepare = sql => {
      if (sql.includes('FROM team_briefs')) return { bind: () => ({ all: async () => ({ success: false, results: [] }) }) };
      if (sql.includes('AS published')) return { bind: () => ({ first: async () => counters }) };
      return prepare(sql);
    };
    const retro = await buildRetrospective(env);
    assert.equal(states(retro.receipt).briefs, 'unavailable');
    assert.equal(states(retro.receipt).attribution, 'unavailable');
    assert.deepEqual(retro.coverage, { published: null, attributed: null });
  }
});

test('partial captures label observed totals by metric coverage instead of implying complete brief performance', async t => {
  const env = fixture(t);
  env.DB.exec("INSERT INTO team_briefs(id,title,objective,status,created_at,updated_at) VALUES('brief','Partial captures','Private','draft',1,2); INSERT INTO social_posts(id,status,public_token,created_at,updated_at) VALUES('measured','published','measured-token',3,4),('uncaptured','published','uncaptured-token',3,4); INSERT INTO post_provenance(post_id,brief_id,created_at,updated_at) VALUES('measured','brief',3,4),('uncaptured','brief',3,4); INSERT INTO ig_media_metrics(media_id,capture_date,post_id,reach,saved,captured_at) VALUES('media','2026-10-03','measured',100,NULL,300)");
  const retro = await buildRetrospective(env);
  assert.equal(retro.briefs[0].posts, 2);
  assert.equal(retro.briefs[0].reach_posts, 1);
  assert.equal(retro.briefs[0].saved_posts, 0);
  assert.equal(retro.briefs[0].reach, 100);
  assert.equal(retro.briefs[0].saved, null);
  const text = renderRetrospective(retro);
  assert.match(text, /100 reach across 1\/2 measured posts; remaining reach unknown/);
  assert.doesNotMatch(text, /0 saves/);
  assert.equal(retro.receipt.rendered_sha256, hash(text));
});
