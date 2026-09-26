import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/hub/owner/assets/operator.js', import.meta.url), 'utf8');
const start = source.indexOf('  function voiceInputFailure(');
const end = source.indexOf('  // 1 tap = talk', start);
assert.ok(start >= 0 && end > start, 'the real voice handlers must be present');
const handlers = source.slice(start, end);

function fixture({ startError, constructorError, supported = true } = {}) {
  const classes = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
  };
  const fab = { classList: classes() }, panel = { classList: classes() };
  const input = { value: 'Keep my typed draft', focusCount: 0, focus() { this.focusCount++; } };
  const logs = [], hints = [], requests = [], recognizers = [];
  let starts = 0, stops = 0;
  function SpeechRecognition() {
    if (constructorError) throw constructorError;
    recognizers.push(this);
    this.start = () => { starts++; if (startError) throw startError; };
  }
  const context = {
    SR: supported ? SpeechRecognition : null, recog: null, fab, panel,
    document: { getElementById(id) { assert.equal(id, 'aopIn'); return input; } },
    stopSpeech() { stops++; },
    showHint(message) { hints.push(message); },
    log(message, kind) { logs.push({ message, kind }); },
    ask(message, speakBack) { requests.push({ message, speakBack }); }
  };
  vm.runInNewContext(handlers, context);
  return { fab, panel, input, logs, hints, requests, recognizers,
    listen: () => context.listen(), starts: () => starts, stops: () => stops };
}

function assertFallback(f, expected) {
  assert.equal(f.fab.classList.contains('listening'), false, 'failure clears listening immediately, without waiting for onend');
  assert.equal(f.panel.classList.contains('open'), true);
  assert.equal(f.input.focusCount, 1);
  assert.equal(f.input.value, 'Keep my typed draft', 'fallback preserves typed content');
  assert.equal(f.logs.length, 1, 'the error remains visible in the panel');
  assert.equal(f.logs[0].kind, 'err');
  assert.match(f.logs[0].message, expected);
  assert.match(f.logs[0].message, /Type your request below instead\./);
  assert.equal(f.hints.at(-1), f.logs[0].message);
  assert.deepEqual(f.requests, [], 'failure never submits a request');
}

for (const [error, expected] of [
  ['not-allowed', /Microphone access was denied or blocked/],
  ['service-not-allowed', /browser blocked the speech recognition service/],
  ['audio-capture', /microphone is unavailable/],
  ['no-speech', /No speech was detected/],
  ['network', /network error/]
]) {
  test(`voice ${error} reports the actual failure and opens typed fallback`, () => {
    const f = fixture(); f.listen();
    assert.equal(f.fab.classList.contains('listening'), true);
    f.recognizers[0].onerror({ error });
    assertFallback(f, expected);
    f.recognizers[0].onend();
    assert.equal(f.fab.classList.contains('listening'), false);
    assert.equal(f.logs.length, 1, 'onend does not replace or duplicate the error');
    assert.equal(f.starts(), 1, 'no automatic retry or permission request');
  });
}

test('synchronous start exception clears listening and exposes typed fallback', () => {
  const f = fixture({ startError: new Error('do not render raw browser internals') });
  assert.doesNotThrow(() => f.listen());
  assertFallback(f, /Speech input could not start or continue/);
  assert.doesNotMatch(f.logs[0].message, /raw browser internals/);
  assert.equal(f.starts(), 1);
});

test('synchronous permission exception receives the permission-specific explanation', () => {
  const error = new Error('Permission failure'); error.name = 'NotAllowedError';
  const f = fixture({ startError: error }); f.listen();
  assertFallback(f, /Microphone access was denied or blocked/);
});

test('recognizer constructor failure also exposes typed fallback', () => {
  const f = fixture({ constructorError: new Error('constructor unavailable') });
  assert.doesNotThrow(() => f.listen());
  assertFallback(f, /Speech input could not start or continue/);
  assert.equal(f.starts(), 0);
});

test('unsupported speech input opens the same fallback without starting recognition', () => {
  const f = fixture({ supported: false }); f.listen();
  assertFallback(f, /This browser has no speech input/);
  assert.equal(f.starts(), 0);
});

test('successful voice result retains transcript submission and clears listening on end', () => {
  const f = fixture(); f.listen();
  assert.equal(f.stops(), 1);
  assert.equal(f.recognizers[0].lang, 'en-US');
  f.recognizers[0].onresult({ results: [[{ transcript: '  marketing status  ' }]] });
  assert.deepEqual(f.requests, [{ message: 'marketing status', speakBack: true }]);
  assert.deepEqual(f.logs, []);
  f.recognizers[0].onend();
  assert.equal(f.fab.classList.contains('listening'), false);
});
