// Añejo HUB — AI automation engine. Each automation is a pure-ish function that reads
// ops data and produces an outcome; the runner wraps it with timing, agent_runs logging,
// and tracking-plan events (automation.run + agent_task.completed). Best-effort + guarded.
// Phase 3: route_optimize / restock_suggest / payroll_prep write `suggestions` rows
// (human-in-the-loop, actioned via /api/hub/owner/suggestions); ticket_triage and
// sentiment_scan act directly (triage updates + alerts). ALL AI calls are optional and
// degrade to deterministic fallbacks without env.ANTHROPIC_API_KEY.
// Files under functions/_lib are NOT routed.
import { id, now, today, toJson, parseJson } from './hub.js';
import { captureSystem } from './track.js';
import { raiseAlert } from './alerts.js';
import { sendPushTickle } from './push.js';

const MODEL = 'claude-sonnet-4-6';
export const IMPLEMENTED = ['daily_summary', 'eod_chase', 'route_optimize', 'restock_suggest', 'ticket_triage', 'sentiment_scan', 'payroll_prep'];
export const PLANNED = [];

async function scalar(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).first();
    if (!r) return 0;
    const k = Object.keys(r)[0];
    return Number(r[k]) || 0;
  } catch { return 0; }
}

async function rows(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    return (r && r.results) || [];
  } catch { return []; }
}

