// The Marketing Expert role (2026-08-11).
//
// Dayan hired a marketing expert to take over the marketing system: run it daily, test it, and
// tell him what to change. She needs her own login, her own surface, and access to the marketing
// team, the website's settings, affiliates, and communication — and nothing else.
//
// A role in this codebase is not one declaration. Before this change it was a string re-typed in
// eighteen places (a JS constant nobody imported, four comms allow-lists, two push allow-lists, a
// dropdown, a validator, a nav map, a router, a training module, a quick card, a dictionary, a
// dev-login fixture, and the "ask the owner for a role" copy). Half-adding a role is the natural
// failure mode: the person can sign in and then finds a screen with no bottom bar, or a dropdown
// that offers a role the API rejects on submit. This file is what makes half-adding fail loudly.
//
// The other half of the file is the NEGATIVE case, and it is the more important one. Widening a
// guard is a one-character edit with no visible consequence until the wrong person is looking at
// the money. The tests at the bottom pin what she must NOT reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const ROLES_LIB = read('../../functions/_lib/roles.js');
const HUB_JS = read('../../public/hub/assets/hub.js');
const HUB_I18N = read('../../public/hub/assets/hub-i18n.js');
const STAFF_PAGE = read('../../public/hub/owner/staff.html');
const STAFF_API = read('../../functions/api/hub/owner/staff/index.js');
const OWNER_JS = read('../../public/hub/owner/assets/owner.js');
const DESK_PAGE = read('../../public/hub/marketing/index.html');
const DESK_JS = read('../../public/hub/marketing/assets/marketing.js');
const RUN_API = read('../../functions/api/hub/marketing/run.js');
const RUN_LIB = read('../../functions/_lib/marketing_run.js');
const TRAINING = read('../../public/hub/training.html');
const CARD = read('../../public/hub/training-card.html');
const DEV_LOGIN = read('../../functions/api/dev/login.js');

// ---------- the role exists everywhere a role has to exist ----------

test('marketing is a staff role and an employable one', () => {
  assert.match(ROLES_LIB, /export const HUB_ROLES = \[[^\]]*'marketing'/);
  assert.match(ROLES_LIB, /export const STAFF_ROLES = \[[^\]]*'marketing'/);
  // 'trainer'/'client' come from the portal, not the roster — they must NOT be employable.
  const staffList = ROLES_LIB.match(/export const STAFF_ROLES = \[([^\]]*)\]/)[1];
  assert.ok(!/'trainer'|'client'/.test(staffList), 'portal identities are not staff roles');
});

test('requireStaff derives from STAFF_ROLES rather than re-typing the list', () => {
  // As a literal it silently excluded each newly added role from every endpoint that guards with
  // it — a whole class of "she is signed in but this screen says forbidden".
  assert.match(ROLES_LIB, /export function requireStaff[\s\S]{0,160}requireRole\(request, env, STAFF_ROLES\)/);
});

