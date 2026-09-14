// What the marketing team is allowed to treat as true about WHAT AÑEJO SELLS and HOW IT IS SOLD.
// Files under functions/_lib are NOT routed.
//
// WHY THIS FILE EXISTS. Two defects, the same shape, found on 2026-09-10:
//
//   1. THE TEAM WAS BOWL-ONLY. The weekly planner filtered the catalog to `kind === 'bowl'` and
//      skipped the whole run when no bowl was on sale; the Team Lead's spine did the same and
//      added drinks as an afterthought. But the live catalog is mostly NOT bowls — every
//      traditional plate, croqueta, empanada, tres leches, cajita and catering tray is a real
//      menu_items row (ids `traditional_*` / `catering_*`, see scripts/menu-2026-09/generate.mjs),
//      and none of them could be promoted because none of them was ever shown. A marketing team
//      that cannot see two thirds of the business writes bowl posts forever, which is exactly the
//      rut the Instagram account was in.
//
//   2. THE TEAM STATED STALE OPERATIONS. "Next-day orders until 8 PM ET", "the 6:00 PM day-before
//      cutoff", "wholesale for venues" — hard-coded sentences that were true once and are prose
//      now. The cutoff is the OWNER'S DIAL (ops.order_by_hour), the Añejo Daily cutoff is a
//      SECOND owner dial (daily.cutoff_time), and a caption that prints either from memory sends
//      a reader to a window that does not exist.
//
// So: one place that reads the LIVE menu, the LIVE ordering settings and the LIVE Añejo Daily
// settings, groups the catalog by the product families the brand brief itself names, and renders
// all of it as prompt text. Three consumers (planner, Team Lead, Aña) instead of three drifting
// copies.
//
// THE PRIVACY BOUNDARY, stated once and enforced by construction: NOTHING in this file may reach
// institutional (clinic/office contract) data. Añejo Daily shares a MEAL DEFINITION with the
// institutional rotating menu Mon–Wed, and that is all marketing is allowed to know — publicDaily()
// is the scrubbed, public-safe view and is the only Daily reader used here. productionFor() (the
// function that adds institutional headcount to public portions) is deliberately NOT imported, and
// a test pins that it never becomes imported.
import { BRAND_BRIEF } from './brand_brief.js';
import { loadMenu, isAvailable, isOrderable } from './menu.js';
import { loadOperating, describe as describeOps, DEFAULTS as OPS_DEFAULTS } from './operating.js';
import { loadOrderingSettings, onDemandConfig, windowState } from './ondemand.js';
import { loadDailySettings, publicDaily, fmtCutoff } from './daily.js';

/**
 * One numbered section of the brand brief, verbatim ("## 3. Our three product lines" → its text).
 *
 * The brief is the authority on identity, and brand_brief.js is GENERATED from the markdown
 * (a test asserts they match byte-for-byte), so a helper cannot live in that file. It lives here
 * instead, and automations.js's productLines() calls it rather than keeping a second copy of the
 * same six lines of string slicing.
 */
