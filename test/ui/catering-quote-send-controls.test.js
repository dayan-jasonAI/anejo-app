// The Hub's quote form has to be able to say WHAT LANGUAGE to send in, and whether to send.
//
// WHAT HAPPENED (2026-09-09). The quote's language is taken from the customer's lead — the
// language she was reading the site in when she filled the form. Dayan's Spanish-speaking client
// had filled it in in ENGLISH, so the automatic pick would have emailed and texted her an English
// quote, which is the opposite of what he asked for. The backend already honoured an override;
// there was no way to set it.
//
// Structural assertions over the page source: this is an inline script in an owner-authenticated
// Hub page, so a browser run is the behavioural proof and lives in the handoff. What is pinned
// here is that the controls cannot be quietly removed and cannot send the wrong thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../../public/hub/owner/catering.html', import.meta.url), 'utf8');

test('the quote form can choose the language it sends in', () => {
  assert.match(PAGE, /id="q-lang"/);
  assert.match(PAGE, /<option value="es">Español<\/option>/);
  assert.match(PAGE, /<option value="en">English<\/option>/);
  assert.match(PAGE, /<option value="">Whatever she used on the site<\/option>/,
    'the default must defer to the lead, not pick a language');
});

test('an unset language is sent as undefined, never as "en"', () => {
  // The whole point of the blank option is to defer to her lead. Sending '' or 'en' for it would
  // override the exact thing it exists to respect.
  assert.match(PAGE, /lang: document\.getElementById\('q-lang'\)\.value \|\| undefined,/);
});

test('the lead id travels with the quote so consent is read, not re-typed', () => {
  assert.match(PAGE, /lead_id: r\.lead_id \|\| r\.id \|\| '',/, 'carried on the prefill');
  assert.match(PAGE, /lead_id: leadId \|\| undefined,/, 'and sent with the create');
  assert.match(PAGE, /leadId = r\.lead_id \|\| r\.id \|\| null;|leadId = r\.lead_id \|\| null;/,
    'and captured when a request is opened');
});

// NO EMAIL GOES OUT WITHOUT A HUMAN PREVIEW.
//
// Dayan, 2026-09-10, after a quote emailed itself to a real client the instant he pressed Create:
// "no email should go out without a human preview, this is law." The checkbox that used to sit
// here CHECKED is the thing that did it — a default that sends is a default that sends something
// nobody has read. These three tests are the law in machine form.

test('there is no send-on-create control at all', () => {
  assert.doesNotMatch(PAGE, /id="q-send"/, 'the send-on-create checkbox must not come back');
  assert.doesNotMatch(PAGE, /send: document\.getElementById/, 'and nothing may put a send flag in the create body');
});

test('creating says plainly that it sends nothing', () => {
  assert.match(PAGE, /<b>It sends nothing\.<\/b>/);
  assert.match(PAGE, /NOTHING is sent to the customer — you read it and press Send afterwards\./,
    'the confirm dialog has to say it too, before the click');
});

test('the customer can only be contacted from a second, named button', () => {
  // The send path is op:'send' against a quote that already exists — which means it existed long
  // enough for a person to read it. There is no path from the create form to a customer's inbox.
  assert.match(PAGE, /id="q-send-now"/);
  assert.match(PAGE, /op: 'send', quote_id: created\.quote_id/);
  assert.match(PAGE, /Email this quote to/, 'and it names who it is about to reach');
});

test('the preview renders the actual email, sandboxed', () => {
  assert.match(PAGE, /op: 'render'/, 'the preview asks the server for the real rendered email');
  assert.match(PAGE, /<iframe sandbox=""/, 'a customer-facing document gets no script and no same-origin');
  assert.match(PAGE, /Read the email she would get/);
});
