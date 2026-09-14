// Sales OS — enrichment: read an organization's OWN public website and pull out what matters for
// meal-service fit, with the page each fact came from. Reusable engine.
// Files under functions/_lib are NOT routed.
//
// WHAT THIS DOES NOT DO, ON PURPOSE:
//   · It does not fetch arbitrary URLs. The only host it will touch is the organization's own
//     website domain, re-checked on every redirect. No IP literals, no private names, no ports but
//     80/443, no credentials in URLs — a prompt- or CSV-sourced URL can never become an SSRF probe.
//   · It honours robots.txt for its user agent and identifies itself honestly.
//   · It does not scrape gated social networks, directories, or anything behind a login.
//   · It never guesses an email address. Only addresses printed on the organization's own pages are
//     recorded, and only on the organization's own domain (or a free-mail address they published as
//     their contact). A web designer's address in the footer is not the clinic's.
//   · It does not decide anything. It records evidence; scoring.js decides.
import {
  cleanText, normEmail, emailDomain, isRoleAddress, phoneDigits, formatPhone, splitName, FREE_MAIL,
} from './normalize.js';

export const USER_AGENT = 'AnejoSalesResearch/1.0 (+https://anejocateringco.com/business; owner-reviewed B2B research)';
const MAX_PAGES = 5;             // home + up to 4 research pages
const PAGE_BYTES = 400_000;
const PAGE_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------- SSRF guard

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.test', '.invalid', '.example'];

/** Decide whether a URL may be fetched. `allowHost` pins the registrable host (www. stripped). */
export function checkUrlSafe(raw, { allowHost } = {}) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return { ok: false, reason: 'not a URL' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'only http(s) is allowed' };
  if (u.username || u.password) return { ok: false, reason: 'credentials in URL' };
  if (u.port && u.port !== '80' && u.port !== '443') return { ok: false, reason: 'non-standard port' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || !host.includes('.')) return { ok: false, reason: 'not a public hostname' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return { ok: false, reason: 'IP literal' };
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((sfx) => host.endsWith(sfx))) return { ok: false, reason: 'private hostname' };
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host.split('.')[0]) && host.split('.').every((p) => /^(0x[0-9a-f]+|\d+)$/i.test(p))) return { ok: false, reason: 'numeric host' };
  if (allowHost) {
    const bare = host.replace(/^www\./, '');
    const want = String(allowHost).toLowerCase().replace(/^www\./, '');
    if (bare !== want && !bare.endsWith('.' + want)) return { ok: false, reason: `off-domain (${bare})` };
  }
  return { ok: true, url: u.toString() };
}

async function readCapped(resp, maxBytes) {
  if (!resp.body || typeof resp.body.getReader !== 'function') {
    const t = await resp.text();
    return t.slice(0, maxBytes);
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.byteLength;
    chunks.push(value);
    if (got >= maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } break; }
  }
  const buf = new Uint8Array(Math.min(got, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.byteLength) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

/** Fetch one page under the guard, following at most 3 redirects, each re-checked. */
export async function safeFetch(url, { allowHost, pathAllowed, fetchImpl = fetch, accept = 'text/html', timeoutMs = PAGE_TIMEOUT_MS, maxBytes = PAGE_BYTES } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const chk = checkUrlSafe(current, { allowHost });
    if (!chk.ok) return { ok: false, url: current, reason: chk.reason };
    // robots.txt is re-checked on EVERY hop: a redirect to a disallowed path is still a disallowed path.
    if (pathAllowed) {
      let path = '/';
      try { path = new URL(chk.url).pathname || '/'; } catch { /* checked above */ }
      if (!pathAllowed(path)) return { ok: false, url: chk.url, reason: 'robots.txt disallows' };
    }
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let resp;
    try {
      resp = await fetchImpl(chk.url, {
        method: 'GET', redirect: 'manual', signal: ctl ? ctl.signal : undefined,
        headers: { 'User-Agent': USER_AGENT, Accept: accept === 'text/html' ? 'text/html,application/xhtml+xml' : accept },
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      return { ok: false, url: chk.url, reason: /abort/i.test(String(e && e.name)) ? 'timeout' : 'network error' };
    }
    if (timer) clearTimeout(timer);
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) return { ok: false, url: chk.url, status: resp.status, reason: 'redirect without location' };
      current = new URL(loc, chk.url).toString();
      continue;
    }
    const ctype = String(resp.headers.get('content-type') || '');
    if (!resp.ok) return { ok: false, url: chk.url, status: resp.status, reason: `HTTP ${resp.status}` };
    if (accept === 'text/html' && ctype && !/html|xml/i.test(ctype)) return { ok: false, url: chk.url, status: resp.status, reason: `not HTML (${ctype.slice(0, 40)})` };
    return { ok: true, url: chk.url, status: resp.status, contentType: ctype, body: await readCapped(resp, maxBytes) };
  }
  return { ok: false, url: current, reason: 'too many redirects' };
}

