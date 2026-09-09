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

test('sending can be turned off, and defaults to on', () => {
  assert.match(PAGE, /id="q-send" type="checkbox" checked/, 'on by default — the point is to send');
  assert.match(PAGE, /send: document\.getElementById\('q-send'\)\.checked,/);
});

test('the confirm dialog says whether it is about to message a customer', () => {
  // "Create a deposit checkout for $815.87?" does not tell you an email and a text are about to
  // leave. Anything that contacts a customer has to say so before it happens.
  assert.match(PAGE, /It will be emailed and texted to her straight away\./);
  assert.match(PAGE, /Nothing will be sent — you will get the link to send yourself\./);
  assert.match(PAGE, /var willSend = b\.send/);
});
