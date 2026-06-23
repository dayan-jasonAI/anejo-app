// POST /api/contract/register — PUBLIC B2B self-registration. A business submits its details
// + chosen billing model → a PENDING contract account (+ sites, intake links). The owner sets
// the negotiated price/terms and activates it. Rate-limited. ok:false returned 200 w/ message.
import { json, bad } from '../../_lib/util.js';
import { registerAccount } from '../../_lib/contract.js';
import { limitOr429 } from '../../_lib/ratelimit.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const limited = await limitOr429(env, request, { name: 'contract-register', limit: 5, windowSec: 600 });
  if (limited) return limited;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const r = await registerAccount(env, b);
  return json(r);
};