// Small Claude call that must return JSON. Fully guarded: returns null on any failure
// (no key, network error, non-JSON answer) so callers always fall back deterministically.
async function askClaudeJson(env, { system, user, maxTokens = 400 }) {
  if (!env || !env.ANTHROPIC_API_KEY) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    let text = (j.content && j.content[0] && j.content[0].text || '').trim();
    if (!text) return null;
    // Tolerate code fences / leading prose around the JSON.
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const start = text.search(/[[{]/);
    if (start > 0) text = text.slice(start);
    const data = JSON.parse(text);
    const tokens = j.usage ? (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) : null;
    return { data, tokens };
  } catch { return null; }
}

// Cheap stable hash for dedupe keys (not cryptographic).
function tinyHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// The "date scope" of a suggestion payload — used to dedupe re-runs of the same automation
// for the same period without blocking suggestions for other days/periods.
function payloadScope(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.route_date || payload.period_end || payload.date || null;
}

// Insert a pending `suggestions` row. Dedupe: if an identical-type PENDING suggestion
// already exists with the same payload date scope, skip (return it instead).
// Best-effort: never throws (table may not be migrated yet).
async function makeSuggestion(env, { type, summary, payload, runId }) {
  if (!env || !env.DB || !type) return { ok: false };
  try {
    const scope = payloadScope(payload);
    const pending = await rows(env, "SELECT id, payload FROM suggestions WHERE suggestion_type=? AND status='pending' ORDER BY created_at DESC LIMIT 20", type);
    for (const p of pending) {
      const existingScope = payloadScope(parseJson(p.payload, null));
      if (existingScope === scope) return { ok: true, id: p.id, deduped: true };
    }
    const sid = id('sug');
    await env.DB
      .prepare("INSERT INTO suggestions (id, suggestion_type, summary, payload, status, source_run_id, created_at) VALUES (?,?,?,?,'pending',?,?)")
      .bind(sid, type, summary || null, toJson(payload || null), runId || null, now())
      .run();
    return { ok: true, id: sid, deduped: false };
  } catch { return { ok: false }; }
}

// --- EOD CHASE: flag active kitchen/driver staff with no EOD report for the date. ---
async function eodChase(env, date) {
  const expRes = await env.DB
    .prepare("SELECT id, name, role, team FROM staff WHERE active=1 AND role IN ('kitchen','driver')")
    .all();
  const expected = (expRes && expRes.results) || [];
  const repRes = await env.DB
    .prepare('SELECT staff_id FROM eod_reports WHERE report_date=?')
    .bind(date)
    .all();
  const filed = new Set(((repRes && repRes.results) || []).map((r) => r.staff_id));
  const missing = expected.filter((s) => !filed.has(s.id));

  for (const s of missing) {
    await raiseAlert(env, {
      alert_type: 'eod_missing',
      severity: 'warning',
      title: 'End-of-day report missing',
      body: `${s.name || s.id} (${s.role}) has not filed an EOD for ${date}.`,
      team: s.team || null,
      ref_type: 'eod_report', ref_id: s.id,
      source: 'automation',
      dedupe_key: `eod_missing:${s.id}:${date}`,
    });
    // Tracking plan: eod_report.missed — one per missing staffer, alongside the alert.
    await captureSystem(env, {
      event: 'eod_report.missed',
      role: 'system',
      team: s.team || null,
      properties: { actor_type: 'system', staff_id: s.id, report_date: date },
    });
  }
  // Nudge the people who owe the report, not only the owner — raiseAlert's push
  // targets roles:['owner'], so without this the staffer is never prompted.
  if (missing.length) {
    try { await sendPushTickle(env, { staffIds: missing.map((m) => m.id) }); } catch { /* best-effort */ }
  }
  return {
    outcome: 'success',
    output: { date, expected: expected.length, missing: missing.length, missing_staff: missing.map((m) => m.name || m.id) },
    summary: `EOD chase for ${date}: ${missing.length} of ${expected.length} reports missing.`,
  };
}

// --- DAILY SUMMARY: snapshot the day; optional AI narrative; alert if compliance low. ---
async function dailySummary(env, date) {
  const ordersOpen = await scalar(env, "SELECT COUNT(*) n FROM orders WHERE status IN ('pending','paid')");
  const onShift = await scalar(env, "SELECT COUNT(*) n FROM shifts WHERE status='open'");
  const openAlerts = await scalar(env, "SELECT COUNT(*) n FROM alerts WHERE status='open'");
  const expensesPending = await scalar(env, "SELECT COUNT(*) n FROM expenses WHERE status='pending'");
  const expected = await scalar(env, "SELECT COUNT(*) n FROM staff WHERE active=1 AND role IN ('kitchen','driver')");
  const filed = await scalar(env, 'SELECT COUNT(*) n FROM eod_reports WHERE report_date=?', date);
  const pct = expected ? Math.round((filed / expected) * 100) : null;

  const stats = { date, orders_open: ordersOpen, on_shift: onShift, open_alerts: openAlerts, expenses_pending: expensesPending, eod_filed: filed, eod_expected: expected, eod_pct: pct };

  let narrative = `Daily summary for ${date}: ${ordersOpen} open orders, ${onShift} on shift, ` +
    `${filed}/${expected} EOD reports filed${pct != null ? ` (${pct}%)` : ''}, ` +
    `${openAlerts} open alerts, ${expensesPending} expenses awaiting review.`;
  let tokens = null;

  // Optional AI polish — fully guarded; deterministic narrative stands if it fails.
  if (env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 220,
          system: 'You are the operations chief of staff for Añejo Catering Co. Write a crisp 2-3 sentence end-of-day briefing for the owner from the JSON stats. Be specific, flag anything that needs attention, no fluff.',
          messages: [{ role: 'user', content: JSON.stringify(stats) }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text = (j.content && j.content[0] && j.content[0].text || '').trim();
        if (text) narrative = text;
        if (j.usage) tokens = (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0);
      }
    } catch { /* keep deterministic narrative */ }
  }

  // Low-compliance nudge for the owner (end of day).
  if (pct != null && pct < 80) {
    await raiseAlert(env, {
      alert_type: 'eod_missing',
      severity: 'info',
      title: 'EOD compliance low',
      body: `${pct}% of EOD reports filed for ${date}.`,
      team: null, source: 'automation',
      dedupe_key: `eod_compliance_low:${date}`,
    });
  }

  return { outcome: 'success', output: { ...stats, narrative }, summary: narrative, tokens };
}

