import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../public/assets/js/i18n.js', import.meta.url), 'utf8');
class Element {
  constructor(tag, attrs = {}, text = null) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.children = [];
    this.id = attrs.id; this.style = {};
    if (text != null) this.append({ nodeType: 3, nodeValue: text });
  }
  append(child) { const prev = this.children.at(-1); if (prev) prev.nextSibling = child; child.parent = this; child.nextSibling = null; this.children.push(child); this.firstChild = this.children[0]; }
  get textContent() { return this.children.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join(''); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  hasAttribute(k) { return k in this.attrs; }
  closest(selector) { for (let n = this; n; n = n.parent) if (selector === '[translate="no"]' && n.attrs?.translate === 'no') return n; return null; }
}
function fixture({ localOnly = true, deniedStorage = false } = {}) {
  const body = new Element('body', localOnly ? { 'data-i18n-local-only': '' } : {});
  const fields = [];
  const add = (tag, attrs, text) => { const el = new Element(tag, attrs, text); fields.push(el); body.append(el); return el; };
  const timers = [], events = [], saved = new Map();
  const document = {
    body, title: 'Catering', readyState: 'loading', documentElement: {},
    addEventListener() {}, dispatchEvent: e => events.push(e),
    getElementById: () => null,
    querySelectorAll: selector => fields.filter(el => el.hasAttribute(selector.slice(1, -1))),
  };
  const ctx = vm.createContext({ document, window: {}, location: { pathname: '/cajita-builder' },
    localStorage: { getItem(k) { if (deniedStorage) throw Error('denied'); return saved.get(k); }, setItem(k,v) { if (deniedStorage) throw Error('denied'); saved.set(k,v); } },
    setTimeout: fn => timers.push(fn), CustomEvent: class { constructor(type, data) { this.type=type; Object.assign(this,data); } },
    fetch: () => { throw Error('Unexpected remote translation'); },
  });
  vm.runInContext(source, ctx);
  ctx.window.AnejoI18n.extend({ 'Ready now': 'Listo ahora', 'Saving…': 'Guardando…', 'Request received.': 'Solicitud recibida.', 'Birthday': 'Cumpleaños' });
  return { ...ctx.window, document, add, timers, events, saved };
}
test('shared language engine normalizes multiline curated copy and round trips English', () => {
  const f=fixture(); const text=f.add('p',{},'  Ready\n  now  ');
  f.AnejoLang.set('es'); assert.equal(text.textContent,'  Listo ahora  ');
  assert.equal(f.AnejoI18n.text('Ready now'),'Listo ahora');
  f.AnejoLang.set('en'); assert.equal(text.textContent,'  Ready\n  now  ');
  assert.equal(f.saved.get('anejo:lang'),'en'); assert.equal(f.document.documentElement.lang,'en');
});
test('status and aria mutations replace their original instead of reviving stale labels', () => {
  const f=fixture(); const el=f.add('button',{'aria-label':'Saving…'},'Saving…');
  f.AnejoLang.set('es'); assert.equal(el.textContent,'Guardando…');
  el.firstChild.nodeValue='Request received.'; el.setAttribute('aria-label','Request received.');
  f.AnejoI18n.refresh(); assert.equal(el.textContent,'Solicitud recibida.'); assert.equal(el.getAttribute('aria-label'),'Solicitud recibida.');
  f.AnejoLang.set('en'); assert.equal(el.textContent,'Request received.'); assert.equal(el.getAttribute('aria-label'),'Request received.');
});
test('local-only pages never queue private or unknown text and protected content is unchanged', () => {
  const f=fixture(); const el=f.add('p',{translate:'no'},'Private customer message');
  f.add('p',{},'Unknown copy'); f.AnejoLang.set('es');
  assert.equal(el.textContent,'Private customer message'); assert.equal(f.timers.length,0);
});
test('translating an implicit option preserves its canonical submitted value', () => {
  const f=fixture(); const option=f.add('option',{},'Birthday');
  f.AnejoLang.set('es'); assert.equal(option.textContent,'Cumpleaños'); assert.equal(option.getAttribute('value'),'Birthday');
  f.AnejoLang.set('en'); assert.equal(option.textContent,'Birthday'); assert.equal(option.getAttribute('value'),'Birthday');
});
test('denied storage does not break language switching', () => {
  const f=fixture({deniedStorage:true}); f.AnejoLang.set('es'); assert.equal(f.AnejoLang.get(),'es');
  f.AnejoLang.set('unexpected'); assert.equal(f.AnejoLang.get(),'en');
});