test('the staff dropdown offers exactly what the staff API accepts', () => {
  // These two lists are in different languages in different files. When they disagree the owner
  // picks a role, submits, and gets "Pick a valid role" with no clue which one is wrong.
  const uiRoles = STAFF_PAGE.match(/var ROLES = \[([^\]]*)\]/)[1].match(/'([\w]+)'/g).map((s) => s.replace(/'/g, ''));
  const libRoles = ROLES_LIB.match(/export const STAFF_ROLES = \[([^\]]*)\]/)[1].match(/'([\w]+)'/g).map((s) => s.replace(/'/g, ''));
  assert.deepEqual(uiRoles, libRoles, 'staff.html ROLES must mirror STAFF_ROLES');
  assert.match(STAFF_API, /import \{[^}]*STAFF_ROLES[^}]*\} from '[^']*roles\.js'/);
  assert.match(STAFF_API, /const ROLES = STAFF_ROLES;/, 'the validator must import the list, not copy it');

  const uiTeams = STAFF_PAGE.match(/var TEAMS = \[([^\]]*)\]/)[1].match(/'([\w]+)'/g).map((s) => s.replace(/'/g, ''));
  const libTeams = ROLES_LIB.match(/export const STAFF_TEAMS = \[([^\]]*)\]/)[1].match(/'([\w]+)'/g).map((s) => s.replace(/'/g, ''));
  assert.deepEqual(uiTeams, libTeams, 'staff.html TEAMS must mirror STAFF_TEAMS');
  assert.ok(libTeams.includes('marketing'), 'she leads her own team — that is what scopes her reads');
});

test('she can be given a login: nothing in the sign-in path enumerates roles', () => {
  // Her login is the ordinary staff PIN flow. It works the moment a staff row can hold her role,
  // and staff.role has no CHECK constraint — so this is about the ROW being creatable, which the
  // dropdown/validator test above covers. Pin the two facts that would break it:
  const PIN_LOGIN = read('../../functions/api/auth/pin-login.js');
  const IDENTIFY = read('../../functions/api/auth/identify.js');
  assert.ok(!/'kitchen', 'driver'|\['owner', 'kitchen'/.test(PIN_LOGIN),
    'pin-login must not allow-list roles — any active staff row signs in');
  assert.match(PIN_LOGIN, /role: staff\.role/, 'the session carries whatever role the row holds');
  assert.ok(!/role\s*===\s*'/.test(IDENTIFY), 'identify must not branch on role either');
});

test('the dev walkthrough can sign in as her, as a lead of her own team', () => {
  assert.match(DEV_LOGIN, /marketing: \{[^}]*role: 'marketing'[^}]*team: 'marketing'[^}]*is_lead: true/);
  assert.match(DEV_LOGIN, /is_lead: !!who\.is_lead/, 'the fixture flag has to reach the session to mean anything');
});

test('"every role" allow-lists import HUB_ROLES instead of re-typing it', () => {
  // Four comms endpoints and two push endpoints each carried their own six-string literal. Every
  // one of them silently omitted the new role, which reads as a deliberate exclusion.
  for (const f of ['comms/messages', 'comms/thread-status', 'comms/threads', 'comms/unread',
                   'push/peek', 'push/subscribe']) {
    const src = read(`../../functions/api/hub/${f}.js`);
    assert.match(src, /const ALL_ROLES = HUB_ROLES;/, `${f} must derive its allow-list`);
    assert.match(src, /import \{[^}]*HUB_ROLES[^}]*\} from '[^']*roles\.js'/, `${f} must import it`);
  }
});

// ---------- she lands somewhere, and it is hers ----------

test('signing in as marketing routes to her own desk, not the owner command center', () => {
  assert.match(HUB_JS, /case 'marketing': return '\/hub\/marketing';/);
  assert.ok(existsSync(new URL('../../public/hub/marketing/index.html', import.meta.url)),
    'routeForRole must not point at a page that does not exist — that is a redirect loop');
});

test('her desk guards itself and is private', () => {
  assert.match(DESK_PAGE, /<meta\s+name="robots"\s+content="noindex">/);
  assert.match(DESK_JS, /M\.ROLES = \['owner', 'marketing'\]/);
  assert.match(DESK_JS, /Hub\.guard\(M\.ROLES\)/, 'the surface guards, it does not rely on the API alone');
  assert.match(DESK_PAGE, /Marketing\.init\('mkt-today', loadAll\)/);
});

test('the "no role yet" copy names the role, or she is told to ask for one that is not offered', () => {
  const INDEX = read('../../public/hub/index.html');
  assert.match(INDEX, /kitchen, driver, marketing, or vendor/);
});

// ---------- her bottom bar ----------

const navBlock = HUB_JS.match(/marketing: \[([\s\S]*?)\n {4}\],/);

test('she has a nav at all — a role with no NAVS entry renders no bottom bar', () => {
  assert.ok(navBlock, 'NAVS.marketing must exist');
  assert.match(HUB_JS, /Hub\.navFor = function/, 'and it must be reachable from the owner surface');
});