// --- ROUTE OPTIMIZE: propose a route (suggestion) for the date's unassigned orders. ---
// Deterministic plan: lunch stops before dinner, then creation order; driver with the
// fewest routes that date. Optional AI pass re-sequences the stops (guarded).
async function routeOptimize(env, date) {
  const orders = await rows(
    env,
    "SELECT o.id, o.customer_name, o.delivery_window, o.created_at FROM orders o " +
    // PAYMENT GATE: unpaid checkouts ('pending') are never proposed into a route.
    "WHERE o.delivery_date=? AND o.status IN ('paid','prep','ready') " +
    'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ' +
    'ORDER BY o.created_at',
    date
  );
  const drivers = await rows(env, "SELECT id, name FROM staff WHERE role='driver' AND active=1 ORDER BY name");
  if (!orders.length || !drivers.length) {
    return {
      outcome: 'success',
      output: { date, unassigned: orders.length, drivers: drivers.length },
      summary: 'nothing to route',
    };
  }

  // Group by window; deterministic sequence = lunch → dinner → created_at.
  const windowRank = (w) => (w === 'lunch' ? 0 : w === 'dinner' ? 1 : 2);
  const ordered = [...orders].sort((a, b) =>
    windowRank(a.delivery_window) - windowRank(b.delivery_window) || (a.created_at || 0) - (b.created_at || 0));
  const windows = { lunch: 0, dinner: 0 };
  for (const o of ordered) {
    if (o.delivery_window === 'lunch') windows.lunch++;
    else if (o.delivery_window === 'dinner') windows.dinner++;
  }

  // Driver with the fewest routes already assigned for the date.
  const loads = await rows(env, 'SELECT driver_id, COUNT(*) n FROM routes WHERE route_date=? GROUP BY driver_id', date);
  const loadBy = new Map(loads.map((l) => [l.driver_id, Number(l.n) || 0]));
  let driver = drivers[0];
  for (const d of drivers) {
    if ((loadBy.get(d.id) || 0) < (loadBy.get(driver.id) || 0)) driver = d;
  }

  // Optional AI re-sequencing — must return a permutation of the same order ids.
  let orderIds = ordered.map((o) => o.id);
  let tokens = null;
  const ai = await askClaudeJson(env, {
    system: 'You are a delivery route planner for a catering company. Given JSON stops with delivery_window (lunch is served before dinner) and created_at, return ONLY JSON {"order_ids":[...]} — every input id exactly once, sequenced for an efficient day (all lunch stops first, then dinner; earlier-created orders earlier within a window).',
    user: JSON.stringify({ date, stops: ordered.map((o) => ({ id: o.id, window: o.delivery_window, created_at: o.created_at })) }),
    maxTokens: 600,
  });
  if (ai && ai.data && Array.isArray(ai.data.order_ids)) {
    const proposed = ai.data.order_ids.map(String);
    const valid = proposed.length === orderIds.length && new Set(proposed).size === proposed.length &&
      proposed.every((oid) => orderIds.includes(oid));
    if (valid) orderIds = proposed;
    tokens = ai.tokens;
  }

  const summary = `Proposed route: ${orderIds.length} stops for ${driver.name || driver.id} on ${date}`;
  const sug = await makeSuggestion(env, {
    type: 'route_optimize',
    summary,
    payload: { route_date: date, driver_id: driver.id, order_ids: orderIds, windows },
  });

  return {
    outcome: 'success',
    output: { date, driver_id: driver.id, driver_name: driver.name || null, stop_count: orderIds.length, windows, suggestion_id: sug.id || null, deduped: !!sug.deduped },
    summary,
    tokens,
  };
}

