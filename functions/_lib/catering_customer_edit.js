// Public quote editing: a bearer token authorizes one quote, never caller-supplied money.
import { loadMenu, isOrderable } from './menu.js';
import { quoteLinesWithImages } from './catering_quote_delivery.js';
import { reviseQuote } from './catering_quote_revision.js';
import { validateCateringNotice } from './catering-notice.js';
const fail = error => ({ ok: false, error });
export const quoteEditBase = env => env.APP_BASE_URL ? new URL(env.APP_BASE_URL).origin : 'https://anejocateringco.com';
const quantity = n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 && n <= 999;
const parse = q => { try { return JSON.parse(q.quote_json || '{}'); } catch { return {}; } };
export async function customerQuote(env, token, follow = false) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  let q = await env.DB.prepare('SELECT * FROM catering_quotes WHERE access_token = ?').bind(token).first();
  if (!follow) return q;
  const seen = new Set();
  for (let n = 0; q && n < 8; n++) {
    if (seen.has(q.id)) return null;
    seen.add(q.id);
    const r = await env.DB.prepare("SELECT * FROM catering_quote_revisions WHERE source_quote_id = ? AND state = 'complete'").bind(q.id).first();
    if (!r) return q;
    q = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id = ?').bind(r.replacement_quote_id).first();
  }
  return null;
}
export function editableQuote(q, now = Date.now()) {
  if (q.deposit_status !== 'unpaid') return fail('Booked or paid orders cannot be changed here. Request a call to discuss additions without changing your booking.');
  const b = parse(q);
  if (Number(b.discount_cents || 0) !== 0 || Number(b.delivery_fee_cents || 0) !== 0 || Number(b.tax_cents || 0) !== 0) return fail('This quote includes a delivery fee, tax or discount that needs review before changing quantities. Request a call.');
  if (!Array.isArray(b.lines) || !b.lines.length || b.lines.some(l => !/^[1-9]\d*$/.test(String(l.qty || '')) || !quantity(Number(l.qty)) || !Number.isSafeInteger(l.cents) || l.cents < 0 || /\b(delivery|discount|tax|fee|entrega|descuento)\b/i.test(l.name || '') || ['delivery', 'fee', 'discount', 'tax'].includes(l.type) || ['delivery', 'fee', 'discount', 'tax'].includes(l.kind))) return fail('This quote has custom quantities or fee lines requiring review. Request a call.');
  if (b.lines.reduce((sum, l) => sum + l.cents, 0) !== q.total_cents) return fail('The quote total requires review before self-service changes.');
  // A date-only event is checked against the earliest possible instant that day;
  // this is conservative, never an invented serving appointment.
  const notice = validateCateringNotice({ eventDate: q.event_date, eventTime: b.event_time || '00:00', customPrinting: b.custom_printing === true || b.customPrinting === true, now });
  return notice.ok ? { ok: true } : fail(notice.error);
}
async function catalog(env) {
  const menu = await loadMenu(env);
  return { menu, items: menu.source === 'd1' ? menu.items.filter(i => i.active === 1 && (!i.availability || i.availability === 'available') && isOrderable(i) && ['addon', 'tray'].includes(i.kind) && /^(catering_|traditional_)/.test(String(i.id)) && Number.isSafeInteger(i.price_cents) && i.price_cents > 0) : [] };
}
export async function getCustomerEdit(env, token) {
  const q = await customerQuote(env, token, true);
  if (!q) return fail('That link is not valid.');
  const { menu, items } = await catalog(env);
  const journal = await env.DB.prepare('SELECT * FROM catering_quote_revisions WHERE source_quote_id = ?').bind(q.id).first();
  let recovery = null;
  if (journal && journal.state !== 'complete' && journal.created_by === 'customer:self-service' && q.deposit_status === 'unpaid') {
    const payload = JSON.parse(journal.payload_json);
    const lines = payload.quoteBreakdown.lines;
    recovery = { expected_updated_at: journal.source_updated_at, preview_fingerprint: await editFingerprint({ ...q, updated_at: journal.source_updated_at }, lines), lines, total_cents: payload.totalCents, deposit_cents: Math.round(payload.totalCents * payload.depositPct) };
  }
  const eligible = journal && journal.created_by !== 'customer:self-service' ? fail('Añejo is updating your quote. Please wait for the updated quote or request a call.') : recovery ? fail('A saved revision is awaiting recovery. Resume the saved changes before making another edit.') : editableQuote(q);
  return { ok: true, recovery, editable: eligible.ok, error: eligible.error, quote: { id: q.id, token: q.access_token, event_date: q.event_date, guests: q.guests, updated_at: q.updated_at, total_cents: q.total_cents, lines: quoteLinesWithImages(parse(q).lines || [], menu).map((l, i) => ({ key: String(i), name: l.name, name_es: l.name_es, detail: l.detail, detail_es: l.detail_es, image: l.image, cents: l.cents, qty: Number(l.qty) })) }, catalog: items.map(i => ({ id: i.id, name: i.name, name_es: i.name_es, price_cents: i.price_cents, image: i.image || i.img })) };
}
export async function editFingerprint(q, lines) {
  const bytes = new TextEncoder().encode(JSON.stringify({ id: q.id, updated_at: q.updated_at, lines }));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function previewCustomerEdit(env, q, body) {
  const journal = await env.DB.prepare('SELECT * FROM catering_quote_revisions WHERE source_quote_id = ?').bind(q.id).first();
  if (journal) return fail('A saved revision already exists. Reload to resume it instead of changing the saved prices.');
  const eligible = editableQuote(q);
  if (!eligible.ok) return eligible;
  if (Number(body.expected_updated_at) !== q.updated_at) return fail('Quote changed. Reload before editing.');
  if (!Array.isArray(body.lines) || !Array.isArray(body.additions || []) || body.lines.length + (body.additions || []).length > 40) return fail('Choose up to 40 menu lines.');
  const b = parse(q), lines = [], keys = new Set();
  for (const selection of body.lines) {
    const key = String(selection.key);
    if (!/^\d+$/.test(key) || !b.lines[Number(key)] || keys.has(key) || !quantity(selection.qty)) return fail('Choose a whole quantity between 1 and 999 for each item.');
    keys.add(key);
    const original = b.lines[Number(key)];
    const cents = Number((BigInt(original.cents) * BigInt(selection.qty) * 2n + BigInt(original.qty)) / (2n * BigInt(original.qty)));
    lines.push({ ...original, qty: String(selection.qty), cents });
  }
  const { items } = await catalog(env), added = new Set();
  for (const selection of body.additions || []) {
    const item = items.find(i => i.id === selection.id);
    if (!item || added.has(selection.id) || !quantity(selection.qty)) return fail('An added menu item is unavailable. Reload the menu.');
    if (item.stock_count != null && Number(item.stock_count) < selection.qty) return fail('An added menu item does not have enough stock.');
    added.add(selection.id);
    lines.push({ product_id: item.id, name: item.name, name_es: item.name_es, qty: String(selection.qty), cents: item.price_cents * selection.qty, image: item.image || item.img });
  }
  const total = lines.reduce((sum, l) => sum + l.cents, 0);
  if (!lines.length || total < 1 || total > 10000000) return fail('Choose a menu total between $0.01 and $100,000.');
  // Use the exact normalizer used by the revision helper so the frozen journal
  // and displayed preview have byte-identical price-bearing lines.
  const { normalizeQuoteLines } = await import('./catering_quote_lines.js');
  const norm = normalizeQuoteLines(lines);
  if (!norm.ok) return norm;
  return { ok: true, lines: norm.lines, total_cents: total, deposit_cents: Math.round(total * q.deposit_pct), preview_fingerprint: await editFingerprint(q, norm.lines) };
}
export async function applyCustomerEdit(env, body) {
  const q = await customerQuote(env, body.token);
  if (!q) return fail('That link is not valid.');
  const journal = await env.DB.prepare('SELECT * FROM catering_quote_revisions WHERE source_quote_id = ?').bind(q.id).first();
  // Recovery is authorized only by the digest of the first frozen, server-priced
  // preview. A subsequent request cannot overwrite a saved replacement.
  if (journal) {
    if (journal.created_by !== 'customer:self-service') return fail('Añejo is updating your quote. Please wait for the updated quote or request a call.');
    const payload = JSON.parse(journal.payload_json);
    const frozen = { ...q, updated_at: journal.source_updated_at };
    const fingerprint = await editFingerprint(frozen, payload.quoteBreakdown.lines);
    if (fingerprint !== body.preview_fingerprint || Number(body.expected_updated_at) !== journal.source_updated_at) return fail('A different revision is already in progress. Reload your quote.');
    return reviseQuote(env, { quote_id: q.id }, { actor: 'customer:self-service', baseUrl: quoteEditBase(env), approvedLines: payload.quoteBreakdown.lines });
  }
  const preview = await previewCustomerEdit(env, q, body);
  if (!preview.ok) return preview;
  if (!body.preview_fingerprint || body.preview_fingerprint !== preview.preview_fingerprint) return fail('Prices or quantities changed. Preview the current total before saving.');
  const b = parse(q);
  return reviseQuote(env, { quote_id: q.id, expected_updated_at: q.updated_at, lines: preview.lines, guests: q.guests, event_date: q.event_date, customer_name: q.customer_name, customer_email: q.customer_email, customer_phone: q.customer_phone, lang: q.lang, note: q.note || '', recommendations: b.recommendations || [] }, { actor: 'customer:self-service', baseUrl: quoteEditBase(env), approvedLines: preview.lines });
}