test('her bar fits the six-slot budget: five primary tabs plus More', () => {
  const items = [...navBlock[1].matchAll(/\{ key: '([\w-]+)'[^}]*?label: '([^']+)'[^}]*?\}/g)];
  const primary = items.filter((m) => /primary: true/.test(m[0]));
  assert.equal(primary.length, 5,
    'six slots is the bar budget (see hub.css) — a sixth primary tab plus More overflows it');
  assert.ok(items.length > primary.length, 'the rest must be reachable behind More, not dropped');
});

test('her bar is the five things she does daily, in her remit', () => {
  const primary = [...navBlock[1].matchAll(/\{ key: '([\w-]+)'[^}]*primary: true[^}]*\}/g)].map((m) => m[1]);
  assert.deepEqual(primary, ['mkt-today', 'marketing', 'partners', 'site-copy', 'comms']);
});

test('every destination on her bar is one her role can actually open', () => {
  // A tab that bounces on tap is worse than no tab: it reads as the app being broken. Each href
  // must be her own surface, a shared page widened to the desk, or a page open to all staff.
  const hrefs = [...navBlock[1].matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  const DESK_WIDENED = ['/hub/owner/marketing.html', '/hub/owner/partners.html',
    '/hub/owner/site-copy.html', '/hub/owner/content.html', '/hub/owner/traffic.html',
    '/hub/owner/adoption.html', '/hub/owner/marketing-settings.html',
    // "sms test?... its all part of marketing at the end of the day" — Dayan, 2026-08-11.
    '/hub/owner/sms-test.html'];
  for (const href of hrefs) {
    if (href.startsWith('/hub/owner/')) {
      assert.ok(DESK_WIDENED.includes(href), `${href} is an owner page not widened to the desk`);
      const file = href.replace('/hub/owner/', '');
      const src = read(`../../public/hub/owner/${file}`);
      // Not [^)]* — two of these pages pass an inline function, whose own parens end the match.
      assert.match(src, /Owner\.init\([\s\S]*?roles: Owner\.MARKETING_DESK/,
        `${href} must guard to the desk, or she is redirected straight back out`);
    }
  }
});

test('the owner pages she shares render HER bar, not the owner\'s', () => {
  // Without this she opens the marketing workspace and is looking at Finance / Kitchen / Staff.
  assert.match(OWNER_JS, /Owner\.MARKETING_DESK = \['owner', 'marketing'\]/);
  assert.match(OWNER_JS, /Hub\.renderNavWithMore\(nav, Hub\.navFor\(role\), active\)/);
  assert.match(OWNER_JS, /Owner\.init = function \(view, render, opts\)/);
  assert.match(OWNER_JS, /var roles = \(opts && opts\.roles\) \|\| \['owner'\];/,
    'the default must stay owner-only — widening is opt-in per page');
});

test('the optimistic bar is corrected once the real role is known', () => {
  // The nav paints before /api/me answers, so it reads a cached role. A cache that is never
  // re-checked is a permission bug waiting on a shared tablet.
  assert.match(HUB_JS, /Hub\.cachedRole = function/);
  assert.match(HUB_JS, /Hub\.rememberRole\(data && data\.authenticated \? Hub\.roleFromMe\(data\) : null\)/);
  assert.match(OWNER_JS, /if \(Hub\.roleFromMe\(me\) !== renderedRole\) Owner\.renderNav\(view\)/);
  const ACCOUNT = read('../../public/hub/account.html');
  assert.match(ACCOUNT, /Hub\.rememberRole\(null\)/, 'signing out must forget the role');
});

// ---------- what she may reach ----------

const DESK_APIS = ['sms-test', 'team', 'team-training', 'team-training-upload', 'social', 'social-inbox',
  'social-upload', 'social-cadence-config', 'social-cleanup', 'social-drill',
  'social-posting-times', 'campaigns', 'links', 'marketing-attribution', 'performance-alerts',
  'site-copy', 'partners', 'traffic', 'adoption', 'content'];

// Read-open, write-owner: she may SEE the state, but the write is the owner's approval authority
// itself. Listed apart from DESK_APIS so a mixed guard reads as intended rather than half-done.
const SPLIT_APIS = ['trust', 'social-autoreply'];

test('the marketing, website, affiliate and content APIs admit the desk', () => {
  for (const name of DESK_APIS) {
    const src = read(`../../functions/api/hub/owner/${name}.js`);
    assert.match(src, /requireRole\(request, env, MARKETING_DESK\)/, `${name} must admit the desk`);
    assert.ok(!/requireRole\(request, env, \['owner'\]\)/.test(src),
      `${name} still has an owner-only guard — a half-widened endpoint 403s one verb and not the other`);
  }
  for (const name of SPLIT_APIS) {
    const src = read(`../../functions/api/hub/owner/${name}.js`);
    assert.match(src, /requireRole\(request, env, MARKETING_DESK\)/, `${name} must let her read the state`);
    assert.match(src, /requireRole\(request, env, \['owner'\]\)/, `${name}'s write must stay owner-only`);
  }
});

test('communication is open to her', () => {
  // Her remit explicitly includes communication, and comms is allow-listed by HUB_ROLES, which
  // now contains her role. Pinned separately because it is reached a different way to the rest.
  assert.match(ROLES_LIB, /export const HUB_ROLES = \[[^\]]*'marketing'/);
  const THREADS = read('../../functions/api/hub/comms/threads.js');
  assert.match(THREADS, /requireRole\(request, env, ALL_ROLES\)/);
});

// ---------- what she must NOT reach ----------

test('the money stays with the owner', () => {
  // The single most important test in this file. Her remit is the marketing system, not the
  // business's bank account. Each of these must still ask for the owner alone.
  for (const name of ['finance/index', 'payouts', 'autopay', 'pricing', 'invoice', 'expenses',
                      'catering-deposit', 'pay-config']) {
    const path = new URL(`../../functions/api/hub/owner/${name}.js`, import.meta.url);
    if (!existsSync(path)) continue;
    const src = readFileSync(path, 'utf8');
    assert.ok(!/MARKETING_DESK/.test(src), `${name} must not admit the marketing desk`);
  }
});

test('the kitchen, the customer book and staff administration stay with the owner', () => {
  for (const name of ['orders', 'order-actions', 'kitchen-audit', 'customers', 'purge',
                      'staff-status', 'staff/index']) {
    const path = new URL(`../../functions/api/hub/owner/${name}.js`, import.meta.url);
    if (!existsSync(path)) continue;
    const src = readFileSync(path, 'utf8');
    assert.ok(!/MARKETING_DESK/.test(src), `${name} must not admit the marketing desk`);
  }
});

test('her bar offers no route into any of it', () => {
  const hrefs = [...navBlock[1].matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  for (const forbidden of ['finance', 'payouts', 'customers', 'staff', 'orders', 'kitchen',
                           'catering', 'pricing', 'invoice', 'rewards', 'trainers']) {
    assert.ok(!hrefs.some((h) => h.includes(forbidden)),
      `her nav must not link to ${forbidden}`);
  }
});

// ---------- the daily run ----------

test('the run defines its checks in code, with somewhere to go for each', () => {
  const keys = [...RUN_LIB.matchAll(/key: '([\w-]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 5, 'a daily run of two things is not a run');
  const hrefs = [...RUN_LIB.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(hrefs.length, keys.length, 'every check must say where to go and answer it');
  assert.match(RUN_LIB, /export const CHECK_RESULTS = \['ok', 'issue', 'skip'\]/);
});

test('a run cannot be closed with an unanswered check', () => {
  // "Not today" is an answer; silence is not. Without this, a run closes green because nobody
  // looked, which is the exact opposite of what the record is for.
  assert.match(RUN_LIB, /export function isComplete[\s\S]{0,200}CHECK_KEYS\.every/);
  assert.match(RUN_API, /if \(!isComplete\(checks\)\) return bad\('Answer every check before closing the run\.'\)/);
});

test('unknown check keys and results are refused, not stored', () => {
  assert.match(RUN_API, /if \(!CHECK_KEYS\.includes\(key\)\) return bad\('Unknown check\.'\)/);
  assert.match(RUN_API, /if \(!CHECK_RESULTS\.includes\(result\)\)/);
  assert.match(RUN_LIB, /export function normalizeChecks/);
});

test('reading the desk never creates a run — a glance is not a check', () => {
  const get = RUN_API.slice(RUN_API.indexOf('onRequestGet'), RUN_API.indexOf('onRequestPost'));
  assert.ok(!/INSERT INTO marketing_daily_runs/.test(get),
    'a GET that writes makes "was it checked today" answer yes for opening the page');
});

test('the run and her findings are gated to the desk, both verbs', () => {
  const guards = RUN_API.match(/requireRole\(request, env, MARKETING_DESK\)/g) || [];
  assert.equal(guards.length, 2, 'GET and POST each ask for the desk');
});

// ---------- her feedback reaches the owner ----------

test('feedback lands in the feed the owner already reads', () => {
  // A second inbox he has to remember to open is a message not delivered.
  const ALERTS = read('../../functions/_lib/alerts.js');
  assert.match(ALERTS, /'marketing_feedback',/, 'the alert type must be registered or raiseAlert drops it');
  assert.match(RUN_API, /alert_type: 'marketing_feedback'/);
  assert.match(DESK_PAGE, /op: 'feedback'/);
});

test('a run that found problems tells him by itself; a clean one stays quiet', () => {
  assert.match(RUN_API, /if \(issues > 0\) \{[\s\S]{0,400}alert_type: 'marketing_feedback'/);
  assert.match(RUN_API, /severity: 'warning'/);
});

test('the table exists for any of it to persist', () => {
  const MIGRATION = read('../../migrations/0089_marketing_desk.sql');
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS marketing_daily_runs/);
  assert.match(MIGRATION, /CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_daily_runs_date/,
    'one run per day, or "was it checked today" has more than one answer');
});

// ---------- her training ----------

test('she has her own tutorial, offered on the role picker', () => {
  assert.match(TRAINING, /\{ key:'marketing',[^}]*en:'Marketing expert'/);
  assert.match(TRAINING, /^ {2}marketing: \[/m, 'and a module behind it');
});

test('her tutorial teaches the run, the testing and the feedback — not just the tour', () => {
  const block = TRAINING.slice(TRAINING.indexOf('  marketing: ['), TRAINING.indexOf('\n  ],', TRAINING.indexOf('  marketing: [')));
  assert.match(block, /daily run/i);
  assert.match(block, /Test it, don’t trust it/, 'opening the thing is the evidence — that is the job');
  assert.match(block, /Tell the owner/);
});

test('she gets a printable quick card like every other role', () => {
  assert.match(CARD, /marketing:\{ role:\{en:'Marketing expert'/);
  const block = CARD.slice(CARD.indexOf('marketing:{'), CARD.indexOf('vendor:{'));
  assert.match(block, /es:\[/, 'bilingual, like the rest of the cards');
});

// ---------- bilingual ----------

test('her role label and the desk\'s visible strings have Spanish', () => {
  assert.match(HUB_I18N, /"marketing": "marketing"/, 'the dropdown/badge label');
  for (const s of ['Affiliate', 'Site copy', 'Today’s run', 'Tell the owner', 'Send to owner',
                   'Close today’s run', 'Marketing settings']) {
    assert.ok(HUB_I18N.includes(`"${s}"`), `"${s}" is rendered to her and has no Spanish entry`);
  }
});

// ---------- the constants are imported wherever they are used ----------

test('every file using a roles.js constant imports it', () => {
  // CI caught this and the local suite did not: traffic.js used MARKETING_DESK without importing
  // it — a ReferenceError on the first request, and the ONLY signal was eslint's no-undef. Every
  // test here reads source as text, so a missing import is invisible to all of them. This walks
  // functions/ and closes that gap without needing eslint installed.
  const NAMES = ['MARKETING_DESK', 'HUB_ROLES', 'STAFF_ROLES', 'STAFF_TEAMS'];
  // fileURLToPath, not `.pathname`: the latter is percent-encoded, so a checkout under a path
  // with a space (e.g. "Dayan Workspace" — real, on the machine this runs on) turns into a
  // literal %20 and readdirSync ENOENTs on a directory that does not exist. Found 2026-08-15.
  const root = fileURLToPath(new URL('../../functions', import.meta.url));

  const walk = (dir) => readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : (full.endsWith('.js') ? [full] : []);
  });

  for (const file of walk(root)) {
    if (file.endsWith('_lib/roles.js')) continue;   // where they are declared
    const src = readFileSync(file, 'utf8');
    for (const name of NAMES) {
      // Uses, not the import clause itself.
      const stripped = src.replace(/import \{[^}]*\} from '[^']*';/g, '');
      if (!new RegExp(`\\b${name}\\b`).test(stripped)) continue;
      assert.match(src, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '[^']*roles\\.js'`),
        `${file.slice(root.length + 1)} uses ${name} without importing it`);
    }
  }
});

// ---------- the owner's approval authority is not hers to hand herself ----------

test('the two autonomy switches stay owner-only', () => {
  // Both of these decide whether a HUMAN TAP is still required before something reaches a
  // customer — trust_ledger.auto_publish for Instagram, social.auto_reply for Aña's replies.
  // Both were widened to the desk in error on 2026-08-11. A role whose output is the thing
  // being approved cannot also be the role that decides approval is no longer needed.
  for (const [file, what] of [['trust.js', 'auto-publish'], ['social-autoreply.js', 'Aña auto-reply']]) {
    const src = read(`../../functions/api/hub/owner/${file}`);
    const post = src.slice(src.indexOf('onRequestPost'));
    assert.match(post, /requireRole\(request, env, \['owner'\]\)/,
      `the ${what} toggle must ask for the owner, not the desk`);
    // ...while the GET stays hers, so she can see what still needs his eyes.
    const get = src.slice(src.indexOf('onRequestGet'), src.indexOf('onRequestPost'));
    assert.match(get, /requireRole\(request, env, MARKETING_DESK\)/,
      `reading the ${what} state must stay available to her`);
  }
});

test('she runs the affiliate programme but cannot pay an affiliate', () => {
  // partners.js is hers in full EXCEPT the two ops that touch money. mark_paid settles what a
  // partner is owed; authorizePayout's safeties answer "was this amount approved", not "may
  // this person spend" — so the role check has to be here as well.
  const P = read('../../functions/api/hub/owner/partners.js');
  assert.match(P, /const ownerOnly = \(o\) => o === 'set_payout' \|\| o === 'mark_paid';/);
  assert.match(P, /if \(ownerOnly\(op\) && ctx\.role !== 'owner'\)/);
  // The programme ops stay hers — otherwise "she handles affiliates" means she can only look.
  for (const op of ['onboard', 'create_code', 'set_code_status', 'resend_welcome']) {
    assert.ok(!new RegExp(`ownerOnly[\\s\\S]{0,80}'${op}'`).test(P), `${op} must remain hers`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// Round two (2026-08-11): time trace, session report, requests, and the notification wiring.
// ══════════════════════════════════════════════════════════════════════════════════════════

const SESSION_API = read('../../functions/api/hub/marketing/session.js');
const REQUESTS_API = read('../../functions/api/hub/marketing/requests.js');
const MESSAGES_API = read('../../functions/api/hub/comms/messages.js');
const ALERTS_LIB = read('../../functions/_lib/alerts.js');
const TRUST_LIB = read('../../functions/_lib/trust_ledger.js');
const OWNER_INDEX = read('../../public/hub/owner/index.html');

// ---------- time trace, without a timeclock ----------

test('engaged time is accrued from heartbeats, not from wall clock', () => {
  // The whole honesty of the number. (ended - started) would let a tab left open overnight read
  // as ten hours of work, which is worse than not measuring at all.
  assert.match(SESSION_API, /export function accrue\(prevSeenAt, atMs\)/);
  assert.match(SESSION_API, /if \(gap > IDLE_GAP_MS\) return 0;/,
    'a gap wider than the idle window must contribute nothing');
  assert.match(SESSION_API, /active_seconds=active_seconds\+\?/,
    'time is accumulated per heartbeat, never computed from the endpoints');
});

test('a stale session is closed where it stopped, not where we noticed', () => {
  assert.match(SESSION_API, /STALE_SESSION_MS/);
  assert.match(SESSION_API, /UPDATE marketing_sessions SET ended_at=\?[\s\S]{0,120}\.bind\(live\.last_seen_at/,
    'ended_at must be the last heartbeat — anything later invents time she did not work');
});

test('the heartbeat pauses when the tab is hidden', () => {
  // Server-side idle rejection is the real guard, but a client that keeps pinging a backgrounded
  // tab would keep the session alive all night and defeat it.
  assert.match(DESK_PAGE, /if \(document\.hidden\) return;/);
  assert.match(DESK_PAGE, /op: 'ping'/);
});

test('there is still no clock-in — this is a trace, not a shift', () => {
  // The kitchen/driver timeclock writes `shifts` rows and drives lateness + the on-shift roster.
  // Dayan: "i don't need her to clock in or out but I do need a time log".
  assert.ok(!/INSERT INTO shifts|clock_in/.test(SESSION_API),
    'the marketing desk must never write a shift row');
  assert.match(SESSION_API, /op !== 'ping' && op !== 'report'/, 'the only two ops are ping and report');
});

// ---------- the end-of-session report ----------

test('the report asks five named questions, not for one free-text blob', () => {
  // A person asked five specific things answers five; a person given a blank box writes "all good".
  const keys = [...SESSION_API.matchAll(/\{ key: '(\w+)', label:/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['work_done', 'obstacles', 'good_news', 'bad_news', 'feedback']);
});

test('the report reaches the owner with the time worked attached', () => {
  assert.match(SESSION_API, /alert_type: 'marketing_session_report'/);
  assert.match(SESSION_API, /Marketing update — \$\{mins\} min worked/);
  assert.match(ALERTS_LIB, /'marketing_session_report',/, 'registered, or raiseAlert drops it');
});

test('bad news raises the severity — the feed colour says which reports need him today', () => {
  assert.match(SESSION_API, /const severity = vals\.bad_news \? 'warning' : 'info';/);
});

test('an empty report is refused', () => {
  assert.match(SESSION_API, /Write at least one line before sending the update/);
});

// ---------- improvement requests as a tracked object ----------

test('a request has a status the owner moves, and declining is a real outcome', () => {
  assert.match(REQUESTS_API, /export const REQUEST_STATUSES = \['open', 'accepted', 'declined', 'shipped'\]/);
  assert.match(REQUESTS_API, /status === 'open'[\s\S]{0,80}Decide it: accepted, declined or shipped/,
    'deciding must not be able to set it back to open');
});

test('only the owner decides — she files and reads', () => {
  // Without this she could mark her own request accepted and the status would mean nothing.
  assert.match(REQUESTS_API, /if \(ctx\.role !== 'owner'\) return bad\('Only the owner decides a request\.', 403\)/);
  assert.match(REQUESTS_API, /op === 'file'/, 'and filing stays hers');
});

test('his reason comes back to her verbatim', () => {
  assert.match(REQUESTS_API, /owner_note/);
  assert.match(DESK_PAGE, /req-note/, 'and the desk renders it');
});

test('filing a request still tells him, through the feed he already reads', () => {
  assert.match(REQUESTS_API, /alert_type: 'improvement_request'/);
  assert.match(ALERTS_LIB, /'improvement_request',/);
});

// ---------- notifications ----------

test('a reply wakes the other PARTICIPANT, not a guessed role', () => {
  // The bug this replaces: a staff-opened thread has staff_id = the OWNER (that is the routing)
  // and created_by = the staffer. On his reply, `staff_id !== sender` was false and
  // `role !== 'owner'` was false, so BOTH branches fell through and she was never told.
  assert.match(MESSAGES_API, /\[thread\.staff_id, thread\.created_by\]/);
  assert.match(MESSAGES_API, /\.filter\(\(x\) => x && x !== ctx\.distinct_id\)/);
  assert.match(MESSAGES_API, /sendPushTickle\(env, \{ staffIds: targets \}\)/);
});

test('an alert can be aimed at someone other than the owner', () => {
  assert.match(ALERTS_LIB, /opts\.notifyRoles/);
  assert.match(ALERTS_LIB, /const audience = \['owner', \.\.\.extra\.filter\(\(r\) => r !== 'owner'\)\]/,
    'the owner is always included; extras never replace him');
});

test('the alerts that are her work reach her device too', () => {
  for (const [file, what] of [
    ['_lib/instagram_insights.js', 'performance signals'],
    ['_lib/social_leads.js', 'a commercial DM'],
  ]) {
    const src = read(`../../functions/${file}`);
    assert.match(src, /notifyRoles: \['marketing'\]/, `${what} must notify the marketing desk`);
  }
});

test('a lane that EARNS auto-publish tells him — he cannot flip a switch nobody mentioned', () => {
  assert.match(TRUST_LIB, /alert_type: 'trust_lane_eligible'/);
  assert.match(TRUST_LIB, /dedupe_key: `trust_eligible:\$\{category\}`/,
    'eligibility is a state, not an event — re-announcing it trains him to ignore it');
  assert.match(TRUST_LIB, /if \(Number\(r\.auto_publish\) === 1\) return;/,
    'a lane already running unattended has nothing to decide');
  assert.match(TRUST_LIB, /notifyRoles: \['marketing'\]/, 'and she is told, since it is her streak');
});

test('an alert that asks for a decision carries the way to make it', () => {
  // Acknowledging "this lane earned auto-publish" with no route to the switch is how a decision
  // sits unmade for a month.
  assert.match(OWNER_INDEX, /function actionFor\(a\)/);
  assert.match(OWNER_INDEX, /case 'trust_lane_eligible':/);
  assert.match(OWNER_INDEX, /Open the trust cockpit/);
  assert.match(OWNER_INDEX, /act \? '<a class="btn gold"/, 'and it renders as a real button on the card');
  assert.match(OWNER_INDEX, /default:\s*\n\s*return null;/, 'alerts with no next action stay Ack-only');
});

// ---------- schema ----------

test('the round-two tables exist', () => {
  const M = read('../../migrations/0090_marketing_desk_ops.sql');
  assert.match(M, /CREATE TABLE IF NOT EXISTS marketing_sessions/);
  assert.match(M, /CREATE TABLE IF NOT EXISTS improvement_requests/);
  assert.match(M, /active_seconds INTEGER NOT NULL DEFAULT 0/);
});

test('she can approve an affiliate but not set their commission', () => {
  // The one-tap approve/decline ops arrived AFTER the payout guard and run before it, and both
  // accept commission_pct / payout_method — which is `set_payout` by another name. Terms fall
  // back to the house default for anyone who is not the owner.
  const P = read('../../functions/api/hub/owner/partners.js');
  assert.match(P, /const terms = \(raw\) => \(ctx\.role === 'owner'/);
  assert.match(P, /commission_pct: undefined, payout_method: undefined/);
  assert.match(P, /onboardPartner\(env, request, terms\(b\)\)/, 'the onboard op must launder its input');
  assert.match(P, /onboardPartner\(env, request, terms\(\{/, 'and so must approve_application');
  // The act itself stays hers — approving affiliates is the job.
  assert.ok(!/ownerOnly[\s\S]{0,120}approve_application/.test(P), 'approving must remain hers');
});
