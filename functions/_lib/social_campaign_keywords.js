// Exact campaign reply shortcuts. These produce drafts only; this module has no provider or send
// dependency. The flag must be enabled explicitly after the rendered copy has been reviewed.
import { loadDailyLunch, dailyOperating, dailyDay, CORPORATE_LUNCH_POLICY } from './daily_lunch.js';
import { etDateOf } from './hub.js';
import { CAJITA_NOTICE_HOURS } from './cajita-policy.js';

export const CAMPAIGN_TEMPLATE_FAMILY_VERSION = 'social-cta-keywords-v1';
export const CAMPAIGN_POLICY_KEY = 'social.campaign_keywords';
const URLS = {
  lunch: 'https://anejocateringco.com/order?category=daily',
  office: 'https://anejocateringco.com/order?category=corporate',
  officeQuote: 'https://anejocateringco.com/catering?occasion=corporate',
  cajita: 'https://anejocateringco.com/cajita-builder',
};

const COPY = {
  en: {
    lunch: {
      available: `Daily lunch is date-based. Check current dates and order here: ${URLS.lunch}`,
      unavailable: `I can’t verify an available daily-lunch date right now. Check the live schedule and ordering page for current dates: ${URLS.lunch}`,
      unverified: `I can’t confirm the current daily-lunch schedule here. Check the live schedule and ordering page for current dates: ${URLS.lunch}`,
    },
    office: `For office lunch, order ${CORPORATE_LUNCH_POLICY.min_qty_per_product}+ of each meal with ${CORPORATE_LUNCH_POLICY.notice_hours} hours’ notice, up to ${CORPORATE_LUNCH_POLICY.max_total_qty} total: ${URLS.office} For more than ${CORPORATE_LUNCH_POLICY.max_total_qty}, custom menus, or recurring service, request a quote: ${URLS.officeQuote}`,
    cajita: `Request a La Cajita quote here: ${URLS.cajita} Please allow at least ${CAJITA_NOTICE_HOURS} hours; the team reviews the quote before confirming details or fulfillment.`,
  },
  es: {
    lunch: {
      available: `El almuerzo diario depende de la fecha. Consulta las fechas disponibles y haz tu pedido aquí: ${URLS.lunch}`,
      unavailable: `No puedo confirmar una fecha disponible para el almuerzo diario ahora. Consulta el calendario y la página de pedidos para ver las fechas actuales: ${URLS.lunch}`,
      unverified: `No puedo verificar aquí el calendario actual del almuerzo diario. Consulta el calendario y la página de pedidos para ver las fechas actuales: ${URLS.lunch}`,
    },
    office: `Para almuerzos de oficina, pide ${CORPORATE_LUNCH_POLICY.min_qty_per_product}+ de cada comida con ${CORPORATE_LUNCH_POLICY.notice_hours} horas de anticipación, hasta ${CORPORATE_LUNCH_POLICY.max_total_qty} en total: ${URLS.office} Para más de ${CORPORATE_LUNCH_POLICY.max_total_qty}, menús personalizados o servicio recurrente, solicita una cotización: ${URLS.officeQuote}`,
    cajita: `Solicita una cotización para La Cajita aquí: ${URLS.cajita} Se requieren al menos ${CAJITA_NOTICE_HOURS} horas; el equipo revisará la cotización antes de confirmar los detalles o el servicio.`,
  },
};

export const campaignTemplateHash = async () => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const input = new TextEncoder().encode(JSON.stringify({ version: CAMPAIGN_TEMPLATE_FAMILY_VERSION, copy: COPY }));
  const digest = await subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

async function approvedPolicy(env) {
  try {
    if (!env?.DB) return false;
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(CAMPAIGN_POLICY_KEY).first();
    if (!row?.value) return false;
    const policy = JSON.parse(row.value);
    const approval = policy.owner_approval;
    const hash = await campaignTemplateHash();
    return !!(hash && policy.enabled === true && policy.template_family_version === CAMPAIGN_TEMPLATE_FAMILY_VERSION &&
      policy.template_hash === hash && approval && typeof approval.approver === 'string' && approval.approver.trim() &&
      Number.isFinite(Date.parse(approval.approved_at)) && approval.scope === 'instagram_campaign_keyword_templates' &&
      Array.isArray(approval.exclusions) && approval.exclusions.length > 0 && typeof approval.source === 'string' && approval.source.trim());
  } catch { return false; }
}

function keyOf(text) {
  const key = String(text || '').trim().toUpperCase();
  return ['LUNCH', 'OFFICE', 'CAJITA'].includes(key) ? key : null;
}

async function lunchStatus(env, now) {
  try {
    const [{ config }, ops] = await Promise.all([loadDailyLunch(env), dailyOperating(env)]);
    const today = etDateOf(now.getTime());
    const orderable = config.dates.some((entry) => entry.date >= today && dailyDay(config, entry.date, ops, now).orderable);
    return orderable ? 'available' : 'unavailable';
  } catch { return 'unverified'; }
}

/**
 * Returns a deterministic customer-facing draft only for an exact campaign keyword and a
 * read-only, owner-approved app_settings policy matching this compiled template family.
 */
export async function campaignKeywordReply(env, { text, language = 'en', now = new Date() } = {}) {
  const key = keyOf(text);
  if (!key) return null;
  if (!(await approvedPolicy(env))) return null;
  const lang = String(language).toLowerCase().startsWith('es') ? 'es' : 'en';
  const category = key.toLowerCase();
  const status = key === 'LUNCH' ? await lunchStatus(env, now) : null;
  const draft = key === 'LUNCH' ? COPY[lang].lunch[status] : COPY[lang][category];
  return { keyword: key, language: lang, draft, source_status: status || 'policy_source' };
}
