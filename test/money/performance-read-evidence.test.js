import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv, OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestGet} from '../../functions/api/hub/owner/performance-alerts.js';
const request=()=>new Request('https://anejo.test/api/hub/owner/performance-alerts',{headers:{cookie:OWNER_COOKIE}});

test('actual performance route exposes historical captures separately from current calculation time',async t=>{
 const env=ownerEnv(); t.after(()=>env.DB.sqlite.close());
 t.mock.method(globalThis,'fetch',()=>{throw Error('No provider call permitted');});
 for(let i=0;i<6;i++)env.DB.sqlite.prepare('INSERT INTO ig_media_metrics(media_id,capture_date,posted_at,reach,captured_at) VALUES(?,?,?,?,?)').run('m'+i,'2026-08-20',Date.parse('2026-08-'+String(19-i).padStart(2,'0')+'T12:00:00Z'),10+i,1);
 for(const [date,followers] of [['2026-08-01',79],['2026-08-20',80]])env.DB.sqlite.prepare('INSERT INTO ig_account_metrics(capture_date,followers,captured_at) VALUES(?,?,?)').run(date,followers,1);
 const response=await onRequestGet({env,request:request()}); const s=await response.json();
 assert.equal(response.status,200);assert.equal(s.ok,true);
 assert.deepEqual(s.readEvidence.reach,{status:'read',captureDates:['2026-08-20'],measuredPosts:6});
 assert.deepEqual(s.readEvidence.followers,{status:'read',captureDates:['2026-08-01','2026-08-20']});
 assert.equal(s.readEvidence.posting.lastRecordedPostAt,Date.parse('2026-08-19T12:00:00Z'));
 assert.ok(s.generatedAt>Date.parse('2026-08-20T12:00:00Z'));
});

test('failed reads remain unavailable while successful empty sources remain explicit empty evidence',async t=>{
 const env=ownerEnv();t.after(()=>env.DB.sqlite.close());
 const prepare=env.DB.prepare.bind(env.DB);
 env.DB.prepare=sql=>{if(sql.includes('FROM ig_account_metrics'))throw Error('read failed');return prepare(sql);};
 const s=await (await onRequestGet({env,request:request()})).json();
 assert.deepEqual(s.readEvidence.followers,{status:'unavailable',captureDates:[]});
 assert.deepEqual(s.readEvidence.reach,{status:'read',captureDates:[],measuredPosts:0});
 assert.deepEqual(s.readEvidence.posting,{status:'read',lastRecordedPostAt:null});
 assert.equal(s.followerTrend.enoughData,false);assert.equal(s.singlePost.enoughData,false);
});