// --- RESTOCK SUGGEST: propose a vendor PO (suggestion). Phase 4: when the kitchen
// keeps inventory_items, the proposal is the PAR GAP (items below par, qty = par - on_hand);
// the original 14-day order-demand heuristic remains the fallback for an empty table. ---
async function restockSuggest(env, date) {
  // Par-gap basis: real counts beat demand inference whenever inventory exists.
  const inv = await rows(env, 'SELECT id, name, unit, on_hand, par_level, vendor_id FROM inventory_items WHERE active=1');
  if (inv.length) {
    const below = inv.filter((it) => Number(it.par_level || 0) > 0 && Number(it.on_hand || 0) < Number(it.par_level || 0));
    if (!below.length) {
      return {
        outcome: 'success',
        output: { date, basis: 'par_gap', inventory_items: inv.length, items: [] },
        summary: 'Restock: all inventory at or above par — nothing to order.',
      };
    }
    const items = below.map((it) => ({
      name: it.name,
      qty: Math.max(1, Math.ceil(Number(it.par_level || 0) - Number(it.on_hand || 0))),
      unit: it.unit || 'ea',
      inventory_id: it.id,
    }));

    // Vendor: the most-specified vendor on the gapped items, else the busiest PO vendor.
    let vendor = null;
    const vendorVotes = new Map();
    for (const it of below) {
      if (it.vendor_id) vendorVotes.set(it.vendor_id, (vendorVotes.get(it.vendor_id) || 0) + 1);
    }
    if (vendorVotes.size) {
      const topVendorId = [...vendorVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const v = await rows(env, "SELECT id, name FROM staff WHERE id=? AND role='vendor' AND active=1", topVendorId);
      if (v.length) vendor = v[0];
    }
    if (!vendor) {
      const byPos = await rows(
        env,
        "SELECT s.id, s.name, COUNT(ro.id) n FROM staff s LEFT JOIN restock_orders ro ON ro.vendor_id = s.id " +
        "WHERE s.role='vendor' AND s.active=1 GROUP BY s.id ORDER BY n DESC, s.name LIMIT 1"
      );
      if (byPos.length) vendor = byPos[0];
    }

    const summary = `Restock: ${items.length} items below par`;
    const sug = await makeSuggestion(env, {
      type: 'restock_suggest',
      summary,
      payload: { vendor_id: vendor ? vendor.id : null, items, date, basis: 'par_gap' },
    });

    return {
      outcome: 'success',
      output: { date, basis: 'par_gap', inventory_items: inv.length, item_count: items.length, vendor_id: vendor ? vendor.id : null, vendor_name: vendor ? vendor.name : null, items, suggestion_id: sug.id || null, deduped: !!sug.deduped },
      summary,
    };
  }

  // Fallback (no inventory rows yet): infer from 14 days of order demand.
  const since = now() - 14 * 24 * 60 * 60 * 1000;
  const recent = await rows(env, "SELECT items FROM orders WHERE created_at >= ? AND status NOT IN ('canceled') LIMIT 1000", since);

  // Aggregate item demand from orders.items JSON.
  const demand = new Map();
  for (const r of recent) {
    const items = parseJson(r.items, []);
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const name = (it && it.name || '').toString().trim();
      if (!name) continue;
      const qty = Number(it.qty) || 1;
      demand.set(name, (demand.get(name) || 0) + qty);
    }
  }
  if (!demand.size) {
    return { outcome: 'success', output: { date, orders_scanned: recent.length, items: [] }, summary: 'No order demand in the last 14 days — nothing to restock.' };
  }

  // Top items by 14-day qty → proposed PO lines (half the trailing demand, min 1).
  const top = [...demand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  let items = top.map(([name, qty]) => ({ name, qty: Math.max(1, Math.ceil(qty * 0.5)), unit: 'ea' }));

  // Optional AI refinement: tune quantities, add kitchen staples. Guarded; must be JSON.
  let tokens = null;
  const ai = await askClaudeJson(env, {
    system: 'You are a kitchen purchasing assistant for a catering company. Given proposed restock lines derived from 14 days of order demand, refine quantities and add obvious missing staples (oil, rice, beans, foil, containers...). Return ONLY JSON {"items":[{"name":"...","qty":1,"unit":"ea"}]} with at most 20 items, integer qty >= 1.',
    user: JSON.stringify({ date, demand_14d: top.map(([name, qty]) => ({ name, qty })), proposed: items }),
    maxTokens: 700,
  });
  if (ai && ai.data && Array.isArray(ai.data.items)) {
    const refined = ai.data.items
      .map((it) => ({ name: (it && it.name || '').toString().trim().slice(0, 80), qty: Math.max(1, Math.ceil(Number(it.qty) || 1)), unit: ((it && it.unit) || 'ea').toString().slice(0, 12) }))
      .filter((it) => it.name)
      .slice(0, 20);
    if (refined.length) items = refined;
    tokens = ai.tokens;
  }

  // Pick a vendor: the one with the most POs, else any active vendor, else null.
  let vendor = null;
  const byPos = await rows(
    env,
    "SELECT s.id, s.name, COUNT(ro.id) n FROM staff s LEFT JOIN restock_orders ro ON ro.vendor_id = s.id " +
    "WHERE s.role='vendor' AND s.active=1 GROUP BY s.id ORDER BY n DESC, s.name LIMIT 1"
  );
  if (byPos.length) vendor = byPos[0];

  const summary = `Restock: ${items.length} items proposed from last 14 days of orders`;
  const sug = await makeSuggestion(env, {
    type: 'restock_suggest',
    summary,
    payload: { vendor_id: vendor ? vendor.id : null, items, date },
  });

  return {
    outcome: 'success',
    output: { date, orders_scanned: recent.length, item_count: items.length, vendor_id: vendor ? vendor.id : null, vendor_name: vendor ? vendor.name : null, items, suggestion_id: sug.id || null, deduped: !!sug.deduped },
    summary,
    tokens,
  };
}

// --- TICKET TRIAGE: classify untriaged open tickets; escalate urgent. Direct action. ---
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, urgent: 3 };
const URGENT_RE = /brake|fire|injur|burn|leak|sick/i;

