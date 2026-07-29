// Scheduled sends and the saved-template library.
//
// Scheduling moves the send from "a human is watching a progress bar" to "nobody is in the room",
// which changes what can go wrong:
//
//   · NOBODY CATCHES A DOUBLE SEND. The page used to be the only caller; now a timer fires every
//     minute and can overlap a click. The claim-before-send has to hold.
//   · LATE IS NOT DUE. If the scheduler was down, a campaign comes due hours after its moment.
//     "Order by 10 AM" landing at 6 PM is worse than never landing, and it goes to the whole list.
//   · A SCHEDULE THAT CANNOT FIRE IS A TRAP. The scheduler is a SEPARATE Cloudflare Worker. If it
//     is not deployed, a scheduled campaign sits there forever looking fine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const API = readFileSync(new URL('../../functions/api/hub/owner/campaigns.js', import.meta.url), 'utf8');
const TICK = readFileSync(new URL('../../functions/api/hub/admin/campaigns-tick.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0058_campaign_templates_and_schedule.sql', import.meta.url), 'utf8');
const CRON = readFileSync(new URL('../../cron/worker.js', import.meta.url), 'utf8');
const UI = readFileSync(new URL('../../public/hub/owner/campaigns.html', import.meta.url), 'utf8');

// ---------- one send path, not two ----------

