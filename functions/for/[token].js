// GET /for/<token> — the personalised landing page a prospect email links to.
//
// The token is the page's only credential: 128 bits from the platform CSPRNG, one per opportunity,
// never an id. The page names ONE organization — the token's — and nothing else about it: no score,
// no tier, no notes, no contact names, no other prospect. Everything it says about Añejo comes from
// the owner's saved offer settings and the live menu; nothing is generated here.
//
// Tracking: a visit is recorded against the opportunity (and the first visit marks the email as
// clicked) unless the viewer is signed in as staff — the owner previewing a page is not a prospect
// engaging with it.
import { escHtml } from '../_lib/email.js';
import { loadMenu, isAvailable } from '../_lib/menu.js';
import { currentRole } from '../_lib/roles.js';
import { loadSalesConfig } from '../_lib/sales/config.js';
import { salesRow, logActivity } from '../_lib/sales/store.js';
import { proofLine } from '../_lib/sales/outreach.js';

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const html = (body, status = 200) => new Response(body, { status, headers: HEADERS });

// Real product photography from the repo (docs/HUB_MENU_MARKETING_REFERENCE.md). Illustrations of
// the food, not claims about any delivered event.
const PHOTOS = [
  ['/assets/img/menu-launch/lechon-meal.webp', 'Lechón plate with congrí and fresh salad'],
  ['/assets/img/menu-launch/ropa-vieja-meal.webp', 'Ropa vieja with congrí and maduros'],
  ['/assets/img/menu-launch/combo-table.webp', 'Trays of roast pork, congrí, yuca and fresh salad'],
  ['/assets/img/menu-launch/salad-side.webp', 'Fresh salad'],
];