// ---------------------------------------------------------------- robots.txt

/** Minimal robots.txt: groups for our agent or '*', longest-match Allow/Disallow. */
export function robotsRules(txt, agent = 'AnejoSalesResearch') {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const val = m[2].trim();
    if (field === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (field === 'allow' || field === 'disallow') cur.rules.push({ allow: field === 'allow', path: val });
  }
  const a = agent.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((x) => x !== '*' && a.includes(x)));
  const star = groups.filter((g) => g.agents.includes('*'));
  const rules = (mine.length ? mine : star).flatMap((g) => g.rules);
  return (path) => {
    let best = null;
    for (const r of rules) {
      if (!r.path) { if (!r.allow) continue; }
      const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
      if (new RegExp('^' + pat).test(path)) {
        if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
      }
    }
    return !best || best.allow || best.path === '';
  };
}

// ---------------------------------------------------------------- extraction (pure)

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', middot: '·' };
function decode(s) {
  return s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] || m);
}

/** Visible text with block boundaries kept as newlines (people and titles live on separate lines). */
export function visibleText(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|address|dt|dd|figcaption|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decode(s);
  return s.split('\n').map((l) => l.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

export function extractLinks(html, baseUrl) {
  const out = [];
  let base;
  try { base = new URL(baseUrl); } catch { return out; }
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(decode(m[1]), base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      out.push({ url: u.toString().split('#')[0], host: u.hostname.replace(/^www\./, ''), text: cleanText(m[2], 80) });
    } catch { /* skip malformed */ }
  }
  return out;
}

const RESEARCH_PATH = /(about|team|staff|leadership|our-?team|who-?we-?are|our-?story|contact|admissions|programs?|services|locations?|directors?|management)/i;

/** Up to `max` same-host pages worth reading, best candidates first. */
export function pickResearchPages(links, host, max = MAX_PAGES - 1) {
  const bare = String(host || '').replace(/^www\./, '');
  const seen = new Set();
  const scored = [];
  for (const l of links) {
    if (l.host !== bare && !l.host.endsWith('.' + bare)) continue;
    let path;
    try { path = new URL(l.url).pathname.toLowerCase(); } catch { continue; }
    if (path === '/' || /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/.test(path)) continue;
    const key = path.replace(/\/$/, '');
    if (seen.has(key)) continue;
    const hit = RESEARCH_PATH.test(path) || RESEARCH_PATH.test(l.text);
    if (!hit) continue;
    seen.add(key);
    const priority = /team|staff|leadership|director|management|who-?we/.test(path + ' ' + l.text.toLowerCase()) ? 0
      : /about|story/.test(path) ? 1 : /contact/.test(path) ? 2 : 3;
    scored.push({ url: l.url, priority });
  }
  return scored.sort((a, b) => a.priority - b.priority).slice(0, max).map((x) => x.url);
}

const JUNK_EMAIL = /(\.(png|jpe?g|gif|webp|svg|css|js)$)|(@(example|domain|email|yourdomain|sentry|wixpress|sentry-next)\.)|^(noreply|no-reply|donotreply|do-not-reply|webmaster|postmaster|abuse)@/i;

/** Emails published on the page that plausibly belong to THIS organization. */
export function extractEmails(html, text, { orgDomain } = {}) {
  const found = new Set();
  for (const m of String(html || '').matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]));
  for (const m of String(text || '').matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) found.add(m[0]);
  const out = [];
  for (const raw of found) {
    const e = normEmail(raw);
    if (!e || JUNK_EMAIL.test(e)) continue;
    const d = emailDomain(e);
    const own = orgDomain && (d === orgDomain || d.endsWith('.' + orgDomain));
    if (!own && !FREE_MAIL.has(d)) continue;
    out.push({ email: e, own_domain: !!own, role_address: isRoleAddress(e) });
  }
  return out;
}

