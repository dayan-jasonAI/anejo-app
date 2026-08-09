// card_on_file.js — putting a B2B contract account's card on file, consent first.
// Files under _lib are NOT routed.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE DEAD END THIS CLOSES. migrations/0086 gave contract_accounts `square_customer_id` and
// `square_card_id`, autopay.js reads both (autopay.js:188), and NOTHING in the codebase has ever
// written either one. So the fourth gate in chargeContractInvoice — "no card on file" — refuses
// every account that exists, forever. B2B autopay could be switched on, an invoice could be
// approved to the exact cent, and the charge would still refuse, because there was no door
// through which a card could arrive.
//
// THIS IS THE DOOR, AND IT IS CONSENT-FIRST.
//
//   1. NOTHING IS EVER CHARGED HERE. This module calls /v2/customers and /v2/cards. It never
//      calls /v2/payments. Storing a card and charging a card are different acts and the second
//      one stays where it was: behind the contracts switch AND a per-amount approval.
//
//   2. THE CARD NUMBER NEVER REACHES US. The customer types into Square's own hosted field; the
//      browser sends a single-use token (`cnon:…`). We refuse anything that looks like a PAN
//      rather than forwarding it — see rejectsPan() — so a mis-wired form fails loudly instead of
//      quietly putting sixteen digits through our logs.
//
//   3. THE CONSENT IS STORED WITH THE CARD, AS TEXT. Not a boolean. Not a version pointer into a
//      file that will be edited next year. The exact paragraph the customer read is written onto
//      the account row alongside who agreed and when — the same discipline catering_terms.js uses
//      for booking terms, and for the same reason: an argument about what somebody authorised is
//      settled by the row, not by today's source code.
//
//   4. THE SWITCH IS OFF BY DEFAULT. `autopay.card_capture_enabled` (AUTOPAY_KEYS.card_capture)
//      gates this whole path. Shipping the page does not open it.
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { square, squareConfigured } from './square.js';
import { id, now } from './hub.js';
import { getAutopaySettings, recordMovement } from './autopay.js';

/** Bumped whenever the paragraph below changes. Old rows keep their old version AND their text. */
export const CARD_CONSENT_VERSION = '2026-08-v1';

/**
 * THE AUTHORIZATION. This exact string is what the customer is shown, and this exact string is
 * what is written to the row. There is deliberately no second copy of it in the HTML — the page
 * fetches this text from the server so "what they saw" and "what we stored" cannot drift apart.
 */
export const CARD_CONSENT_TEXT = [
  'I authorize Añejo Catering Co. to keep this card on file and to charge it automatically for this',
  'account’s lunch invoices — each invoice at its own amount, on or after its due date, for as long',
  'as the account is active.',
  '',
  'I understand that:',
  '• Nothing is charged right now. This saves the card and nothing else.',
  '• Every charge is for an invoice this account can see, for the amount on that invoice. If the',
  '  amount changes after it was approved, the charge is refused rather than adjusted.',
  '• Añejo never sees or stores my card number. Square holds the card; Añejo holds only a reference',
  '  to it and the last four digits, so we can tell you which card is on file.',
  '• I can remove this card or withdraw this authorization at any time, by replying to any Añejo',
  '  invoice or calling us, and it takes effect before the next invoice.',
  '• I am authorized to put this card on file on behalf of this business.',
].join('\n');

const clean = (s, max) => {
  const v = String(s == null ? '' : s).trim();
  return v ? v.slice(0, max) : null;
};

const sqErr = (r) => (r && r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail)
  || `Square returned ${(r && r.status) || 0}.`;

/**
 * Does this look like a raw card number rather than a Square token?
 *
 * Square's tokens are prefixed (`cnon:`, `ccof:`) and are never all digits, so ANY bare 12–19
 * digit string in the token field means the hosted field was bypassed. We refuse on shape alone
 * rather than on a Luhn check: a mistyped PAN fails Luhn and is still a PAN, and forwarding it
 * "because the checksum was wrong" is exactly the wrong instinct.
 */
export function looksLikeCardNumber(sourceId) {
  return /^\d{12,19}$/.test(String(sourceId == null ? '' : sourceId).replace(/[\s-]/g, ''));
}

/**
 * Store a card on file for a contract account.
 *
 * THE GATE ORDER IS THE POINT, exactly as it is in chargeContractInvoice: every refusal is decided
 * BEFORE Square is contacted, so a refusal cannot have leaked a token anywhere.
 *
 *   1. no account                → refused, no Square call
 *   2. capture switch off        → refused, no Square call
 *   3. consent box not ticked    → refused, no Square call
 *   4. nobody named as agreeing  → refused, no Square call
 *   5. missing token             → refused, no Square call
 *   6. token looks like a PAN    → refused, no Square call, and the value is never echoed back
 *   7. Square not configured     → refused, no Square call
 *   … only then is a card saved, and even then NOTHING is charged.
 *
 * Returns { ok, stored, reason?, error?, brand?, last4? }. Never throws.
 */
