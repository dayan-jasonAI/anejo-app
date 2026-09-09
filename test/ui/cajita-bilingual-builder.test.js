import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { foods, presets, newVariant, totals, clone } from '../../src/cajita/catalog.js';
import { normalizeCajitaConfiguration } from '../../functions/_lib/cajita-config.js';

const builder = readFileSync(new URL('../../src/cajita/builder.js', import.meta.url), 'utf8');
const translations = readFileSync(new URL('../../src/cajita/i18n.js', import.meta.url), 'utf8');

function fixture(lang = 'es', responses = []) {
  const nodes = new Map(), requests = [];
  let preference = lang;
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.value = ''; this.disabled = false; this.isConnected = true; this._text = ''; }
    set id(id) { this._id = id; nodes.set(id, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text + this.children.map((n) => n.textContent).join(''); }
    append(...children) { children.forEach((child) => { child.parent = this; this.children.push(child); }); }
    replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
    setAttribute(k, v) { this.attributes[k] = v; }
    get previousElementSibling() { return this.parent.children[this.parent.children.indexOf(this) - 1]; }
    get nextElementSibling() { return this.parent.children[this.parent.children.indexOf(this) + 1]; }
    checkValidity() { return true; }
    reportValidity() { return true; }
    focus() {}
  }
  const get = (id) => {
    if (!nodes.has(id)) { const n = new Element(); n.id = id; }
    return nodes.get(id);
  };
  get('surface').value = 'label'; get('layer').value = 'text';
  const form = get('quote-form');
  form.fields = { name: 'My Real Name', email: 'qa@example.test', guests: '30', event_date: '2030-12-10' };
  form.elements = { sms_consent: { checked: false } };
  const window = {
    AnejoLang: { get: () => preference },
    addEventListener() {},
  };
  // The shared engine dispatches a non-bubbling CustomEvent on document, not
  // window. Use a real EventTarget so the fixture enforces that integration.
  const document = new EventTarget();
  Object.assign(document, { getElementById: get, createElement: (tag) => new Element(tag), querySelectorAll: () => [] });
  const ctx = vm.createContext({
    window, document,
    foods, presets, newVariant, totals, clone, normalizeCajitaConfiguration,
    paintSurface() {}, loadBrand() {}, createScene() {}, crypto, AbortSignal,
    FormData: class { constructor(f) { return Object.entries(f.fields); } },
    confirm: () => true,
    fetch: async (url, options) => { requests.push({ url, body: options.body }); const res = responses.shift(); if (res instanceof Error) throw res; assert.ok(res, 'No unexpected request'); return res; },
  });
  vm.runInContext(translations.replace(/^export /gm, '') + '\n' + builder.replace(/^import .*;\n/gm, '').replace(/\ninit\(\);\s*$/, ''), ctx);
  vm.runInContext('brandReady = true; fill();', ctx);
  return {
    ctx, get, requests,
    run: (code) => vm.runInContext(code, ctx),
    switchLanguage(next) { preference = next; document.dispatchEvent(new CustomEvent('anejo:langchange', { detail: { lang: next } })); },
    dispatchField(type, field) { const event = new Event(type); Object.defineProperty(event, 'target', { value: field }); document.dispatchEvent(event); },
    submit: () => form.onsubmit({ preventDefault() {} }),
  };
}

test('all catalog names, descriptions and presets have local Spanish copy', () => {
  const f = fixture();
  for (const food of foods) {
    assert.equal(f.run(`Object.hasOwn(spanish, ${JSON.stringify(food.name)})`), true, food.name);
    assert.equal(f.run(`Object.hasOwn(spanish, ${JSON.stringify(food.detail)})`), true, food.detail);
  }
  for (const preset of presets) assert.equal(f.run(`Object.hasOwn(spanish, ${JSON.stringify(preset.name)})`), true, preset.name);
  assert.match(f.get('food-salad').textContent, /Ensalada de fiesta/);
  assert.match(f.get('food-skewer').textContent, /Uva, jamón, guayaba, queso y piña/);
  assert.equal(f.get('count-skewer').attributes['aria-label'], 'Brocheta de frutas y jamón por caja');
});

test('language switching rerenders copy without replacing controls or changing user content and canonical configuration', () => {
  const f = fixture('en');
  f.run(`active().name = 'Artwork'; active().theme.name = 'My Halloween'; active().notes = 'Party salad'; active().personalization.labelText = 'Happy Maria'; active().packagingRequest = 'Keep My Box'; changed();`);
  const snapshot = f.run('JSON.stringify(config)'), color = f.get('color-box');
  f.switchLanguage('es');
  assert.equal(f.run('JSON.stringify(config)'), snapshot);
  assert.equal(f.get('color-box'), color);
  assert.ok(color.parent.children.includes(color), 'Color label refresh must not destroy the color input');
  assert.match(f.get('summary').textContent, /Artwork/);
  assert.match(f.get('summary').textContent, /Party salad/);
  assert.match(f.get('summary').textContent, /My Halloween/);
  assert.match(f.get('summary').textContent, /Empaque: Keep My Box/);
  assert.match(f.get('summary').textContent, /Ensalada de fiesta/);
  assert.match(f.get('scene-count').textContent, /artículos por caja/);
  assert.equal(f.get('scene-theme').attributes.translate, 'no');
  assert.ok(f.get('summary').children.every((node) => node.attributes.translate === 'no'));
  f.switchLanguage('en');
  assert.match(f.get('summary').textContent, /Party salad/);
  assert.match(f.get('scene-count').textContent, /items per box/);
  assert.equal(f.run('JSON.stringify(config)'), snapshot);
});

