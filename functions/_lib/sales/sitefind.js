// Sales OS — FIND THE WEBSITE OF A FACILITY THAT ARRIVED WITHOUT ONE.
// Files under functions/_lib are NOT routed.
//
// THE PROBLEM. The state licensure registry gives a name, an address, a phone and a licensed
// capacity — and no website. On 2026-09-21 that was 88 of 159 prospects: real, licensed, in-area
// buyers that enrichment could not touch, because enrichment reads an organization's own site and
// they had none on record. A prospect with no contact is not a prospect, it is a row.
//
// THE RULE THIS FILE OBEYS. It does not guess a website and save it. It generates candidate
// domains from the name, fetches each one, and keeps it ONLY when the page proves it belongs to
// that facility: the registry phone number printed on the page, or the street address, or the
// facility's distinctive name plus its city. Two independent signals, or nothing.
//
// Why so strict: "sunrise adult day care" resolves to a dozen unrelated businesses, and a wrong
// website poisons everything downstream — the scorer reads its signals, the AI writes a brief from
// it, and the owner emails a stranger about a program they do not run. A missing website is a gap;
// a wrong one is a lie with a citation.
import { cleanText, phoneDigits } from './normalize.js';
import { safeFetch } from './enrich.js';

const TLDS = ['com', 'org', 'net'];
const MAX_CANDIDATES = 8;
const PAGE_BYTES = 300_000;
const TIMEOUT_MS = 7000;

// Words that do not distinguish one facility from another. Dropped when building a domain guess,
// kept when checking that a page is about this facility.
const GENERIC = new Set(['the', 'and', 'of', 'at', 'for', 'a', 'an', 'inc', 'llc', 'corp', 'co', 'ltd', 'pa', 'pllc',
  'adult', 'day', 'care', 'center', 'centre', 'services', 'service', 'health', 'healthcare', 'senior', 'seniors',
  'llc.', 'group', 'home', 'homes', 'living', 'community', 'treatment', 'recovery', 'wellness', 'rehab', 'rehabilitation']);

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Domains worth trying for this name, most distinctive first. Never more than MAX_CANDIDATES.
 *
 * "The Volen Center" really is volencenter.org, so the generic noun is dropped when deciding
 * whether a name says anything at all, and put BACK when composing the guess. Drop it from both
 * and every center in Florida collapses to the same handful of domains.
 */
