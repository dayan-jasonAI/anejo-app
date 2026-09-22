// GET  /api/hub/kitchen/event                 — the booked events coming up
// GET  /api/hub/kitchen/event?id=cq_…         — the full production plan for one event
// POST /api/hub/kitchen/event  { op:'task' }  — tick or untick a task on the plan
// POST /api/hub/kitchen/event  { op:'details' } — set the serving time, address and theme
// POST /api/hub/kitchen/event  { op:'link_brief' } — copy those facts across from the design request
//
// Kitchen and owner. This is the surface that was missing: the HUB sold the event, took the
// deposit and held the menu, and the kitchen had no screen on which the event existed.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { eventPlan, setEventTask, setEventDetails, briefCandidates, upcomingEvents } from '../../../_lib/event.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const quoteId = url.searchParams.get('id');
  try {
    if (!quoteId) return json({ ok: true, events: await upcomingEvents(env) });
    const plan = await eventPlan(env, quoteId);
    if (!plan.ok) return bad(plan.error, 404);
    // Only worth offering a brief when the event is still missing what a brief would supply.
    const missing = !plan.event.serving_time || !plan.event.address || !plan.event.theme;
    const candidates = missing
      ? await briefCandidates(env, { guests: plan.event.guests })
      : [];
    return json({ ...plan, brief_candidates: candidates });
  } catch (e) {
    return bad('Could not build the event plan: ' + String((e && e.message) || e).slice(0, 160), 500);
  }
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = String(b.op || '');
  try {
    if (op === 'task') {
      const r = await setEventTask(env, b, ctx);
      return r.ok ? json(r) : bad(r.error);
    }
    if (op === 'details') {
      const r = await setEventDetails(env, b);
      return r.ok ? json(r) : bad(r.error);
    }
    if (op === 'link_brief') {
      if (!b.quote_id || !b.lead_id) return bad('Which event, and which design request?');
      const quote = await env.DB.prepare('SELECT id, guests FROM catering_quotes WHERE id = ?').bind(b.quote_id).first();
      if (!quote) return bad('No event with that id.', 404);
      const brief = (await briefCandidates(env, quote)).find((c) => c.lead_id === b.lead_id);
      if (!brief) return bad('That design request does not match this event.');
      // Only fills what is blank: a fact the kitchen has already corrected is not overwritten.
      const current = await env.DB.prepare('SELECT serving_time, address, theme, colors, dietary_notes FROM catering_quotes WHERE id = ?').bind(b.quote_id).first();
      const patch = { quote_id: b.quote_id, source_lead_id: b.lead_id };
      for (const k of ['serving_time', 'address', 'theme', 'colors', 'dietary_notes']) {
        if (!current[k] && brief[k]) patch[k] = brief[k];
      }
      const r = await setEventDetails(env, patch);
      return r.ok ? json({ ...r, applied: patch }) : bad(r.error);
    }
    return bad('Unknown action.');
  } catch (e) {
    return bad('Could not save: ' + String((e && e.message) || e).slice(0, 160), 500);
  }
};
