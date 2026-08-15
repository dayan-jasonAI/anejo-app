#!/usr/bin/env node
// verify-live.mjs — READ PRODUCTION AFTER A DEPLOY. Exit 1 on anything that is not true live.
//
//   node scripts/verify-live.mjs                 # public surfaces only (no credentials needed)
//   node scripts/verify-live.mjs --db            # + read the live D1 (needs wrangler auth)
//   node scripts/verify-live.mjs --base https://staging.example.com
//
// WHY THIS EXISTS (Dayan's ruling, 2026-08-03 — "tests passing is not the same as it working").
// In one evening three defects shipped with a fully green suite:
//   1. The owner's roster + override ops were UNREACHABLE. They sat below an
//      `if (!b.account_id) return bad(...)` guard while the HUB sent only site_id. The test
//      asserted that /op === 'set_headcount'/ appeared in the source file. A source match proves
//      code is PRESENT; it proves nothing about a request ever reaching it. The owner clicked
//      Add, saw a message, and the roster stayed empty.
//   2. The "Allow" button for a pending stand-in rendered but could never be used, because the
//      API only ever returned ACTIVE roster rows.
//   3. The first real invite text read "Añejo Catering: Añejo added you" — the session context
//      carries no `name`, so the one line meant to say WHO added you repeated the brand instead.
// Every one was found by reading production afterwards: the D1 rows, the sms_log, the live JSON.
// None was found by the suite. So the read stops being something a session remembers to do and
// becomes a script that fails.
//
// WHAT IT IS NOT. It is not a replacement for `npm test`, and it cannot exercise anything behind
// an owner login — it has no session and must not fabricate one. What it CAN do is prove that the
// deployed build is the one just pushed, that public surfaces answer, that the shapes downstream
// code depends on are really present, and (with --db) that the data those surfaces claim to have
// written is actually in the database. Where it cannot verify, it SAYS SO rather than passing.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const BASE = (argOf('--base', 'https://anejocateringco.com')).replace(/\/+$/, '');
const WITH_DB = args.includes('--db');

// When the deployed commit was made. A row older than this was produced by a PREVIOUS build, so
// it is history — evidence about the code that shipped before, never about the code running now.
let BUILD_MS = 0;
try { BUILD_MS = Number(execFileSync('git', ['log', '-1', '--format=%ct', 'origin/main'], { encoding: 'utf8' }).trim()) * 1000 || 0; } catch { BUILD_MS = 0; }

let bad = 0, skipped = 0;
const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { console.error('  ✗ ' + m); bad++; };
const skip = (m) => { console.log('  – ' + m); skipped++; };
const head = (m) => console.log('\n' + m);

async function get(path) {
  const r = await fetch(BASE + path, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
}

function d1(sql) {
  // --json so the shape is parseable; --remote so it is PRODUCTION, never the local simulator.
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'anejo', '--remote', '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
  const m = out.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('unparseable wrangler output');
  return (JSON.parse(m[0])[0] || {}).results || [];
}

// ---------------------------------------------------------------------------------------------
head(`Reading PRODUCTION at ${BASE}`);

// 1) Is the deployed build the one that was just pushed? Everything below is meaningless if the
//    answer is no — and the Pages build lags a push by ~15-60s, which is exactly long enough to
//    verify the OLD bundle and believe it.
head('Build freshness');
try {
  const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const originHead = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  if (localHead !== originHead) skip(`local HEAD ${localHead.slice(0, 7)} ≠ origin/main ${originHead.slice(0, 7)} — push first, then re-run`);
  else ok(`origin/main is ${originHead.slice(0, 7)}`);
} catch { skip('not a git checkout — cannot compare the deployed commit'); }

// 2) Public pages must answer, and must carry the markers downstream behaviour depends on.
//    A 200 alone is not proof: the OLD build also returns 200.
head('Public surfaces');
const PAGES = [
  { path: '/lunch-count', must: [
    ['whoOrdering', 'the "who is ordering" picker (multi-staff ordering)'],
    ['otherPerson', 'the covering-for-them path'],
    ['staff_id', 'the roster pick is sent to the API'],
    ['stInvite', 'the invite tick-box'],
  ] },
  { path: '/hub/owner/contracts.html', must: [
    ['add_staff', 'the owner roster control'],
    ['set_headcount', 'the owner override control'],
    ['redrawStaff', 'the in-place roster redraw'],
    ['si_', 'the owner invite tick-box'],
  ] },
];
for (const p of PAGES) {
  const r = await get(p.path);
  if (r.status !== 200) { fail(`${p.path} → HTTP ${r.status}`); continue; }
  for (const [needle, what] of p.must) {
    if (r.text.includes(needle)) ok(`${p.path} carries ${what}`);
    else fail(`${p.path} is MISSING ${what} (\`${needle}\`) — the deployed build is not this one`);
  }
}

// 3) API shape. The functions bundle deploys SEPARATELY from static assets and has lagged it by
//    ~15s in practice — a page that looks updated over an API that is not is a real state, and it
//    is how "it's live" gets said too early.
head('API');
{
  const r = await get('/api/contract/site?t=__definitely_not_a_real_token__');
  if (r.status !== 200) fail(`/api/contract/site → HTTP ${r.status}`);
  else if (!r.json) fail('/api/contract/site did not return JSON');
  else if (r.json.ok !== false) fail('/api/contract/site accepted a junk token — the link gate is open');
  else ok('/api/contract/site refuses an invalid token');
}
{
  // Routed at all? A 404 here means the file never shipped.
  const r = await fetch(BASE + '/api/contract/staff', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: '__nope__', op: 'add', name: 'x', phone: '5615550000' }),
  });
  const j = await r.json().catch(() => null);
  if (r.status === 404) fail('/api/contract/staff is NOT ROUTED — the roster endpoint never shipped');
  else if (!j || j.ok !== false) fail('/api/contract/staff did not refuse an invalid token');
  else ok('/api/contract/staff is routed and refuses an invalid token');
}

