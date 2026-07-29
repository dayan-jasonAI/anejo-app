// Owner-supplied HTML email templates.
//
// The whole risk of this feature is in one sentence: a designed template is the entire document,
// so it bypasses the Añejo shell — and the Añejo shell is where the unsubscribe link and postal
// address were guaranteed to be. A template exported from a design tool has a pretty footer with
// a company name and NO opt-out. The real one that prompted this feature ends with "PALM BEACH
// COUNTY, FLORIDA", which is a service area, not the postal address CAN-SPAM requires.
//
// Sending that untouched would put marketing mail with no exit on the same domain that carries
// receipts and magic links. Every test below exists to make that impossible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeTemplate, htmlToText, templateAudit, hasToken, injectBeforeBodyEnd } from '../../functions/_lib/email-template.js';
import { renderCampaignEmail } from '../../functions/api/hub/owner/campaigns.js';

const CAMPAIGNS = readFileSync(new URL('../../functions/api/hub/owner/campaigns.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0057_campaign_html_templates.sql', import.meta.url), 'utf8');

const UNSUB = 'https://anejocateringco.com/api/unsubscribe?a=x%40y.com&c=email';
const POSTAL = 'Añejo Catering Co. LLC · 10058 Spanish Isles Blvd, Unit F8, Boca Raton, FL 33498';

