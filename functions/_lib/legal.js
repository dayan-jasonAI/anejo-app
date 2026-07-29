// The three public legal documents, shared by the edge override (functions/legal/_middleware.js)
// and the owner desk that writes them. Files under _lib are NOT routed.
//
// A CLOSED set, not an open namespace. "Any doc can become a public page" would be a CMS with a
// route for every row — the same reason content slots are named rather than free-form.

export const LEGAL_SLUGS = ['terms', 'privacy', 'refund'];

export const LEGAL_LABEL = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  refund: 'Refund & Cancellation Policy',
};

// Deterministic ids: the override looks a document up by id, so it must be the SAME id every time
// rather than whatever a generator produced when the row was first created.
export const LEGAL_DOC_ID = {
  terms: 'doc_legal_terms',
  privacy: 'doc_legal_privacy',
  refund: 'doc_legal_refund',
};

/**
 * Which legal document is this path, if any?
 * Pages serves /legal/terms.html at BOTH /legal/terms and /legal/terms.html, and both are linked
 * from the site — matching only one would leave a page that silently ignores the owner's edit.
 */
export function legalSlug(pathname) {
  const m = /^\/legal\/([a-z]+)(?:\.html)?\/?$/.exec(String(pathname || '').toLowerCase());
  return m && LEGAL_SLUGS.includes(m[1]) ? m[1] : null;
}
