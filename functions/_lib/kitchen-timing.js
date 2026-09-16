// Kitchen timing: when an order has to be ready, when to start it, and how long it has been cooking.
// Files under functions/_lib are NOT routed.
//
// Dayan, 2026-09-15: a clock per menu item "so the food is done at the right time" — not early, where
// it sits in the box, and not late, where the driver waits. Every number here is an ESTIMATE the
// owner sets in the HUB:
//   · menu_items.prep_minutes       one item (menu editor)
//   · kitchen.office_prep_minutes   an office lunch order, which has no menu item
//   · kitchen.lunch_start / .dinner_start   when a web order's delivery window opens, "HH:MM" ET
//   · kitchen.ready_lead_minutes    how long before that the food must be ready for the driver
// An order with no estimate shows no timer. A made-up number would be worse than none.
//
// An order's estimate is its LONGEST item, not the sum: the rice, the chicken and the salmon cook
// side by side, so five bowls of three kinds are ready when the slowest one is.
//
// KNOWN LIMITATION — QUANTITY IS IGNORED. "The longest item" is the estimate for ONE of it. Five
// of the same bowl at one station take longer than one, and this model says they take the same.
// No quantity term has been invented here on purpose: a made-up multiplier would be a guess
// wearing a formula's clothes, and the kitchen would then be judged against it.
// prep_actuals (migration 0113, _lib/prep-actuals.js) records qty on EVERY measurement — batch and
// whole-order — and the owner's menu desk shows measured minutes per unit beside the total. When
// there are enough rows, that data answers what the multiplier should be, or whether there is one.
// Until then this stays as it is, and the owner adopts measured numbers item by item.
import { etMidnightMs } from './hub.js';

// Lunch and dinner defaults are the delivery windows the business already publishes (11:00 and
// 17:00). The 30-minute lead is only a starting point for the owner to change.
export const TIMING_DEFAULTS = Object.freeze({
  lunch_start: '11:00', dinner_start: '17:00', ready_lead_minutes: 30, office_prep_minutes: null,
});
const KEYS = Object.keys(TIMING_DEFAULTS);
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LATE_AFTER_MS = 5 * 60000;

function wholeMinutes(v, max) {
  if (v === null || v === undefined || String(v).trim() === '') return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) return { error: true };
  return { value: n };
}

/** Validate owner input (or stored values). Only the keys present are returned. */
export function validateTiming(input = {}) {
  const values = {};
  const errors = [];
  for (const k of ['lunch_start', 'dinner_start']) {
    if (!(k in input)) continue;
    const v = String(input[k] || '').trim();
    if (!HHMM.test(v)) errors.push(`${k === 'lunch_start' ? 'Lunch' : 'Dinner'} start must be a 24-hour time like 11:00.`);
    else values[k] = v;
  }
  if ('ready_lead_minutes' in input) {
    const r = wholeMinutes(input.ready_lead_minutes, 240);
    if (r.error || r.value === null) errors.push('Ready before delivery must be 0–240 minutes.');
    else values.ready_lead_minutes = r.value;
  }
  if ('office_prep_minutes' in input) {
    const r = wholeMinutes(input.office_prep_minutes, 600);
    if (r.error) errors.push('Office lunch prep time must be 0–600 minutes, or blank.');
    else values.office_prep_minutes = r.value;
  }
  return { values, errors };
}