// Shaped like the real export: full document, dark background, its own footer, no opt-out.
const DESIGNED = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans" rel="stylesheet"><title>Añejo</title></head>
<body style="margin:0;background:#071207;">
<div style="display:none;">Your Founders window is open until 10 AM.</div>
<h1 style="color:#E8E2CA;">Today is the day.</h1>
<a href="https://anejocateringco.com/order">Claim Your Bowls</a>
<p>AÑEJO CATERING CO. LLC &middot; PALM BEACH COUNTY, FLORIDA</p>
</body></html>`;

const render = (body, over = {}) =>
  renderCampaignEmail({ body, format: 'html', unsubUrl: UNSUB, postal: POSTAL, name: 'Arianne Vega', address: 'x@y.com', ...over });

// ---------- the exit is not optional ----------

test('a designed template with no opt-out still goes out with one', () => {
  const { html, footerAppended } = render(DESIGNED);
  assert.equal(footerAppended, true);
  assert.ok(html.includes('/api/unsubscribe'), 'an unsubscribe link was added');
  assert.ok(html.includes('10058 Spanish Isles Blvd'), 'the real postal address was added');
});

test('the added block lands INSIDE the document, not after </html>', () => {
  // Appended after the closing tag it is outside the body: clients may drop it, and a legal
  // notice that some inboxes never render is not a legal notice.
  const { html } = render(DESIGNED);
  assert.ok(html.indexOf('/api/unsubscribe') < html.toLowerCase().indexOf('</body>'));
});

test('a template that carries BOTH tokens keeps its own footer, untouched', () => {
  // The opt-out from the appended block — the owner took responsibility for the design.
  const own = '<html><body><p>Hi</p><footer><a href="{{unsubscribe_url}}">Unsubscribe</a><br>{{postal_address}}</footer></body></html>';
  const { html, footerAppended } = render(own);
  assert.equal(footerAppended, false);
  assert.ok(!html.includes('background:#f4f2ec'), 'no grey strip under their artwork');
  assert.ok(html.includes('10058 Spanish Isles Blvd'));
  assert.ok(html.includes('/api/unsubscribe'));
});

test('ONE token is not enough to opt out — both are required', () => {
  // CAN-SPAM wants an opt-out AND a physical address. Honouring a template that has only one of
  // them would let a half-finished footer disable the block that supplies the other.
  for (const partial of [
    '<html><body><a href="{{unsubscribe_url}}">out</a></body></html>',
    '<html><body>{{postal_address}}</body></html>',
  ]) {
    const { footerAppended, html } = render(partial);
    assert.equal(footerAppended, true, 'the block is still appended');
    assert.ok(html.includes('10058 Spanish Isles Blvd') && html.includes('/api/unsubscribe'));
  }
});

test('compliance is NOT decided by sniffing the rendered content', () => {
  // A template that merely mentions an address or the word "unsubscribe" must not pass. The cost
  // of a false positive here is bulk mail with no working exit.
  const decoy = '<html><body><p>Unsubscribe anytime. 10058 Spanish Isles Blvd, Boca Raton, FL 33498</p></body></html>';
  const { footerAppended, html } = render(decoy);
  assert.equal(footerAppended, true);
  assert.ok(html.includes('/api/unsubscribe'), 'a REAL link, not the word');
});

test('the unsubscribe URL survives as a working href', () => {
  // The `&` between query parameters must be `&amp;` inside an href, or the link breaks at &c.
  const { html } = render('<html><body><a href="{{unsubscribe_url}}">out</a>{{postal_address}}</body></html>');
  assert.ok(html.includes('a=x%40y.com&amp;c=email'), 'escaped for HTML, still one URL');
  assert.ok(!/a=x%40y\.com&c=/.test(html));
});

// ---------- plain text campaigns are untouched ----------

test('a plain-text campaign renders exactly as it always did', () => {
  // The regression that would matter most: this feature must not change the 4 campaigns already
  // sent, nor the default for the next one.
  const { html, text, footerAppended } = renderCampaignEmail({ body: 'Hello\n\nWorld', format: 'text', unsubUrl: UNSUB, postal: POSTAL });
  assert.ok(html.includes('<p>Hello</p>'), 'still escaped and paragraphed');
  assert.ok(html.includes('10058 Spanish Isles Blvd'));
  assert.equal(text, null, 'unchanged wire shape for existing campaigns');
  assert.equal(footerAppended, true);
});

test('plain text is still escaped — a template opts in explicitly', () => {
  const { html } = renderCampaignEmail({ body: '<b>not bold</b>', format: 'text', unsubUrl: UNSUB, postal: POSTAL });
  assert.ok(html.includes('&lt;b&gt;'), 'markup typed into the plain box is shown, never executed');
});

test('the format defaults to text and SMS can never be html', () => {
  assert.match(MIG, /ADD COLUMN body_format TEXT NOT NULL DEFAULT 'text'/);
  assert.match(CAMPAIGNS, /channel === 'email' && b\.body_format === 'html' \? 'html' : 'text'/);
});

// ---------- the text/plain alternative ----------

test('a text alternative is derived, and keeps its links', () => {
  const { text } = render(DESIGNED);
  assert.ok(text.includes('Today is the day.'));
  assert.ok(text.includes('Claim Your Bowls (https://anejocateringco.com/order)'), 'a CTA without its URL reads as complete but is dead');
  assert.ok(text.includes('/api/unsubscribe'), 'the exit exists in the text part too');
  assert.ok(!/<[a-z]/i.test(text), 'no tags left');
});

test('the text part carries no style or script noise', () => {
  const t = htmlToText('<html><head><style>.a{color:red}</style><title>T</title></head><body><p>Real</p></body></html>');
  assert.equal(t, 'Real');
});

test('entities are decoded, not left as &middot;', () => {
  assert.equal(htmlToText('<p>A &middot; B &amp; C&nbsp;D &rsquo;</p>').replace(/\s+/g, ' ').trim(), 'A · B & C D ’');
});

test('sendEmail is given the text part', () => {
  assert.match(CAMPAIGNS, /text: msg\.text,/);
});

// ---------- merge tokens ----------

test('the recipient name is carried on the FROZEN roster, not re-queried', () => {
  // Re-resolving the audience mid-send is exactly what freezing it exists to prevent.
  assert.match(MIG, /ALTER TABLE campaign_sends ADD COLUMN name TEXT/);
  assert.match(CAMPAIGNS, /INSERT OR IGNORE INTO campaign_sends \(id, campaign_id, address, name, status, created_at\)/);
  assert.match(CAMPAIGNS, /SELECT id, address, name FROM campaign_sends/);
});

test('{{first_name}} is the first name, {{name}} the whole one', () => {
  const { html } = render('<html><body>Hi {{first_name}} / {{name}} / {{email}}</body></html>');
  assert.ok(html.includes('Hi Arianne / Arianne Vega / x@y.com'));
});

test('a missing name leaves no stray "Hi ," — it renders empty', () => {
  const { html } = render('<html><body>[{{first_name}}]</body></html>', { name: null });
  assert.ok(html.includes('[]'));
});

test('a name with markup in it cannot inject into the email', () => {
  const { html } = render('<html><body>{{name}}</body></html>', { name: '<script>x</script>' });
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('an unknown token is left visible rather than silently deleted', () => {
  // Shown, the owner sees their typo in the preview. Deleted, they find out from the list.
  const { html } = render('<html><body>{{frist_name}}</body></html>');
  assert.ok(html.includes('{{frist_name}}'));
});

// ---------- hygiene and the pre-send audit ----------

test('script tags and inline handlers are stripped', () => {
  const dirty = '<html><body><script>alert(1)</script><img src="x" onerror="alert(2)"><p>ok</p></body></html>';
  const clean = sanitizeTemplate(dirty);
  assert.ok(!/<script/i.test(clean));
  assert.ok(!/onerror/i.test(clean));
  assert.ok(clean.includes('<p>ok</p>'), 'the design itself survives');
});

test('the audit names what the owner needs to fix BEFORE the send', () => {
  const a = templateAudit(DESIGNED);
  assert.equal(a.has_unsubscribe_token, false);
  assert.equal(a.has_postal_token, false);
  assert.equal(a.uses_remote_stylesheet, true, 'Gmail strips <link> — explains a font that works everywhere but the inbox');
  assert.equal(a.looks_like_document, true);
  assert.equal(a.too_big_for_gmail, false);
  assert.ok(a.bytes > 0);
});

test('a template over Gmail\'s clip threshold is flagged', () => {
  // Past ~102KB Gmail hides the rest behind "View entire message" — including the unsubscribe
  // link, if it is at the bottom. Which it is.
  assert.equal(templateAudit('<html><body>' + 'x'.repeat(103000) + '</body></html>').too_big_for_gmail, true);
});

test('injection falls back to appending when there is no </body>', () => {
  assert.equal(injectBeforeBodyEnd('<p>fragment</p>', '[F]'), '<p>fragment</p>[F]');
  assert.equal(hasToken('{{ unsubscribe_url }}', 'unsubscribe_url'), true, 'whitespace inside the braces is tolerated');
});

test('the appended band cannot go invisible in Outlook', () => {
  // Outlook ignores CSS `background` on a table. If the band fails to paint, #5b5b5b text lands on
  // the template's own body colour — near-black on near-black for the dark template this feature
  // was built for. An unreadable opt-out is legally the same as no opt-out, so the colour is
  // carried by the bgcolor ATTRIBUTE too, on both the table and the cell.
  const { html } = render(DESIGNED);
  const band = html.slice(html.indexOf('Unsubscribe from marketing email') - 700);
  assert.equal((band.match(/bgcolor="#f4f2ec"/g) || []).length >= 2, true, 'table AND cell');
  assert.match(CAMPAIGNS, /<td align="center" bgcolor="#f4f2ec" style="background:#f4f2ec;/);
});
