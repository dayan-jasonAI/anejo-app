// POST /api/hub/owner/social-cleanup — delete OUR OWN broken-character comments from Instagram.
//
// Exists because of the 2026-07-31 incident: a self-reply loop posted seven scaffolding replies
// ("please paste the comment...") publicly under a customer's 🔥. Deliberately narrow:
//   · only comments authored by OUR account (username matched against live /me, never env config)
//   · only ones that trip looksLikeScaffolding() — the same detector that now gates every send
//   · dry run by default; { confirm: true } actually deletes
// It cannot touch a customer's comment: the username gate runs before the content gate.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { resolveTarget, accountInfo } from '../../../_lib/instagram.js';
import { looksLikeScaffolding } from '../../../_lib/ana_social.js';

async function g(env, base, path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN });
  const r = await fetch(`${base}${path}?${qs}`);
  const j = await r.json().catch(() => null);
  if (!r.ok || (j && j.error)) throw new Error((j && j.error && j.error.message) || `HTTP ${r.status}`);
  return j;
}

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;

  let b = {};
  try { b = await request.json(); } catch { /* dry run */ }
  const confirm = b && b.confirm === true;

  const target = await resolveTarget(env);
  if (!target.ok) return bad('Instagram is not reachable.', 502);
  const acct = await accountInfo(env);
  const ourName = String((acct.ok && acct.username) || '').toLowerCase();
  if (!ourName) return bad('Could not confirm our own username — refusing to delete anything.', 502);

  const found = [];
  try {
    const media = await g(env, target.base, `/${target.id}/media`, { fields: 'id', limit: '5' });
    for (const m of (media.data || [])) {
      const comments = await g(env, target.base, `/${m.id}/comments`, {
        fields: 'id,text,username,replies{id,text,username}', limit: '50',
      });
      const flat = [];
      for (const c of (comments.data || [])) {
        flat.push(c);
        for (const rep of ((c.replies && c.replies.data) || [])) flat.push(rep);
      }
      for (const c of flat) {
        // BOTH gates, in this order: ours, then broken. A customer's comment can never match.
        if (String(c.username || '').toLowerCase() !== ourName) continue;
        if (!looksLikeScaffolding(c.text)) continue;
        found.push({ id: c.id, text: String(c.text || '').slice(0, 80) });
      }
    }
  } catch (e) {
    return bad('Listing comments failed: ' + String(e.message).slice(0, 160), 502);
  }

  if (!confirm) return json({ ok: true, dry_run: true, would_delete: found });

  const deleted = [], failed = [];
  for (const c of found) {
    try {
      const qs = new URLSearchParams({ access_token: env.IG_ACCESS_TOKEN });
      const r = await fetch(`${target.base}/${c.id}?${qs}`, { method: 'DELETE' });
      const j = await r.json().catch(() => null);
      if (r.ok && j && (j.success === true || j.success === undefined)) deleted.push(c.id);
      else failed.push({ id: c.id, error: (j && j.error && j.error.message) || `HTTP ${r.status}` });
    } catch (e) { failed.push({ id: c.id, error: String(e.message).slice(0, 120) }); }
  }
  return json({ ok: true, deleted: deleted.length, failed });
};
