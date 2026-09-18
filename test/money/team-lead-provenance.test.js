import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeAction } from '../../functions/api/hub/owner/team.js';
import { captionHash } from '../../functions/_lib/trust_ledger.js';

function fixture({ known = true, mediaFails = false, attachmentFails = false } = {}) {
  const writes = [], reads = [];
  let attached = false;
  const env = { DB: { prepare(sql) {
    let args = [];
    return { bind(...v) { args = v; return this; },
      async first() {
        reads.push(sql);
        if (/SELECT id FROM (team_briefs|market_intel)/.test(sql)) return known ? { id: args[0] } : null;
        // Audit must not issue any provider call in this fixture.
        return null;
      },
      async all() {
        if (/FROM social_post_media/.test(sql)) {
          if (mediaFails) throw Error('read unavailable');
          return { results: attached ? [{ id: 'm1', seq: 0, media_key: 'studio/vida.jpg' }] : [] };
        }
        return { results: [] };
      },
      async run() {
        if (/INSERT INTO social_post_media/.test(sql)) {
          if (attachmentFails) throw Error('attachment unavailable');
          attached = true;
        }
        writes.push({ sql, args, attached });
        return { meta: { changes: 1 } };
      }
    };
  } } };
  return { env, writes, reads };
}
const action = { action: 'draft_posts', brief_id: 'brief_known', category: 'catering', assets: [
  { caption: 'Meet VIDA', intel_id: 'intel_known' }
] };
function provenance(writes) {
  const row = writes.find(r => /INSERT INTO post_provenance/.test(r.sql));
  const cols = row.sql.match(/post_provenance \(([^)]+)\)/)[1].split(',');
  return Object.fromEntries(cols.map((c, i) => [c, row.args[i]]));
}
test('Lead drafts seal trust after media and stamp validated sources without invented rule evidence', async () => {
  const f = fixture();
  const result = await executeAction(f.env, action);
  assert.equal(result.drafted, 1);
  const original = f.writes.find(r => /original_design_snapshot=/.test(r.sql));
  assert.equal(original.attached, true);
  assert.match(original.sql, /AND caption=\? AND COALESCE\(image_brief,''\)=\?/);
  assert.match(original.sql, /COUNT\(\*\).*social_post_media.*=1/);
  assert.equal(original.args.at(-1), f.writes.find(r => /INSERT INTO social_post_media/.test(r.sql)).args[2]);
  assert.deepEqual(original.args.slice(0, 2), ['catering', captionHash('Meet VIDA')]);
  const p = provenance(f.writes);
  assert.equal(p.brief_id, 'brief_known');
  assert.equal(p.intel_id, 'intel_known');
  assert.equal(p.format, 'single');
  assert.equal(p.slide_count, 1);
  assert.equal('rule_ids' in p, false);
  assert.ok(f.reads.some(sql => /revision_snapshot FROM social_posts/.test(sql)), 'uses shared saved-image audit');
});
test('unknown proposed source IDs are omitted, not recorded as verified attribution', async () => {
  const f = fixture({ known: false });
  await executeAction(f.env, action);
  const p = provenance(f.writes);
  assert.equal('brief_id' in p, false);
  assert.equal('intel_id' in p, false);
});
test('failed attachment and failed media reads do not claim a single-image post', async () => {
  for (const opts of [{ attachmentFails: true }, { mediaFails: true }]) {
    const f = fixture(opts);
    const result = await executeAction(f.env, action);
    assert.equal(result.drafted, 1);
    if (opts.attachmentFails) assert.equal(f.writes.some(r => /original_design_snapshot=/.test(r.sql)), false);
    const p = provenance(f.writes);
    assert.equal('format' in p, false);
    assert.equal('slide_count' in p, false);
  }
});
test('unsupported category cannot earn lane trust and absent sources are explicitly none', async () => {
  const f = fixture();
  await executeAction(f.env, { action: 'draft_posts', category: 'invented', assets: [{ caption: 'Meet VIDA' }] });
  const p = provenance(f.writes);
  assert.equal(p.category, null);
  assert.equal(p.brief_id, null);
  assert.equal(p.intel_id, null);
});
