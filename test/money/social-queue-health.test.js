import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/hub/admin/social-tick.js';

test('scheduler exposes storage failure instead of reporting an empty successful run', async () => {
  let writes = 0;
  const env = {
    CRON_KEY: 'fixture-cron', IG_ACCESS_TOKEN: 'fixture-not-real',
    DB: { prepare(sql) { return { bind() { return {
      all: async () => { throw new Error('storage down'); },
      run: async () => { if (!sql.includes('app_settings')) writes++; },
    }; } }; } },
  };
  const response = await onRequestPost({ env, request: new Request('https://example.test/tick', {
    method: 'POST', headers: { 'x-cron-key': env.CRON_KEY },
  }) });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /No posts were processed/);
  assert.equal(writes, 0);
});
