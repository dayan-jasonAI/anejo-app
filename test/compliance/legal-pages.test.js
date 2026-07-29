// Terms / Privacy / Refund must be editable by the owner, without a developer and without giving
// up server-rendered HTML.
//
// These are the pages a regulator, a card network or Twilio can force a change to on short notice
// — an auto-renewal disclosure, an SMS clause, a refund window — and every one of them required a
// deploy. The obvious fix (fetch the text, render it client-side) would have been a regression:
// these pages carry ld+json legal schema, a table of contents of in-page anchors and hreflang
// pairing, and /legal/terms is exactly the page a crawler must read without running JS. So the
// override happens at the edge and the response stays fully-formed HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legalSlug, LEGAL_SLUGS, LEGAL_DOC_ID } from '../../functions/_lib/legal.js';

const MW = readFileSync(new URL('../../functions/legal/_middleware.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/site-copy.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/site-copy.html', import.meta.url), 'utf8');

test('both URL forms of a legal page are recognised', () => {
  // Pages serves terms.html at BOTH paths and the site links both; matching one would leave a page
  // that silently ignores the owner's edit.
  assert.equal(legalSlug('/legal/terms'), 'terms');
  assert.equal(legalSlug('/legal/terms.html'), 'terms');
  assert.equal(legalSlug('/legal/terms/'), 'terms');
  assert.equal(legalSlug('/LEGAL/Terms'), 'terms', 'case must not decide whether an edit applies');
});

test('the legal set is CLOSED', () => {
  // "Any doc can become a public page" is a CMS with a route per row.
  assert.equal(legalSlug('/legal/anything'), null);
  assert.equal(legalSlug('/legal/../secrets'), null);
  assert.equal(legalSlug('/other/terms'), null);
  assert.deepEqual(LEGAL_SLUGS, ['terms', 'privacy', 'refund']);
});

test('document ids are deterministic, not generated per save', () => {
  // The edge looks the document up BY id. A fresh id on each save would leave the public page
  // reading a row nobody edits any more.
  assert.equal(LEGAL_DOC_ID.terms, 'doc_legal_terms');
  assert.match(API, /ON CONFLICT\(id\) DO UPDATE SET body=excluded\.body/);
});

test('nothing published leaves the shipped page exactly as it was', () => {
  assert.match(MW, /if \(!body\) return res;/);
});

test('any failure returns the shipped page rather than an error', () => {
  // A legal page that fails to load is worse than one that is an edit stale.
  assert.match(MW, /catch \{\s*\n\s*return res;/);
});

test('the schema, header and TOC stay code — only <main> is replaced', () => {
  assert.match(MW, /\.on\('main'/);
  assert.ok(!/\.on\('head'/.test(MW), 'the ld+json legal schema must not be rewritable');
  assert.ok(!/\.on\('body'/.test(MW), 'nor the whole document');
});

test('the "last updated" date moves with the text', () => {
  // A legal document whose text changed but whose date did not asserts, in a dispute, that the old
  // version was current.
  assert.match(MW, /\.on\('\.updated'/);
  assert.match(MW, /Last updated: ' \+ updated/);
});

test('a conditional request cannot return an empty 304 to rewrite', () => {
  // 304 has no body. The validator being compared is the STATIC file's, which does not change when
  // the owner publishes — so without this the stale copy survives every revalidation forever.
  assert.match(MW, /stripConditional/);
  assert.match(MW, /h\.delete\('if-none-match'\)/);
  assert.match(MW, /h\.delete\('if-modified-since'\)/);
});

test('an overridden page does not carry the static file validators', () => {
  assert.match(MW, /headers\.delete\('etag'\)/);
  assert.match(MW, /headers\.delete\('last-modified'\)/);
});

test('only GET html is rewritten', () => {
  assert.match(MW, /request\.method === 'GET'/);
  assert.match(MW, /ct\.includes\('text\/html'\)/, 'the stylesheet under /legal must pass through');
});

test('an unknown legal page is refused', () => {
  assert.match(API, /LEGAL_SLUGS\.includes\(doc\)/);
  assert.match(API, /Unknown legal page/);
});

test('clearing the text restores the shipped page instead of publishing a blank one', () => {
  // "Delete my edit" has to be a safe action on a Terms of Service.
  assert.match(API, /body \|\| null/);
  assert.match(PAGE, /Restore shipped version/);
  assert.match(PAGE, /window\.confirm\('Restore the shipped/);
});

test('the desk says which version the PUBLIC is getting', () => {
  assert.match(PAGE, /Your version is live/);
  assert.match(PAGE, /Shipped version/);
  assert.match(API, /published: !!body/);
});