const notFound = () => html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page unavailable — Añejo Catering Co.</title><meta name="robots" content="noindex, nofollow">
<body style="margin:0;background:#0b1f0a;font-family:Georgia,serif;color:#e9e6dc">
<div style="max-width:420px;margin:12vh auto;padding:32px;background:#fffdf7;color:#20392e;border-radius:16px">
<p style="margin:0 0 12px;font-size:22px;letter-spacing:3px;color:#ae8745">AÑEJO</p>
<p style="margin:0 0 10px;font-size:19px">This page is no longer available.</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#5d675f">If you received an email from us, simply reply to it and a person will get back to you.</p>
<a href="/business" style="color:#ae8745">Añejo for business</a></div></body>`, 404);

function menuImage(it) {
  const v = String((it && it.image) || '');
  if (!v || v.includes('..') || !/^[\w/.-]+\.(webp|jpe?g|png)$/i.test(v)) return null;
  return v.startsWith('/assets/img/') ? v : '/assets/img/' + v.replace(/^\/+/, '');
}

export const onRequestGet = async ({ params, request, env }) => {
  const token = String((params && params.token) || '').trim();
  if (!/^[a-f0-9]{32}$/.test(token) || !env || !env.DB) return notFound();
  const opp = await salesRow(env, 'SELECT id, organization_id, stage FROM sales_opportunities WHERE landing_token = ?', token);
  if (!opp) return notFound();
  const org = await salesRow(env, 'SELECT id, name, city, do_not_contact, status FROM sales_organizations WHERE id = ?', opp.organization_id);
  if (!org || org.do_not_contact || org.status === 'suppressed') return notFound();

  const cfg = await loadSalesConfig(env);
  const offer = cfg.offer;
  let viewer = null;
  try { viewer = await currentRole(env, request); } catch { viewer = null; }
  const staffViewing = !!(viewer && viewer.type === 'staff');

  if (!staffViewing) {
    const recent = await salesRow(env, "SELECT id FROM sales_activity WHERE opportunity_id = ? AND kind = 'landing_view' AND created_at > ? LIMIT 1", opp.id, Date.now() - 30 * 60000);
    if (!recent) {
      const seen = await salesRow(env, "SELECT id FROM sales_activity WHERE opportunity_id = ? AND kind = 'landing_view' LIMIT 1", opp.id);
      await logActivity(env, { organization_id: org.id, opportunity_id: opp.id, kind: 'landing_view', actor: 'prospect', event: seen ? null : 'sales.outreach_clicked', props: { source: 'landing' } });
      if (!seen) {
        const t = Date.now();
        await env.DB.prepare("UPDATE sales_outreach SET clicked_at = COALESCE(clicked_at, ?), updated_at = ? WHERE id = (SELECT id FROM sales_outreach WHERE opportunity_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1)")
          .bind(t, t, opp.id).run().catch(() => {});
      }
    }
  }

  let sample = [];
  const ids = Array.isArray(offer.sample_menu_item_ids) ? offer.sample_menu_item_ids.map(String) : [];
  if (ids.length) {
    const menu = await loadMenu(env);
    sample = (menu.items || []).filter((it) => ids.includes(String(it.id)) && isAvailable(it)).slice(0, 8);
  }
  const e = escHtml;
  const orgName = e(org.name);
  const tasting = !!offer.tasting_enabled;
  const proof = proofLine(cfg.proof);
  const price = offer.pricing_display_policy === 'show_from' && Number(offer.price_from_cents) > 0
    ? `From $${(Number(offer.price_from_cents) / 100).toFixed(2)} per meal — quoted for your headcount, delivery days and locations.`
    : 'Pricing is quoted for your headcount, delivery days and locations. Ask below and we will send it.';
  const cutoff = String(offer.headcount_cutoff_text || '').trim();
  const days = String(offer.delivery_days_text || '').trim();

  const faq = [
    ['How does the daily headcount work?', `Each location gets its own private link. Your team enters the day’s count${cutoff ? ` by ${e(cutoff)}` : ' by a morning cutoff we agree with you'}, and the kitchen prepares that number.`],
    ['Which areas do you serve?', `${e(offer.service_area_text || cfg.service_area.label)}${days ? ` — deliveries ${e(days)}` : ''}.`],
    ['How is billing handled?', 'One invoice for the account, on the billing schedule we agree when you start.'],
  ];
  if (tasting) faq.push(['Can we try the food first?', 'Yes — request a tasting below.']);

  const body = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(offer.product_name)} — prepared for ${orgName}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/png" href="/assets/img/favicon.png">
<style>
:root{--black:#0D0D0D;--green:#1A3D2E;--gold:#C6A85B;--gold-deep:#C08418;--cream:#F5F2EC;--ink:#1f2a24;--muted:#6f7b74;--line:#e3ddcf}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--cream);color:var(--ink);line-height:1.55}
nav{background:var(--black);padding:13px 22px}nav a{font-family:Georgia,serif;letter-spacing:6px;color:var(--gold);font-weight:600;text-decoration:none;font-size:20px}
.pv{background:#fbf3da;color:#6b5412;font-size:13px;text-align:center;padding:8px 12px;border-bottom:1px solid #e7d9a6}
.hero{background:var(--black);color:var(--cream);padding:38px 22px 44px;text-align:center}
.eyebrow{font-size:11px;letter-spacing:4px;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:12px}
.hero h1{font-family:Georgia,serif;font-size:clamp(26px,5vw,38px);font-weight:400;max-width:640px;margin:0 auto}
.hero p{color:rgba(245,242,236,.8);font-size:15px;margin:14px auto 0;max-width:560px}
.btn{display:inline-block;margin-top:22px;padding:14px 26px;border:none;border-radius:999px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--gold),var(--gold-deep));color:#1c1606;text-decoration:none}
.wrap{max-width:760px;margin:0 auto;padding:28px 20px 70px}
.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:-26px auto 0;max-width:760px;padding:0 20px}
.photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;border:3px solid #fff;box-shadow:0 6px 18px rgba(0,0,0,.12)}
section{background:#fff;border:1px solid var(--line);border-top:4px solid var(--gold);border-radius:14px;padding:22px;margin-top:18px}
h2{font-size:14px;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:12px}
ol{padding-left:20px}ol li{margin:6px 0}
.menu{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.menu .it{border:1px solid var(--line);border-radius:10px;overflow:hidden}.menu img{width:100%;aspect-ratio:4/3;object-fit:cover}
.menu .t{font-weight:700;color:var(--green);padding:8px 10px 0}.menu .d{font-size:13px;color:var(--muted);padding:2px 10px 10px}
details{border-bottom:1px solid var(--line);padding:10px 0}summary{cursor:pointer;font-weight:600;color:var(--green)}details p{margin-top:6px;color:var(--muted)}
label{display:block;font-size:12px;font-weight:700;color:var(--green);margin:12px 0 5px}
input,select,textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:var(--cream);font:inherit;font-size:15px}
.kinds{display:flex;gap:8px;flex-wrap:wrap}.kinds label{display:flex;gap:6px;align-items:center;margin:0;font-weight:600;border:1px solid var(--line);border-radius:999px;padding:8px 14px;background:var(--cream);cursor:pointer}
.kinds input{width:auto}.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.msg{margin-top:12px;font-size:14px}.fine{font-size:12px;color:var(--muted);margin-top:10px}
.links a{color:var(--gold-deep);margin-right:14px}
footer{text-align:center;color:var(--muted);font-size:12px;padding:26px 16px}footer a{color:var(--muted)}
</style></head><body>
<nav><a href="/">AÑEJO</a></nav>
${staffViewing ? '<div class="pv">Staff preview — this visit is not recorded as prospect engagement.</div>' : ''}
<header class="hero">
  <div class="eyebrow">Prepared for ${orgName}</div>
  <h1>${e(offer.headline)}</h1>
  <p>${e(offer.value_prop)}</p>
  <a class="btn" href="#request" data-cta="hero">${tasting ? 'Request pricing or a tasting' : 'Request pricing'}</a>
</header>
<div class="photos">${PHOTOS.map(([src, alt]) => `<img src="${src}" alt="${e(alt)}" loading="lazy">`).join('')}</div>
<div class="wrap">
<section id="how"><h2>How ${e(offer.product_name)} works</h2><ol>
  <li>We agree your delivery days, typical headcount and delivery location${'(s)'}.</li>
  <li>Each morning your team sends the day’s headcount from a private link${cutoff ? ` by ${e(cutoff)}` : ''}.</li>
  <li>We prepare the meals and deliver on your schedule.</li>
  <li>Your account receives one invoice on the schedule we agree.</li>
</ol>${offer.capacity_note ? `<p class="fine">${e(offer.capacity_note)}</p>` : ''}</section>
${sample.length ? `<section id="menu" data-track="menu_view"><h2>A sample of what we cook</h2><div class="menu">${sample.map((it) => {
    const img = menuImage(it);
    return `<div class="it">${img ? `<img src="${e(img)}" alt="${e(it.name)}" loading="lazy">` : ''}<div class="t">${e(it.name)}</div><div class="d">${e(it.description || '')}</div></div>`;
  }).join('')}</div><p class="fine">Weekly menus rotate. Ask for a sample week built for your program.</p></section>` : ''}
<section id="pricing" data-track="pricing_view"><h2>Pricing</h2><p>${e(price)}</p></section>
<section id="area"><h2>Where we deliver</h2><p>${e(offer.service_area_text || cfg.service_area.label)}${days ? ` · ${e(days)}` : ''}</p></section>
${proof ? `<section id="proof"><h2>Who we work with</h2><p>${e(proof)}</p></section>` : ''}
<section id="faq" data-track="faq_open"><h2>Questions</h2>${faq.map(([q, a]) => `<details><summary>${e(q)}</summary><p>${a}</p></details>`).join('')}</section>
<section id="request"><h2>Request ${tasting ? 'pricing, a call, or a tasting' : 'pricing or a call'}</h2>
<form id="rq" novalidate>
  <div class="kinds">
    <label><input type="radio" name="kind" value="pricing" checked> Sample menu &amp; pricing</label>
    <label><input type="radio" name="kind" value="call"> A short call</label>
    ${tasting ? '<label><input type="radio" name="kind" value="tasting"> A tasting</label>' : ''}
  </div>
  <label for="nm">Your name</label><input id="nm" name="name" autocomplete="name" required>
  <label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required>
  <label for="ph">Phone (optional)</label><input id="ph" name="phone" type="tel" autocomplete="tel">
  <label for="hc">Approximate people per day (optional)</label><input id="hc" name="headcount" inputmode="numeric">
  <label for="ms">Anything we should know (optional)</label><textarea id="ms" name="message" rows="3"></textarea>
  <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <button class="btn" type="submit" data-cta="form">Send request</button>
  <div class="msg" id="rq-msg" role="status"></div>
  <p class="fine">Or simply reply to the email we sent you. We use these details only to answer your request — see our <a href="/legal/privacy">privacy policy</a>.</p>
</form></section>
${offer.catering_link_enabled ? '<p class="links" style="margin-top:18px">Also from Añejo: <a href="/catering" data-cta="catering">event catering</a><a href="/cajita" data-cta="cajita">La Cajita</a></p>' : ''}
</div>
<footer>Añejo Catering Co. · Palm Beach County, FL</footer>
<script>
(function(){
  var T=${JSON.stringify(token)};
  function ev(name){try{fetch('/api/sales/landing-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:T,event:name}),keepalive:true});}catch(e){}}
  var seen={};
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(x){var k=x.target.getAttribute('data-track');if(x.isIntersecting&&!seen[k]){seen[k]=1;ev(k);}});},{threshold:.5});
    Array.prototype.forEach.call(document.querySelectorAll('[data-track]'),function(el){io.observe(el);});}
  Array.prototype.forEach.call(document.querySelectorAll('[data-cta]'),function(el){el.addEventListener('click',function(){if(!seen.cta){seen.cta=1;ev('cta_click');}});});
  var f=document.getElementById('rq'),m=document.getElementById('rq-msg');
  f.addEventListener('submit',function(e){e.preventDefault();var d=new FormData(f),b={t:T};d.forEach(function(v,k){b[k]=v;});
    var btn=f.querySelector('button[type=submit]');btn.disabled=true;m.textContent='Sending…';
    fetch('/api/sales/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json().catch(function(){return {};});})
      .then(function(r){if(r&&r.ok){m.textContent=r.message;f.querySelectorAll('input,textarea,button').forEach(function(x){x.disabled=true;});}else{btn.disabled=false;m.textContent=(r&&r.error)||'Something went wrong — please reply to our email instead.';}})
      .catch(function(){btn.disabled=false;m.textContent='Network error — please try again, or reply to our email.';});});
})();
</script>
</body></html>`;
  return html(body);
};