export async function saveCardOnFile(env, {
  account, sourceId, consent, agreedName, agreedEmail, ip, source = 'contract_card_page',
  settings = null,
} = {}) {
  const refuse = async (reason, error) => {
    await recordMovement(env, {
      kind: 'card_on_file', ref_type: 'account', ref_id: (account && account.id) || null,
      amount_cents: null, outcome: 'refused', reason, actor: clean(agreedName, 120), detail: error,
    });
    return { ok: false, stored: false, reason, error };
  };

  if (!env || !env.DB) return { ok: false, stored: false, reason: 'no_db', error: 'Database not configured.' };
  if (!account || !account.id) {
    return { ok: false, stored: false, reason: 'no_account', error: 'That link does not match an account.' };
  }

  const s = settings || await getAutopaySettings(env);
  if (!s.card_capture_enabled) {
    return refuse('card_capture_off', 'Saving a card on file is switched off. Ask Añejo to turn it on in the HUB.');
  }

  // Consent is an explicit `true`. Not "truthy" — a stray string from a form that forgot its
  // checkbox must not read as agreement.
  if (consent !== true) {
    return refuse('no_consent', 'Tick the authorization box before saving a card. Nothing is stored without it.');
  }
  const who = clean(agreedName, 120);
  if (!who) return refuse('no_signer', 'Type the name of the person authorizing this, so we know who agreed.');

  const token = String(sourceId == null ? '' : sourceId).trim();
  if (!token) return refuse('no_token', 'No card was entered.');
  if (looksLikeCardNumber(token)) {
    // Deliberately says nothing about the value it received.
    return refuse('pan_rejected', 'That is a card number, not a secure token. The card must be typed into Square’s own field — we never accept a card number directly.');
  }
  if (!squareConfigured(env)) return refuse('square_not_configured', 'Payments are not configured yet.');

  // 1) The Square customer. Reused when the account already has one — a second customer per
  //    account would split their cards across two records nobody can reconcile.
  let customerId = account.square_customer_id || null;
  if (!customerId) {
    const cr = await square(env, '/v2/customers', {
      method: 'POST',
      body: {
        idempotency_key: id('cus'),
        company_name: clean(account.name, 255) || undefined,
        given_name: who,
        email_address: clean(agreedEmail, 160) || clean(account.billing_email, 160) || undefined,
        reference_id: String(account.id).slice(0, 100),
        note: `Añejo contract account ${account.id}`,
      },
    });
    if (!cr.ok || !(cr.data && cr.data.customer && cr.data.customer.id)) return refuse('square_error', sqErr(cr));
    customerId = cr.data.customer.id;
  }

  // 2) The card. This is the ONLY place the token is used, and it is not stored anywhere after.
  const cardRes = await square(env, '/v2/cards', {
    method: 'POST',
    body: {
      idempotency_key: id('card'),
      source_id: token,
      card: { customer_id: customerId, cardholder_name: who, reference_id: String(account.id).slice(0, 100) },
    },
  });
  if (!cardRes.ok || !(cardRes.data && cardRes.data.card && cardRes.data.card.id)) {
    return refuse('square_error', sqErr(cardRes));
  }
  const card = cardRes.data.card;
  const brand = clean(card.card_brand, 32);
  const last4 = clean(card.last_4, 4);

  // 3) The row. Opaque ids + the last four + the consent, and not one digit more.
  const t = now();
  try {
    await env.DB.prepare(
      'UPDATE contract_accounts SET square_customer_id=?, square_card_id=?, card_brand=?, card_last4=?, card_added_at=?, ' +
      'card_consent_at=?, card_consent_version=?, card_consent_text=?, card_consent_name=?, card_consent_email=?, ' +
      'card_consent_ip=?, card_consent_src=?, updated_at=? WHERE id=?'
    ).bind(
      customerId, card.id, brand, last4, t,
      t, CARD_CONSENT_VERSION, CARD_CONSENT_TEXT, who, clean(agreedEmail, 160),
      clean(ip, 64), clean(source, 40), t, account.id,
    ).run();
  } catch (e) {
    // The card exists at Square but this account does not point at it, so nothing can charge it.
    // That is the safe direction to fail in, and it is said out loud rather than reported as ok.
    return refuse('not_saved', 'The card was accepted but could not be saved to the account. Nothing will be charged — please try again. ' + String((e && e.message) || '').slice(0, 120));
  }

  await recordMovement(env, {
    kind: 'card_on_file', ref_type: 'account', ref_id: account.id,
    amount_cents: null, outcome: 'stored', reason: 'consent_' + CARD_CONSENT_VERSION, actor: who,
    detail: `${brand || 'card'} ••${last4 || '????'} — nothing charged.`,
  });

  return { ok: true, stored: true, brand, last4, consent_version: CARD_CONSENT_VERSION };
}

/**
 * Withdraw the card and the authorization together.
 *
 * The consent text promises "I can remove this card or withdraw this authorization at any time".
 * A promise with no code behind it is a lie, so this is that code. It clears the Square references
 * AND the consent in one statement — leaving a stored consent next to no card would misrepresent
 * what the account has agreed to today.
 */
export async function removeCardOnFile(env, { accountId, actor } = {}) {
  if (!env || !env.DB || !accountId) return { ok: false, error: 'Database not configured.' };
  try {
    await env.DB.prepare(
      'UPDATE contract_accounts SET square_card_id=NULL, square_customer_id=NULL, card_brand=NULL, card_last4=NULL, ' +
      'card_added_at=NULL, card_consent_at=NULL, card_consent_version=NULL, card_consent_text=NULL, ' +
      'card_consent_name=NULL, card_consent_email=NULL, card_consent_ip=NULL, card_consent_src=NULL, updated_at=? WHERE id=?'
    ).bind(now(), accountId).run();
  } catch { return { ok: false, error: 'Could not remove that card.' }; }
  await recordMovement(env, {
    kind: 'card_on_file', ref_type: 'account', ref_id: accountId,
    outcome: 'refused', reason: 'card_removed', actor,
    detail: 'Card and authorization withdrawn — autopay for this account now refuses with no_card_on_file.',
  });
  return { ok: true, account_id: accountId };
}