/** The owner's settings over the defaults. A bad stored value falls back; it never breaks the board. */
export async function loadKitchenTiming(env) {
  const out = { ...TIMING_DEFAULTS };
  try {
    const rows = ((await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'kitchen.%'").all()).results) || [];
    const raw = {};
    for (const r of rows) {
      const k = String(r.key).slice('kitchen.'.length);
      if (!KEYS.includes(k)) continue;
      let v = r.value;
      try { v = JSON.parse(v); } catch { /* stored as plain text */ }
      raw[k] = v;
    }
    Object.assign(out, validateTiming(raw).values);
  } catch { /* no settings yet: defaults */ }
  return out;
}

/** Upserts for validated values, for the caller's batch. */
export function timingSettingStmts(env, values, actor, ts) {
  return Object.entries(values).map(([k, v]) => env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(`kitchen.${k}`, JSON.stringify(v), actor, ts));
}

/** menu item id → prep minutes, for items that have an estimate. */
export async function loadPrepMinutes(env) {
  const map = new Map();
  try {
    const rows = ((await env.DB.prepare('SELECT id, prep_minutes FROM menu_items WHERE prep_minutes IS NOT NULL').all()).results) || [];
    for (const r of rows) map.set(String(r.id), Number(r.prep_minutes));
  } catch { /* column not migrated yet: no estimates */ }
  return map;
}

/** contract site id → window label ("11:30–12:30"), for the office orders on the board. */
export async function loadSiteWindows(env, siteIds) {
  const map = new Map();
  const ids = [...new Set((siteIds || []).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const rows = ((await env.DB.prepare(
        `SELECT id, window_label FROM contract_sites WHERE id IN (${chunk.map(() => '?').join(',')})`
      ).bind(...chunk).all()).results) || [];
      for (const r of rows) map.set(r.id, r.window_label);
    } catch { /* the default window applies */ }
  }
  return map;
}

/** The first clock time in a window label, as minutes after midnight. "11:30–12:30" → 690. */
export function labelStartMinutes(label) {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(String(label || ''));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[3] || '').toLowerCase();
  if (h > 23 || min > 59) return null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

const hhmmMinutes = (v) => {
  const m = HHMM.exec(String(v || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * One order's timing. Pure: every input is passed in, including the clock.
 *   estimate_minutes  longest known item, or the office estimate; null when nothing is set
 *   missing           item names with no estimate, so the owner knows what to fill in
 *   ready_by_at       window start minus the lead, epoch ms; null without a date or window
 *   start_by_at       ready_by_at minus the estimate
 *   started_at / due_at   when prep started, and when the estimate says it should be done
 *   state             upcoming | start_now | late | cooking | over | cooking_no_estimate | ready | not_set
 */
export function orderTiming({ order, items = [], prepById = new Map(), siteLabel = null, timing = TIMING_DEFAULTS, atMs = Date.now() }) {
  const isOffice = !!order.contract_site_id;
  let estimate = null;
  const missing = [];
  if (isOffice) {
    estimate = Number.isInteger(timing.office_prep_minutes) ? timing.office_prep_minutes : null;
    if (estimate === null) missing.push('Office lunch');
  } else {
    for (const it of items) {
      const m = prepById.get(it && it.id != null ? String(it.id) : '');
      if (Number.isFinite(m)) estimate = Math.max(estimate ?? 0, m);
      else missing.push((it && (it.name || it.id)) || 'Item');
    }
  }

  let startMin = isOffice ? labelStartMinutes(siteLabel) : null;
  if (startMin === null) {
    startMin = hhmmMinutes(order.delivery_window === 'dinner' ? timing.dinner_start
      : order.delivery_window === 'lunch' ? timing.lunch_start : null);
  }
  let readyBy = null;
  if (startMin !== null && /^\d{4}-\d{2}-\d{2}$/.test(String(order.delivery_date || ''))) {
    const midnight = etMidnightMs(order.delivery_date);
    if (Number.isFinite(midnight)) readyBy = midnight + (startMin - (timing.ready_lead_minutes || 0)) * 60000;
  }
  const startBy = readyBy !== null && estimate !== null ? readyBy - estimate * 60000 : null;
  const startedAt = Number(order.prep_started_at) || null;
  const dueAt = startedAt && estimate !== null ? startedAt + estimate * 60000 : null;

  let state = 'not_set';
  if (order.status === 'ready') state = 'ready';
  else if (order.status === 'prep') state = dueAt === null ? 'cooking_no_estimate' : (atMs > dueAt ? 'over' : 'cooking');
  else if (startBy !== null) state = atMs < startBy ? 'upcoming' : (atMs > startBy + LATE_AFTER_MS ? 'late' : 'start_now');

  return { estimate_minutes: estimate, missing, ready_by_at: readyBy, start_by_at: startBy, started_at: startedAt, due_at: dueAt, state };
}
