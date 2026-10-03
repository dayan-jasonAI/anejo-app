import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/hub/owner/assets/operator.js', import.meta.url), 'utf8');

function fixture({ preference, pageLanguage = '', storedLanguage = null, storageThrows = false } = {}) {
  const timers = [];
  const utterances = [];
  const recognizers = [];
  const requests = [];
  const elements = new Map();
  const makeClassList = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value), toggle(value) { if (values.has(value)) { values.delete(value); return false; } values.add(value); return true; } };
  };
  function element(tag) {
    return {
      tagName: tag.toUpperCase(), children: [], listeners: {}, classList: makeClassList(), style: {}, value: '',
      setAttribute(key, value) { this[key] = value; },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      focus() {},
    };
  }
  ['aopLog', 'aopCapabilities', 'aopMarketingStatus', 'aopIn', 'aopGo'].forEach(id => elements.set(id, element(id === 'aopIn' ? 'input' : 'div')));
  const body = element('body'), head = element('head');
  let currentLanguage = preference;
  let releaseFetch;
  function SpeechRecognition() {
    const recognition = this;
    this.start = () => { recognition.started = true; };
    recognizers.push(this);
  }
  const context = {
    window: {
      AnejoLang: preference === 'missing' ? undefined : { get() { if (preference === 'throws') throw new Error('locale failure'); return currentLanguage; } },
      localStorage: { getItem(key) { assert.equal(key, 'anejo:lang'); if (storageThrows) throw new Error('storage failure'); return storedLanguage; } },
      speechSynthesis: { speak(utterance) { utterances.push(utterance); }, cancel() {} },
      SpeechRecognition,
      AnejoOperatorPrivateUI() {},
    },
    document: {
      documentElement: { lang: pageLanguage }, head, body,
      createElement: element,
      getElementById(id) { return elements.get(id); },
    },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
    fetch(url, init) { requests.push({ url, init }); return new Promise(resolve => { releaseFetch = resolve; }); },
    SpeechRecognition,
    console,
  };
  vm.runInNewContext(source.slice(source.indexOf('/* operator.js —')), context);
  return {
    body, requests, recognizers, utterances,
    setLanguage(value) { currentLanguage = value; },
    startListening() {
      const fab = body.children.find(node => node.className === 'aop-fab');
      fab.listeners.click();
      const tap = timers.find(timer => timer.delay === 260);
      assert.ok(tap, 'recognition waits for the explicit single tap');
      tap.fn();
    },
    answer(reply) {
      releaseFetch({ ok: true, json: async () => ({ ok: true, reply }) });
    },
  };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

test('AnejoLang drives recognition and browser TTS; a language switch applies on the next tap', async () => {
  const f = fixture({ preference: 'en' });
  assert.equal(f.recognizers.length, 0, 'loading the widget does not start the microphone');
  f.startListening();
  assert.equal(f.recognizers[0].lang, 'en-US');
  f.recognizers[0].onresult({ results: [[{ transcript: 'orders' }]] });
  assert.equal(f.requests.length, 1);
  f.setLanguage('es');
  f.answer('Respuesta en inglés del operador');
  await settle();
  assert.equal(f.utterances[0].lang, 'en-US', 'the spoken reply retains the request locale captured at listening time');

  f.startListening();
  assert.equal(f.recognizers[1].lang, 'es-ES', 'the next user tap reads the updated locale');
  f.recognizers[1].onresult({ results: [[{ transcript: 'pedidos' }]] });
  f.setLanguage('en');
  f.answer('Respuesta en español del operador');
  await settle();
  assert.equal(f.requests.length, 2);
  assert.equal(f.utterances[1].lang, 'es-ES', 'a mid-request language switch does not reinterpret the reply');
  assert.equal(f.utterances[0].text, 'Respuesta en inglés del operador');
  assert.equal(f.utterances[1].text, 'Respuesta en español del operador');
});

test('locale falls back through page language and safe stored preference when AnejoLang is absent or throws', () => {
  const fromPage = fixture({ preference: 'missing', pageLanguage: 'es-MX' });
  fromPage.startListening();
  assert.equal(fromPage.recognizers[0].lang, 'es-ES');

  const fromStorage = fixture({ preference: 'throws', storedLanguage: 'es' });
  fromStorage.startListening();
  assert.equal(fromStorage.recognizers[0].lang, 'es-ES');

  const safeDefault = fixture({ preference: 'throws', storageThrows: true });
  safeDefault.startListening();
  assert.equal(safeDefault.recognizers[0].lang, 'en-US');
});