// 4) FALLBACK PRICE DRIFT — what a customer would be charged if D1 were unreachable.
//
//    Every price the store quotes and charges comes from loadMenu(env), which reads D1 so the
//    owner can reprice from the HUB without a deploy. When D1 cannot be read, loadMenu falls back
//    to the hardcoded tables in functions/_lib/menu.js and the storefront KEEPS SELLING — that
//    fail-open is deliberate (failing closed would take the whole store off sale over one missing
//    column, see the note beside `availability` in functions/api/checkout.js).
//
//    The consequence nobody sees until it happens: those constants are a SNAPSHOT. Display and
//    charge always move together — both call loadMenu, so a customer is never shown one price and
//    charged another, and that is NOT what this checks. What drifts is the fallback against the
//    owner's CURRENT intended price. Found 2026-08-15 auditing the pay tiers: the bowls had
//    drifted up to $3.00 BELOW live and the Fit drinks $2.50 ABOVE it, so an outage would have
//    quietly sold bowls at a discount and overcharged every drink.
//
//    Overcharging is called out separately and first. Underselling is lost margin; charging a
//    real card MORE than the published price is the one that has to be answered to a customer.
head('Menu fallback prices (what an outage would charge)');
{
  const r = await get('/api/menu');
  if (r.status !== 200 || !r.json) {
    fail(`/api/menu → HTTP ${r.status} — cannot read live prices to compare the fallback against`);
  } else if (r.json.source !== 'd1') {
    // NOT A PASS. If the live endpoint is itself serving the fallback, comparing it to the
    // fallback compares a table to itself and agrees every time — a vacuous green. The one
    // moment this check matters most is the one where it cannot run, so it says so instead.
    skip(`/api/menu is serving "${r.json.source}" prices, not d1 — the live table is unreadable right now, so fallback drift CANNOT be measured (re-run when D1 answers)`);
  } else {
    const { FALLBACK_BOWLS, FALLBACK_NON_BOWLS } = await import('../functions/_lib/menu.js');
    // FALLBACK_BOWLS is {id: cents}; FALLBACK_NON_BOWLS is {id: {name, price_cents}}.
    const fallback = new Map();
    for (const [id, cents] of Object.entries(FALLBACK_BOWLS)) fallback.set(id, Number(cents));
    for (const [id, v] of Object.entries(FALLBACK_NON_BOWLS)) fallback.set(id, Number(v && v.price_cents));

    const live = new Map();
    for (const row of [...(r.json.bowls || []), ...(r.json.drinks || []), ...(r.json.addons || [])]) {
      if (row && row.id != null) live.set(String(row.id), Number(row.price_cents));
    }

    const money = (c) => '$' + (Number(c) / 100).toFixed(2);
    const over = [], under = [], missing = [], orphan = [];
    for (const [id, liveCents] of live) {
      if (!fallback.has(id)) { missing.push(id); continue; }
      const f = fallback.get(id);
      if (!Number.isFinite(f) || !Number.isFinite(liveCents)) continue;
      if (f > liveCents) over.push(`${id} ${money(f)} vs ${money(liveCents)} live (+${money(f - liveCents)})`);
      else if (f < liveCents) under.push(`${id} ${money(f)} vs ${money(liveCents)} live (−${money(liveCents - f)})`);
    }
    for (const id of fallback.keys()) if (!live.has(id)) orphan.push(id);

    if (over.length) fail(`fallback OVERCHARGES ${over.length} item(s) if D1 goes down — a real card billed above the published price: ${over.join(' · ')}. Fix in functions/_lib/menu.js`);
    if (under.length) fail(`fallback UNDERSELLS ${under.length} item(s) if D1 goes down — sold below the owner's current price: ${under.join(' · ')}. Fix in functions/_lib/menu.js`);
    // A live item with NO fallback is worse than a stale one: loadMenu cannot price it at all
    // during an outage, so it silently vanishes from a storefront that is still taking orders.
    if (missing.length) fail(`${missing.length} live item(s) have NO fallback price — they disappear from the menu during a D1 outage: ${missing.join(', ')}`);
    // The reverse is only stale weight, not a money bug — reported, never failed.
    if (orphan.length) skip(`${orphan.length} fallback item(s) are no longer in the live menu (stale entries, harmless): ${orphan.join(', ')}`);
    if (!over.length && !under.length && !missing.length) ok(`all ${live.size} live price(s) match the fallback — an outage would charge exactly what the menu shows`);
  }
}

