// GET/POST /api/hub/owner/site-copy — owner-editable copy in named slots on the PUBLIC site.
// Owner-only.
//
// Named site-copy rather than "content" because /api/hub/owner/content already owns the docs
// library (manuals, policies, procedures). Different thing: this is storefront copy.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';
import { SLOTS, isSlot, normalizeTone, isLive } from '../../../_lib/content.js';
import { capture } from '../../../_lib/track.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let rows = [];
  try {
    const r = await env.DB.prepare('SELECT * FROM content_blocks').all();
    rows = (r && r.results) || [];
  } catch { rows = []; }
  const bySlot = {};
  for (const row of rows) bySlot[row.slot] = row;

  return json({
    ok: true,
    slots: Object.keys(SLOTS).map((k) => {
      const row = bySlot[k] || null;
      return {
        slot: k,
        label: SLOTS[k].label,
        where: SLOTS[k].where,
        max: SLOTS[k].max,
        body_en: (row && row.body_en) || '',
        body_es: (row && row.body_es) || '',
        link_url: (row && row.link_url) || '',
        link_label: (row && row.link_label) || '',
        tone: normalizeTone(row && row.tone),
        active: !!(row && row.active),
        starts_at: (row && row.starts_at) || null,
        ends_at: (row && row.ends_at) || null,
        // Whether a visitor would see it THIS SECOND. "Switched on" and "showing" are different
        // once scheduling exists, and an owner looking only at the toggle cannot tell why the bar
        // is missing.
        live_now: isLive(row),
      };
    }),
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const slot = String((b && b.slot) || '').trim();
  if (!isSlot(slot)) return bad('Unknown slot.');

  const max = SLOTS[slot].max;
  const en = String((b && b.body_en) || '').trim().slice(0, max);
  const es = String((b && b.body_es) || '').trim().slice(0, max);
  const active = b && b.active ? 1 : 0;

  // Publishing an empty slot renders a band of colour saying nothing. Refuse instead.
  if (active && !en) return bad('Write the English text before turning this on.');

  const url = String((b && b.link_url) || '').trim().slice(0, 300);
  if (url && !/^(https?:\/\/|\/)/.test(url)) {
    return bad('The link must start with http(s):// or with / for a page on this site.');
  }

  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; };
  const startsAt = num(b && b.starts_at);
  const endsAt = num(b && b.ends_at);
  if (startsAt && endsAt && endsAt <= startsAt) return bad('The end time has to be after the start time.');

  const t = now();
  await env.DB.prepare(
    `INSERT INTO content_blocks (slot, body_en, body_es, link_url, link_label, tone, active, starts_at, ends_at, updated_by, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(slot) DO UPDATE SET
       body_en=excluded.body_en, body_es=excluded.body_es, link_url=excluded.link_url,
       link_label=excluded.link_label, tone=excluded.tone, active=excluded.active,
       starts_at=excluded.starts_at, ends_at=excluded.ends_at,
       updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(
    slot, en || null, es || null, url || null,
    String((b && b.link_label) || '').trim().slice(0, 60) || null,
    normalizeTone(b && b.tone), active, startsAt, endsAt,
    ctx.distinct_id || null, t,
  ).run();

  const row = await env.DB.prepare('SELECT * FROM content_blocks WHERE slot=?').bind(slot).first();

  await capture(env, {
    event: 'content.slot_updated',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { slot, active: !!active, scheduled: !!(startsAt || endsAt) },
  });

  // Report the RESULTING state, not what was submitted — scheduling is exactly where "saved" and
  // "visible" come apart.
  return json({ ok: true, slot, active: !!active, live_now: isLive(row) });
};
