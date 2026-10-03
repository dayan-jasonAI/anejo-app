import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createRenderJobStore } from './render-jobs.mjs';

const schema = readFileSync(new URL('./render-jobs.sql', import.meta.url), 'utf8');
const descriptor = Object.freeze({ sourceKey: 'sources/image.png', sourceSha256: 'a'.repeat(64),
  sourceVersionId: 'source-version-1', sourceMetadataSha256: 'e'.repeat(64),
  postId: 'post-1', postRevision: 100, mediaId: 'media-1', rendererVersion: 'editorial-v1', templateId: 'square-v1', optionsHash: 'b'.repeat(64) });
const receipt = Object.freeze({ outputKey: 'outputs/render.png', sha256: 'c'.repeat(64), outputBytes: 200, width: 1080, height: 1080 });

// Real SQLite implementation of the D1 statement surface; no SQL interpreter/mock.
function adapter(db) {
  return { prepare(sql) { return { bind(...args) { return {
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async run() { return db.prepare(sql).run(...args); },
  }; } }; } };
}
function fixture(t, path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(schema);
  t.after(() => db.close());
  return { db, store: createRenderJobStore(adapter(db)) };
}
const enqueue = (store, overrides = {}) => store.enqueue({ actorId: 'actor-1', requestId: 'request-1', descriptor, now: 100, ...overrides });
const claim = (store, overrides = {}) => store.claim({ actorId: 'actor-1', now: 100, leaseMs: 100, ...overrides });
const completion = (store, leased, overrides = {}) => store.complete({ actorId: leased.actorId, jobId: leased.id,
  leaseToken: leased.leaseToken, receipt, now: 101, ...overrides });
const failure = (store, leased, overrides = {}) => store.fail({ actorId: leased.actorId, jobId: leased.id,
  leaseToken: leased.leaseToken, errorCode: 'render_failed', now: 101, ...overrides });
function rejectsCode(promise, code) { return assert.rejects(promise, error => error.code === code); }

test('trusted deadline refuses job operations before any database dispatch',async t=>{
 const {db}=fixture(t);let dispatched=0;
 const store=createRenderJobStore({prepare(){dispatched++;throw Error('must not dispatch');}});
 const deadline={expiresAt:Date.now()-1};
 for(const operation of [()=>enqueue(store,{deadline}),()=>store.get({actorId:'actor-1',jobId:'job',deadline}),()=>claim(store,{deadline})])
  await rejectsCode(operation(),'execution_deadline_expired');
 assert.equal(dispatched,0);assert.equal(db.prepare('SELECT count(*) n FROM prototype_render_jobs').get().n,0);
});
test('expiry after awaited claim cleanup stops candidate claim dispatch',async t=>{
 const {db}=fixture(t),base=adapter(db);let expired=false,reads=0;
 const deadline={expiresAt:Date.now()+10000,check(){if(expired)throw Error('latched expiry');}};
 const store=createRenderJobStore({prepare(sql){const statement=base.prepare(sql);return {bind(...args){const bound=statement.bind(...args);return {async run(){const result=await bound.run();expired=true;return result;},async first(){reads++;return bound.first();}};}};}});
 await assert.rejects(claim(store,{deadline}),/latched expiry/);assert.equal(reads,0);
});

test('canonical enqueue is immutable and exact-request replay is scoped to actor', async t => {
  const { store, db } = fixture(t);
  const input = { ...descriptor };
  const first = await enqueue(store, { descriptor: input });
  input.sourceKey = 'changed-after-enqueue';
  const reversed = Object.fromEntries(Object.entries(descriptor).reverse());
  const replay = await enqueue(store, { descriptor: reversed, now: 200 });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(first.job, replay.job);
  assert.equal(first.job.descriptor.sourceKey, descriptor.sourceKey);
  for (const field of Object.keys(descriptor)) {
    const replacement = field === 'postRevision' ? 101
      : field === 'sourceSha256' || field === 'sourceMetadataSha256' || field === 'optionsHash' ? 'd'.repeat(64) : `changed-${field}`;
    await rejectsCode(enqueue(store, { descriptor: { ...descriptor, [field]: replacement } }), 'request_conflict');
  }
  const other = await enqueue(store, { actorId: 'actor-2' });
  assert.notEqual(other.job.id, first.job.id);
  assert.equal(await store.get({ actorId: 'actor-2', jobId: first.job.id }), null);
  assert.equal(db.prepare('SELECT count(*) AS n FROM prototype_render_jobs').get().n, 2);
});

