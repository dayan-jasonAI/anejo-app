// POST /api/hub/admin/dispatch-tick
//   Runs automated dispatch: if enabled + at/after the configured time, groups the day's
//   unassigned orders into efficient routes and auto-offers them to drivers. Self-gating +
//   idempotent. Also the owner's "Auto-build routes now" button — body { force:true, date? }
//   bypasses the enabled flag + time gate.
// Auth: owner session OR X-Cron-Key (constant-time).
import { json, bad, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { runAutoDispatch } from '../../../_lib/autodispatch.js';

function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const cron = cronAuthed(request, env);
  let owner = false;
  if (!cron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
    owner = true;
  }
  let b = {};
  try { b = await request.json(); } catch { /* allow empty */ }
  // Only an authenticated owner may force a build; cron always runs the gated path.
  const force = owner && !!(b && b.force);
  const date = (b && b.date) || undefined;
  const r = await runAutoDispatch(env, { force, date });
  return json(r);
};
