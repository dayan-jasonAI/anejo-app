// /api/hub/owner/email-suppressions — owner view + management of the email suppression list.
//   GET  ?reason=bounced|complained|suppressed|manual|all   → newest first (max 500)
//   POST { op:'remove', email }            → delete a suppression
//        { op:'add', email, detail? }       → manually suppress an address
//
// CAUTION (suppressions best practice): REMOVING a bounce/complaint re-enables sending to an
// address that previously bounced or marked Añejo as spam. It does NOT fix the underlying mailbox,
// and re-sending damages sender reputation. Only remove with a real business reason. Owner-only.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { addSuppression, removeSuppression, normalizeEmail } from '../../../_lib/email.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const reason = (new URL(request.url).searchParams.get('reason') || 'all').toLowerCase();
  let q = 'SELECT email, reason, detail, created_at, updated_at FROM email_suppressions';
  const binds = [];
  if (['bounced', 'complained', 'suppressed', 'manual'].includes(reason)) { q += ' WHERE reason=?'; binds.push(reason); }
  q += ' ORDER BY created_at DESC LIMIT 500';

  let items = [];
  try { const r = await env.DB.prepare(q).bind(...binds).all(); items = (r && r.results) || []; } catch (_) { /* empty */ }
  return json({ ok: true, items });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const email = normalizeEmail(b && b.email);
  if (!email) return bad('An email address is required.');
  const op = (b.op === 'add' || b.op === 'remove') ? b.op : null;
  if (!op) return bad("Unknown op (use 'add' or 'remove').");

  const okWrite = op === 'remove'
    ? await removeSuppression(env, email)
    : await addSuppression(env, email, 'manual', (b.detail || 'owner-added'));
  if (!okWrite) return bad('Could not update the suppression list.', 500);
  return json({ ok: true, op, email });
};