test('rendered receipt is terminal and never implies attachment, audit, approval, or publication', async t => {
  const { store } = fixture(t);
  await enqueue(store);
  const leased = await claim(store);
  assert.equal(leased.status, 'rendering');
  assert.equal(leased.attempts, 1);
  const done = await completion(store, leased);
  assert.equal(done.status, 'rendered');
  assert.deepEqual(done.receipt, receipt);
  assert.equal(done.leaseToken, null);
  assert.equal(done.leaseUntil, null);
  for (const key of ['attached', 'published', 'approved', 'audited', 'resourceReady']) assert.equal(Object.hasOwn(done, key), false);
  await rejectsCode(completion(store, leased, { receipt: { ...receipt, outputKey: 'replacement' } }), 'lease_not_live');
  await rejectsCode(failure(store, leased), 'lease_not_live');
  const replay = await enqueue(store);
  assert.deepEqual(replay.job.receipt, receipt);
  assert.equal(replay.job.status, 'rendered');
  assert.equal(await claim(store, { now: 300 }), null);
});

test('expired and superseded leases cannot complete or fail; recovery issues fresh token', async t => {
  const { store } = fixture(t);
  await enqueue(store);
  const old = await claim(store);
  assert.equal(await claim(store, { now: 199 }), null);
  await rejectsCode(completion(store, old, { now: 200 }), 'lease_not_live');
  await rejectsCode(failure(store, old, { now: 200 }), 'lease_not_live');
  const fresh = await claim(store, { now: 200 });
  assert.equal(fresh.id, old.id);
  assert.equal(fresh.attempts, 2);
  assert.notEqual(fresh.leaseToken, old.leaseToken);
  await rejectsCode(completion(store, old, { now: 201 }), 'lease_not_live');
  await rejectsCode(failure(store, old, { now: 201 }), 'lease_not_live');
  await rejectsCode(completion(store, fresh, { actorId: 'actor-2', now: 201 }), 'lease_not_live');
  await rejectsCode(failure(store, fresh, { actorId: 'actor-2', now: 201 }), 'lease_not_live');
  assert.equal((await completion(store, fresh, { now: 201 })).status, 'rendered');
});

test('three explicit failures exhaust retries and remain visibly dead', async t => {
  const { store } = fixture(t);
  const { job } = await enqueue(store);
  const tokens = new Set();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const leased = await claim(store, { now: 100 + attempt * 10 });
    tokens.add(leased.leaseToken);
    assert.equal(leased.attempts, attempt);
    assert.equal((await failure(store, leased, { now: 101 + attempt * 10 })).status, attempt === 3 ? 'dead' : 'failed');
  }
  assert.equal(tokens.size, 3);
  assert.equal(await claim(store, { now: 1000 }), null);
  const dead = await store.get({ actorId: 'actor-1', jobId: job.id });
  assert.equal(dead.status, 'dead');
  assert.equal(dead.errorCode, 'render_failed');
  assert.equal((await enqueue(store)).job.status, 'dead');
});

test('third expired lease becomes terminal dead on claim with no fourth attempt', async t => {
  const { store } = fixture(t);
  const { job } = await enqueue(store);
  let last;
  for (let n = 0; n < 3; n++) last = await claim(store, { now: 100 + n * 100 });
  assert.equal(last.attempts, 3);
  await rejectsCode(completion(store, last, { now: 400 }), 'lease_not_live');
  assert.equal(await claim(store, { now: 400 }), null);
  const dead = await store.get({ actorId: 'actor-1', jobId: job.id });
  assert.equal(dead.status, 'dead');
  assert.equal(dead.attempts, 3);
  assert.equal(dead.errorCode, 'lease_expired_attempt_limit');
  assert.equal(dead.leaseToken, null);
  assert.equal(dead.receipt, null);
});

