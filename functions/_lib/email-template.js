// Owner-supplied HTML email templates. Files under _lib are NOT routed.
//
// A designed template is not "a body with tags in it" — it is the entire document, its own shell
// included. So it bypasses emailShell() and is NOT escaped. Three things follow from that, and
// each is the reason a function below exists:
//
//   1. IT WILL NOT CARRY AN EXIT. A template exported from a design tool has a pretty footer with
//      a company name in it and no unsubscribe link — the one in Downloads that prompted this says
//      "PALM BEACH COUNTY, FLORIDA", which is a service area, not the postal address CAN-SPAM
//      requires. Passing it through untouched would send marketing mail with no opt-out from the
//      same domain that carries receipts and magic links. So compliance is ENFORCED here, not
//      trusted: see ensureCompliance.
//
//   2. IT IS ONE HTML PART. Bulk HTML with no text/plain alternative is a documented spam signal,
//      and it is what a screen reader and a watch notification fall back to. htmlToText derives it
//      rather than asking the owner to maintain a second copy that would drift.
//
//   3. IT IS OWNER-AUTHORED, NOT UNTRUSTED. sanitizeTemplate is deliberately thin — this is not an
//      XSS boundary (the route is owner-only), it is hygiene: <script> in bulk mail is inert in
//      every major client and scores against the sending domain.
import { escHtml } from './email.js';

// Substitutions available inside a template. Deliberately small: every token here is either a
// legal requirement or something the roster already knows at send time.
export const MERGE_TOKENS = ['unsubscribe_url', 'postal_address', 'name', 'first_name', 'email'];

const tokenRe = (name) => new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'gi');

export function hasToken(html, name) {
  return tokenRe(name).test(String(html == null ? '' : html));
}

/**
 * Replace {{tokens}}. Values are HTML-escaped — which is also what makes an unsubscribe URL
 * correct inside an href, since its `&` separator must be `&amp;` in HTML.
 * An unknown token is left alone: silently deleting something the owner typed is worse than
 * showing it, because they can see the second one and fix it.
 */
export function renderTemplate(html, vars = {}) {
  let out = String(html == null ? '' : html);
  for (const key of MERGE_TOKENS) {
    const v = vars[key];
    out = out.replace(tokenRe(key), v == null ? '' : escHtml(String(v)));
  }
  return out;
}

/** Insert immediately before </body> so the block lands inside the document, not after it. */
export function injectBeforeBodyEnd(html, block) {
  const s = String(html == null ? '' : html);
  const i = s.toLowerCase().lastIndexOf('</body>');
  return i === -1 ? s + block : s.slice(0, i) + block + s.slice(i);
}

/**
 * The compliance gate. A template opts OUT of the appended block only by placing BOTH
 * {{unsubscribe_url}} and {{postal_address}} itself — an explicit, checkable signal that the
 * designer took responsibility for them.
 *
 * Deliberately NOT a content sniff. Searching the rendered HTML for something that looks like an
 * address would pass on a template that merely mentions a city, and the failure mode of a false
 * pass is sending bulk mail with no opt-out.
 */
export function ensureCompliance(rendered, { rawTemplate, footerHtml } = {}) {
  const raw = String(rawTemplate == null ? '' : rawTemplate);
  const selfServed = hasToken(raw, 'unsubscribe_url') && hasToken(raw, 'postal_address');
  if (selfServed) return { html: rendered, footerAppended: false };
  return { html: injectBeforeBodyEnd(rendered, footerHtml || ''), footerAppended: true };
}

/**
 * Which required pieces a template is missing. The HUB shows this BEFORE a send so the owner can
 * design the footer into the template instead of discovering an appended grey strip under their
 * artwork after it has gone to the whole list.
 */
export function templateAudit(html) {
  const s = String(html == null ? '' : html);
  const bytes = new TextEncoder().encode(s).length;
  return {
    bytes,
    has_unsubscribe_token: hasToken(s, 'unsubscribe_url'),
    has_postal_token: hasToken(s, 'postal_address'),
    // Gmail truncates around 102KB and hides everything after it behind "View entire message" —
    // including, if it is at the bottom, the unsubscribe link.
    too_big_for_gmail: bytes > 102000,
    // <link rel=stylesheet> is stripped by Gmail and Outlook. Harmless when the template also has
    // inline styles (most exports do), but it explains a webfont that renders everywhere except
    // the inbox, which otherwise looks like our bug.
    uses_remote_stylesheet: /<link\b[^>]*rel=["']?stylesheet/i.test(s),
    has_script: /<script\b/i.test(s),
    looks_like_document: /<html\b/i.test(s) || /<body\b/i.test(s),
  };
}

/** Hygiene, not a security boundary — see the header note. */
export function sanitizeTemplate(html) {
  return String(html == null ? '' : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', bull: '•',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '"', rdquo: '"', hellip: '…',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(ENTITIES, n.toLowerCase()) ? ENTITIES[n.toLowerCase()] : m));
}

/**
 * Derive the text/plain alternative. Links keep their destination — a text part whose calls to
 * action have silently lost their URLs is worse than none, because it reads as complete.
 */
export function htmlToText(html) {
  let s = String(html == null ? '' : html);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, '');
  // Drop the hidden preheader. It is text written FOR the inbox preview line, so in the text part
  // it surfaces as a stray opening sentence the reader then sees again in the body. Matched only
  // when it contains no nested element of the same kind, so a display:none wrapper around real
  // content cannot silently swallow the email.
  s = s.replace(/<(div|span)\b[^>]*display:\s*none[^>]*>(?:(?!<\/?\1\b)[\s\S])*?<\/\1>/gi, '');
  s = s.replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    if (!label) return href;
    return /^https?:/i.test(label) ? label : `${label} (${href})`;
  });
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|tr|table|h[1-6]|li|blockquote)\s*>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t\u00a0]+/g, ' ');
  return s
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