function heuristicSeverity(ticket) {
  const text = `${ticket.title || ''} ${ticket.body || ''}`;
  if (URGENT_RE.test(text)) return { severity: 'urgent', rationale: 'Safety keyword detected (heuristic).' };
  if (ticket.ticket_type === 'complaint' || /complaint/i.test(text)) return { severity: 'medium', rationale: 'Customer complaint (heuristic).' };
  return { severity: ticket.severity || 'low', rationale: 'No escalation keywords found (heuristic).' };
}

async function ticketTriage(env, date) {
  const tickets = await rows(env, "SELECT id, ticket_type, severity, title, body FROM tickets WHERE status='open' AND ai_triaged=0 ORDER BY created_at LIMIT 20");
  if (!tickets.length) {
    return { outcome: 'success', output: { date, scanned: 0, escalated: 0, urgent: 0 }, summary: 'Ticket triage: no untriaged open tickets.' };
  }

  let escalated = 0, urgent = 0, tokens = 0;
  for (const tk of tickets) {
    let verdict = heuristicSeverity(tk);
    const ai = await askClaudeJson(env, {
      system: 'You are a triage assistant for a catering operations team. Classify the ticket severity as one of low|medium|high|urgent (urgent = safety, injury, fire, vehicle, food-safety risk). Return ONLY JSON {"severity":"...","rationale":"one short sentence"}.',
      user: JSON.stringify({ ticket_type: tk.ticket_type, title: tk.title, body: (tk.body || '').slice(0, 1500) }),
      maxTokens: 120,
    });
    if (ai && ai.data && SEVERITY_RANK[ai.data.severity] != null) {
      verdict = { severity: ai.data.severity, rationale: (ai.data.rationale || '').toString().slice(0, 240) || 'Classified by AI triage.' };
      tokens += ai.tokens || 0;
    }

    // Never downgrade: keep the higher of current vs classified severity.
    const current = SEVERITY_RANK[tk.severity] != null ? tk.severity : 'low';
    const severity = SEVERITY_RANK[verdict.severity] > SEVERITY_RANK[current] ? verdict.severity : current;
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[current]) escalated++;

    try {
      await env.DB
        .prepare('UPDATE tickets SET ai_triaged=1, severity=?, body=COALESCE(body,\'\') || ?, updated_at=? WHERE id=?')
        .bind(severity, `\n[AI triage] ${verdict.rationale}`, now(), tk.id)
        .run();
    } catch { /* best-effort per ticket */ }

    if (severity === 'urgent') {
      urgent++;
      await raiseAlert(env, {
        alert_type: 'negative_sentiment',
        severity: 'critical',
        title: 'Urgent ticket needs attention',
        body: `${tk.title || tk.id}: ${verdict.rationale}`,
        ref_type: 'ticket', ref_id: tk.id,
        source: 'automation',
        dedupe_key: `ticket:${tk.id}`,
      });
    }
  }

  return {
    outcome: 'success',
    output: { date, scanned: tickets.length, escalated, urgent },
    summary: `Ticket triage: ${tickets.length} tickets scanned, ${escalated} escalated, ${urgent} urgent.`,
    tokens: tokens || null,
  };
}

