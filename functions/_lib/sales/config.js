// Sales OS — feature flags and owner-editable settings, stored in app_settings.
// Files under functions/_lib are NOT routed.
//
// ROLLOUT IS CONTROLLED BY FLAGS, and the defaults are the production-safe ones from the spec:
// the workspace is on; discovery, enrichment, email, follow-up, voice and auto-send are OFF until
// the owner turns each one on. Deploying this code changes nothing a prospect can see.
//
// THREE FLAGS ARE LOCKED IN THIS BUILD and cannot be changed from the HUB:
//   sales.owner_approval_required = true   — no cold email leaves without an owner approval
//   sales.auto_send_enabled       = false  — the approval gate is not silently removable
//   sales.voice_enabled           = false  — the AI voice channel is Phase 2 and does not exist
// A later build can unlock them deliberately; a settings POST cannot.
import { now } from '../hub.js';
import {
  DEFAULT_ICP, DEFAULT_OFFER, DEFAULT_PROOF, DEFAULT_SENDER, DEFAULT_SEND_WINDOW, DEFAULT_SERVICE_AREA,
} from './anejo.js';

export const FLAG_DEFAULTS = {
  'sales.enabled': true,
  'sales.discovery_enabled': false,
  'sales.enrichment_enabled': false,
  'sales.email_enabled': false,
  'sales.followup_enabled': false,
  'sales.voice_enabled': false,
  'sales.auto_send_enabled': false,
  'sales.owner_approval_required': true,
  'sales.max_new_prospects_per_day': 25,
  'sales.max_emails_per_day': 10,
  'sales.max_discovery_calls_per_day': 8,
};

export const LOCKED_FLAGS = {
  'sales.owner_approval_required': true,
  'sales.auto_send_enabled': false,
  'sales.voice_enabled': false,
};

// Hard ceilings the owner's numbers are clamped to. The first experiment is 20 emails, not 2,000;
// a mistyped 500 must not become 500 cold emails from the domain that carries receipts.
export const CAPS = {
  'sales.max_new_prospects_per_day': 100,
  'sales.max_emails_per_day': 40,
  'sales.max_discovery_calls_per_day': 30,
};

const BOOL_FLAGS = Object.keys(FLAG_DEFAULTS).filter((k) => typeof FLAG_DEFAULTS[k] === 'boolean');
const NUM_FLAGS = Object.keys(FLAG_DEFAULTS).filter((k) => typeof FLAG_DEFAULTS[k] === 'number');

export const JSON_SETTINGS = {
  'sales.icp': DEFAULT_ICP,
  'sales.offer': DEFAULT_OFFER,
  'sales.proof': DEFAULT_PROOF,
  'sales.sender': DEFAULT_SENDER,
  'sales.send_window': DEFAULT_SEND_WINDOW,
  'sales.service_area': DEFAULT_SERVICE_AREA,
};

const POSTAL_FALLBACK = 'Añejo Catering Co. · Palm Beach County, FL';

function parseBool(v, dflt) {
  if (v == null) return dflt;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(s)) return true;
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  return dflt;
}

function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

/** Owner values over defaults, key by key, so a partial save never drops a default. Arrays replace. */
export function deepMerge(base, over) {
  if (!isPlainObject(base)) return over === undefined ? base : over;
  const out = { ...base };
  if (!isPlainObject(over)) return out;
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(base[k]) && isPlainObject(v) ? deepMerge(base[k], v) : v;
  }
  return out;
}

async function readAll(env) {
  const map = new Map();
  if (!env || !env.DB) return map;
  try {
    const r = await env.DB.prepare(
      "SELECT key, value FROM app_settings WHERE key LIKE 'sales.%' OR key = 'campaign.postal_address'"
    ).all();
    for (const row of (r && r.results) || []) map.set(row.key, row.value);
  } catch { /* table absent → defaults */ }
  return map;
}

export function flagsFrom(map) {
  const flags = {};
  for (const k of BOOL_FLAGS) flags[k] = parseBool(map.get(k), FLAG_DEFAULTS[k]);
  for (const k of NUM_FLAGS) {
    const n = Number(map.get(k));
    const v = map.has(k) && Number.isFinite(n) ? Math.round(n) : FLAG_DEFAULTS[k];
    flags[k] = Math.max(0, Math.min(CAPS[k] || v, v));
  }
  // Locked flags are what the code says, whatever a row says.
  for (const [k, v] of Object.entries(LOCKED_FLAGS)) flags[k] = v;
  return flags;
}

/**
 * Everything the Sales OS needs to decide anything, in one read.
 * { flags, icp, offer, proof, sender, send_window, service_area, postal_address, postal_is_real }
 */
export async function loadSalesConfig(env) {
  const map = await readAll(env);
  const json = (key) => {
    const raw = map.get(key);
    if (!raw) return deepMerge(JSON_SETTINGS[key], {});
    try { return deepMerge(JSON_SETTINGS[key], JSON.parse(raw)); } catch { return deepMerge(JSON_SETTINGS[key], {}); }
  };
  const postal = String(map.get('campaign.postal_address') || '').trim();
  return {
    flags: flagsFrom(map),
    icp: json('sales.icp'),
    offer: json('sales.offer'),
    proof: json('sales.proof'),
    sender: json('sales.sender'),
    send_window: json('sales.send_window'),
    service_area: json('sales.service_area'),
    postal_address: postal || POSTAL_FALLBACK,
    // CAN-SPAM wants a real postal address in every commercial email. A service area is not one,
    // so cold email refuses to send on the fallback (Broadcast merely warns; prospecting is stricter
    // because these recipients have no relationship with us at all).
    postal_is_real: !!postal && postal !== POSTAL_FALLBACK && /\d/.test(postal),
  };
}

async function put(env, key, value, by) {
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(key, value, by || null, now()).run();
}

/** Set one flag. Locked flags and unknown keys are refused with a reason, never silently ignored. */
export async function setFlag(env, key, value, by) {
  if (!Object.prototype.hasOwnProperty.call(FLAG_DEFAULTS, key)) return { ok: false, error: `Unknown setting ${key}.` };
  if (Object.prototype.hasOwnProperty.call(LOCKED_FLAGS, key)) {
    const why = key === 'sales.voice_enabled'
      ? 'The AI voice channel is Phase 2 and is not built in this release.'
      : 'Owner approval of every prospect email is required in this release; it cannot be switched off from the Hub.';
    return { ok: false, error: why, locked: true };
  }
  let stored;
  if (typeof FLAG_DEFAULTS[key] === 'boolean') stored = parseBool(value, null);
  else {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Enter a whole number, 0 or more.' };
    stored = Math.min(CAPS[key] || n, Math.round(n));
  }
  if (stored === null) return { ok: false, error: 'Use on or off.' };
  await put(env, key, String(stored), by);
  return { ok: true, key, value: stored, clamped: typeof stored === 'number' && stored !== Math.round(Number(value)) };
}

/** Save one JSON settings object (merged over defaults on read, so partial objects are fine). */
export async function saveJsonSetting(env, key, value, by) {
  if (!Object.prototype.hasOwnProperty.call(JSON_SETTINGS, key)) return { ok: false, error: `Unknown setting ${key}.` };
  if (!isPlainObject(value)) return { ok: false, error: 'Settings must be an object.' };
  const s = JSON.stringify(value);
  if (s.length > 20000) return { ok: false, error: 'That settings object is too large.' };
  await put(env, key, s, by);
  return { ok: true, key };
}

/** A short fingerprint of the ICP settings, stored with each score so a re-weight is traceable. */
export function configHash(obj) {
  const s = JSON.stringify(obj || {});
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
