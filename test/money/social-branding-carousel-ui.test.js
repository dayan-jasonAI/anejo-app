// The branding tool and the carousel generator must actually be WIRED into the page — a fix that
// exists in a module nothing calls is invisible to the owner (see social-food-photo.test.js's
// header for the two real incidents that pattern already caused here). Source-pinned, same style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The branding + carousel tools moved out of social.html when the four marketing pages were
// consolidated into one workspace (social.html is now a redirect stub). These assertions guard
// the rule that matters most in this whole feature — an image model must NEVER draw the Añejo
// logo — so they follow the markup rather than the filename.
const HTML = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Branding: the ONE RULE — an image model never draws the logo
// ---------------------------------------------------------------------------

test('PREVENT — branding is composited from the REAL logo asset, not asked of an image model', () => {
  assert.match(HTML, /loadImageEl\('\/assets\/img\/logo_full\.png'\)/, 'must load the actual committed logo file');
  assert.match(HTML, /ctx\.drawImage\(logo, lx, ly, logoW, logoH\)/, 'must draw the loaded image, not synthesize one');
});

test('branding never touches the model/provider chain — no generation call in the compositing path', () => {
  // Bounded to the actual branding CODE (through the end of wireBranding), not the CAROUSEL
  // comment block that follows it — that block legitimately mentions generate_carousel in prose.
  const section = HTML.slice(HTML.indexOf('function loadImageEl'), HTML.indexOf('// CAROUSEL —'));
  assert.ok(!/openai|gemini|generate_cover|generate_carousel/i.test(section), 'branding must be pure client-side compositing, not another generation call');
  assert.match(section, /new Promise\(function \(resolve, reject\)/, 'compositing is local Canvas work, not a fetch to a provider');
});

test('wording is drawn from the exact owner string — real canvas text, never sent to a model', () => {
  assert.match(HTML, /ctx\.fillText\(upper, tx, ty\)/, 'the exact typed text (uppercased) is what gets drawn');
  assert.match(HTML, /class="brand-text" type="text" maxlength="40"/, 'wording is capped — a headline/CTA, not a caption');
});

test('branding is OPTIONAL and never touches an existing slide — it uploads a NEW one', () => {
  assert.match(HTML, /brand-preview/, 'preview control exists');
  assert.match(HTML, /Use this — add as a new slide/, 'the accept action explicitly adds, never replaces');
  assert.match(HTML, /op: 'attach', id: postId, media_key: r\.media_key \}, 'Branded photo added as a new slide/, 'wired through the existing attach op — additive by construction');
});

test('branding never uploads or attaches until the owner explicitly accepts the preview', () => {
  // The preview render (resultBox.innerHTML = ...img...) must appear BEFORE the social-upload call
  // in source order — the upload only happens inside the LATER "brand-use" click handler nested
  // under it, never as part of showing the preview itself.
  const wireStart = HTML.indexOf('function wireBranding');
  const previewRender = HTML.indexOf('resultBox.innerHTML =', wireStart);
  const uploadCall = HTML.indexOf('/api/hub/owner/social-upload', wireStart);
  assert.ok(wireStart > -1 && previewRender > wireStart, 'preview render must exist inside wireBranding');
  assert.ok(uploadCall > previewRender, 'the upload only happens after the preview is shown, inside the brand-use handler');
});

test('the branded upload carries the source slide\'s role forward, so the food-first guard still recognises it', () => {
  assert.match(HTML, /var sourceRole = \(key\.match\(/, 'the source slide key is parsed for its role suffix');
  assert.match(HTML, /data_url: dataUrl, role: sourceRole/, 'the parsed role rides along with the upload');
});

test('branding is offered only on a draft/scheduled/failed post, never on a live one', () => {
  const fn = HTML.slice(HTML.indexOf('function brandingTool'), HTML.indexOf('function wireBranding'));
  assert.match(fn, /var locked = p\.status === 'published' \|\| p\.status === 'publishing';/);
  assert.match(fn, /if \(locked\) return '';/);
});

test('branding and carousel generation are offered only on feed posts, not Reels/Stories', () => {
  assert.match(HTML, /\(isFeed \? brandingTool\(p\) \+ carouselTool\(p\) : ''\)/);
  assert.match(HTML, /var isFeed = mtype !== 'REELS' && mtype !== 'STORIES';/);
});

// ---------------------------------------------------------------------------
// Carousel generation
// ---------------------------------------------------------------------------

test('the carousel tool is rendered and wired to the generate_carousel op', () => {
  assert.match(HTML, /carousel-gen/);
  assert.match(HTML, /op: 'generate_carousel', id: b\.getAttribute\('data-carousel'\), count: count/);
});

test('the owner picks a TOTAL slide count, capped at 10 (Instagram\'s carousel ceiling)', () => {
  assert.match(HTML, /for \(var n = start; n <= 10; n\+\+\)/);
  assert.match(HTML, /photos total/);
});

test('the generate button self-disables before the call — a multi-image batch costs real money', () => {
  const section = HTML.slice(HTML.indexOf('function wireCarousel'), HTML.indexOf('function postCard'));
  assert.match(section, /if \(b\.disabled\) return;/);
  assert.match(section, /b\.disabled = true; b\.textContent = 'Generating…';/);
});

test('carousel generation reloads the post list on success so the new slides actually show', () => {
  const section = HTML.slice(HTML.indexOf('function wireCarousel'), HTML.indexOf('function postCard'));
  assert.match(section, /Hub\.toast\(r\.message \|\| 'Carousel updated'\); load\(\);/);
});

test('the carousel tool and the branding tool are both actually invoked from wire()', () => {
  assert.match(HTML, /wireBranding\(\);\s*\n\s*wireCarousel\(\);/);
});