export function briefSection(heading) {
  const start = BRAND_BRIEF.indexOf(heading);
  if (start === -1) return '';
  // The section ends at the next heading of the SAME OR SHALLOWER level — "### B. Añejo
  // Traditional" ends at "### C. Añejo Fit", not only at the next "## 4.". Matching on '##' alone
  // is how a request for one product line returned all three plus the shopping routes.
  const level = (heading.match(/^#+/) || ['##'])[0].length;
  const stop = new RegExp(`^#{1,${level}} `, 'm');
  const rest = BRAND_BRIEF.slice(start);
  const end = rest.slice(heading.length).search(stop);
  return (end === -1 ? rest : rest.slice(0, heading.length + end)).trim();
}

/**
 * The product families, in the order the brand brief and the order page put them.
 *
 * `match` decides which live menu_items row belongs where, and it reads the row's OWN id and kind
 * rather than a hand-kept list of SKUs — the whole point being that a product the owner adds in
 * the HUB tomorrow is promotable tomorrow, not after someone edits an array here. The id prefixes
 * are the real scheme the menu was generated from: `traditional_<base>` is a single plate/piece,
 * `catering_<base>-<n>` is the tray of n, and anything with `cajita` in it is La Cajita whichever
 * of the two it is packaged as.
 *
 * `blurb_heading` points at the brief section that DEFINES the family, so the description the
 * model reads is the owner's own words and moves when he edits them.
 */
export const FAMILIES = [
  {
    key: 'daily', label: 'Añejo Daily',
    surface: 'anejocateringco.com/order',
    match: (it) => it.kind === 'daily',
    note: "One featured lunch per service date, sold from a small public allocation, ordered the SAME DAY until that day's cutoff. Delivery only.",
  },
  {
    key: 'traditional', label: 'Traditional Cuban',
    surface: 'anejocateringco.com/order',
    blurb_heading: '### B. Añejo Traditional',
    match: (it) => /^traditional_/.test(it.id) && !/cajita/.test(it.id),
  },
  {
    key: 'catering', label: 'Catering & Events',
    surface: 'anejocateringco.com/catering',
    blurb_heading: '### A. Añejo Catering',
    match: (it) => /^catering_/.test(it.id) && !/cajita/.test(it.id),
    note: 'Trays and spreads by the count. Scheduled delivery only — never promise same-day catering.',
  },
  {
    key: 'cajita', label: 'La Cajita',
    surface: 'anejocateringco.com/cajita-builder',
    match: (it) => /cajita/.test(it.id),
    note: 'Individually packed boxes, personalized per event. Custom printing is quote-only.',
  },
  {
    key: 'fit', label: 'Añejo Fit',
    surface: 'anejocateringco.com/order',
    blurb_heading: '### C. Añejo Fit',
    match: (it) => it.kind === 'bowl',
    note: 'Includes the free macro calculator (/calculator), the Macro Portal and the weekly goal-sized meal plans (/subscribe) — services inside Fit, not a separate family.',
  },
  {
    key: 'drinks', label: 'Drinks & add-ons',
    surface: 'anejocateringco.com/order',
    match: (it) => it.kind === 'drink' || it.kind === 'addon',
  },
  {
    key: 'institutional', label: 'Institutional (office & clinic meal service)',
    surface: 'anejocateringco.com/catering',
    match: () => false,   // never a catalog row: it is a contract, not a SKU
    note:
      'Standing weekday meal service for offices and clinics, on a rotating menu. GENERIC ONLY: ' +
      'you are never given, and may never name, an account, a headcount, a patient, or anything ' +
      'else from a contract. Write about the service; never about a customer.',
  },
];

const usd = (cents) => Math.round(Number(cents) || 0) / 100;

/** One catalog row as marketing needs to see it: what it is, what it costs, whether it sells. */
function describeRow(it) {
  return {
    id: it.id,
    name: it.name || String(it.id).toUpperCase(),
    kind: it.kind,
    price_usd: usd(it.price_cents),
    // Sold-out is not "missing": the model must be told it exists AND that it may not be promoted.
    available: isAvailable(it) && isOrderable(it),
    description: String(it.description || '').trim(),
    // The approved catalog image. Mostly .webp, which Instagram will not take — the owner's browser
    // stages a JPEG derivative at attach time (see public/hub/owner/marketing.html), so the model
    // may KNOW a picture exists without anything here pretending it is post-ready.
    image: it.image || null,
  };
}

/**
 * Every sellable product family, from the live catalog. Never throws.
 *
 * `cap` bounds how many rows of one family are listed — the traditional/catering families run to
 * hundreds of SKUs (every flavour × every tray size), and a prompt carrying all of them would cost
 * more than the campaign. The count is reported alongside, so "22 of 214 shown" is visible to the
 * model rather than looking like the whole catalog.
 */
export async function productFamilies(env, { menu, daily, cap = 24 } = {}) {
  const m = menu || await loadMenu(env);
  const items = (m && m.items) || [];
  // FIRST MATCH WINS, in FAMILIES order. The ids overlap on purpose — `traditional_lechon` is a
  // menu_items row of kind 'addon', so a plate would otherwise land in BOTH "Traditional Cuban"
  // and "Drinks & add-ons" and be counted twice. Ordering the families and claiming each row once
  // is what keeps "Drinks & add-ons" meaning drinks and sauces rather than the whole kitchen.
  const claimed = new Set();
  const out = [];
  for (const fam of FAMILIES) {
    const rows = items.filter((it) => {
      if (claimed.has(it.id)) return false;
      let hit = false;
      try { hit = !!fam.match(it); } catch { hit = false; }
      if (hit) claimed.add(it.id);
      return hit;
    });
    // Available first, then cheapest — an on-sale item is the one worth a post, and a family
    // truncated to its 24 most expensive trays would read as a different business.
    rows.sort((a, b) => (isAvailable(b) - isAvailable(a)) || ((a.price_cents || 0) - (b.price_cents || 0)));
    out.push({
      key: fam.key,
      label: fam.label,
      surface: fam.surface,
      note: fam.note || '',
      blurb: fam.blurb_heading ? briefSection(fam.blurb_heading) : '',
      total: rows.length,
      on_sale: rows.filter((it) => isAvailable(it) && isOrderable(it)).length,
      items: rows.slice(0, cap).map(describeRow),
    });
  }
  // Añejo Daily's live schedule rides on its own family — the catalog row is the meal DEFINITION,
  // and what the team needs to promote is the DATE it is being sold on. Public view only.
  const d = daily === undefined ? await dailyMarketingContext(env) : daily;
  const dailyFam = out.find((f) => f.key === 'daily');
  if (dailyFam) dailyFam.daily = d;
  return out;
}

/** True when at least one thing, anywhere in the catalog, can actually be bought right now. */
export const anythingSellable = (families) => families.some((f) => f.on_sale > 0);

/** The families as prompt text. Absent facts are stated as absent, never left to be guessed. */
export function renderFamilies(families) {
  const lines = [];
  for (const f of families) {
    if (f.key === 'institutional') {
      lines.push(`\n— ${f.label} — ${f.surface}\n  ${f.note}`);
      continue;
    }
    const head = `\n— ${f.label} — ${f.surface}` +
      (f.total ? ` (${f.on_sale} of ${f.total} on sale right now${f.total > f.items.length ? `, ${f.items.length} listed below` : ''})` : ' (nothing in the catalog right now)');
    lines.push(head);
    if (f.note) lines.push(`  ${f.note}`);
    if (f.blurb) lines.push(f.blurb.split('\n').map((l) => `  ${l}`).join('\n'));
    for (const it of f.items) {
      lines.push(`  · ${it.name} ($${it.price_usd.toFixed(2)})` +
        (it.available ? '' : ' — OFF SALE right now, do not promote it') +
        (it.description ? ` — ${it.description}` : '') +
        (it.image ? ` [catalog photo: ${it.image}]` : ''));
    }
    if (f.key === 'daily' && f.daily) lines.push(renderDailyContext(f.daily).split('\n').map((l) => `  ${l}`).join('\n'));
  }
  return lines.join('\n');
}

/**
 * HOW ORDERING ACTUALLY WORKS, read from the dials rather than remembered.
 *
 * Every field here is either an owner setting or derived from one. `delivery_only` is the single
 * hard-coded fact, and it is hard-coded because it is TRUE and load-bearing: Añejo has no pickup,
 * has never had pickup, and a caption offering one sends someone to a door that does not open.
 * Never throws — a settings read that fails yields the same defaults the storefront itself uses.
 */
export async function orderingFacts(env, { nowDate = new Date() } = {}) {
  // loadOperating already merges DEFAULTS and never throws; the belt-and-braces here is so a
  // future change to it can never leave describe() rendering "undefined–undefined" into a prompt.
  let ops = { ...OPS_DEFAULTS };
  try { ops = { ...OPS_DEFAULTS, ...(await loadOperating(env)) }; } catch { ops = { ...OPS_DEFAULTS }; }
  let over = {};
  try { over = await loadOrderingSettings(env); } catch { over = {}; }
  let daily = null;
  try { daily = await loadDailySettings(env); } catch { daily = null; }

  const described = describeOps(ops);
  const cfg = onDemandConfig(env, over);
  const win = windowState(env, nowDate, over);
  const hr12 = (h, m) => `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  return {
    delivery_only: true,
    area_label: described.area_label || '',
    delivery_days: described.days,
    // "6 PM the day before" — but the HOUR comes from ops.order_by_hour, wherever it currently sits.
    scheduled_order_by: described.order_by,
    lunch_window: described.lunch,
    dinner_window: described.dinner,
    same_day_available: !cfg.scheduledOnly,
    same_day_window: cfg.scheduledOnly
      ? null
      : `${hr12(cfg.openHour, 0)}–${hr12(cfg.closeHour, cfg.closeMinute)} ET`,
    same_day_open_now: !!win.open,
    daily_cutoff_label: daily ? fmtCutoff(daily.cutoff_time) : null,
  };
}

/** The ordering facts as prompt text — the ONLY version of them a caption may state. */
export function renderOrderingFacts(f) {
  const lines = [
    'DELIVERY ONLY — Añejo has no pickup. Never offer one.',
    f.area_label ? `Delivery area: ${f.area_label}.` : 'Delivery area: set in the HUB — do not state one you were not given.',
    `Delivery days: ${f.delivery_days}. Lunch ${f.lunch_window}, dinner ${f.dinner_window} (ET).`,
    `Scheduled delivery is ordered by ${f.scheduled_order_by} — a rolling daily cutoff, not a weekly one. ` +
    'There is no "order by Wednesday" and no weekly deadline of any kind.',
    f.same_day_available
      ? `Same-day delivery is available during opening hours (${f.same_day_window}).`
      : 'Same-day ordering is OFF right now — everything is scheduled for a later date.',
  ];
  if (f.daily_cutoff_label) {
    lines.push(`Añejo Daily is ordered the SAME DAY until ${f.daily_cutoff_label} ET, from that day's small allocation. ` +
      'That cutoff is an owner setting and can be overridden for one date — state the one you were given above, never a remembered hour.');
  }
  lines.push('Every hour above is an owner setting that moves. If a cutoff is not stated here, you do not know it — ' +
    'say "anejocateringco.com/order shows what is open right now" instead of naming a time.');
  return lines.join('\n');
}

