import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { newVariant, presets } from '../../src/cajita/catalog.js';

const source = readFileSync(new URL('../../public/hub/assets/catering-i18n.js', import.meta.url), 'utf8');
const owner = readFileSync(new URL('../../public/hub/owner/catering.html', import.meta.url), 'utf8');
const kitchen = readFileSync(new URL('../../public/hub/kitchen/catering.html', import.meta.url), 'utf8');
function fixture() {
  let lang = 'en';
  const events = {}, nodes = { labels:[], configs:[] };
  const ctx = vm.createContext({
    window: { AnejoLang:{ get:() => lang }, AnejoI18n:{ extend() {} } },
    document: { addEventListener:(name, fn) => { events[name] = fn; }, querySelectorAll:(selector) => selector === '[data-catering-label]' ? nodes.labels : nodes.configs },
  });
  vm.runInContext(source, ctx);
  return { api:ctx.window.CateringI18n, nodes, change(value) { lang = value; events['anejo:langchange'](); } };
}
function configuration() {
  const a = newVariant(), b = newVariant();
  a.name = 'Classic custom name'; a.quantity = 20;
  b.name = 'No dessert'; b.quantity = 10;
  b.items.find(i => i.id === 'tres-leches').quantity = 0;
  b.items.find(i => i.id === 'skewer').quantity = 1;
  b.theme.name = 'Christmas'; b.theme.preset = 'christmas'; b.theme.pickShape = 'star';
  b.personalization.labelText = 'Happy birthday, María';
  b.personalization.tagText = 'Keep my English exactly';
  b.notes = 'No nuts. No nueces. Customer exact text.';
  b.packagingRequest = 'Larger box please';
  return { version:1, variants:[a,b] };
}

test('Hub summaries translate food and metadata while preserving quantities and customer copy', () => {
  const { api } = fixture(), config = configuration(), original = JSON.stringify(config);
  const spanish = api.summary(config, 'es');
  assert.match(spanish, /Total de cajitas: 30/);
  assert.match(spanish, /Tres leches ×20/);
  assert.match(spanish, /Brocheta de frutas y jamón ×10/);
  assert.match(spanish, /Artículos omitidos: Tres leches ×0/);
  assert.match(spanish, /Tema: Navidad/);
  assert.match(spanish, /Forma del palillo: estrella/);
  for (const text of ['No dessert', 'Happy birthday, María', 'Keep my English exactly', config.variants[1].notes, 'Larger box please']) assert.ok(spanish.includes(text));
  assert.equal(JSON.stringify(config), original, 'Display language must not mutate the canonical request');
  assert.match(api.summary(config, 'en'), /Total boxes: 30/);
});

test('All catalog presets have deterministic local Spanish display names', () => {
  const { api } = fixture();
  for (const preset of presets) {
    const v = newVariant(); v.theme.name = preset.name; v.theme.preset = preset.id;
    const text = api.summary({ version:1, variants:[v] }, 'es');
    if (preset.name !== 'Halloween') assert.ok(!text.includes('Tema: ' + preset.name + '\n'), preset.name);
  }
});

test('Customer theme names and attachment IDs stay exact in Spanish', () => {
  const { api } = fixture(), c = configuration();
  c.variants[1].theme.name = 'My Christmas in New York';
  c.variants[1].personalization.artworks = [{ attachmentId:'client-art-001', surface:'tag', x:2, y:3, scale:1.2, rotation:45 }];
  const result = api.summary(c, 'es');
  assert.match(result, /Tema: My Christmas in New York/);
  assert.match(result, /client-art-001@etiqueta colgante@2,3 escala 1.2 rotación 45/);
});

test('Only canonical menu choices translate; custom menu text remains unchanged and escaped', () => {
  const f = fixture(); f.change('es');
  assert.match(f.api.menu('Cuban Food, Individual Cajitas'), /Comida cubana/);
  assert.match(f.api.menu('Cuban Food, Individual Cajitas'), /Cajitas individuales/);
  assert.equal(f.api.menu('Customer lunch <special>'), 'Customer lunch &lt;special&gt;');
});

test('Language changes update only dedicated text nodes, preserving open details and form state', () => {
  const f = fixture(), c = configuration();
  const label = { textContent:'Start a quote', getAttribute:() => 'Start a quote' };
  const config = { textContent:'', getAttribute:() => JSON.stringify(c) };
  f.nodes.labels.push(label); f.nodes.configs.push(config);
  f.change('es');
  assert.equal(label.textContent, 'Crear una cotización');
  assert.match(config.textContent, /Total de cajitas: 30/);
  f.change('en');
  assert.equal(label.textContent, 'Start a quote');
  assert.match(config.textContent, /Total boxes: 30/);
  assert.doesNotMatch(source, /\.innerHTML\s*=|fetch\(|XMLHttpRequest|\.value\s*=/);
});

test('Summary markup escapes user text and opts out of remote translation', () => {
  const { api } = fixture(), c = configuration();
  c.variants[0].name = '<img src=x onerror=alert(1)>"';
  const html = api.summaryHtml(c);
  assert.match(html, /translate="no"/);
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
  assert.match(html, /data-cajita-config="/);
  assert.match(api.label('Start a quote'), /translate="no"/);
});

test('Kitchen page uses the website language toggle and keeps private request data local', () => {
  assert.match(kitchen, /<body data-i18n-local-only>/);
  assert.match(kitchen, /id="app"[^>]*translate="no"/);
  assert.match(kitchen, /id="lang-toggle"/);
  assert.match(kitchen, /\/assets\/js\/i18n.js/);
  assert.match(kitchen, /anejo:langchange',render/);
  assert.match(kitchen, /C.summaryHtml\(r.cajita_configuration/);
  assert.doesNotMatch(kitchen, /root.textContent=e.message/);
});

test('Owner requests retain original customer copy and protect attachments from automatic translation', () => {
  assert.match(owner, /<article translate="no" class="rcard/);
  assert.match(owner, /C.label\('Original request \(as submitted\)'\)/);
  assert.match(owner, /C.summaryHtml\(r.cajita_configuration,r.cajita_summary\)/);
  assert.match(owner, /C.label\('Preview'\) \+ ' ' \+ esc\(file.filename\)/);
  assert.match(owner, /C.label\('Download'\) \+ ' ' \+ esc\(file.filename\)/);
  assert.doesNotMatch(owner, /addEventListener\('anejo:langchange',\s*render/);
});
