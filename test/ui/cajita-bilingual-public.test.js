import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const source = read('public/assets/js/catering-i18n.js');
const dictionary = {};
vm.runInNewContext(source, { window: { AnejoI18n: { extend: (entries) => Object.assign(dictionary, entries) } } });
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"').replace(/\s+/g, ' ').trim();

test('every static text and accessible attribute on the new public pages has curated Spanish', () => {
  const missing = [];
  for (const file of ['catering.html', 'cajita.html', 'cajita-builder.html']) {
    const html = read(`public/${file}`).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const values = [...html.matchAll(/>([^<>]+)</g), ...html.matchAll(/(?:alt|aria-label|placeholder)="([^"]+)"/g)].map((match) => decode(match[1]));
    for (const value of values) {
      if (!/[a-z]/i.test(value) || /^[^\s@]+@[^\s@]+$/.test(value)) continue;
      if (!dictionary[value]) missing.push(`${file}: ${value}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('engine and curated dictionary load before interactions, with private local-only translation', () => {
  for (const file of ['catering.html', 'cajita.html', 'cajita-builder.html']) {
    const html = read(`public/${file}`);
    assert.match(html, /<body data-i18n-local-only>/);
    assert.ok(html.indexOf('/assets/js/i18n.js') < html.indexOf('/assets/js/catering-i18n.js'));
    if (file === 'cajita-builder.html') assert.ok(html.indexOf('/assets/js/catering-i18n.js') < html.indexOf('/assets/js/cajita-builder.js'));
  }
  const home = read('public/index.html');
  assert.match(home, /class="cajita-gallery-caption">Cajita inspiration/);
  assert.equal([...home.matchAll(/<blockquote[^>]+translate="no"/g)].length, 6);
  assert.equal([...home.matchAll(/<cite translate="no"/g)].length, 6);
});

test('catering stores selected locale once and keeps immutable retry payload', () => {
  const html = read('public/catering.html');
  assert.match(html, /lang:spanish\(\)\?'es':'en'/);
  assert.match(html, /JSON\.stringify\(pendingSubmission\)/);
  assert.match(html, /status\.setAttribute\('translate','no'\)/);
  assert.match(html, /fileList\.setAttribute\('translate','no'\)/);
  assert.match(html, /reference\.setAttribute\('translate','no'\)/);
  assert.match(html, /getElementById\('request-notifications'\)\.setAttribute\('translate','no'\)/);
  assert.match(html, /document\.addEventListener\('anejo:langchange',renderReceipt\)/);
});

test('all eight gallery themes have Spanish names, descriptions and image alternatives', () => {
  const html = read('public/cajita.html');
  const metadata = vm.runInNewContext(html.match(/var themes=(\[[\s\S]*?\]);/)[1]);
  assert.equal(metadata.length, 8);
  for (const theme of metadata) for (const field of ['name', 'description', 'alt']) assert.ok(dictionary[theme[field]], theme[field]);
});

test('gallery locale changes preserve selected image and translate loading, error, and retry states', async () => {
  class Node {
    constructor() { this.attrs = {}; this.events = {}; this.style = {}; this.textContent = ''; }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key]; }
    addEventListener(key, fn) { this.events[key] = fn; }
    after(...items) { this.afterNodes = items; }
  }
  const nodes = Object.fromEntries(['themeStage','themeImage','themeName','themeDescription','themeToggle','themePrev','themeNext'].map((id) => [id, new Node()]));
  const tabs = [0,1].map((index) => { const node = new Node(); node.setAttribute('data-theme', index); return node; });
  const events = {}, pending = [];
  let lang = 'es';
  const document = { getElementById: (id) => nodes[id], querySelectorAll: () => tabs, createElement: () => new Node(), addEventListener: (event, fn) => { events[event] = fn; } };
  const window = { AnejoLang: { get: () => lang }, AnejoI18n: { text: (value) => lang === 'es' ? dictionary[value] || value : value }, matchMedia: () => ({ matches: true }) };
  vm.runInNewContext(read('public/assets/js/cajita-gallery-v3.js'), { document, window, Image: class { constructor() { pending.push(this); } decode() { return Promise.resolve(); } }, setTimeout: () => 1, clearTimeout() {} });
  const themes = [{ name: 'Añejo Signature', src: '/signature.jpg', alt: 'Añejo Cajita event table', description: 'The standard La Cajita' }, { name: 'Christmas', src: '/christmas.jpg', alt: 'Añejo Cajita event table', description: 'Your colors' }];
  window.initCajitaThemeGallery(themes);
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  assert.equal(nodes.themeStage.afterNodes[0].textContent, 'Cargando Añejo Clásico…');
  pending[0].onload(); await flush();
  assert.equal(nodes.themeName.textContent, 'Añejo Clásico');
  tabs[1].events.click(); pending.find((img) => img.src === '/christmas.jpg').onerror(); await flush();
  assert.match(nodes.themeStage.afterNodes[0].textContent, /No se pudo cargar Navidad/);
  assert.equal(nodes.themeImage.src, '/signature.jpg');
  lang = 'en'; events['anejo:langchange']();
  assert.equal(nodes.themeName.textContent, 'Añejo Signature');
  assert.match(nodes.themeStage.afterNodes[0].textContent, /Could not load Christmas/);
  assert.equal(nodes.themeImage.src, '/signature.jpg');
  lang = 'es'; events['anejo:langchange']();
  assert.equal(nodes.themeStage.afterNodes[1].textContent, 'Reintentar imagen');
});

test('homepage gallery play state remains bilingual after manual changes', () => {
  const handlers = {}, pause = { attrs: {}, setAttribute(key,value) { this.attrs[key] = value; }, addEventListener(type, handler) { handlers[type] = handler; } };
  let lang = 'es';
  const gallery = { querySelectorAll: () => [{}, {}], querySelector: () => pause };
  vm.runInNewContext(read('public/assets/js/cajita-hero.js'), { document: { querySelector: () => gallery, addEventListener: (event, handler) => { handlers[event] = handler; } }, window: { matchMedia: () => ({ matches: true, addEventListener() {} }), setInterval() {}, AnejoI18n: { text: (value) => lang === 'es' ? dictionary[value] : value } } });
  assert.equal(pause.textContent, 'Reproducir galería');
  handlers.click(); assert.equal(pause.textContent, 'Pausar galería');
  lang = 'en'; handlers['anejo:langchange'](); assert.equal(pause.textContent, 'Pause gallery');
  assert.equal(pause.attrs.translate, 'no');
});
