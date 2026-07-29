// GET/POST /api/hub/owner/site-copy — owner-editable copy in named slots on the PUBLIC site.
// Owner-only.
//
// Named site-copy rather than "content" because /api/hub/owner/content already owns the docs
// library (manuals, policies, procedures). Different thing: this is storefront copy.
//
// A slot holds a QUEUE (migrations/0052). One message per slot meant the owner had to be at a
// keyboard at the moment a message became true — so announcements got written late, or left up.
// Now a month of them can be written in one sitting, each with its own window, and whichever
// window contains "now" is the one on the site.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now, id } from '../../../_lib/hub.js';
import { SLOTS, isSlot, normalizeTone, isLive, pickLive, stateOf } from '../../../_lib/content.js';
import { capture } from '../../../_lib/track.js';

// Newest window first, so the list reads like a calendar rather than insertion order.
const byWhen = (a, b) => (Number(b.starts_at) || 0) - (Number(a.starts_at) || 0)
  || (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0);

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let rows = [];
  try {
    const r = await env.DB.prepare('SELECT * FROM content_blocks').all();
    rows = (r && r.results) || [];
  } catch { rows = []; }

  const t = now();
  return json({
    ok: true,
    slots: Object.keys(SLOTS).map((k) => {
      const mine = rows.filter((r) => r.slot === k).sort(byWhen);
      const live = pickLive(mine, t);
      return {
        slot: k,
        label: SLOTS[k].label,
        where: SLOTS[k].where,
        max: SLOTS[k].max,
        // Whether a visitor would see anything in this slot THIS SECOND. "Switched on" and
        // "showing" are different once scheduling exists, and more so once a slot holds several.
        live_now: !!live,
        live_id: live ? live.id : null,
        entries: mine.map((row) => ({
          id: row.id,
          body_en: row.body_en || '',
          body_es: row.body_es || '',
          link_url: row.link_url || '',
          link_label: row.link_label || '',
          tone: normalizeTone(row.tone),
          active: !!row.active,
          starts_at: row.starts_at || null,
          ends_at: row.ends_at || null,
          updated_at: row.updated_at || null,
          state: stateOf(row, t, live ? live.id : null),
        })),
      };
    }),
  });
};

// POST { slot, id?, body_en, … }            → create (no id) or update one queued entry
// POST { op:'delete', slot, id }            → remove one
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const slot = String((b && b.slot) || '').trim();
  if (!isSlot(slot)) return bad('Unknown slot.');

  if (b && b.op === 'delete') {
    const entryId = String(b.id || '').trim();
    if (!entryId) return bad('Missing id.');
    // Scoped by slot as well as id: a delete that silently matched nothing would report success
    // while the message stayed on the site.
    const r = await env.DB.prepare('DELETE FROM content_blocks WHERE id = ? AND slot = ?').bind(entryId, slot).run();
    if (!r || !r.meta || r.meta.changes !== 1) return bad('That message no longer exists.', 404);
    await capture(env, {
      event: 'content.slot_deleted',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { slot },
    });
    return json({ ok: true, deleted: entryId, ...(await slotState(env, slot)) });
  }

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
  const entryId = String((b && b.id) || '').trim() || id('cb');
  const fields = [
    en || null, es || null, url || null,
    String((b && b.link_label) || '').trim().slice(0, 60) || null,
    normalizeTone(b && b.tone), active, startsAt, endsAt,
    ctx.distinct_id || null, t,
  ];

  if (b && b.id) {
    const r = await env.DB.prepare(
      `UPDATE content_blocks SET body_en=?, body_es=?, link_url=?, link_label=?, tone=?, active=?,
         starts_at=?, ends_at=?, updated_by=?, updated_at=? WHERE id=? AND slot=?`
    ).bind(...fields, entryId, slot).run();
    if (!r || !r.meta || r.meta.changes !== 1) return bad('That message no longer exists.', 404);
  } else {
    await env.DB.prepare(
      `INSERT INTO content_blocks (id, slot, body_en, body_es, link_url, link_label, tone, active,
         starts_at, ends_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(entryId, slot, ...fields).run();
  }

  await capture(env, {
    event: 'content.slot_updated',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { slot, active: !!active, scheduled: !!(startsAt || endsAt), created: !(b && b.id) },
  });

  // Report the RESULTING state, not what was submitted — scheduling is exactly where "saved" and
  // "visible" come apart, and with a queue an entry can be on, in-window, and STILL not showing
  // because another entry outranks it. Saying "saved and live" then would be a lie.
  const state = await slotState(env, slot, entryId);
  return json({ ok: true, slot, id: entryId, active: !!active, ...state });
};

// Re-read the slot so the answer describes the world after the write, not the request.
async function slotState(env, slot, entryId) {
  let rows = [];
  try {
    const r = await env.DB.prepare('SELECT * FROM content_blocks WHERE slot = ?').bind(slot).all();
    rows = (r && r.results) || [];
  } catch { rows = []; }
  const t = now();
  const live = pickLive(rows, t);
  const mine = entryId ? rows.find((r) => r.id === entryId) : null;
  return {
    live_now: !!live,
    live_id: live ? live.id : null,
    // Is the entry just saved the one a visitor sees?
    this_one_live: !!(mine && live && mine.id === live.id),
    state: mine ? stateOf(mine, t, live ? live.id : null) : null,
    queued: rows.filter((r) => r.active && !isLive(r, t) && (!r.ends_at || t < Number(r.ends_at))).length,
  };
}
