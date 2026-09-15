// POST /api/sales/landing-event { t, event } — engagement on a personalised landing page.
//
// Public, rate-limited, and deliberately UNINFORMATIVE: it answers 204 whether or not the token is
// real, so it cannot be used to probe which prospect links exist. Events are a fixed allow-list and
// land in sales_activity against the opportunity the token names — never in client telemetry.
import { limitOr429 } from '../../_lib/ratelimit.js';
import { salesRow, logActivity } from '../../_lib/sales/store.js';

export const LANDING_EVENTS = ['menu_view', 'pricing_view', 'cta_click', 'faq_open'];
const none = () => new Response(null, { status: 204 });

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'sales_evt', limit: 60, windowSec: 60 });
  if (limited) return limited;
  let b;
  try { b = await request.json(); } catch { return none(); }
  const t = String((b && b.t) || '');
  const event = String((b && b.event) || '');
  if (!/^[a-f0-9]{32}$/.test(t) || !LANDING_EVENTS.includes(event) || !env || !env.DB) return none();
  const opp = await salesRow(env, 'SELECT id, organization_id FROM sales_opportunities WHERE landing_token = ?', t);
  if (!opp) return none();
  // One row per opportunity per event per 30 minutes — a scroll up and down is not two signals.
  const recent = await salesRow(env,
    "SELECT id FROM sales_activity WHERE opportunity_id = ? AND kind = 'landing_event' AND json_extract(detail_json, '$.event') = ? AND created_at > ? LIMIT 1",
    opp.id, event, Date.now() - 30 * 60000);
  if (!recent) await logActivity(env, { organization_id: opp.organization_id, opportunity_id: opp.id, kind: 'landing_event', actor: 'prospect', detail: { event } });
  return none();
};
