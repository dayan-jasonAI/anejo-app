// GET/POST /api/hub/owner/intel — the owner's window onto the Intel Bench. Owner-only.
//
// GET returns the freshest brief of each kind plus the request queue, so the page can show
// "here is what we know, here is what is being looked into" in one round trip. POST files a
// question; the intel tick answers it on its next run — research runs on the cron's budget
// clock, never inline in a page request that would sit for 30 seconds of web searching.
import { json, bad, id, now, parseJson } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

const KINDS = ['competitor', 'market', 'platform', 'adhoc'];

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  // Newest brief per kind. Four indexed point-reads beat a window function D1 may plan badly,
  // and the kinds are a fixed enum — this is not a scan that grows with the table.
  const latest = {};
  for (const kind of KINDS) {
    try {
      const row = await env.DB.prepare(
        'SELECT id, kind, title, body, sources_json, created_at FROM market_intel WHERE kind=? ORDER BY created_at DESC LIMIT 1'
      ).bind(kind).first();
      latest[kind] = row ? { ...row, sources: parseJson(row.sources_json, []), sources_json: undefined } : null;
    } catch { latest[kind] = null; }
  }

  // The queue, newest first: pending questions plus recent outcomes, so a question that
  // failed is visible instead of silently vanishing from "pending".
  let requests = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, question, status, requested_by, answer_intel_id, created_at, updated_at FROM intel_requests ORDER BY created_at DESC LIMIT 30'
    ).all();
    requests = (r && r.results) || [];
  } catch { requests = []; }

  return json({ ok: true, latest, requests });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const question = String(b && b.question || '').trim().slice(0, 1000);
  if (!question) return bad('Ask a question first.');

  const reqId = id('ir');
  const t = now();
  try {
    await env.DB.prepare(
      "INSERT INTO intel_requests (id, question, status, requested_by, created_at, updated_at) VALUES (?,?,'pending',?,?,?)"
    ).bind(reqId, question, ctx.distinct_id || 'owner', t, t).run();
  } catch (e) {
    return bad('Could not queue the question. ' + String(e && e.message || '').slice(0, 120), 500);
  }

  return json({ ok: true, id: reqId, status: 'pending', note: 'Queued — the intel tick researches it on its next run.' });
};