test('Spanish submit language is frozen across ambiguous retry and language change; statuses and receipt follow current language', async () => {
  const f = fixture('es', [new Error('Private English provider failure'), { ok: true, status: 200, json: async () => ({ ok: true, id: 'lead-test', notifications: { queued: true } }) }]);
  await f.submit();
  const first = f.requests[0].body;
  assert.equal(JSON.parse(first).lang, 'es');
  assert.match(f.get('quote-status').textContent, /Tu solicitud exacta se conserva aquí/);
  assert.doesNotMatch(f.get('quote-status').textContent, /Private English/);
  assert.equal(f.get('submit').textContent, 'Reintentar la misma solicitud');
  f.switchLanguage('en');
  assert.equal(f.get('submit').textContent, 'Retry same request');
  await f.submit();
  assert.equal(f.requests[1].body, first);
  assert.match(f.get('quote-form').textContent, /Request received/);
  f.switchLanguage('es');
  assert.match(f.get('quote-form').textContent, /Solicitud recibida/);
  assert.match(f.get('quote-form').textContent, /Referencia: lead-test/);
  assert.match(f.get('quote-form').textContent, /cotización personalizada/);
});

test('filenames remain literal and protected while file actions switch languages', () => {
  const f = fixture('en');
  f.run(`assets.set('asset-1', { name: 'Party salad.png', image: {} }); drawFiles();`);
  f.switchLanguage('es');
  assert.match(f.get('files').textContent, /Party salad\.png · Diseño/);
  assert.match(f.get('files').textContent, /Colocar en etiqueta/);
  assert.match(f.get('files').textContent, /Quitar archivo/);
  assert.equal(f.get('files').children[0].attributes.translate, 'no');
});

test('native validity messages follow site language and clear on edits and language changes without removing constraints', () => {
  const f = fixture('es'), field = f.get('email-validation');
  field.type = 'email'; field.required = true; field.maxLength = 160;
  field.closest = () => f.get('quote-form');
  field.setCustomValidity = (message) => { field.validationMessage = message; };
  field.validity = { valid: false, typeMismatch: true };
  f.dispatchField('invalid', field);
  assert.equal(field.validationMessage, 'Escribe una dirección de correo electrónico válida.');
  f.dispatchField('input', field);
  assert.equal(field.validationMessage, '');
  f.dispatchField('invalid', field);
  f.switchLanguage('en');
  assert.equal(field.validationMessage, '');
  f.dispatchField('invalid', field);
  assert.equal(field.validationMessage, 'Please enter a valid email address.');
  f.dispatchField('change', field);
  assert.equal(field.validationMessage, '');
  assert.equal(field.required, true);
  assert.equal(field.maxLength, 160);
  field.validity = { valid: false, valueMissing: true };
  f.switchLanguage('es');
  f.dispatchField('invalid', field);
  assert.equal(field.validationMessage, 'Completa este campo obligatorio.');
});

test('number range and step errors stay localized and keep original numeric constraints', () => {
  const f = fixture('es'), field = f.get('quantity');
  Object.assign(field, { type: 'number', min: '1', max: '5000', step: '1', closest: () => f.get('controls') });
  field.setCustomValidity = (message) => { field.validationMessage = message; };
  field.validity = { valid: false, rangeOverflow: true };
  f.dispatchField('invalid', field);
  assert.equal(field.validationMessage, 'Escribe un valor menor o igual a 5000.');
  f.dispatchField('input', field);
  field.validity = { valid: false, stepMismatch: true };
  f.dispatchField('invalid', field);
  assert.equal(field.validationMessage, 'Usa el incremento permitido para este campo.');
  assert.equal(field.min, '1'); assert.equal(field.max, '5000'); assert.equal(field.step, '1');
});

test('confirmed defaults and changed flavors survive duplication, language switching and submission', async () => {
  const f = fixture('en', [{ ok:true, status:200, json:async () => ({ok:true,id:'flavor-test',notifications:{queued:true}}) }]);
  assert.equal(f.get('flavor-sandwich').value, 'ham-spread');
  assert.equal(f.get('flavor-empanada').value, 'guava-cheese');
  assert.equal(f.get('flavor-croqueta').value, 'ham');
  assert.equal(f.get('count-skewer').value, 1);
  f.get('flavor-sandwich').value = 'tuna-spread'; f.get('flavor-sandwich').onchange();
  f.get('duplicate').onclick();
  f.get('flavor-croqueta').value = 'chorizo'; f.get('flavor-croqueta').onchange();
  f.switchLanguage('es');
  assert.match(f.get('summary').textContent, /Pasta de atún/);
  await f.submit();
  const variants = JSON.parse(f.requests[0].body).cajita_configuration.variants;
  assert.equal(variants[0].items.find(i => i.id === 'sandwich').flavor, 'tuna-spread');
  assert.equal(variants[0].items.find(i => i.id === 'croqueta').flavor, 'ham');
  assert.equal(variants[1].items.find(i => i.id === 'croqueta').flavor, 'chorizo');
});