// --- SENTIMENT SCAN: screen last-24h comms text for negative signals → alerts. ---
const NEGATIVE_LEXICON = [
  'angry', 'late', 'broken', 'refund', 'complaint', 'unsafe', 'quit', 'frustrated',
  'missing', 'wrong', 'cold food', 'never again', 'rude', 'spoiled', 'damaged',
  'terrible', 'awful', 'upset', 'cancel my', 'disgust',
];

async function sentimentScan(env, date) {
  const since = now() - 24 * 60 * 60 * 1000;
  const corpus = [];
  for (const m of await rows(env, 'SELECT body, direction, sender_role FROM messages WHERE created_at >= ? AND body IS NOT NULL LIMIT 200', since)) {
    corpus.push({ source: m.direction === 'inbound' ? 'message:inbound' : `message:${m.sender_role || 'staff'}`, text: m.body });
  }
  for (const r of await rows(env, 'SELECT summary, blockers FROM eod_reports WHERE created_at >= ? LIMIT 100', since)) {
    const text = [r.summary, r.blockers].filter(Boolean).join(' — ');
    if (text) corpus.push({ source: 'eod_report', text });
  }
  for (const tk of await rows(env, 'SELECT title, body FROM tickets WHERE created_at >= ? LIMIT 100', since)) {
    const text = [tk.title, tk.body].filter(Boolean).join(' — ');
    if (text) corpus.push({ source: 'ticket', text });
  }
  if (!corpus.length) {
    return { outcome: 'success', output: { date, scanned: 0, flags: 0 }, summary: 'Sentiment scan: no comms in the last 24h.' };
  }

  // Deterministic screen: lowercase lexicon match, one flag per matching text.
  let flags = [];
  for (const c of corpus) {
    const low = c.text.toLowerCase();
    const hit = NEGATIVE_LEXICON.find((w) => low.includes(w));
    if (hit) flags.push({ source: c.source, quote: c.text.slice(0, 140), reason: `matched "${hit}"` });
  }

  // Optional AI verdict over the (truncated) corpus — replaces the lexicon flags if valid.
  let tokens = null;
  let body = '';
  for (const c of corpus) {
    const line = `[${c.source}] ${c.text}\n`;
    if (body.length + line.length > 4000) break;
    body += line;
  }
  const ai = await askClaudeJson(env, {
    system: 'You scan internal catering-ops messages for negative sentiment that the owner should see (angry customers, unsafe conditions, staff about to quit, failed deliveries). Return ONLY JSON {"flags":[{"source":"...","quote":"verbatim excerpt","reason":"short"}]} — empty array if nothing notable. Max 10 flags.',
    user: body,
    maxTokens: 700,
  });
  if (ai && ai.data && Array.isArray(ai.data.flags)) {
    flags = ai.data.flags
      .map((f) => ({ source: (f && f.source || 'message').toString().slice(0, 40), quote: (f && f.quote || '').toString().slice(0, 140), reason: (f && f.reason || '').toString().slice(0, 120) }))
      .filter((f) => f.quote)
      .slice(0, 10);
    tokens = ai.tokens;
  }

  for (const f of flags) {
    await raiseAlert(env, {
      alert_type: 'negative_sentiment',
      severity: 'warning',
      title: 'Negative sentiment detected',
      body: `"${f.quote}" (${f.source})`,
      source: 'automation',
      dedupe_key: `sent:${date}:${tinyHash(f.quote)}`,
    });
  }

  return {
    outcome: 'success',
    output: { date, scanned: corpus.length, flags: flags.length, flagged: flags },
    summary: `Sentiment scan: ${corpus.length} texts scanned, ${flags.length} flagged.`,
    tokens,
  };
}

