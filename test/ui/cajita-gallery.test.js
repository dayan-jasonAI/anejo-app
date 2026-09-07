import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(`${root}/public/cajita.html`, 'utf8');
const script = fs.readFileSync(`${root}/public/assets/js/cajita-gallery-v3.js`, 'utf8');
const themes = [...html.matchAll(/data-theme="(\d+)"/g)].map((m) => Number(m[1]));
const srcs = [...html.matchAll(/themes\/([\w-]+\.jpg)/g)].map((m) => m[1]);

class El {
  constructor() { this.listeners = {}; this.attrs = {}; this.children = []; this.hidden = false; this.textContent = ''; this.src = ''; this.alt = ''; this.style = {}; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({ target: this }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  after(...nodes) { this.afterNodes = nodes; }
}
class FakeDocument extends El {
  constructor() { super(); this.hidden = false; this.byId = {}; this.tabs = []; }
  getElementById(id) { return this.byId[id]; }
  createElement() { return new El(); }
  querySelectorAll(sel) { return sel === '[data-theme]' ? this.tabs : []; }
}
class FakeImage {
  static pending = [];
  constructor() { this.onload = null; this.onerror = null; this._src = ''; FakeImage.pending.push(this); }
  set src(v) { this._src = v; }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
  static settle(src, ok = true) { const hit = FakeImage.pending.find((x) => x._src === src); assert.ok(hit, `pending image ${src}`); if (ok) hit.onload?.(); else hit.onerror?.(); FakeImage.pending = FakeImage.pending.filter((x) => x !== hit); }
}
function harness(reduced = false) {
  FakeImage.pending = [];
  const d = new FakeDocument();
  for (const id of ['themeStage','themeImage','themeName','themeDescription','themeToggle','themePrev','themeNext']) d.byId[id] = new El();
  d.byId.themeImage.src = '/assets/img/cajita/themes/anejo-signature-duo-v2.jpg';
  d.tabs = themes.map((i) => { const t = new El(); t.setAttribute('data-theme', i); return t; });
  const timers = new Map(); let seq = 0;
  const context = { window: { matchMedia: () => ({ matches: reduced }) }, document: d, Image: FakeImage,
    setTimeout: (fn) => { const id = ++seq; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id), console };
  context.window.document = d;
  vm.runInNewContext(script, context);
  const metadata = themes.map((i) => ({ name: `Theme ${i}`, src: `/theme-${i}.jpg`, alt: `alt-${i}`, description: `desc-${i}` }));
  context.window.initCajitaThemeGallery(metadata);
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  return { d, metadata, flush, runTimers: () => [...timers.values()].forEach((fn) => fn()), init: context.window.initCajitaThemeGallery };
}

test('HTML has eight unique theme assets and all files exist', () => {
  assert.deepEqual(themes, [0,1,2,3,4,5,6,7]);
  assert.equal(new Set(srcs).size, 8);
  for (const src of srcs) assert.ok(fs.existsSync(`${root}/public/assets/img/cajita/themes/${src}`), src);
});

test('metadata commits only after image success', async () => {
  const h = harness(true); await h.flush();
  assert.equal(h.d.byId.themeName.textContent, '');
  FakeImage.settle('/theme-0.jpg'); await h.flush();
  assert.equal(h.d.byId.themeName.textContent, 'Theme 0');
  assert.equal(h.d.byId.themeImage.src, '/theme-0.jpg');
  h.d.tabs[3].click(); await h.flush();
  assert.equal(h.d.byId.themeName.textContent, 'Theme 0');
  FakeImage.settle('/theme-3.jpg'); await h.flush();
  assert.equal(h.d.byId.themeName.textContent, 'Theme 3');
});

test('rapid selection ignores stale image responses', async () => {
  const h = harness(true); await h.flush();
  h.d.tabs[4].click(); h.d.tabs[6].click(); await h.flush();
  FakeImage.settle('/theme-4.jpg'); await h.flush();
  assert.equal(h.d.byId.themeName.textContent, '');
  FakeImage.settle('/theme-6.jpg'); await h.flush();
  assert.equal(h.d.byId.themeName.textContent, 'Theme 6');
});

test('failed selection retains prior committed image and retry can succeed', async () => {
  const h = harness(true); await h.flush(); FakeImage.settle('/theme-0.jpg'); await h.flush();
  h.d.tabs[5].click(); await h.flush(); FakeImage.settle('/theme-5.jpg', false); await h.flush();
  assert.equal(h.d.byId.themeImage.src, '/theme-0.jpg');
  assert.equal(h.d.byId.themeName.textContent, 'Theme 0');
  assert.match(h.d.byId.themeStage.afterNodes[0].textContent, /Could not load Theme 5/);
  h.d.byId.themeStage.afterNodes[1].click(); await h.flush(); FakeImage.settle('/theme-5.jpg'); await h.flush();
  assert.equal(h.d.byId.themeName.textContent, 'Theme 5');
});

test('reduced motion starts paused; normal motion starts playing', async () => {
  const reduced = harness(true); await reduced.flush(); assert.equal(reduced.d.byId.themeToggle.textContent, 'Play themes');
  const normal = harness(false); await normal.flush(); assert.equal(normal.d.byId.themeToggle.textContent, 'Pause themes');
});
