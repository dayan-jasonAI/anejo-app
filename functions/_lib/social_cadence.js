// Social posting cadence — how many NEW feed posts the planner tops up to each week, and the
// Stories cadence the owner asked for (recorded here, not drafted by this planner — see below).
//
// OWNER-SETTABLE WITHOUT A REDEPLOY. Same three-tier pattern as every other owner-tunable number
// in this codebase (pay.js getPayConfig, autodispatch.js getAutoConfig): KV override → env var →
// hard-coded default. env.SESSIONS is the one settings store every one of those already uses —
// this does not open a second one.
// Files under functions/_lib are NOT routed.

const KEY = 'cfg:social_cadence';

// The owner's literal ask was "3 to 6 posts daily." That is the right cadence for Stories
// (ephemeral, shot-that-day, the algorithm rewards frequency there) and the wrong cadence for
// the FEED (permanent grid posts — what this planner drafts). 2026 platform research on food
// accounts is consistent: 3-5 feed posts/week is the sweet spot, and average reach PER POST
// starts falling once an account crosses roughly 5/week — the algorithm reads high-frequency
// grid posting as spammy and throttles distribution, so posting MORE can mean fewer people
// seeing each one. `feed_per_week` defaults to 4 — inside that band, with headroom on both
// sides, not pinned to the ceiling. `stories_per_day_*` records the owner's actual ask so the
// config is honest about BOTH cadences instead of only ever encoding the feed number — Stories
// are not drafted here (they are same-day camera-roll content), but the range belongs in the
// one place that documents Añejo's posting cadence, not nowhere.
const DEFAULTS = {
  feed_per_week: 4,
  stories_per_day_min: 3,
  stories_per_day_max: 6,
};

const FIELDS = ['feed_per_week', 'stories_per_day_min', 'stories_per_day_max'];

// feed_per_week=0 is a valid, deliberate "pause the planner" setting (mirrors WANT=0 semantics
// nobody previously had a dial for). 14 is a sanity ceiling — twice a day, every day — because
// nothing in the research above supports a feed cadence anywhere near that, and a fat-fingered
// entry (e.g. pasting a Stories number into the feed field) should clamp, not run away.
const MAX_FEED_PER_WEEK = 14;

function fromEnv(env) {
  const out = {};
  for (const f of FIELDS) {
    const v = Number(env && env['SOCIAL_CADENCE_' + f.toUpperCase()]);
    if (Number.isFinite(v) && v >= 0) out[f] = Math.round(v);
  }
  return out;
}

function clean(obj) {
  const out = {};
  for (const f of FIELDS) {
    const v = Number(obj && obj[f]);
    out[f] = Number.isFinite(v) && v >= 0 ? Math.round(v) : DEFAULTS[f];
  }
  out.feed_per_week = Math.min(MAX_FEED_PER_WEEK, out.feed_per_week);
  // A max below the min is a config typo, not a real 0-width range — widen the max to match
  // rather than silently accepting a range nothing can ever satisfy.
  if (out.stories_per_day_max < out.stories_per_day_min) out.stories_per_day_max = out.stories_per_day_min;
  return out;
}

// Effective cadence config: KV override → env → defaults (field-by-field, same resolution
// order as getPayConfig).
export async function getCadenceConfig(env) {
  let kv = {};
  try { const raw = env && env.SESSIONS && await env.SESSIONS.get(KEY); if (raw) kv = JSON.parse(raw) || {}; } catch { kv = {}; }
  return clean({ ...DEFAULTS, ...fromEnv(env), ...kv });
}

export async function setCadenceConfig(env, cfg) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const next = clean(cfg);
  try { await env.SESSIONS.put(KEY, JSON.stringify(next)); return { ok: true, config: next }; }
  catch { return { ok: false, error: 'Could not save cadence settings.' }; }
}

export const CADENCE_DEFAULTS = DEFAULTS;
export const CADENCE_FIELDS = FIELDS;