export function extractPhones(html, text) {
  const found = new Set();
  for (const m of String(html || '').matchAll(/tel:([+0-9().\s-]{7,20})/gi)) { const d = phoneDigits(m[1]); if (d) found.add(d); }
  for (const m of String(text || '').matchAll(/(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g)) {
    const d = phoneDigits(m[0]); if (d) found.add(d);
  }
  return [...found].slice(0, 6).map(formatPhone);
}

const TITLE_RE = /\b(executive director|clinical director|program director|director of operations|operations director|director of nursing|facility administrator|administrator|office manager|practice manager|operations manager|business manager|facility manager|facilities (?:director|manager)|chief executive officer|chief operating officer|ceo|coo|co-?founder|founder|president|owner|director of admissions|admissions director|procurement (?:manager|director)|purchasing (?:manager|director)|general manager|center director|site director|day program director|program manager)\b/i;

export function roleCategoryOf(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return 'other';
  if (/executive director|center director|site director/.test(t)) return 'executive_director';
  if (/chief executive|\bceo\b|founder|president|owner/.test(t)) return 'owner_executive';
  if (/administrator/.test(t)) return 'administrator';
  if (/operations|chief operating|\bcoo\b|general manager/.test(t)) return 'operations_director';
  if (/office manager|practice manager|business manager/.test(t)) return 'office_manager';
  if (/program director|program manager|clinical director|director of nursing/.test(t)) return 'program_director';
  if (/facilit/.test(t)) return 'facility_manager';
  if (/procurement|purchasing/.test(t)) return 'procurement';
  if (/admissions/.test(t)) return 'admissions';
  return 'other';
}

const NOT_NAME_WORDS = new Set(['our', 'the', 'contact', 'about', 'us', 'team', 'meet', 'palm', 'beach', 'boca', 'raton', 'florida',
  'center', 'centre', 'recovery', 'health', 'behavioral', 'program', 'programs', 'services', 'home', 'privacy', 'policy', 'copyright',
  'all', 'rights', 'reserved', 'call', 'today', 'admissions', 'treatment', 'mental', 'care', 'day', 'adult', 'get', 'help', 'now',
  'learn', 'more', 'read', 'view', 'fort', 'lauderdale', 'west', 'delray', 'boynton', 'jupiter', 'street', 'suite', 'avenue',
  'executive', 'director', 'clinical', 'office', 'manager', 'leadership', 'staff', 'board', 'directors', 'medical', 'south', 'north',
  'wellness', 'insurance', 'verify', 'free', 'confidential', 'assessment', 'county', 'hospital', 'clinic', 'group', 'llc', 'inc']);
const NAME_RE = /^([A-Z][a-zA-Z'’-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-zA-Z'’-]+){1,2})(?:,\s*(?:[A-Z]{2,6}(?:[-/][A-Z]{1,4})?)(?:,\s*[A-Z]{2,6})*)?$/;

