import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { normalizeRecurrence, nextOccurrence } from '../../functions/_lib/social_recurrence.js';
import { onRequestGet, onRequestPost } from '../../functions/api/hub/owner/social-recurrence.js';
import { onRequestPost as tick } from '../../functions/api/hub/admin/social-tick.js';
import { onRequestGet as mediaGet } from '../../functions/api/social/media/[token].js';

const url = 'https://anejo.test/api/hub/owner/social-recurrence';
const jpeg = 'marketing-library/box.jpg';
const daily = { frequency: 'daily', start: '2026-11-16', time: '09:00' };
const clock = iso => Date.parse(iso);
const at = clock('2026-11-16T13:59:00Z');

const get = (env, query = '', cookie = OWNER_COOKIE) => onRequestGet({
  env, request: new Request(url + query, { headers: { Cookie: cookie } }),
});
const post = (env, body) => onRequestPost({
  env, request: new Request(url, { method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});
const runTick = env => tick({
  env, request: new Request('https://anejo.test/api/hub/admin/social-tick', { method: 'POST', headers: { 'x-cron-key': 'fixture-cron' } }),
});
const loadedSeries = async env => (await (await get(env)).json()).series[0];

function fixture(type = 'STORIES') {
  let etag = 'approved-media';
  const env = ownerEnv({
    IG_ACCESS_TOKEN: 'fixture', IG_USER_ID: '17841400000000000', IG_API_HOST: 'facebook', IG_POLL_MS: 0,
    CRON_KEY: 'fixture-cron',
    MEDIA: {
      head: async key => key === jpeg ? { etag } : null,
      get: async (key, options) => key === jpeg && options?.onlyIf?.etagMatches === etag
        ? { etag, body: 'reviewed image' } : { etag },
    },
  });
  const t = Date.now();
  env.DB.prepare(`INSERT INTO social_posts
    (id,caption,media_type,status,public_token,created_at,updated_at) VALUES ('original','Caption',?,'draft','original-token',?,?)`).bind(type,t,t).run();
  env.DB.prepare(`INSERT INTO social_post_media
    (id,post_id,seq,media_key,public_token,created_at) VALUES ('original-slide','original',0,?,'original-token',?)`).bind(jpeg,t).run();
  return { env, overwrite: () => { etag = 'different-media'; } };
}

async function preview(env) { return (await (await get(env, '?post=original')).json()).hash; }
async function approve(env, rule = daily) {
  return post(env, { op: 'create', post_id: 'original', preview_hash: await preview(env), rule });
}

test('all cadences keep Eastern wall time and obey the inclusive end date', () => {
  assert.equal(nextOccurrence(normalizeRecurrence({...daily,start:'2026-03-07'}),clock('2026-03-07T14:00:00Z')),clock('2026-03-08T13:00:00Z'));
  assert.equal(nextOccurrence(normalizeRecurrence({...daily,start:'2026-10-31'}),clock('2026-10-31T13:00:00Z')),clock('2026-11-01T14:00:00Z'));
  assert.equal(nextOccurrence(normalizeRecurrence({...daily,frequency:'alternate'}),clock('2026-11-16T14:00:00Z')),clock('2026-11-18T14:00:00Z'));
  assert.equal(nextOccurrence(normalizeRecurrence({...daily,frequency:'weekdays'}),clock('2026-11-20T14:00:00Z')),clock('2026-11-23T14:00:00Z'));
  const selected = normalizeRecurrence({frequency:'custom',start:daily.start,end:'2026-11-20',times:{1:'09:00',5:'16:30'}});
  assert.equal(nextOccurrence(selected,clock('2026-11-16T14:00:00Z')),clock('2026-11-20T21:30:00Z'));
  assert.equal(nextOccurrence(selected,clock('2026-11-20T21:30:00Z')),null);
  const gap = normalizeRecurrence({frequency:'daily',start:'2026-03-08',time:'02:30'});
  assert.equal(nextOccurrence(gap,clock('2026-03-08T06:00:00Z')),clock('2026-03-09T06:30:00Z'));
  assert.equal(normalizeRecurrence({...daily,start:'2026-11-31'}),null);
  assert.equal(normalizeRecurrence({frequency:'custom',start:daily.start,times:{}}),null);
});

test('only approved media can repeat, with durable pause, edit, resume and stop', async t => {
  t.mock.timers.enable({apis:['Date'],now:at});
  const {env,overwrite} = fixture('IMAGE');
  assert.equal((await get(env,'','')).status,401);
  const expected = await preview(env);
  overwrite();
  const stale = await post(env,{op:'create',post_id:'original',preview_hash:expected,rule:daily});
  assert.equal((await stale.json()).error,'preview_changed');
  const approved = await (await approve(env)).json();
  assert.equal(approved.next_at,clock('2026-11-16T14:00:00Z'));
  assert.equal((await approve(env)).status,409);
  let row = await loadedSeries(env);
  assert.equal(row.snapshot.caption,'Caption');
  assert.equal(row.snapshot.media[0].etag,'different-media');
  assert.equal((await post(env,{op:'pause',id:row.id,version:row.version})).status,200);
  assert.equal((await post(env,{op:'stop',id:row.id,version:row.version})).status,409);
  row = await loadedSeries(env);
  assert.equal(row.next_at,null);
  assert.equal((await post(env,{op:'edit',id:row.id,version:row.version,rule:{...daily,time:'12:00'}})).status,200);
  row = await loadedSeries(env);
  assert.equal((await post(env,{op:'resume',id:row.id,version:row.version})).status,200);
  row = await loadedSeries(env);
  assert.equal(row.next_at,clock('2026-11-16T17:00:00Z'));
  assert.equal((await post(env,{op:'stop',id:row.id,version:row.version})).status,200);
  assert.equal((await loadedSeries(env)).status,'stopped');
});

test('overlapping ticks publish one Story through the normal provider, skip stale slots, and close the final date', async t => {
  t.mock.timers.enable({apis:['Date'],now:at});
  const {env,overwrite} = fixture();
  assert.equal((await approve(env,{...daily,end:'2026-11-18'})).status,200);
  env.DB.exec("UPDATE social_posts SET caption='Edited later' WHERE id='original'");
  const tokens = [];
  let sends = 0;
  t.mock.method(globalThis,'fetch',async (input,init) => {
    const path = new URL(input).pathname;
    if (path.endsWith('/media')) {
      const format = new URLSearchParams(init.body);
      assert.equal(format.get('media_type'),'STORIES');
      assert.equal(format.has('caption'),false);
      const token = new URL(format.get('image_url')).pathname.split('/').at(-1);
      tokens.push(token);
      const response = await mediaGet({env,params:{token}});
      assert.equal(await response.text(),'reviewed image');
      overwrite();
      assert.equal((await mediaGet({env,params:{token}})).status,404);
      return Response.json({id:'container'});
    }
    if (path.endsWith('/media_publish')) { sends++; return Response.json({id:'instagram-story'}); }
    if (path.endsWith('/container')) return Response.json({status_code:'FINISHED'});
    return Response.json({});
  });
  t.mock.timers.setTime(clock('2026-11-16T14:00:00Z'));
  const checks = await Promise.all([runTick(env),runTick(env)]);
  const receipts = await Promise.all(checks.map(response=>response.json()));
  assert.ok(receipts.every(receipt=>receipt.ok),JSON.stringify(receipts));
  assert.equal(sends,1);
  assert.equal(tokens.length,1);
  let row = await loadedSeries(env);
  assert.equal(row.last_status,'published');
  assert.equal(row.next_at,clock('2026-11-17T14:00:00Z'));
  t.mock.timers.setTime(clock('2026-11-18T18:00:00Z'));
  assert.equal((await (await runTick(env)).json()).missed.length,1);
  row = env.DB.one('SELECT status,next_at FROM social_recurrences WHERE id=?',row.id);
  assert.equal(row.status,'ended');
  assert.equal(row.next_at,null);
  assert.equal(sends,1);
});
