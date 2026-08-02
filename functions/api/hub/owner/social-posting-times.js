// /api/hub/owner/social-posting-times — owner-configurable default posting-time slots for the
// social planner (stored in KV), one array of ET hours per weekday (0=Sunday..6=Saturday).
//   GET  → { ok, table:{0:[18],1:[12,18],...}, defaults }
//   POST { table:{...} } → merges per-weekday (an entry only in the body overrides that day;
//                           omitted days keep their current value), saves, returns table.
// Owner-only. Takes effect on the NEXT social_plan run.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { getPostingTimes, setPostingTimes, DEFAULT_POSTING_SLOTS } from '../../../_lib/posting_times.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  return json({ ok: true, table: await getPostingTimes(env), defaults: DEFAULT_POSTING_SLOTS });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const cur = await getPostingTimes(env);
  const next = { ...cur, ...((b && b.table) || {}) };
  const r = await setPostingTimes(env, next);
  if (!r.ok) return bad(r.error || 'Could not save.', 400);
  return json({ ok: true, table: r.table });
};
