// GET/POST /api/hub/owner/ordering — how the storefront takes orders, owned by the owner.
//
// These settings lived ONLY in environment variables, so "we're scheduled-ahead only this week"
// required a developer, a secret change and a redeploy. That is an operating decision, not a
// deployment, and it belongs to whoever runs the business.
//
// Everything here is a SETTING, not code: the storefront and the checkout gate both already read
// these values on every request, so a change takes effect on the next page load with no deploy.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';
import { loadOrderingSettings, onDemandConfig, windowState } from '../../../_lib/ondemand.js';
import { capture } from '../../../_lib/track.js';

const KEYS = {
  scheduled_only: (v) => (v ? '1' : '0'),
  open_hour: (v) => String(Math.min(23, Math.max(0, parseInt(v, 10) || 0))),
  close_hour: (v) => String(Math.min(23, Math.max(0, parseInt(v, 10) || 0))),
  close_min: (v) => String(Math.min(59, Math.max(0, parseInt(v, 10) || 0))),
  bowl_limit: (v) => String(Math.min(999, Math.max(0, parseInt(v, 10) || 0))),
};

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  const settings = await loadOrderingSettings(env);
  const cfg = onDemandConfig(env, settings);
  const w = windowState(env, new Date(), settings);

  return json({
    ok: true,
    scheduled_only: cfg.scheduledOnly,
    open_hour: cfg.openHour,
    close_hour: cfg.closeHour,
    close_min: cfg.closeMinute,
    bowl_limit: cfg.limit,
    // What a customer hitting /order right this second would actually see. Showing the SETTING
    // without the resulting STATE is how an owner ends up unsure whether a change took.
    open_right_now: w.open,
    // True when nothing is stored yet and the values shown come from deploy-time defaults.
    using_defaults: Object.keys(settings).length === 0,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const writes = [];
  for (const [key, norm] of Object.entries(KEYS)) {
    if (b[key] === undefined) continue;
    writes.push([`ordering.${key}`, norm(b[key])]);
  }
  if (!writes.length) return bad('Nothing to change.');

  const t = now();
  for (const [k, v] of writes) {
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(k, v, ctx.distinct_id || null, t).run();
  }

  // Read back through the same path the storefront uses, so the response reflects what customers
  // will actually get rather than what was submitted.
  const settings = await loadOrderingSettings(env);
  const cfg = onDemandConfig(env, settings);
  const w = windowState(env, new Date(), settings);

  await capture(env, {
    event: 'ordering.settings_changed',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { changed: writes.map(([k]) => k), scheduled_only: cfg.scheduledOnly },
  });

  return json({
    ok: true,
    scheduled_only: cfg.scheduledOnly,
    open_hour: cfg.openHour, close_hour: cfg.closeHour, close_min: cfg.closeMinute,
    bowl_limit: cfg.limit,
    open_right_now: w.open,
  });
};
