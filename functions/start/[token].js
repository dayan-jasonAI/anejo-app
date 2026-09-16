// GET /start/<intake token> — the onboarding page for a LIVE contract account's location.
//
// WHY THIS EXISTS. Everything a newly activated site needs to know — which days we come, by when
// the count has to be in, what happens when it changes, who is allowed to send it, who to call —
// has only ever lived in a conversation Dayan had with somebody, and in columns on the site row.
// The person who actually opens the link on a Monday morning is frequently not the person who had
// that conversation. This page is the same facts, from the same row, on a link they already have.
//
// THE TOKEN IS THE SAME CREDENTIAL AS THE COUNT LINK, and nothing here widens what it opens. It
// says what /api/contract/site already says to any holder of that link — the site's schedule, its
// cutoff, the names on the ordering roster — and deliberately less: no phone hints, no prices, no
// totals, no billing email, and no other site on the account. It changes nothing: there is no form,
// no POST, and no visit is recorded.
//
// NOTHING ON THIS PAGE IS WRITTEN HERE. Days, window and cutoff come off contract_sites; the
// billing schedule off contract_accounts; the freeze time from the same helper submitHeadcount
// enforces. A column that is empty renders as an absent sentence, never as a default — telling an
// office it gets lunch on a day it never ordered is the one failure this whole surface must not
// have (see the note on parseDeliveryDays in _lib/contract.js).
import { escHtml } from '../_lib/email.js';
import { deliveryDaysLabel, hardCutoffLabel, billingModelLabel, listSiteStaff } from '../_lib/contract.js';
import { loadSalesConfig } from '../_lib/sales/config.js';
import { mediaSlotHtml, MEDIA_CSS } from '../_lib/sales/media.js';

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const html = (body, status = 200) => new Response(body, { status, headers: HEADERS });

// The one number an office is told to ring when the link cannot help them. Same number the count
// page hands them at the freeze (public/lunch-count.html) and the same one on the public site.
const PHONE = '561-778-7474';
const PHONE_TEL = '5617787474';

// A dead or mistyped link must not look like a system failure to a clinic administrator — the same
// shape of answer /for/<token> gives, for the same reason.
const notFound = () => html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page unavailable — Añejo Catering Co.</title><meta name="robots" content="noindex, nofollow">
<body style="margin:0;background:#0b1f0a;font-family:Georgia,serif;color:#e9e6dc">
<div style="max-width:420px;margin:12vh auto;padding:32px;background:#fffdf7;color:#20392e;border-radius:16px">
<p style="margin:0 0 12px;font-size:22px;letter-spacing:3px;color:#ae8745">AÑEJO</p>
<p style="margin:0 0 10px;font-size:19px">This page is no longer available.</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#5d675f">If this is your office’s ordering link, call us on ${PHONE} and we will send you a new one.</p>
<a href="tel:${PHONE_TEL}" style="color:#ae8745">Call ${PHONE}</a></div></body>`, 404);

const shell = (title, inner) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/png" href="/assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{--black:#0D0D0D;--green:#1A3D2E;--gold:#C6A85B;--gold-deep:#C08418;--cream:#F5F2EC;--ink:#1f2a24;--muted:#6f7b74;--line:#e3ddcf}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Josefin Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--cream);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
nav{background:var(--black);padding:13px 22px}nav a{font-family:'Cormorant Garamond',Georgia,serif;letter-spacing:6px;color:var(--gold);font-weight:600;text-decoration:none;font-size:22px}
.hero{background:var(--black);color:var(--cream);padding:34px 22px 38px;text-align:center}
.hero b{display:block;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:rgba(198,168,91,.72);font-weight:600;margin-bottom:7px}
.hero h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(30px,5.4vw,44px);font-weight:500;line-height:1.1;max-width:660px;margin:0 auto}
.hero p{color:rgba(245,242,236,.8);font-size:16px;margin:14px auto 0;max-width:560px}
.wrap{max-width:720px;margin:0 auto;padding:22px 20px 70px}
section{background:#fff;border:1px solid var(--line);border-top:4px solid var(--gold);border-radius:14px;padding:22px;margin-top:18px}
h2{font-size:14px;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:12px}
p+p{margin-top:10px}
ol,ul{padding-left:20px}ol li,ul li{margin:7px 0}li b{font-weight:600}
.facts{list-style:none;padding:0;margin:0}
.facts li{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding:11px 0;margin:0}
.facts li:last-child{border-bottom:0}
.facts .k{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:600}
.facts .v{font-family:'Cormorant Garamond',Georgia,serif;font-size:21px;color:var(--green);font-weight:600;text-align:right}
.names{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.names li{margin:0;background:var(--cream);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600;color:var(--green)}
.names li span{font-weight:400;color:var(--muted);font-size:13px}
.btn{display:inline-block;margin-top:16px;padding:14px 26px;border:none;border-radius:999px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;background:linear-gradient(135deg,var(--gold),var(--gold-deep));color:#1c1606;text-decoration:none}
.muted{color:var(--muted)}
.fine{font-size:12px;color:var(--muted);margin-top:10px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.call{display:inline-block;margin-top:6px;font-size:21px;font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;color:var(--gold-deep);text-decoration:none}
footer{text-align:center;color:var(--muted);font-size:12px;padding:26px 16px}
${MEDIA_CSS}
</style></head><body>
<nav><a href="/">AÑEJO</a></nav>
${inner}
<footer>Añejo Catering Co. · Palm Beach County, FL</footer>
</body></html>`;