test('the timer and the page drive the SAME send routine', () => {
  // Two copies of "freeze the audience, claim each recipient, recompute counters" would drift, and
  // the copy nobody watches is the one that would drift unnoticed.
  assert.match(API, /export async function sendCampaignBatch/);
  assert.match(API, /const r = await sendCampaignBatch\(\{ env, request, cid, expect: b\.expect \}\)/);
  assert.match(TICK, /import \{ sendCampaignBatch \} from '\.\.\/owner\/campaigns\.js'/);
  assert.match(TICK, /await sendCampaignBatch\(\{ env, request, cid: c\.id/);
});

test('the claim still guards against a click racing the timer', () => {
  // The conditional UPDATE is the only mutex available. Without it, a tick firing while the owner
  // clicks Send mails the same list twice.
  assert.match(API, /UPDATE campaigns SET status='sending', recipients=\?, updated_at=\? WHERE id=\? AND status=\?/);
  assert.match(API, /UPDATE campaign_sends SET status='sent', reason=NULL WHERE id=\? AND status='queued'/);
});

test('a scheduled campaign freezes its audience when it FIRES, not when it was scheduled', () => {
  // "Send Friday to the launch list" means the list on Friday. Freezing at schedule time would
  // silently exclude everyone who signed up in between.
  assert.match(API, /if \(c\.status === 'draft' \|\| c\.status === 'scheduled'\)/);
});

test('the timer passes no expected count', () => {
  // `expect` exists to catch "I thought I was mailing 40 people" — a human comparing a number on
  // screen. With nobody watching there is no such number, and enforcing a stale one would refuse
  // to send for no reason.
  assert.match(TICK, /expect: undefined/);
});

// ---------- late is not due ----------

test('a campaign that comes due too late does NOT send', () => {
  assert.match(TICK, /const GRACE_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(TICK, /if \(late > GRACE_MS\)/);
  assert.match(TICK, /UPDATE campaigns SET status='draft', schedule_note=\?/);
});

test('a missed schedule records WHY, and says it in the HUB', () => {
  // Otherwise it reappears as a plain draft and reads as though it was never scheduled.
  assert.match(MIG, /ALTER TABLE campaigns ADD COLUMN schedule_note TEXT/);
  assert.match(TICK, /the scheduler was not running/);
  assert.match(UI, /draft\.schedule_note \? '<div class="warn"/);
});

test('a stalled mid-send campaign is resumed, not abandoned', () => {
  // A list bigger than one tick's budget sits at 'sending' with rows queued. Half-sent is the one
  // outcome worse than unsent.
  assert.match(TICK, /SELECT id, name FROM campaigns WHERE status='sending'/);
  assert.match(TICK, /kind: 'resume'/);
});

// ---------- a schedule that cannot fire ----------

test('the scheduler is actually wired into the cron worker', () => {
  // The endpoint existing is not the feature. Being POSTed every minute is.
  assert.match(CRON, /const EVERY_MINUTE = \['\/api\/hub\/admin\/offers-tick', '\/api\/hub\/admin\/campaigns-tick'\]/);
});

test('the HUB says so when the scheduler is not configured', () => {
  assert.match(API, /scheduler_ready: !!env\.CRON_KEY/);
  assert.match(UI, /will <b>not<\/b> send on its own/);
});

test('the tick is not open to the internet', () => {
  assert.match(TICK, /ctEq\(cronKey, env\.CRON_KEY\)/);
  assert.match(TICK, /requireRole\(request, env, \['owner'\]\)/);
});

// ---------- scheduling rules ----------

test('only something that has not gone out can be scheduled', () => {
  assert.match(API, /Only a draft can be scheduled/);
  assert.match(API, /row\.status !== 'draft' && row\.status !== 'scheduled'/);
});

test('a scheduled campaign is still editable, a sent one is not', () => {
  // It has not gone anywhere. Freezing it would mean re-creating a draft to fix a typo.
  assert.match(API, /has already gone out — start a new draft instead of editing it/);
  assert.match(API, /A scheduled campaign has not gone anywhere yet, so it is still editable/);
});

test('a time in the past is refused, with a minute of slack', () => {
  // Typing 9:00 at 9:00:30 is not a mistake, but yesterday is.
  assert.match(API, /if \(when < t - 60000\) return bad\('That time has already passed\.'\)/);
});

test('an absurd date is caught rather than scheduled', () => {
  assert.match(API, /more than a year away/);
});

test('the schedule can be taken off again', () => {
  assert.match(API, /op === 'schedule' \|\| op === 'unschedule'/);
  assert.match(API, /UPDATE campaigns SET status='draft', scheduled_at=NULL, schedule_note=NULL/);
});

test('the picker builds LOCAL time, never an ISO string', () => {
  // toISOString() on a local Date shifts by the timezone offset — in ET that schedules the send
  // four hours early, which is exactly the kind of bug that only shows up in production.
  // Matched as a CALL, not as the word — the source comment explains why it is avoided.
  assert.ok(!/toISOString\s*\(/.test(UI), 'no UTC round-trip in the datetime-local value');
  assert.match(UI, /d\.getFullYear\(\) \+ '-' \+ p\(d\.getMonth\(\) \+ 1\)/);
});

test('scheduling saves the copy first', () => {
  // Scheduling a body that was never written to the row would send the previous version.
  assert.match(UI, /save\(\)\.then\(function \(ok\) \{\s*if \(!ok\) return;\s*Hub\.api\('\/api\/hub\/owner\/campaigns', \{ method: 'POST', body: \{ op: 'schedule'/);
});

// ---------- the template library ----------

test('templates are their own table, carrying no audience or send history', () => {
  // Loading a template must not be able to drag a previous send's roster or counters with it.
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS campaign_templates/);
  assert.ok(!/campaign_templates[\s\S]*?segment/.test(MIG), 'no segment on a template');
  assert.ok(!/campaign_templates[\s\S]*?sent_count/.test(MIG), 'no counters on a template');
});

test('saving under a name you already used REPLACES it', () => {
  // Otherwise the dropdown fills with copies of "Founders 8am" that cannot be told apart.
  assert.match(MIG, /CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_templates_name ON campaign_templates \(channel, name\)/);
  assert.match(API, /ON CONFLICT\(channel, name\) DO UPDATE SET/);
});

test('a template remembers its format and subject, not just the body', () => {
  // Loading an HTML template into a plain-text campaign would send escaped markup.
  assert.match(API, /INSERT INTO campaign_templates \(id, name, channel, subject, body, body_format/);
  assert.match(UI, /draft\.body_format = t\.body_format === 'html' \? 'html' : 'text';/);
});

test('deleting a template cannot affect a campaign already sent', () => {
  // A campaign copies the body at save time; a template is a starting point, not a live link.
  assert.match(API, /Deleting a template touches no campaign/);
  assert.match(API, /DELETE FROM campaign_templates WHERE id=\?/);
});

test('the picker only offers templates for the channel in hand', () => {
  assert.match(UI, /\(x\.channel \|\| 'email'\) === draft\.channel/);
});

test('loading over existing copy asks first', () => {
  assert.match(UI, /Replace the message below with/);
});
