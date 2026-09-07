// Owner or existing minute scheduler only. No public notification/re-send endpoint.
import { json, bad, ctEq } from '../../_lib/util.js';
import { requireRole } from '../../_lib/roles.js';
import { drainCateringOutbox } from '../../_lib/catering-request.js';

export async function onRequestPost({ request, env }) {
  const key = request.headers.get('x-cron-key');
  if (!(env.CRON_KEY && key && ctEq(key, env.CRON_KEY))) {
    const auth = await requireRole(request, env, ['owner']);
    if (auth instanceof Response) return auth;
  }
  if (!env.DB) return bad('Database unavailable.', 503);
  try {
    const result = await drainCateringOutbox(env);
    const pending = await env.DB.prepare(`SELECT status,COUNT(*) AS count FROM catering_notification_outbox
      WHERE status!='accepted' GROUP BY status`).all();
    return json({ ok: true, ...result, outstanding: pending.results || [] });
  } catch { return bad('Catering notification retry failed; requests remain saved.', 503); }
}