test('claims isolate actors and choose oldest eligible work', async t => {
  const { store } = fixture(t);
  const other = await enqueue(store, { actorId: 'actor-2', now: 0 });
  const late = await enqueue(store, { requestId: 'late', now: 200 });
  const early = await enqueue(store, { requestId: 'early', now: 100 });
  assert.equal((await claim(store)).id, early.job.id);
  assert.equal((await claim(store)).id, late.job.id);
  assert.equal(await claim(store), null);
  assert.equal((await claim(store, { actorId: 'actor-2' })).id, other.job.id);
});

test('exact job claim selects B while older A and wrong actor/id stay untouched', async t => {
  const { store } = fixture(t);
  const a = await enqueue(store, { requestId: 'A', now: 100 });
  const b = await enqueue(store, { requestId: 'B', now: 101 });
  for (const args of [{actorId:'actor-2',jobId:a.job.id},{jobId:'missing-job'}]) {
    assert.equal(await claim(store, args), null);
    assert.deepEqual(await store.get({actorId:'actor-1',jobId:a.job.id}), a.job);
    assert.deepEqual(await store.get({actorId:'actor-1',jobId:b.job.id}), b.job);
  }
  assert.equal((await claim(store, {jobId:b.job.id})).id, b.job.id);
  assert.deepEqual(await store.get({actorId:'actor-1',jobId:a.job.id}), a.job);
  assert.equal((await claim(store)).id, a.job.id); // Internal oldest fallback remains.
});

test('exact expired recovery fences its old token and does not reclaim queued A', async t => {
  const { store } = fixture(t);
  const a = await enqueue(store, { requestId: 'A', now: 99 });
  const b = await enqueue(store, { requestId: 'B', now: 100 });
  const old = await claim(store, {jobId:b.job.id});
  assert.equal(await claim(store, {jobId:b.job.id,now:199}), null);
  const fresh = await claim(store, {jobId:b.job.id,now:200});
  assert.equal(fresh.id, b.job.id);assert.notEqual(fresh.leaseToken,old.leaseToken);assert.equal(fresh.attempts,2);
  await rejectsCode(completion(store,old,{now:201}),'lease_not_live');
  await rejectsCode(failure(store,old,{now:201}),'lease_not_live');
  assert.deepEqual(await store.get({actorId:'actor-1',jobId:a.job.id}), a.job);
  assert.equal((await completion(store,fresh,{now:201})).status,'rendered');
});

test('exact terminal expiry cleanup never mutates another expired job', async t => {
  const { store } = fixture(t);
  const a = await enqueue(store, {requestId:'A'});
  const b = await enqueue(store, {requestId:'B'});
  for(let n=0;n<3;n++)await claim(store,{jobId:a.job.id,now:100+n*100});
  const expired = await store.get({actorId:'actor-1',jobId:a.job.id});
  assert.equal(await claim(store,{jobId:a.job.id,actorId:'actor-2',now:400}),null);
  assert.equal(await claim(store,{jobId:'missing-job',now:400}),null);
  assert.deepEqual(await store.get({actorId:'actor-1',jobId:a.job.id}),expired);
  assert.equal((await claim(store,{jobId:b.job.id,now:400})).id,b.job.id);
  assert.deepEqual(await store.get({actorId:'actor-1',jobId:a.job.id}),expired);
  assert.equal(await claim(store,{jobId:a.job.id,now:400}),null);
  assert.equal((await store.get({actorId:'actor-1',jobId:a.job.id})).status,'dead');
});