function looksLikeName(s) {
  const m = String(s || '').trim().match(NAME_RE);
  if (!m) return null;
  const words = m[1].split(/\s+/).map((w) => w.replace(/\.$/, '').toLowerCase());
  if (words.some((w) => NOT_NAME_WORDS.has(w))) return null;
  return m[1];
}

/** People named WITH a leadership title on the page. Nothing else is treated as a person. */
export function extractPeople(text, { pageUrl } = {}) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && l.length <= 160);
  const leadershipPage = /team|staff|leadership|about|director|management|who-?we/i.test(String(pageUrl || ''));
  const out = [];
  const push = (name, title, snippet) => {
    const n = splitName(name);
    if (!n.full || out.some((p) => p.full_name === n.full)) return;
    const t = cleanText(title, 80);
    out.push({ full_name: n.full, title: t, role_category: roleCategoryOf(t), snippet: cleanText(snippet, 200), confidence: leadershipPage ? 'medium' : 'low' });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "Maria Ruiz, LCSW — Executive Director" / "Maria Ruiz | Administrator"
    let m = line.match(/^(.{3,60}?)\s*(?:[,|–—-]|\s{2,})\s*(.{3,80})$/);
    if (m && TITLE_RE.test(m[2])) {
      const nm = looksLikeName(m[1]);
      if (nm) { push(nm, m[2].match(TITLE_RE)[0], line); continue; }
    }
    // "Executive Director: Maria Ruiz"
    m = line.match(/^(.{3,60}?)\s*[:–—-]\s*(.{3,60})$/);
    if (m && TITLE_RE.test(m[1])) {
      const nm = looksLikeName(m[2]);
      if (nm) { push(nm, m[1].match(TITLE_RE)[0], line); continue; }
    }
    // Name on one line, title on the next (the usual team-card layout).
    const nm = looksLikeName(line);
    if (nm && i + 1 < lines.length && TITLE_RE.test(lines[i + 1]) && lines[i + 1].length <= 80) {
      push(nm, lines[i + 1].match(TITLE_RE)[0], `${line} — ${lines[i + 1]}`);
    }
  }
  return out.slice(0, 12);
}

// Signals are EVIDENCE for scoring. Each carries the sentence it came from so the owner can read it.
const SIGNALS = [
  ['day_program', /\b(partial hospitali[sz]ation|PHP|intensive outpatient|IOP|day treatment|day program|adult day (?:care|center|centre|services|program)|day services)\b/i],
  ['residential', /\b(residential (?:treatment|program|care)|inpatient|detox(?:ification)?|sober living|live-?in|24\/7 care|round[- ]the[- ]clock care)\b/i],
  ['meals_provided', /\b(meals? (?:are |is )?(?:provided|included|served)|(?:we|they) (?:provide|serve) (?:daily )?(?:meals|lunch|breakfast)|lunch (?:is )?(?:provided|included|served)|catered (?:meals|lunch(?:es)?))\b/i],
  ['meals', /\b(meals?|lunch(?:es)?|breakfast|dinners?|snacks?|nutrition(?:al)?|dietitian|dietary)\b/i],
  ['weekday_schedule', /\b(monday\s*(?:through|thru|to|-|–|—)\s*friday|mon\.?\s*(?:-|–|—|to|through)\s*fri\.?|weekdays|five days a week|5 days a week)\b/i],
  ['in_house_kitchen', /\b(on-?site (?:chef|kitchen)|in-?house (?:chef|kitchen)|our (?:chef|kitchen|culinary team)|full-?service kitchen|chef-?prepared)\b/i],
  ['multi_site', /\b((?:\d{1,2}|two|three|four|five|six|seven|several|multiple)\s+(?:locations|campuses|facilities|centers|centres|offices|sites))\b/i],
];
const CAPACITY_RE = /\b(\d{1,4})\s*[- ]?(?:bed|beds|patients|clients|residents|participants|seats|individuals)\b/i;

