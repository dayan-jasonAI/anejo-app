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
    link: row.link_url ? { url: String(row.link_url), label: String(row.link_label || '').trim() || null } : null,
  };
}

/** Read every live slot. Never throws — a copy block must not be able to break a page. */
export async function liveBlocks(env, lang = 'en', nowMs = Date.now()) {
  const out = {};
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare('SELECT * FROM content_blocks WHERE active = 1').all();
    for (const row of (r && r.results) || []) {
      const v = render(row, lang, nowMs);
      if (v) out[row.slot] = v;
    }
  } catch { /* an empty object renders nothing, which is the safe default */ }
  return out;
}
