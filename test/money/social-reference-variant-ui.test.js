// The reference-variant tool (public/hub/owner/marketing.html) must actually be WIRED into the
// page, same class of test as social-branding-carousel-ui.test.js — a fix that exists in a module
// nothing calls is invisible to the owner. Two things matter most here, distinct from the branding
// tool: (1) the honesty line the build brief said never to bury, and (2) preview-then-commit —
// nothing is added to the post until the owner explicitly accepts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

test('the tool is rendered and wired to the generate_reference_variant op', () => {
  assert.match(HTML, /function referenceVariantTool\(p\)/);
  assert.match(HTML, /refvar-gen/);
  assert.match(HTML, /op: 'generate_reference_variant', id: postId, bowl: bowl, look: look/);
});

test('THE HONESTY LINE — "this is a styled variant of a real photo" is stated plainly, unconditionally, every time the panel opens', () => {
  const fn = HTML.slice(HTML.indexOf('function referenceVariantTool'), HTML.indexOf('function wireReferenceVariant'));
  assert.match(fn, /This makes a styled variant of a real Añejo photo/i);
  assert.match(fn, /never a new picture of food/i);
  // Unconditional: the line must be OUTSIDE any if/ternary that could suppress it — it should sit
  // directly in the template string the panel always renders, not behind a config flag.
  assert.ok(!/reference_gemini_configured\s*\?[^:]*styled variant/i.test(fn), 'the honesty line must not be gated by provider config');
});

test('the panel never touches the post until the owner explicitly accepts — preview renders BEFORE attach is ever called', () => {
  const wireStart = HTML.indexOf('function wireReferenceVariant');
  const previewRender = HTML.indexOf('resultBox.innerHTML =', wireStart);
  const attachCall = HTML.indexOf("op: 'attach', id: postId, media_key: r.media_key", wireStart);
  assert.ok(wireStart > -1 && previewRender > wireStart, 'the generated image is shown as a preview');
  assert.ok(attachCall > previewRender, 'attach only happens later, inside the refvar-use click handler');
});

test('discarding the preview never calls attach, and clears the panel', () => {
  const section = HTML.slice(HTML.indexOf('function wireReferenceVariant'), HTML.indexOf('function postCard'));
  assert.match(section, /refvar-discard.*addEventListener\('click', function \(\) \{ resultBox\.innerHTML = ''; \}\);/s);
});

test('the campaign look is required before generating — no request with an empty look', () => {
  const section = HTML.slice(HTML.indexOf('function wireReferenceVariant'), HTML.indexOf('function postCard'));
  assert.match(section, /if \(!look \|\| !look\.trim\(\)\) \{ Hub\.toast\('Describe the campaign look first\.'\); return; \}/);
});

test('the bowl picker is sourced from the server, not a client-side duplicate list', () => {
  const fn = HTML.slice(HTML.indexOf('function referenceVariantTool'), HTML.indexOf('function wireReferenceVariant'));
  assert.match(fn, /DATA\.reference_bowls/);
  assert.ok(!/var BOWLS = \[.*coco/is.test(fn), 'must not hardcode the 8 bowl names client-side');
});

test('the generate button self-disables before the call — a real provider call costs real money', () => {
  const section = HTML.slice(HTML.indexOf('function wireReferenceVariant'), HTML.indexOf('function postCard'));
  assert.match(section, /if \(btn\.disabled\) return;/);
  assert.match(section, /btn\.disabled = true; btn\.textContent = 'Generating…';/);
});

test('capped at 10 slides — Instagram\'s own carousel ceiling — nothing left to generate past that', () => {
  const fn = HTML.slice(HTML.indexOf('function referenceVariantTool'), HTML.indexOf('function wireReferenceVariant'));
  assert.match(fn, /if \(count >= 10\) return '';/);
});

test('the tool is actually invoked from wire()', () => {
  assert.match(HTML, /wireCarousel\(\);\s*\n\s*wireReferenceVariant\(\);/);
});
