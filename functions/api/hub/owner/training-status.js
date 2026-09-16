// GET /api/hub/owner/training-status — OWNER-ONLY training compliance: every active staffer, whether
// they have completed THEIR role's tutorial, and — since migration 0112 — whether that completion is
// still CURRENT. Drives the compliance view.
//
// Three states, not two. "Never trained" and "trained, but before the process changed" look identical
// on a done/not-done list, and they are not the same problem: one person has never been taught, the
// other was taught correctly and is now working to an old procedure. The owner has to be able to see
// who owes the NEW material, which is the whole reason the version column exists.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { trainingStatus, updateFor } from '../../../_lib/training_modules.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT s.id, s.name, s.role, s.team, tc.completed_at, tc.lang, tc.version
         FROM staff s
         LEFT JOIN training_completions tc ON tc.staff_id = s.id AND tc.module = s.role
        WHERE s.active = 1
        ORDER BY (tc.completed_at IS NULL) DESC, s.role, s.name`
    ).all();
    rows = (r && r.results) || [];
  } catch (_) { /* empty */ }

  const items = rows.map((r) => {
    const st = trainingStatus(r.role, r);
    return {
      id: r.id, name: r.name, role: r.role, team: r.team,
      completed_at: r.completed_at || null, lang: r.lang || null,
      // 'never' | 'outdated' | 'current' — the field the view badges on.
      state: st.state,
      current_version: st.current_version,
      completed_version: st.completed_version,
      // What they would be shown if they opened their training right now (null when nothing changed
      // for that role), so the owner reads WHY someone is outdated without leaving the page.
      update_headline: st.update ? st.update.headline : null,
    };
  });

  // Most urgent first: never trained, then out of date, then current — the SQL ORDER BY can only see
  // "has a row", which would bury someone who trained a year ago on an obsolete procedure.
  const RANK = { never: 0, outdated: 1, current: 2 };
  items.sort((a, b) => (RANK[a.state] - RANK[b.state])
    || String(a.role).localeCompare(String(b.role))
    || String(a.name || '').localeCompare(String(b.name || '')));

  // An outdated staffer is NOT counted in `done`: they owe work. `done` stayed the name it had so the
  // existing summary line keeps meaning what it says — completed, at the current version.
  const done = items.filter((i) => i.state === 'current').length;
  const outdated = items.filter((i) => i.state === 'outdated').length;
  const never = items.filter((i) => i.state === 'never').length;
  // Which roles have new material at all — lets the view say "nothing changed for drivers" honestly.
  const modules_with_updates = [...new Set(items.map((i) => i.role))].filter((role) => !!updateFor(role));

  return json({ ok: true, items, done, outdated, never, total: items.length, modules_with_updates });
};