/**
 * Añejo Daily, as marketing is allowed to see it: READ-ONLY, PUBLIC-SAFE.
 *
 * publicDaily() is what the storefront itself serves — the dish, its tier price, the allocation,
 * what is left, the cutoff and the status, and nothing else. It carries no institutional data at
 * all, which is the point: Mon–Wed the Daily is the same DISH the institutional rotating menu
 * names, and the team may say so in generic terms ("aligned with our office & clinic meal
 * service") while never being able to name an account, a headcount or a patient, because none of
 * those ever reach this object.
 *
 * Never throws: a Daily that cannot be read is reported as not scheduled, which is honest — it is
 * exactly the state a caption may not promote.
 */
export async function dailyMarketingContext(env, { nowDate = new Date() } = {}) {
  let pub = null;
  try { pub = await publicDaily(env, { nowDate }); } catch { pub = null; }
  const day = (v) => {
    if (!v) return null;
    return {
      date: v.date,
      weekday: v.weekday,
      name: (v.item && v.item.name) || null,
      description: (v.item && v.item.description) || '',
      image: (v.item && v.item.image) || null,
      price_usd: usd(v.item && v.item.price_cents),
      allocation: v.allocation,
      remaining: v.remaining,
      cutoff_label: v.cutoff_label,
      status: v.status,                       // open | sold_out | closed | unavailable
      sold_out: v.status === 'sold_out' || v.remaining <= 0,
      // Mon–Wed the Daily and the institutional rotating menu are the same meal definition. This
      // boolean is the WHOLE of what marketing may know about that relationship.
      institutional_aligned: v.weekday >= 1 && v.weekday <= 3,
    };
  };
  return {
    scheduled: !!(pub && (pub.today || pub.next)),
    today: day(pub && pub.today),
    next: day(pub && pub.next),
    default_cutoff_label: (pub && pub.cutoff_label) || null,
  };
}

