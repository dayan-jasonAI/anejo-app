// /api/hub/owner/social-autoreply — owner control for Aña's Instagram auto-reply mode.
//   GET  → { ok, mode, options }            mode ∈ 'off'|'dm'|'comment'|'both'
//   POST { mode } → validates + saves, returns { ok, mode }
//
// This ONLY surfaces the existing setting (app_settings key 'social.auto_reply', read at
// functions/api/hub/admin/social-inbox-tick.js:62). It is control, not a default change:
// absence of the row still means OFF (draft-only), exactly as the tick's code default enforces.
// Turning it on is a deliberate owner action — the UI confirms first — and flipping back to
// 'off' restores draft-only instantly on the next tick.
import { json, bad, now } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';

const MODES = ['off', 'dm', 'comment', 'both'];

async function currentMode(env) {
  // Mirror the tick's own read (social-inbox-tick.js): only 'both'|'dm'|'comment' turn it on;
  // anything else — including a missing row — is OFF. Never report a mode the tick wouldn't honor.
  try {
    const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key='social.auto_reply'").first();
    const v = r && String(r.value);
    return ['both', 'dm', 'comment'].includes(v) ? v : 'off';
  } catch { return 'off'; }
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  return json({ ok: true, mode: await currentMode(env), options: MODES });
};

// OWNER ONLY, not MARKETING_DESK. This switch decides whether Aña answers a real customer
// with no human tap. The marketing expert reads the mode (GET) because a draft-only inbox is
// hers to work; turning the tap OFF as a standing policy is the owner's call alone.
// (Widened to the desk in error on 2026-08-11 and narrowed back the same day.)
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const mode = (b && String(b.mode || '')).trim();
  if (!MODES.includes(mode)) return bad('mode must be one of: ' + MODES.join(', '));

  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('social.auto_reply',?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(mode, ctx.distinct_id || null, now()).run();

  return json({ ok: true, mode });
};
