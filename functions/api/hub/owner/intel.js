// GET/POST /api/hub/owner/intel — the owner's window onto the Intel Bench. Owner-only.
//
// GET returns the freshest brief of each kind, plus the request queue WITH each answered
// request's actual answer attached (0081-era fix: before this, "done" was a bare badge — the
// owner could see a question was answered but not read the answer without it happening to be
// the single newest 'adhoc' brief above). POST either files a NEW question (unchanged shape:
// research runs on the cron's budget clock, never inline in a page request that would sit for 30
// seconds of web searching), or — new — files a MANUAL answer against an existing queued
// question. The owner sometimes already knows the answer (a competitor's hours, a price he saw
// himself) and there was previously no way to close the loop except waiting on a web search that
// might not even find what he already knows.
import { json, bad, id, now } from '../../../_lib/util.js';
import { parseJson } from '../../../_lib/hub.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';

const KINDS = ['competitor', 'market', 'platform', 'adhoc'];

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
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

  // Attach the actual answer text to every request that has one, so "done" in the queue means
  // "read it right here" instead of "go find the matching brief above, if it's still the
  // newest." One IN() read for the whole page, not one query per row — the queue can grow to 30
  // and this must not become 30 round trips.
  const answerIds = [...new Set(requests.map((r) => r.answer_intel_id).filter(Boolean))];
  if (answerIds.length) {
    try {
      const placeholders = answerIds.map(() => '?').join(',');
      const r = await env.DB.prepare(
        `SELECT id, title, body, sources_json, created_at FROM market_intel WHERE id IN (${placeholders})`
      ).bind(...answerIds).all();
      const byId = new Map(((r && r.results) || []).map((row) => [row.id, row]));
      for (const req of requests) {
        const a = req.answer_intel_id && byId.get(req.answer_intel_id);
        req.answer = a ? { title: a.title, body: a.body, sources: parseJson(a.sources_json, []), created_at: a.created_at } : null;
      }
    } catch { for (const req of requests) req.answer = null; }
  } else {
    for (const req of requests) req.answer = null;
  }

  return json({ ok: true, latest, requests });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  // Branch on request_id: present means "answer this queued question by hand," absent means
  // "file a new question" (the original, unchanged behavior). One endpoint, two shapes, exactly
  // like social.js already dispatches on the fields the body carries.
  const requestId = String(b && b.request_id || '').trim();
  if (requestId) return answerRequest(env, ctx, requestId, b);

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

// A manual answer is filed exactly like a researched one: a market_intel row (kind 'adhoc', so it
// reads in the same "owner question, answered" lane as a web-researched reply) plus the
// intel_requests row flipped to 'done' with answer_intel_id pointing at it. sources_json is left
// NULL rather than an empty array — the UI's "No sources recorded" line already covers NULL, and
// an empty array would visually claim "we checked and there were none," which is false; nobody
// checked, the owner just knows.
async function answerRequest(env, ctx, requestId, b) {
  const answer = String(b && b.answer || '').trim().slice(0, 4000);
  if (!answer) return bad('Write an answer first.');

  let reqRow;
  try {
    reqRow = await env.DB.prepare('SELECT id, question, status FROM intel_requests WHERE id=?').bind(requestId).first();
  } catch (e) {
    return bad('Could not read the question. ' + String(e && e.message || '').slice(0, 120), 500);
  }
  if (!reqRow) return bad('That question no longer exists.', 404);

  const intelId = id('mi');
  const t = now();
  try {
    await env.DB.prepare(
      'INSERT INTO market_intel (id, kind, title, body, sources_json, created_at) VALUES (?,?,?,?,?,?)'
    ).bind(intelId, 'adhoc', String(reqRow.question || answer).slice(0, 160), answer, null, t).run();
  } catch (e) {
    return bad('Could not save the answer. ' + String(e && e.message || '').slice(0, 120), 500);
  }
  try {
    await env.DB.prepare("UPDATE intel_requests SET status='done', answer_intel_id=?, updated_at=? WHERE id=?")
      .bind(intelId, t, requestId).run();
  } catch (e) {
    // The answer itself landed in market_intel either way — losing the queue-row link is
    // recoverable (the owner can re-answer), losing the answer he just typed would not be.
    return bad('Answer saved, but could not update the queue row. ' + String(e && e.message || '').slice(0, 120), 500);
  }

  return json({ ok: true, id: requestId, status: 'done', intel_id: intelId });
}
