// /api/hub/owner/performance-alerts — GET only (owner-only).
//
// Answers the question 0079 exists to answer: is anything Añejo posts actually landing, and is
// the team reacting? Backed by functions/_lib/instagram_insights.js:detectPerformanceSignals,
// which stays honest about sample size — every signal reports enoughData:false rather than a
// confident verdict when the account's history is too thin to support one. This route does no
// math of its own; it only gates access and forwards the signals so the HUB card can render "not
// enough data yet" itself — same discipline as marketing-attribution.js.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { detectPerformanceSignals } from '../../../_lib/instagram_insights.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const signals = await detectPerformanceSignals(env);
  return json(signals);
};