test('validates exact immutable binding, receipts, and safe integer timestamp arithmetic', async t => {
  const { store, db } = fixture(t);
  for (const invalid of [undefined, null, {}, [], { ...descriptor, unknown: 'x' }, { ...descriptor, sourceKey: ' source' },
    { ...descriptor, sourceSha256: 'A'.repeat(64) }, { ...descriptor, optionsHash: 'bad' },
    { ...descriptor, postId: '' }, { ...descriptor, rendererVersion: 'x\n' }, { ...descriptor, sourceKey: 'x'.repeat(1025) }])
    await assert.rejects(enqueue(store, { descriptor: invalid }));
  for (const now of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) await rejectsCode(enqueue(store, { now }), 'invalid_now');
  for (const postRevision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', undefined])
    await rejectsCode(enqueue(store, { descriptor: { ...descriptor, postRevision } }), 'invalid_postRevision');
  for (const sourceVersionId of ['', ' version', 'version ', 'x\n', 'x'.repeat(257), null, undefined, 1])
    await rejectsCode(enqueue(store, { descriptor: { ...descriptor, sourceVersionId } }), 'invalid_sourceVersionId');
  for (const sourceMetadataSha256 of ['A'.repeat(64), 'e'.repeat(63), 'g'.repeat(64), '', null, undefined])
    await rejectsCode(enqueue(store, { descriptor: { ...descriptor, sourceMetadataSha256 } }), 'invalid_sourceMetadataSha256');
  for (const missing of ['sourceVersionId', 'sourceMetadataSha256']) {
    const incomplete = { ...descriptor }; delete incomplete[missing];
    await rejectsCode(enqueue(store, { descriptor: incomplete }), 'invalid_descriptor');
  }
  await rejectsCode(enqueue(store, { actorId: '' }), 'invalid_actorId');
  await rejectsCode(enqueue(store, { requestId: '' }), 'invalid_id');
  assert.equal(db.prepare('SELECT count(*) AS n FROM prototype_render_jobs').get().n, 0);
  await enqueue(store);
  for(const jobId of [null,'',' x','x\n','x'.repeat(257),1])await rejectsCode(claim(store,{jobId}),'invalid_id');
  for (const leaseMs of [0, -1, 1.5, 300001, Infinity]) await rejectsCode(claim(store, { leaseMs }), 'invalid_leaseMs');
  await rejectsCode(claim(store, { now: Number.MAX_SAFE_INTEGER, leaseMs: 1 }), 'invalid_leaseUntil');
  const leased = await claim(store);
  for (const errorCode of ['Provider returned secret details', 'UPPER_CASE', 'bad-code', 'x\n', '', 'x'.repeat(65)])
    await rejectsCode(failure(store, leased, { errorCode }), 'invalid_errorCode');
  for (const invalid of [{ ...receipt, outputBytes: 0 }, { ...receipt, width: 1.5 }, { ...receipt, height: Number.MAX_SAFE_INTEGER + 1 },
    { ...receipt, sha256: 'bad' }, { ...receipt, outputKey: '' }, { ...receipt, extra: true }])
    await assert.rejects(completion(store, leased, { receipt: invalid }));
  assert.equal((await store.get({ actorId: 'actor-1', jobId: leased.id })).status, 'rendering');
  assert.equal((await completion(store, leased)).status, 'rendered');
});

test('durable records reopen from the same SQLite file', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'render-jobs-durable-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'jobs.sqlite');
  const db = new DatabaseSync(path);
  db.exec(schema);
  const original = await enqueue(createRenderJobStore(adapter(db)));
  db.close();
  const { store } = fixture(t, path);
  assert.deepEqual(await store.get({ actorId: 'actor-1', jobId: original.job.id }), original.job);
});