// --- PAYROLL PREP: 14-day closed-shift hours per staff → suggestion for owner review. ---
async function payrollPrep(env, date) {
  const periodEnd = date;
  const periodStart = (() => {
    try {
      const d = new Date(`${date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 14);
      return d.toISOString().slice(0, 10);
    } catch { return date; }
  })();
  const since = now() - 14 * 24 * 60 * 60 * 1000;

  const shifts = await rows(
    env,
    "SELECT sh.staff_id, sh.clock_in_at, sh.clock_out_at, sh.total_minutes, sh.break_minutes, " +
    'st.name, st.role, st.pay_rate_cents ' +
    "FROM shifts sh JOIN staff st ON st.id = sh.staff_id " +
    "WHERE sh.status='closed' AND sh.clock_in_at >= ? ORDER BY sh.staff_id",
    since
  );
  if (!shifts.length) {
    return { outcome: 'success', output: { period_start: periodStart, period_end: periodEnd, rows: [] }, summary: 'Payroll prep: no closed shifts in the last 14 days.' };
  }

  const byStaff = new Map();
  for (const sh of shifts) {
    let agg = byStaff.get(sh.staff_id);
    if (!agg) {
      agg = { staff_id: sh.staff_id, name: sh.name || sh.staff_id, role: sh.role || null, pay_rate_cents: sh.pay_rate_cents || null, minutes: 0, break_minutes: 0 };
      byStaff.set(sh.staff_id, agg);
    }
    let mins = Number(sh.total_minutes);
    if (!mins && sh.clock_out_at && sh.clock_in_at) mins = Math.round((sh.clock_out_at - sh.clock_in_at) / 60000);
    agg.minutes += Math.max(0, mins || 0);
    agg.break_minutes += Math.max(0, Number(sh.break_minutes) || 0);
  }

  const table = [...byStaff.values()].map((a) => {
    const hours = Math.round((a.minutes / 60) * 100) / 100;
    return {
      staff_id: a.staff_id,
      name: a.name,
      role: a.role,
      hours,
      break_minutes: a.break_minutes,
      est_pay_cents: a.pay_rate_cents ? Math.round(hours * a.pay_rate_cents) : null,
    };
  }).sort((x, y) => y.hours - x.hours);
  const totalHours = Math.round(table.reduce((s, r) => s + r.hours, 0) * 10) / 10;

  const summary = `Payroll prep: ${table.length} staff, ${totalHours} total hours (last 14d)`;
  const sug = await makeSuggestion(env, {
    type: 'payroll_prep',
    summary,
    payload: { period_start: periodStart, period_end: periodEnd, rows: table },
  });

  return {
    outcome: 'success',
    output: { period_start: periodStart, period_end: periodEnd, staff_count: table.length, total_hours: totalHours, rows: table, suggestion_id: sug.id || null, deduped: !!sug.deduped },
    summary,
  };
}

const RUNNERS = {
  daily_summary: dailySummary,
  eod_chase: eodChase,
  route_optimize: routeOptimize,
  restock_suggest: restockSuggest,
  ticket_triage: ticketTriage,
  sentiment_scan: sentimentScan,
  payroll_prep: payrollPrep,
};

// Public runner: times, logs agent_runs, fires automation.run + agent_task.completed.
export async function runAutomation(env, type, opts = {}) {
  if (!env || !env.DB) return { ok: false, error: 'no_db' };
  const date = opts.date || today();
  const runner = RUNNERS[type];
  if (!runner) {
    return { ok: false, error: 'not_implemented', type, planned: PLANNED.includes(type) };
  }

  const started = now();
  let result, outcome = 'success', errMsg = null;
  try {
    result = await runner(env, date);
    outcome = result.outcome || 'success';
  } catch (e) {
    outcome = 'failed';
    errMsg = String(e && e.message || e).slice(0, 500);
    result = { output: null, summary: 'Automation failed.' };
  }
  const finished = now();
  const duration = finished - started;

  // Log the agent run (best-effort).
  try {
    await env.DB
      .prepare(
        'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
        "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
      )
      .bind(id('run'), type, type, outcome, toJson({ date, triggered_by: opts.triggeredBy || 'manual' }),
        toJson(result.output || null), duration, result.tokens || null, errMsg, started, finished, started)
      .run();
  } catch { /* best-effort */ }

  // Tracking-plan events.
  await captureSystem(env, { event: 'automation.run', role: 'system', properties: { automation_type: type, outcome } });
  await captureSystem(env, { event: 'agent_task.completed', role: 'system', properties: { task_type: type, duration_ms: duration, tokens: result.tokens || undefined } });

  return { ok: outcome !== 'failed', type, date, outcome, duration_ms: duration, summary: result.summary, output: result.output, error: errMsg };
}
