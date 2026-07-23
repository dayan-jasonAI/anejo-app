// /api/orders — retired legacy kitchen endpoint.
// The role-gated /hub/kitchen board is the only supported kitchen surface. Keeping this route
// as an explicit 410 avoids stale shared-key behavior drifting away from payment-gated HUB logic.
import { json } from '../_lib/util.js';

export const onRequestGet = async () => {
  return json({ error: 'Legacy kitchen endpoint retired. Use /hub/kitchen/.' }, 410);
};

export const onRequestPost = async () => {
  return json({ error: 'Legacy kitchen endpoint retired. Use /hub/kitchen/.' }, 410);
};