export function candidateDomains(name, { city } = {}) {
  const tokens = words(name).filter((w) => !/^(the|inc|llc|corp|co|ltd|pa|pllc|and|of)$/.test(w));
  const core = tokens.filter((w) => !GENERIC.has(w) && w.length > 2);
  if (!core.length) return [];          // nothing here distinguishes this facility from any other
  const out = [];
  const push = (label) => {
    const l = String(label).replace(/[^a-z0-9]/g, '');
    if (l.length < 4 || l.length > 30) return;
    for (const tld of TLDS) {
      const d = `${l}.${tld}`;
      if (!out.includes(d)) out.push(d);
    }
  };
  push(core.join(''));                                   // volen → volen.com
  // A long name produces a label past the 30-character limit and would otherwise yield NOTHING:
  // "Memory & Wellness Center at Florida Atlantic University" is one real example. The first two or
  // three distinctive words are what such a place actually registers.
  if (core.length > 2) { push(core.slice(0, 3).join('')); push(core.slice(0, 2).join('')); }
  const tail = tokens.find((w) => /^(center|centre|house|club|manor|villa|place|gardens)$/.test(w));
  if (tail && !core.includes(tail)) push(core.join('') + tail);   // volencenter.com
  push(tokens.join(''));                                 // thevolencenter-ish, minus the noise words
  if (core.length === 1 && city) push(core[0] + String(city).toLowerCase().replace(/[^a-z]/g, ''));
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Does this page prove it belongs to this organization?
 *
 * Returns the signals that matched. The caller requires at least two, and a name match alone is
 * never enough: every adult day care page on earth says "adult day care".
 */
export function verifyPage(html, org) {
  const text = cleanText(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '), 200_000).toLowerCase();
  const digitsOnPage = (String(html || '').match(/\d[\d\s().-]{8,}\d/g) || []).map(phoneDigits).filter((d) => d && d.length >= 10);
  const signals = [];
  const orgPhone = phoneDigits(org.phone || '');
  if (orgPhone && orgPhone.length >= 10 && digitsOnPage.some((d) => d.endsWith(orgPhone.slice(-10)))) signals.push('phone');
  // ADDRESS, BUT AS ONE ADDRESS. Matching the street number anywhere and the road name anywhere is
  // not an address match on a large site: broward.org contains thousands of both, and it was
  // accepted for "Broward Adult Day Care Center" in production on 2026-09-21. The number and the
  // road words have to appear TOGETHER AND IN ORDER, the way an address is actually written —
  // which also fixes "4700 NW 9th Ave", where no single road word is long enough to key on.
  const street = cleanText(org.street || '', 80).toLowerCase();
  if (street) {
    const num = (street.match(/^\d+/) || [])[0];
    const parts = street.replace(/^\d+\s*/, '').split(/[^a-z0-9]+/).filter(Boolean).slice(0, 3);
    if (num && parts.length) {
      const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${num}\\W{0,4}${parts.map(esc).join('\\W{0,4}')}`, 'i');
      if (re.test(text)) signals.push('address');
    }
  }
  const distinctive = words(org.name).filter((w) => !GENERIC.has(w) && w.length > 3);
  if (distinctive.length && distinctive.every((w) => text.includes(w))) signals.push('name');
  const city = cleanText(org.city || '', 40).toLowerCase();
  if (city && text.includes(city)) signals.push('city');
  // THE PLACE-NAME TRAP, found in production on 2026-09-21. "Adult Day Care of Sunrise" matched
  // sunrise.org and "Broward Adult Day Care Center" matched broward.org: in both, the facility's
  // only distinctive word IS its city or county, so "name" and "city" are the same fact counted
  // twice, and every page about that place passes. A name built from a place therefore proves
  // nothing on its own — such a candidate needs the phone or the street address.
  const place = new Set([...words(org.city || ''), ...words(org.county || ''), ...words(org.state || '')]);
  const nameIsPlace = distinctive.length > 0 && distinctive.every((w) => place.has(w));
  // A parked domain says nothing about anyone.
  const parked = /domain (is )?for sale|buy this domain|parked free|godaddy\.com\/domainsearch|this domain is available/i.test(text);
  const hardEvidence = signals.includes('phone') || signals.includes('address');
  const softEvidence = signals.includes('name') && signals.includes('city') && !nameIsPlace && distinctive.length >= 2;
  return { signals, parked, name_is_place: nameIsPlace, matched: !parked && signals.length >= 2 && (hardEvidence || softEvidence) };
}

/**
 * Try the candidates and return the first that proves itself, with the evidence.
 * Never throws. Returns { ok:false, tried:[...] } when nothing verified — which is a fine outcome:
 * the prospect keeps its phone number and goes to the call list instead.
 */
export async function findWebsite(org, { fetchImpl = fetch, budgetMs = 20000, maxCandidates = MAX_CANDIDATES } = {}) {
  const started = Date.now();
  const cands = candidateDomains(org && org.name, { city: org && org.city }).slice(0, maxCandidates);
  const tried = [];
  for (const domain of cands) {
    if (Date.now() - started > budgetMs) { tried.push({ domain, reason: 'time budget' }); break; }
    const url = `https://${domain}/`;
    let r;
    try {
      r = await safeFetch(url, { allowHost: domain, fetchImpl, maxBytes: PAGE_BYTES, timeoutMs: TIMEOUT_MS });
      // A guess that redirects to a sister domain is a hint, not a dead end: browardpaceprogram.com
      // sends you to .org. Follow it WITHOUT the host pin — the SSRF guard inside safeFetch still
      // refuses private hosts, ports and credentials — and let verification decide, as it does for
      // every other candidate. Nothing is stored unless the destination proves itself.
      if (r && !r.ok && /off-domain/.test(String(r.reason || ''))) {
        r = await safeFetch(url, { fetchImpl, maxBytes: PAGE_BYTES, timeoutMs: TIMEOUT_MS });
      }
    } catch { tried.push({ domain, reason: 'fetch failed' }); continue; }
    if (!r || !r.ok) { tried.push({ domain, reason: (r && r.reason) || 'unreachable' }); continue; }
    const v = verifyPage(r.body, org);
    tried.push({ domain, reason: v.matched ? 'verified' : (v.parked ? 'parked domain' : `only ${v.signals.join('+') || 'no'} signal`), signals: v.signals });
    if (v.matched) {
      let finalDomain = domain;
      try { finalDomain = new URL(r.url || url).hostname.replace(/^www\./, ''); } catch { /* keep the guess */ }
      return { ok: true, website: r.url || url, domain: finalDomain, signals: v.signals, tried };
    }
  }
  return { ok: false, tried };
}