/** The Daily context as prompt text, including what may NOT be said about it. */
export function renderDailyContext(ctx) {
  const line = (label, d) => {
    if (!d) return `${label}: nothing scheduled — do not promise one.`;
    return `${label}: ${d.name} ($${d.price_usd.toFixed(2)}) on ${d.date}` +
      ` — ${d.allocation} portions allocated, ${d.remaining} left, orders close ${d.cutoff_label} ET` +
      ` [${d.status}${d.sold_out ? ', SOLD OUT — do not invite orders' : ''}]` +
      (d.description ? `\n    ${d.description}` : '') +
      (d.image ? `\n    catalog photo: ${d.image}` : '') +
      (d.institutional_aligned
        ? '\n    Today this dish is also what our office & clinic meal service is eating. You may say it ' +
          'that way and no other way — never name an account, a headcount, a patient or a clinic.'
        : '');
  };
  return [
    '=== AÑEJO DAILY (read-only, public view) ===',
    line('Today', ctx.today),
    line('Next', ctx.next),
    ctx.default_cutoff_label ? `Default cutoff when a date sets none: ${ctx.default_cutoff_label} ET.` : '',
    'Añejo Daily is DELIVERY ONLY, same-day, from a small allocation that can sell out. Never state a ' +
    'portion count, a cutoff or a price you were not given above.',
  ].filter(Boolean).join('\n');
}

/**
 * Everything above in one read, for a caller that needs all three (the planner and the Team Lead
 * both do). Gathering once means the menu is read once and the three sections cannot disagree
 * about what was on sale at the moment the prompt was built.
 */
export async function marketingContext(env, { nowDate = new Date(), cap } = {}) {
  const menu = await loadMenu(env);
  const daily = await dailyMarketingContext(env, { nowDate });
  const [families, ordering] = [
    await productFamilies(env, { menu, daily, cap }),
    await orderingFacts(env, { nowDate }),
  ];
  return { menu, families, ordering, daily };
}

/** The whole marketing context as prompt text. */
export function renderMarketingContext(ctx) {
  return (
    '=== WHAT AÑEJO SELLS (the live catalog — promote across ALL of it, not only bowls) ===\n' +
    'Añejo Catering Co. is a Cuban catering company in Palm Beach County. Its lines are catering & ' +
    'events, traditional Cuban plates and bites, La Cajita, Añejo Fit, Añejo Daily, packaged drinks, ' +
    'and a standing office & clinic meal service. These prices and availability are read live and ' +
    'are the only ones that exist.' +
    renderFamilies(ctx.families) + '\n\n' +
    '=== HOW ORDERING ACTUALLY WORKS (owner settings, read live — the only version you may state) ===\n' +
    renderOrderingFacts(ctx.ordering)
  );
}