test('SQL changes guard rejects zero-row writes and permits transaction rollback', async t => {
  const { db, store } = fixture(t);
  const { job } = await enqueue(store);
  db.exec('BEGIN');
  db.prepare('UPDATE prototype_render_jobs SET error_code = ? WHERE id = ?').run('transaction_probe', job.id);
  db.exec('INSERT INTO prototype_render_guards(success) VALUES (changes())');
  db.prepare('UPDATE prototype_render_jobs SET error_code = ? WHERE id = ?').run('not_written', 'missing-job');
  assert.throws(() => db.exec('INSERT INTO prototype_render_guards(success) VALUES (changes())'), /CHECK constraint failed/);
  db.exec('ROLLBACK');
  assert.equal((await store.get({ actorId: 'actor-1', jobId: job.id })).errorCode, null);
  assert.equal(db.prepare('SELECT count(*) AS n FROM prototype_render_guards').get().n, 0);
});

test('two real concurrent SQLite handles cannot claim the same lease', {timeout:10000}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'render-jobs-race-'));
  const workers = [];
  t.after(async () => { await Promise.all(workers.map(w => w.terminate())); rmSync(dir, { recursive: true, force: true }); });
  const path = join(dir, 'jobs.sqlite');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(schema);
  const expected = await enqueue(createRenderJobStore(adapter(db)));
  db.close();
  const gate = new SharedArrayBuffer(4);
  const source = `const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    (async () => {
      const { createRenderJobStore } = await import(workerData.moduleUrl);
      const db = new DatabaseSync(workerData.path); db.exec('PRAGMA busy_timeout = 5000');
      const adapter = { prepare(sql) { return { bind(...args) { return {
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async run() { return db.prepare(sql).run(...args); }
      }; } }; } };
      parentPort.postMessage({ ready: true });
      if(Atomics.wait(new Int32Array(workerData.gate), 0, 0, 5000)==='timed-out')throw Error('race barrier timeout');
      try { parentPort.postMessage({ result: await createRenderJobStore(adapter).claim({ actorId: 'actor-1', now: 100, leaseMs: 100 }) }); }
      finally { db.close(); }
    })().catch(error => { throw error; });`;
  const ready = [], results = [];
  for (let n = 0; n < 2; n++) {
    const worker = new Worker(source, { eval: true, workerData: { path, gate, moduleUrl: new URL('./render-jobs.mjs', import.meta.url).href } });
    workers.push(worker);
    ready.push(new Promise((resolve, reject) => { worker.on('error', reject); worker.on('message', m => { if (m.ready) resolve(); }); }));
    results.push(new Promise((resolve, reject) => { worker.on('error', reject); worker.on('message', m => { if (Object.hasOwn(m, 'result')) resolve(m.result); }); }));
  }
  await Promise.all(ready);
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0);
  const claimed = (await Promise.all(results)).filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, expected.job.id);
  assert.equal(claimed[0].attempts, 1);
});

test('normalization receipt persists exact provenance and rejects incomplete or invented bindings', async t => {
 const {store}=fixture(t);await enqueue(store);const leased=await claim(store);
 const normalizedSource={versionId:'normalized-1',derivativeKey:'marketing-normalized-versions/normalized-1.png',derivativeSha256:'d'.repeat(64),receiptSha256:'e'.repeat(64),normalizerVersion:'resvg-lcms-rgba-1'};
 for(const field of Object.keys(normalizedSource)){
  const incomplete={...normalizedSource};delete incomplete[field];
  await rejectsCode(completion(store,leased,{receipt:{...receipt,normalizedSource:incomplete}}),'invalid_normalizedSource');
 }
 await rejectsCode(completion(store,leased,{receipt:{...receipt,normalizedSource:{...normalizedSource,approved:true}}}),'invalid_normalizedSource');
 await rejectsCode(completion(store,leased,{receipt:{...receipt,normalizedSource:{...normalizedSource,derivativeSha256:'invalid'}}}),'invalid_derivativeSha256');
 const done=await completion(store,leased,{receipt:{...receipt,normalizedSource}});
 assert.deepEqual(done.receipt,{...receipt,normalizedSource});
 assert.deepEqual((await store.get({actorId:'actor-1',jobId:leased.id})).receipt,done.receipt);
});
