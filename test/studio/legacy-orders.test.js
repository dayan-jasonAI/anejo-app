import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../../functions/api/orders.js';

test('legacy /api/orders is retired with 410', async () => {
  const get = await onRequestGet();
  assert.equal(get.status, 410);
  assert.match(await get.text(), /retired/i);

  const post = await onRequestPost();
  assert.equal(post.status, 410);
  assert.match(await post.text(), /retired/i);
});