export const onRequestGet = async ({ params, env }) => {
  const token = String((params && params.token) || '').trim();
  // Tokens are randToken(22) — 44 hex characters. A short or non-hex value is a typo or a probe,
  // and answering it without touching the database keeps this off the scan path entirely.
  if (!/^[a-f0-9]{16,64}$/.test(token) || !env || !env.DB) return notFound();

  const site = await env.DB.prepare('SELECT * FROM contract_sites WHERE intake_token = ? AND active = 1')
    .bind(token).first().catch(() => null);
  if (!site) return notFound();
  const account = await env.DB.prepare('SELECT id, name, status, billing_model, invoice_cadence FROM contract_accounts WHERE id = ?')
    .bind(site.account_id).first().catch(() => null);
  if (!account) return notFound();

  const e = escHtml;
  const siteName = e(site.name || '');
  const accountName = e(account.name || '');
  const countLink = `/lunch-count?t=${encodeURIComponent(token)}`;

  // A pending or paused account has an ordering link that will refuse every count it is given
  // (submitHeadcount checks the same status). Saying so here is kinder than a walkthrough of a
  // first week that cannot start yet.
  if (account.status && account.status !== 'active') {
    return html(shell(`${siteName} — Añejo Catering Co.`, `<header class="hero"><b>${accountName}</b><h1>${siteName}</h1>
<p>Your account is being set up. Añejo will confirm when ordering is live.</p></header>
<div class="wrap"><section><h2>Anything you need before then</h2>
<p>Call us and we will pick it up from wherever the set-up is.</p>
<a class="call" href="tel:${PHONE_TEL}">${PHONE}</a></section></div>`));
  }

  const days = deliveryDaysLabel(site.delivery_days);
  const windowLabel = String(site.window_label || '').trim();
  const cutoff = String(site.cutoff_time || '').trim();
  const freeze = hardCutoffLabel(site);
  const billing = billingModelLabel(account.billing_model);
  const roster = await listSiteStaff(env, site.id);
  // Names only. The count page shows masked phone hints because it has to pick a handset to text a
  // code to; a page that only explains has no such need, and a roster is a list of real people.
  const named = roster.filter((r) => String(r.name || '').trim());
  const primary = named.find((r) => r.is_primary) || null;

  let media = { };
  try { media = (await loadSalesConfig(env)).media; } catch { media = {}; }

  // Each fact is its own line and an ABSENT column produces no line at all — an empty string in
  // the value position would read as "we deliver on [nothing]", which is worse than silence.
  // The count page says "submit by 9:00 AM" and this page has to agree with it word for word — an
  // office told "09:00" here and "9:00 AM" there has two cutoffs to worry about instead of one.
  // Guarded rather than hardcoded: cutoff_time is a morning cutoff by design, but printing
  // "13:00 AM" because nothing checked would be its own small betrayal of a page like this.
  const clock = (hhmm) => (Number(String(hhmm).slice(0, 2)) < 12 ? `${hhmm} AM` : hhmm);
  const facts = [
    days ? ['Delivery days', days] : null,
    windowLabel ? ['Delivery window', windowLabel] : null,
    cutoff ? ['Count in by', clock(cutoff)] : null,
    ['Count closes at', clock(freeze)],
    billing ? ['Billing', billing.title] : null,
  ].filter(Boolean);

  const inner = `<header class="hero"><b>${accountName}</b><h1>${siteName}</h1>
<p>Your first week, and everything this link does — it is the same link every service day from here on.</p></header>
<div class="wrap">
<section id="orientation"><h2>Start here</h2>
${mediaSlotHtml(media, 'orientation', { label: `Orientation for ${site.name}` })}
<p>One link runs your service. Open it on a delivery morning, send the number of lunches you need, and that is the whole job — there is no app to install, no account to create and no password for anyone to lose.</p>
<a class="btn" href="${countLink}">Open your count link</a>
<p class="fine">Keep it on the office phone, or bookmark it. Anyone you put on the list below can use it.</p></section>

<section id="schedule"><h2>Your schedule</h2>
<ul class="facts">${facts.map(([k, v]) => `<li><span class="k">${e(k)}</span><span class="v">${e(v)}</span></li>`).join('')}</ul>
${days ? '' : '<p class="fine">Your delivery days are not recorded on this location yet — call us before your first service day so the kitchen and the driver are working from the same week.</p>'}
${cutoff ? '' : '<p class="fine">Your morning cutoff is not recorded on this location yet — call us and we will set it with you.</p>'}
</section>

<section id="week"><h2>Your first week</h2>
${mediaSlotHtml(media, 'onboarding', { label: 'A walkthrough of your first week' })}
<ol>
  <li><b>Before the first delivery day</b> — decide who sends the count, and add them to the list below. Two or three people is better than one: whoever is in the building that morning can send it.</li>
  <li><b>On a delivery day${days ? ` (${e(days)})` : ''}</b> — open the link and tap the number of lunches${cutoff ? ` by ${e(clock(cutoff))}` : ''}. Allergies and special requests go in the notes box underneath, and they travel with that day’s order to the kitchen.</li>
  <li><b>The first time each person orders</b> — we text them a six-digit code to confirm it is really them. That device is then remembered, so it is a one-time step per phone, not a daily one.</li>
  <li><b>After you send it</b> — the person who sent it gets a text receipt, and the same link shows every count sent this month.</li>
  <li><b>We deliver${windowLabel ? ` in your ${e(windowLabel)} window` : ''}</b> — and the day closes itself. There is nothing to confirm afterwards.</li>
</ol></section>

<section id="changes"><h2>If the count changes</h2>
<p>Reopen the link and change the number${cutoff ? `. Up to ${e(clock(cutoff))} it is simply the new count` : ''}.</p>
${cutoff ? `<p>After ${e(clock(cutoff))} the change still reaches the kitchen, but it goes in as a rush on the terms agreed for your account.</p>` : ''}
<p>At <b>${e(clock(freeze))}</b> the day’s number is frozen: the kitchen has already built to it and the driver is counting it, so the link will not move it. It will tell you that clearly, show you what you <i>are</i> getting, and give you our number — call us and we will do whatever the kitchen can still cover. Tomorrow’s count opens again overnight on the same link.</p></section>

<section id="closed"><h2>If you are closed — a holiday, a light day</h2>
<p>Send no count. A delivery only exists because somebody submitted a number, so a day with no count is a day with no delivery and nothing on your invoice. There is no standing order running in the background.</p>
<p>We do not keep a holiday calendar for your program: your count is the only thing we cook to. If we have not heard from you and your cutoff is close, we may check in — that is us making sure a busy morning did not swallow it, not a reminder that you owe us an order.</p></section>

<section id="who"><h2>Who can send the count</h2>
${named.length ? `<ul class="names">${named.map((r) => `<li>${e(String(r.name).trim())}${r.is_primary ? ' <span>· main contact</span>' : ''}</li>`).join('')}</ul>`
    : '<p class="muted">Nobody is on the list for this location yet. The first person to order from the link becomes the main contact — or call us and we will add whoever you name.</p>'}
<p${named.length ? '' : ' class="fine"'}>Your main contact keeps this list from the count link itself: add a colleague and they can order the next morning, remove them and they cannot. If somebody unexpected is covering, they can order as a stand-in with their own mobile, and your main contact is copied on the receipt and sees them on the list.</p></section>

<section id="billing"><h2>Billing</h2>
${billing ? `<p><b>${e(billing.title)}</b> — ${e(billing.detail)}</p>` : '<p>Your billing schedule is set on your account with Añejo.</p>'}
<p>One invoice for the account, built from the counts you sent — not a bill per person and not a card swipe per day. Days you sent no count are not on it.</p>
<p class="fine">The count link never shows a price or a total. It is used by whoever is covering the office that morning, and what your account pays is not their business to hold.</p></section>

<section id="help"><h2>Who to call</h2>
<p>Anything the link cannot do — a change after it has frozen, a new location, someone to add, a question about an invoice — is a phone call, not a form.</p>
<a class="call" href="tel:${PHONE_TEL}">${PHONE}</a>
<p class="fine">${primary && primary.name ? `${e(primary.name)} is the main contact we have on file for ${siteName}. ` : ''}Tell us if that should change.</p></section>
</div>`;

  return html(shell(`${siteName} — getting started with Añejo`, inner));
};