export function extractSignals(text, url) {
  const sentences = String(text || '').split(/\n+|(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length >= 8 && x.length <= 400);
  const out = [];
  const count = {};
  for (const sentence of sentences) {
    for (const [kind, re] of SIGNALS) {
      if ((count[kind] || 0) >= 3) continue;
      if (re.test(sentence)) {
        // "meals" is broad; do not let a 'meals_provided' sentence also count twice as 'meals'.
        if (kind === 'meals' && out.some((o) => o.kind === 'meals_provided' && o.snippet === cleanText(sentence, 220))) continue;
        out.push({ kind, snippet: cleanText(sentence, 220), url });
        count[kind] = (count[kind] || 0) + 1;
      }
    }
    const cap = sentence.match(CAPACITY_RE);
    if (cap && (count.capacity || 0) < 3) {
      const v = Number(cap[1]);
      // Guard the classic false positive: a year ("Since 2009 clients…") is not a capacity.
      if (v > 0 && v <= 1500 && !(v >= 1900 && v <= 2100)) {
        out.push({ kind: 'capacity', value: v, snippet: cleanText(sentence, 220), url });
        count.capacity = (count.capacity || 0) + 1;
      }
    }
  }
  return out;
}

/** Everything from one page. */
export function extractFromPage(html, url, { orgDomain } = {}) {
  const text = visibleText(html);
  return {
    url,
    text,
    emails: extractEmails(html, text, { orgDomain }),
    phones: extractPhones(html, text),
    people: extractPeople(text, { pageUrl: url }),
    signals: extractSignals(text, url),
    links: extractLinks(html, url),
  };
}

// ---------------------------------------------------------------- orchestration (network only)

/**
 * Read an organization's website. Returns what was found per page; persistence is the caller's.
 * { ok, pages:[{url, emails, phones, people, signals, excerpt}], skipped:[{url, reason}], error? }
 */
export async function crawlOrganization(org, { fetchImpl = fetch, budgetMs = 25000 } = {}) {
  const started = Date.now();
  if (!org || !org.website || !org.domain) return { ok: false, pages: [], skipped: [], error: 'no website on record' };
  const home = org.website;
  const host = org.domain;
  let allowed = () => true;
  try {
    const origin = new URL(home).origin;
    const r = await safeFetch(origin + '/robots.txt', { allowHost: host, fetchImpl, accept: 'text/plain', maxBytes: 64_000, timeoutMs: 5000 });
    if (r.ok) allowed = robotsRules(r.body);
    else if (r.status && r.status >= 500) allowed = () => false;   // server error on robots → treat as disallow
  } catch { /* no robots → allowed */ }

  const pages = [];
  const skipped = [];
  const visit = async (url) => {
    let path = '/';
    try { path = new URL(url).pathname || '/'; } catch { /* checked below */ }
    if (!allowed(path)) { skipped.push({ url, reason: 'robots.txt disallows' }); return null; }
    const r = await safeFetch(url, { allowHost: host, pathAllowed: allowed, fetchImpl });
    // Record where it actually stopped — after a redirect that is the target, not the link we followed.
    if (!r.ok) { skipped.push({ url: r.url || url, reason: r.reason }); return null; }
    const ex = extractFromPage(r.body, r.url, { orgDomain: host });
    pages.push({ url: r.url, emails: ex.emails, phones: ex.phones, people: ex.people, signals: ex.signals, excerpt: cleanText(ex.text, 1200) });
    return ex;
  };

  const first = await visit(home);
  if (!first) return { ok: false, pages, skipped, error: skipped.length ? skipped[skipped.length - 1].reason : 'home page unavailable' };
  for (const url of pickResearchPages(first.links, host)) {
    if (Date.now() - started > budgetMs) { skipped.push({ url, reason: 'time budget' }); break; }
    await visit(url);
  }
  return { ok: true, pages, skipped, text: pages.map((p) => p.excerpt).join('\n') };
}
