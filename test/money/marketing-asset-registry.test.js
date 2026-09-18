import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost, onRequestGet } from '../../functions/api/hub/owner/marketing-asset-registry.js';
import { selectApprovedMarketingAssets } from '../../functions/_lib/marketing_asset_selection.js';
const key = 'marketing-library/2026-09/a_photo.jpg';
// JPEG structure with an SOF dimension segment, sufficient to exercise the metadata parser.
const jpeg = (w = 1080, h = 1350) => new Uint8Array([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,1,1,17,0,255,217]);
function setup(t) {
  const env = ownerEnv(); t.after(() => env.DB.sqlite.close());
  if (!env.DB.one("SELECT name FROM sqlite_master WHERE name='marketing_asset_registry'")) env.DB.exec(readFileSync(new URL('../../migrations/0119_marketing_asset_registry.sql', import.meta.url), 'utf8'));
  env.DB.exec("INSERT OR IGNORE INTO menu_items(id,kind,name,price_cents,created_at,updated_at) VALUES ('asset_test_a','bowl','A',100,1,1),('asset_test_b','bowl','B',100,1,1)");
  const files = new Map([[key, jpeg()]]);
  env.MEDIA = { async get(k) { const data = files.get(k); return data ? { size: data.byteLength, async arrayBuffer() { return data.buffer.slice(0); } } : null; }, async put() { assert.fail('Registry may not write R2'); } };
  return { env, files };
}
const body = (overrides = {}) => ({ asset_key: key, expected_revision: 0, menu_item_ids: ['asset_test_a'], theme: 'Signature', visual_type: 'product', approved_for_draft_selection: true, ...overrides });
const req = (payload, cookie = OWNER_COOKIE) => new Request('https://example.test/api/hub/owner/marketing-asset-registry', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
const save = (env, payload = body(), cookie = OWNER_COOKIE) => onRequestPost({ request: req(payload, cookie), env });
const select = (env, overrides = {}) => selectApprovedMarketingAssets(env, { productIds: ['asset_test_a'], format: 'portrait', theme: 'Signature', ...overrides });

test('private opt-in binds existing JPEG hash, reviewer and immutable review history without publishing consent', async t => {
  const { env } = setup(t);
  assert.equal((await select(env)).assets.length, 0, 'existing R2 uploads are not backfilled');
  const r = await save(env); assert.equal(r.status, 200); const result = await r.json();
  assert.equal(result.publication_approved, false);
  const row = env.DB.one('SELECT * FROM marketing_asset_registry WHERE id=?', result.id);
  assert.equal(row.width, 1080); assert.equal(row.height, 1350);
  assert.equal(row.reviewed_by, 'stf_owner'); assert.equal(row.revision, 1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_registry_reviews').n, 1);
  assert.throws(() => env.DB.exec("UPDATE marketing_asset_registry SET content_sha256='" + 'a'.repeat(64) + "'"), /immutable/);
  assert.throws(() => env.DB.exec('UPDATE marketing_asset_registry_reviews SET revision=50'), /immutable/);
});
test('selection uses exact product set/theme/format, deterministic order and freshly verified bytes', async t => {
  const { env, files } = setup(t); const keyB = key.replace('/a_', '/b_'); files.set(keyB, jpeg());
  await save(env, body({ asset_key: keyB })); await save(env);
  const result = await select(env, { limit: 2 });
  assert.deepEqual(result.assets.map(a => a.media_key), [key, keyB]);
  assert.equal(result.assets[0].publication_approved, false);
  for (const criteria of [{ productIds: ['asset_test_a', 'asset_test_b'] }, { format: 'square' }, { theme: 'Birthday' }]) assert.equal((await select(env, criteria)).assets.length, 0);
  files.set(key, jpeg(1200));
  const changed = await select(env); assert.equal(changed.assets[0].media_key, keyB);
  assert.equal(changed.rejected[0].reason, 'content_changed');
});
test('only authorized marketing desk may register and approval must be explicitly boolean', async t => {
  const { env } = setup(t);
  assert.equal((await save(env, body(), '')).status, 401);
  assert.equal((await save(env, body(), 'anejo_sess=tok-kitchen')).status, 403);
  const without = body(); delete without.approved_for_draft_selection;
  assert.equal((await save(env, without)).status, 400);
  assert.equal((await save(env, body({ reviewed_by: 'spoof' }))).status, 400);
  assert.equal((await save(env, body({ approved_for_draft_selection: false }), 'anejo_sess=tok-marketing')).status, 200);
  assert.equal((await select(env)).assets.length, 0);
});
test('review update requires expected revision, content identity and atomic audit row', async t => {
  const { env, files } = setup(t); await save(env);
  assert.equal((await save(env, body({ approved_for_draft_selection: false }))).status, 409);
  assert.equal((await save(env, body({ expected_revision: 1, approved_for_draft_selection: false }))).status, 200);
  assert.equal((await select(env)).assets.length, 0);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_registry_reviews').n, 2);
  files.set(key, jpeg(1200));
  assert.equal((await save(env, body({ expected_revision: 2 }))).status, 409);
});
test('R2 and catalog validation refuse unknown products, URLs, malformed JPEG and unavailable reads', async t => {
  const { env, files } = setup(t);
  for (const payload of [body({ asset_key: 'https://example.test/photo.jpg' }), body({ asset_key: 'marketing-library/../a.jpg' }), body({ menu_item_ids: ['unknown'] })]) assert.equal((await save(env, payload)).status, 400);
  files.set(key, new Uint8Array([1, 2, 3])); assert.equal((await save(env)).status, 400);
  files.delete(key); assert.equal((await save(env)).status, 404);
  env.MEDIA.get = async () => { throw Error('storage down'); }; assert.equal((await save(env)).status, 503);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_registry').n, 0);
});
test('revocation while selector verifies bytes cannot return an approved asset', async t => {
  const { env } = setup(t); await save(env);
  const get = env.MEDIA.get;
  env.MEDIA.get = async k => { env.DB.exec('UPDATE marketing_asset_registry SET approved_for_draft_selection=0, revision=revision+1'); return get(k); };
  const result = await select(env);
  assert.equal(result.assets.length, 0); assert.equal(result.rejected[0].reason, 'review_changed');
});
test('audit storage failure rolls back approval and GET remains authenticated', async t => {
  const { env } = setup(t);
  env.DB.exec("CREATE TRIGGER fail_review BEFORE INSERT ON marketing_asset_registry_reviews BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await save(env)).status, 503);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_registry').n, 0);
  assert.equal((await onRequestGet({ request: new Request('https://example.test/api/hub/owner/marketing-asset-registry'), env })).status, 401);
});

test('explicit revocation survives missing/changed R2 and inactive catalog, retaining original metadata/hash', async t => {
  for (const condition of ['missing', 'changed', 'unavailable']) {
    const { env, files } = setup(t); const registered = await (await save(env)).json();
    const original = env.DB.one('SELECT * FROM marketing_asset_registry WHERE id=?', registered.id);
    env.DB.exec("UPDATE menu_items SET active=0 WHERE id='asset_test_a'");
    if (condition === 'missing') files.delete(key);
    if (condition === 'changed') files.set(key, jpeg(1200));
    if (condition === 'unavailable') env.MEDIA.get = async () => { throw Error('storage down'); };
    const revoked = await save(env, { op: 'revoke', asset_key: key, expected_revision: 1 });
    assert.equal(revoked.status, 200);
    const row = env.DB.one('SELECT * FROM marketing_asset_registry WHERE id=?', registered.id);
    assert.equal(row.approved_for_draft_selection, 0);
    for (const field of ['content_sha256', 'menu_item_ids_json', 'theme', 'visual_type', 'format']) assert.equal(row[field], original[field]);
    assert.equal(JSON.parse(env.DB.one('SELECT metadata_json FROM marketing_asset_registry_reviews WHERE asset_id=? AND revision=2', registered.id).metadata_json).op, 'revoke');
    assert.equal((await save(env, body({ expected_revision: 2 }))).status, 400, 'reapproval still validates active products');
  }
});
test('revocation rejects stale revisions and rolls back if audit history fails', async t => {
  const { env, files } = setup(t); await save(env); files.delete(key);
  assert.equal((await save(env, { op: 'revoke', asset_key: key, expected_revision: 0 })).status, 409);
  env.DB.exec("CREATE TRIGGER fail_revoke_review BEFORE INSERT ON marketing_asset_registry_reviews BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await save(env, { op: 'revoke', asset_key: key, expected_revision: 1 })).status, 503);
  assert.equal(env.DB.one('SELECT approved_for_draft_selection FROM marketing_asset_registry').approved_for_draft_selection, 1);
  assert.equal(env.DB.one('SELECT revision FROM marketing_asset_registry').revision, 1);
});

test('exact private asset lookup reaches records beyond list cap without approval or writes', async t => {
  const { env } = setup(t); await save(env);
  const original = env.DB.one('SELECT * FROM marketing_asset_registry');
  const cols = Object.keys(original);
  const insert = env.DB.sqlite.prepare(`INSERT INTO marketing_asset_registry (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  for (let i = 0; i < 105; i++) {
    const row = { ...original, id: 'test_lookup_'+i, asset_key: `marketing-library/z_${String(i).padStart(3,'0')}.jpg`, approved_for_draft_selection: 0 };
    insert.run(...cols.map(c => row[c]));
  }
  const get = query => onRequestGet({ env, request: new Request('https://example.test/api/hub/owner/marketing-asset-registry'+query, { headers: { cookie: OWNER_COOKIE } }) });
  const list = await (await get('')).json(); assert.equal(list.assets.length, 100); assert.equal(list.truncated, true);
  const exactKey = 'marketing-library/z_104.jpg';
  const exact = await (await get('?asset_key='+encodeURIComponent(exactKey))).json();
  assert.equal(exact.assets.length, 1); assert.equal(exact.assets[0].asset_key, exactKey);
  assert.equal(exact.assets[0].approved_for_draft_selection, false); assert.equal(exact.truncated, false);
  const absent = await (await get('?asset_key=marketing-library%2Fmissing.jpg')).json();
  assert.deepEqual(absent.assets, []); assert.equal(absent.truncated, false);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_registry_reviews').n, 1, 'read never creates review evidence');
});
test('exact lookup rejects duplicate/invalid keys, enforces role and distinguishes unavailable DB', async t => {
  const { env } = setup(t);
  const get = (query, cookie = OWNER_COOKIE) => onRequestGet({ env, request: new Request('https://example.test/api/hub/owner/marketing-asset-registry'+query, { headers: { cookie } }) });
  for (const query of ['?asset_key=', '?asset_key=https%3A%2F%2Fexample.test%2Fa.jpg', '?asset_key=marketing-library%2F..%2Fa.jpg', '?asset_key='+encodeURIComponent(key)+'&asset_key='+encodeURIComponent(key)]) assert.equal((await get(query)).status, 400);
  const query = '?asset_key='+encodeURIComponent(key);
  assert.equal((await get(query, '')).status, 401);
  assert.equal((await get(query, 'anejo_sess=tok-kitchen')).status, 403);
  env.DB.exec('DROP TABLE marketing_asset_registry_reviews; DROP TABLE marketing_asset_registry');
  const unavailable = await get(query); assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).assets, undefined, 'unavailable is not an empty registry');
});