// 5) What the owner surfaces WRITE. This is the half a public probe cannot see: the endpoints
//    need a signed-in session, and this script has none and must not invent one. What it can do
//    is check the data those endpoints are supposed to produce.
head('Live data (--db)');
if (!WITH_DB) skip('skipped — pass --db to read the live database (needs wrangler auth)');
else {
  try {
    const staff = d1('SELECT site_id, name, active, is_primary, added_by FROM contract_site_staff');
    if (!staff.length) fail('contract_site_staff is EMPTY — migration 0077 never ran, so every site is back to one orderer');
    else {
      ok(`contract_site_staff has ${staff.length} row(s)`);
      const sites = d1("SELECT id, name FROM contract_sites WHERE active = 1 AND contact_phone IS NOT NULL");
      for (const s of sites) {
        const mine = staff.filter((x) => x.site_id === s.id);
        if (!mine.some((x) => x.is_primary && x.active))
          fail(`${s.name} has no ACTIVE primary on the roster — its picker is empty and nobody can order`);
        else ok(`${s.name}: ${mine.filter((x) => x.active).length} authorized, ${mine.filter((x) => !x.active).length} pending`);
      }
    }
  } catch (e) { fail('could not read contract_site_staff: ' + String(e.message || e).slice(0, 120)); }

  try {
    // Every invite that claimed to send must appear in sms_log as sent — and must carry ITS OWN
    // site's token. A crossed link files an office's head count against another office's bill.
    const rows = d1(
      "SELECT l.id, l.status, l.body, l.created_at FROM sms_log l WHERE l.direction='outbound' AND l.body LIKE '%lunch-count?t=%' ORDER BY l.created_at DESC LIMIT 20"
    );
    if (!rows.length) skip('no invite texts sent yet — nothing to check');
    else {
      const sites = d1('SELECT name, intake_token FROM contract_sites WHERE intake_token IS NOT NULL');
      let crossed = 0, failedSend = 0;
      for (const r of rows) {
        if (r.status !== 'sent' && r.status !== 'noop') failedSend++;
        const named = sites.find((s) => r.body.includes(s.name));
        if (named && !r.body.includes('t=' + named.intake_token)) crossed++;
      }
      if (crossed) fail(`${crossed} invite text(s) carry a DIFFERENT site's ordering link — a count would land on the wrong bill`);
      else ok(`${rows.length} invite text(s): every link matches the site it names`);
      if (failedSend) fail(`${failedSend} invite text(s) did not send — someone is authorized with no way in`);
      else ok('all invite texts left the building');
      // The sender line is the anti-scam signal; the brand is not a person.
      //
      // Judged on the NEWEST invite only, deliberately. Texts already delivered are history: they
      // cannot be edited, and failing on them forever would make this gate permanently red, which
      // is how a gate becomes something people scroll past. The question worth asking after a
      // deploy is "is the code STILL doing this?", and the newest message is the answer. Older
      // occurrences are reported as context, not as a failure.
      const isBrandAsPerson = (b) => /Añejo Catering: Añejo added you|Añejo Catering: Añejo te agregó/.test(b);
      const historical = rows.filter((r) => isBrandAsPerson(r.body)).length;
      // Three distinct states, and collapsing them would make this check either a permanent red
      // or a lie: STILL BROKEN (a message the CURRENT build produced has the defect) is a
      // failure; NOT YET EXERCISED (every affected message predates this build) is a skip, not a
      // pass — the fix is deployed and unproven; CLEAN is a pass.
      const sinceBuild = rows.filter((r) => Number(r.created_at) > BUILD_MS);
      const brokenSinceBuild = sinceBuild.filter((r) => isBrandAsPerson(r.body)).length;
      if (brokenSinceBuild)
        fail(`${brokenSinceBuild} invite(s) sent by the CURRENT build still name the brand as the person — not fixed`);
      else if (!sinceBuild.length && historical)
        skip(`${historical} invite(s) with the old brand-as-person line predate this build; no invite sent since — send one to prove the fix`);
      else if (sinceBuild.length)
        ok(`${sinceBuild.length} invite(s) since this build name a person (or drop the subject), never the brand twice`);
      else ok('no invites affected by the brand-as-person defect');
    }
  } catch (e) { fail('could not read sms_log: ' + String(e.message || e).slice(0, 120)); }

  // FOOD-FIRST REPAIR. The guard could name "this post has no food photo" and not fix it; the
  // repair generates one. Two things are worth reading from production rather than assuming:
  // whether the schema the badge needs is actually there, and whether anything the repair
  // produced is publishable at all.
  try {
    const col = d1("SELECT name FROM pragma_table_info('social_post_media') WHERE name='origin'");
    if (!col.length) fail("social_post_media.origin missing — migration 0076 never ran, so a generated cover cannot be badged AI");
    else ok('social_post_media.origin present (generated covers can be badged)');
  } catch (e) { fail('could not read social_post_media schema: ' + String(e.message || e).slice(0, 120)); }

  try {
    // Instagram is JPEG-only and this Worker cannot transcode. A generated cover stored as PNG is
    // a repair that produced an unpublishable post — the exact failure requireJpeg exists to stop.
    const gen = d1("SELECT media_key, origin FROM social_post_media WHERE origin='ai_generated'");
    if (!gen.length) skip('no AI-generated cover exists yet — the provider chain is unproven against live keys');
    else {
      const notJpeg = gen.filter((g) => !/\.jpe?g$/i.test(g.media_key));
      const notRole = gen.filter((g) => !/_photo\.[a-z0-9]+$/i.test(g.media_key));
      if (notJpeg.length) fail(`${notJpeg.length} generated cover(s) are not JPEG — Instagram will refuse them`);
      else ok(`${gen.length} generated cover(s), all JPEG`);
      if (notRole.length) fail(`${notRole.length} generated cover(s) lack the _photo role suffix — the guard cannot see its own repair and keeps warning`);
      else ok('every generated cover carries the _photo role suffix');
    }
  } catch (e) { fail('could not read generated covers: ' + String(e.message || e).slice(0, 120)); }

  try {
    // The original complaint: drafts whose every slide is a text card. Reported, not failed —
    // fixing them is the owner tapping a button, not something a deploy can do.
    const stuck = d1(
      "SELECT p.id FROM social_posts p WHERE p.status IN ('draft','scheduled') " +
      "AND EXISTS (SELECT 1 FROM social_post_media m WHERE m.post_id=p.id) " +
      "AND NOT EXISTS (SELECT 1 FROM social_post_media m WHERE m.post_id=p.id AND (m.media_key LIKE '%_photo.%' OR m.media_key LIKE 'studio/bowls/%'))"
    );
    if (stuck.length) skip(`${stuck.length} unshipped draft(s) still have no food photo — tap "Generate a food photo" on each`);
    else ok('no unshipped draft is text-cards-only');
  } catch (e) { fail('could not survey drafts: ' + String(e.message || e).slice(0, 120)); }

  try {
    // An owner override must be visible as such. A corrected count that looks like a client
    // submission is a record that cannot be explained when the invoice is questioned.
    const ovr = d1("SELECT COUNT(*) n, SUM(CASE WHEN notes IS NULL OR TRIM(notes)='' THEN 1 ELSE 0 END) noreason FROM contract_order_events WHERE event='owner_override'");
    const n = Number((ovr[0] || {}).n || 0), noreason = Number((ovr[0] || {}).noreason || 0);
    if (!n) skip('no owner overrides recorded yet');
    else if (noreason) fail(`${noreason} of ${n} owner override(s) carry no reason — unexplainable at invoice time`);
    else ok(`${n} owner override(s), every one with a stated reason`);
  } catch (e) { fail('could not read contract_order_events: ' + String(e.message || e).slice(0, 120)); }
}

head(bad ? `LIVE VERIFY: ${bad} problem(s) in production.` : `LIVE VERIFY: production matches what shipped${skipped ? ` (${skipped} check(s) skipped)` : ''}.`);
if (!bad && skipped) console.log('Skipped checks are NOT passes — re-run with the flags they name before calling this done.');
process.exit(bad ? 1 : 0);
