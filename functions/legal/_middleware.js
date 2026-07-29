// Owner-editable Terms / Privacy / Refund, WITHOUT giving up server-rendered HTML.
//
// The legal pages are the one part of the storefront the owner is legally obliged to keep current
// — an auto-renewal disclosure, an SMS clause, a refund window — and every one of them required a
// developer and a deploy. That is the wrong dependency for a document a regulator, a card network
// or Twilio can force a change to on short notice.
//
// The obvious fix — fetch the text and render it client-side — would have been a regression. These
// pages carry ld+json legal schema, a table of contents of in-page anchors, and hreflang pairing,
// and /legal/terms is exactly the kind of page a crawler must be able to read without running JS.
// So the override happens HERE, on the edge, before the HTML leaves: the static file remains the
// document, and a published override is streamed into it with HTMLRewriter. The response is still
// fully-formed HTML, and the page is identical to today's whenever no override exists.
//
// Failure posture: ANY problem — no D1, no row, a bad read — returns the static page untouched.
// A legal page that fails to load is a worse outcome than a legal page that is one edit stale.
import { legalSlug, LEGAL_DOC_ID } from '../_lib/legal.js';

// Owner-authored HTML is injected as HTML, deliberately. It comes from /api/hub/owner/content,
// which is owner-gated, and the docs library has always stored "markdown/html" — the same trust
// model as every other doc in it. This is NOT customer input and must never be pointed at any.
export async function onRequest(context) {
  const { request, next, env } = context;
  const slug = request.method === 'GET' ? legalSlug(new URL(request.url).pathname) : null;

  // A conditional request would come back 304 with NO BODY, leaving nothing to rewrite — and the
  // visitor would keep the pre-edit page. Worse, the validator being compared is the STATIC file's,
  // which does not change when the owner publishes, so the stale copy would survive every
  // revalidation indefinitely. Ask for the full asset on these three low-traffic pages and let the
  // freshness decision below be ours.
  const res = slug
    ? await next(new Request(request.url, { method: 'GET', headers: stripConditional(request.headers) }))
    : await next();

  try {
    if (!slug) return res;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return res;
    if (!env.DB) return res;

    const row = await env.DB
      .prepare("SELECT title, body, updated_at FROM docs WHERE id = ? AND doc_type = 'legal' AND active = 1")
      .bind(LEGAL_DOC_ID[slug])
      .first();
    const body = String((row && row.body) || '').trim();
    if (!body) return res;   // nothing published → the static page, exactly as before

    const updated = new Date(Number(row.updated_at) || Date.now())
      .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });

    // The body is no longer the file on disk, so the file's validators must not travel with it.
    // Left in place, a browser or CDN holding the old copy would revalidate, match the unchanged
    // static ETag, and be told "not modified" about a legal document that HAS been modified.
    const headers = new Headers(res.headers);
    headers.delete('etag');
    headers.delete('last-modified');
    const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers });

    return new HTMLRewriter()
      // The <main> of each legal page is the document body; the header, TOC and schema above it
      // stay code so an edit cannot break them.
      .on('main', {
        element(el) { el.setInnerContent(body, { html: true }); },
      })
      // A legal document whose text changed but whose date did not is worse than useless in a
      // dispute — it asserts the old version was current.
      .on('.updated', {
        element(el) { el.setInnerContent('Last updated: ' + updated); },
      })
      .transform(out);
  } catch {
    return res;   // never let an override attempt take a legal page down
  }
}

// Drop the freshness validators so `next()` cannot answer 304 with an empty body.
function stripConditional(headers) {
  const h = new Headers(headers);
  h.delete('if-none-match');
  h.delete('if-modified-since');
  return h;
}
