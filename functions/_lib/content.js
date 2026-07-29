// Owner-editable copy in named slots on the public site.
//
// Deliberately NOT a page editor. Pages carry SEO schema, hreflang pairing and a CLS budget; a
// free-form editor lets someone break all three without knowing. Slots are the safe subset: the
// page structure stays code, the words inside a named slot become data.
//
// Two rules, both learned the hard way elsewhere in this codebase:
//   1. A slot is LIVE only if active AND inside its window. Scheduling is an expiry rather than a
//      flag because a promo bar nobody remembers to switch off is worse than no bar.
//   2. Spanish left blank falls back to the on-demand translator, never to English. A half-
//      translated banner is the exact defect the language work existed to fix.

export const SLOTS = {
  announcement: {
    label: 'Announcement bar',
    where: 'A strip across the top of every public page.',
    max: 180,
  },
};

export const isSlot = (s) => Object.prototype.hasOwnProperty.call(SLOTS, s);

const TONES = ['info', 'good', 'urgent'];
export const normalizeTone = (t) => (TONES.includes(String(t)) ? String(t) : 'info');

// How it presents itself. A bar suits a standing line; a pop-up suits something that has to be
// read once. Anything unrecognised falls back to the bar — the quieter of the two, so a bad value
// can never escalate a message into an interruption.
const PLACEMENTS = ['bar', 'modal'];
export const normalizePlacement = (p) => (PLACEMENTS.includes(String(p)) ? String(p) : 'bar');

/** Is this row live right now? Active plus inside any window it declares. */
export function isLive(row, nowMs = Date.now()) {
  if (!row || !row.active) return false;
  const s = Number(row.starts_at) || 0;
  const e = Number(row.ends_at) || 0;
  if (s && nowMs < s) return false;
  if (e && nowMs >= e) return false;
  return true;
}

/**
 * Where one queued entry stands, for the owner's list. Deliberately distinguishes the four states
 * a single "on/off" toggle collapses — an owner staring at a switched-ON message that nobody can
 * see needs to be told WHY, and "ended" vs "not yet" are opposite problems.
 *   off       — switched off; the window is irrelevant
 *   ended     — its window has closed; it retired itself
 *   scheduled — switched on, window has not opened yet
 *   waiting   — on and in-window, but another entry in the same slot outranks it
 *   showing   — this is the one on the site right now
 */
export function stateOf(row, nowMs = Date.now(), liveId = undefined) {
  if (!row || !row.active) return 'off';
  const s = Number(row.starts_at) || 0;
  const e = Number(row.ends_at) || 0;
  if (e && nowMs >= e) return 'ended';
  if (s && nowMs < s) return 'scheduled';
  if (liveId !== undefined && row.id !== liveId) return 'waiting';
  return 'showing';
}

/**
 * What the storefront should render for a slot, or null.
 * `lang` picks the body; Spanish missing returns the English text WITH needsTranslation set, so the
 * page can hand it to the existing translator instead of silently showing English.
 */
export function render(row, lang = 'en', nowMs = Date.now()) {
  if (!isLive(row, nowMs)) return null;
  const es = String(lang || 'en').toLowerCase().startsWith('es');
  const en = String(row.body_en || '').trim();
  const esText = String(row.body_es || '').trim();
  const body = es ? (esText || en) : en;
  if (!body) return null;
  return {
    body,
    needsTranslation: es && !esText && !!en,
    tone: normalizeTone(row.tone),
    placement: normalizePlacement(row.placement),
    // The storefront remembers a dismissed pop-up by id, so editing a message shows it again
    // (it is new information) while re-reading the same one does not nag.
    id: row.id || null,
    link: row.link_url ? { url: String(row.link_url), label: String(row.link_label || '').trim() || null } : null,
  };
}

/**
 * One slot holds a QUEUE. Given every row for a slot, which one shows right now?
 *
 * Only live rows are candidates, then the MOST SPECIFIC window wins:
 *   1. A row with an end date beats an open-ended one. A dated notice ("closed the 4th") is always
 *      more urgent than the evergreen line it temporarily displaces, and it retires by itself —
 *      so the evergreen one comes back with no one touching it.
 *   2. Then the latest start — the most recently begun message is the current one.
 *   3. Then the most recently edited, so an owner fixing a typo sees their edit win immediately.
 *
 * Ties resolve deterministically rather than "whatever the database returned first", because two
 * overlapping announcements flickering between page loads is worse than either one of them.
 */
export function pickLive(rows, nowMs = Date.now()) {
  const live = (rows || []).filter((r) => isLive(r, nowMs));
  if (!live.length) return null;
  return live.slice().sort((a, b) => {
    const bounded = (r) => (Number(r.ends_at) > 0 ? 1 : 0);
    return (bounded(b) - bounded(a))
      || ((Number(b.starts_at) || 0) - (Number(a.starts_at) || 0))
      || ((Number(b.updated_at) || 0) - (Number(a.updated_at) || 0));
  })[0];
}

/** Read every live slot. Never throws — a copy block must not be able to break a page. */
export async function liveBlocks(env, lang = 'en', nowMs = Date.now()) {
  const out = {};
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare('SELECT * FROM content_blocks WHERE active = 1').all();
    const bySlot = new Map();
    for (const row of (r && r.results) || []) {
      if (!bySlot.has(row.slot)) bySlot.set(row.slot, []);
      bySlot.get(row.slot).push(row);
    }
    for (const [slot, rows] of bySlot) {
      const v = render(pickLive(rows, nowMs), lang, nowMs);
      if (v) out[slot] = v;
    }
  } catch { /* an empty object renders nothing, which is the safe default */ }
  return out;
}
