// /api/contract/card — the customer-facing end of "put a card on file", token-gated.
//
//   GET  ?t=<site intake token>  → who this is for, whether a card is already on file, and THE
//                                  CONSENT TEXT ITSELF, so the page renders the server's copy
//                                  rather than its own. What they read and what we store cannot
//                                  drift apart if there is only one of them.
//   POST { t, source_id, consent, agreed_name, agreed_email? }
//                                → saves the card against the account and records the consent.
//
// PUBLIC, but gated three ways: the site's intake token (the same secret the daily lunch-count
// link already carries), a rate limit, and the owner's card-capture switch, which is OFF until
// somebody turns it on.
//
// THIS ENDPOINT CHARGES NOTHING AND CAN CHARGE NOTHING. It reaches /v2/customers and /v2/cards.
// Charging stays where it was: the contracts switch plus a per-amount approval, re-checked by the
// tick itself. Putting a card on file makes autopay POSSIBLE, not permitted.
import { json, bad } from '../../_lib/util.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { getAutopaySettings } from '../../_lib/autopay.js';
import { saveCardOnFile, CARD_CONSENT_TEXT, CARD_CONSENT_VERSION } from '../../_lib/card_on_file.js';

// A site token identifies a site, and a site belongs to exactly one account — which is the thing a
// card is attached to. Inactive sites resolve to nothing: a decommissioned link must not still be
// able to attach a card to a live account.
async function accountForToken(env, token) {
  const t = String(token || '').trim();
  if (!t) return { site: null, account: null };
  let site = null;
  try {
    site = await env.DB.prepare('SELECT id, account_id, name FROM contract_sites WHERE intake_token = ? AND active = 1')
      .bind(t).first();
  } catch { site = null; }
  if (!site) return { site: null, account: null };
  let account = null;
  try {
    account = await env.DB.prepare(
      'SELECT id, name, billing_email, status, square_customer_id, square_card_id, card_brand, card_last4, card_added_at, ' +
      'card_consent_at, card_consent_version, card_consent_name FROM contract_accounts WHERE id = ?'
    ).bind(site.account_id).first();
  } catch { account = null; }
  return { site, account };
}

// What the page is allowed to know. Note what is NOT here: square_card_id and square_customer_id.
// They are opaque, but they are also the handle Square charges by, and a public page has no use
// for them. The last four is the only card fact that leaves this endpoint.
const publicView = (site, account, settings) => ({
  ok: true,
  enabled: !!(settings && settings.card_capture_enabled),
  account_name: (account && account.name) || null,
  site_name: (site && site.name) || null,
  has_card: !!(account && account.square_card_id && account.square_customer_id),
  card_brand: (account && account.card_brand) || null,
  card_last4: (account && account.card_last4) || null,
  card_added_at: (account && account.card_added_at) || null,
  consent_on_file_at: (account && account.card_consent_at) || null,
  consent_on_file_by: (account && account.card_consent_name) || null,
  consent_version: CARD_CONSENT_VERSION,
  consent_text: CARD_CONSENT_TEXT,
});

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const t = new URL(request.url).searchParams.get('t') || '';
  const { site, account } = await accountForToken(env, t);
  if (!account) return json({ ok: false, error: 'This link is not valid. Ask Añejo for a new one.' }, 404);
  return json(publicView(site, account, await getAutopaySettings(env)));
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const limited = await limitOr429(env, request, { name: 'contract-card', limit: 8, windowSec: 300 });
  if (limited) return limited;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const { account } = await accountForToken(env, b && b.t);
  if (!account) return json({ ok: false, error: 'This link is not valid. Ask Añejo for a new one.' }, 404);

  const r = await saveCardOnFile(env, {
    account,
    sourceId: b && b.source_id,
    // Strictly `true`. The lib refuses anything else and this must not soften it on the way in.
    consent: (b && b.consent) === true,
    agreedName: b && b.agreed_name,
    agreedEmail: b && b.agreed_email,
    ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '',
    source: 'contract_card_page',
  });

  // Returned 200 with ok:false so the page shows the reason inline rather than a bare status code.
  // The reason is machine-readable; the error is what a human reads.
  if (!r.ok) return json({ ok: false, reason: r.reason, error: r.error }, 200);
  return json({ ok: true, brand: r.brand, last4: r.last4, consent_version: r.consent_version });
};
