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

test('PREVENT — branding is composited from the REAL logo assets, not asked of an image model', () => {
  assert.match(HTML, /var MARK_SRC = \{ emblem: '\/assets\/img\/emblem\.png', lockup: '\/assets\/img\/logo_full\.png' \}/,
    'the only two marks are the actual committed logo files');
  assert.match(HTML, /loadImageEl\(MARK_SRC\[markKey\]\)/, 'the mark is LOADED from that map, never built');
  assert.match(HTML, /ctx\.drawImage\(drawable, chosen\[0\], chosen\[1\], markW, markH\)/, 'must draw the loaded image, not synthesize one');
});

test('re-inking the mark preserves the REAL asset silhouette — it recolours, it never redraws', () => {
  // The adaptive finish flood-fills through the loaded PNG's own alpha. That is still the committed
  // artwork's exact shape; anything that DREW the mark (paths, glyphs, a traced outline) would be
  // an approximation of the logo, which is the one thing this whole feature exists to prevent.
  const fn = HTML.slice(HTML.indexOf('function tintMark'), HTML.indexOf('// Letterspacing, by hand'));
  assert.match(fn, /x\.drawImage\(img, 0, 0, c\.width, c\.height\)/, 'starts from the real asset');
  assert.match(fn, /x\.globalCompositeOperation = 'source-in'/, 'recolours through the asset\'s own alpha');
  assert.ok(!/beginPath|arcTo|moveTo|lineTo|fillText/.test(fn), 'must not draw shapes or glyphs of its own');
});

test('branding never touches the model/provider chain — no generation call in the compositing path', () => {
  // Bounded to the actual branding CODE (through the end of wireBranding), not the CAROUSEL
  // comment block that follows it — that block legitimately mentions generate_carousel in prose.
  const section = HTML.slice(HTML.indexOf('function loadImageEl'), HTML.indexOf('// CAROUSEL —'));
  assert.ok(!/openai|gemini|generate_cover|generate_carousel/i.test(section), 'branding must be pure client-side compositing, not another generation call');
  assert.match(section, /new Promise\(function \(resolve, reject\)/, 'compositing is local Canvas work, not a fetch to a provider');
});

test('wording is drawn from the exact owner string — real canvas text, never sent to a model', () => {
  assert.match(HTML, /ctx\.fillText\(head\.lines\[li\],/, 'the headline the owner typed is what gets drawn');
  assert.match(HTML, /drawTracked\(ctx, kicker,/, 'the kicker the owner typed is what gets drawn');
  assert.match(HTML, /class="brand-text" type="text" maxlength="48"/, 'the headline is capped — a headline/CTA, not a caption');
  assert.match(HTML, /class="brand-kicker" type="text" maxlength="28"/, 'the kicker is capped shorter still');
});

// ---------------------------------------------------------------------------
// Branding: NO PLATE, NO BAND (owner ruling 2026-08-05)
//
// The first version of this tool bought legibility with a dark rounded plate behind the mark and a
// full-width dark band behind the wording. The owner rejected both — "it cannot have the box in the
// back or the logo in the square" — and they are the exact thing a future session reaches for the
// moment a composite looks washed out. These assertions make that reach fail loudly instead.
// ---------------------------------------------------------------------------

const BRAND_SECTION = HTML.slice(HTML.indexOf('  var MARK_SRC ='), HTML.indexOf('// CAROUSEL —'));

test('PREVENT — nothing opaque is ever drawn behind the mark', () => {
  assert.ok(!/roundRectPath/.test(HTML), 'the rounded-plate helper must stay deleted');
  const draw = BRAND_SECTION.slice(BRAND_SECTION.indexOf('var drawable ='), BRAND_SECTION.indexOf('return canvas.toDataURL'));
  assert.match(draw, /ctx\.drawImage\(drawable/, 'the mark is drawn');
  assert.ok(!/fillRect|\.fill\(/.test(draw), 'no plate, halo only — the mark sits on the photograph');
  assert.match(draw, /ctx\.shadowColor = haloFor\(/, 'separation comes from a soft halo, which has no edge');
});

test('PREVENT — the only background treatment behind wording is a gradient that reaches zero alpha', () => {
  assert.match(BRAND_SECTION, /var solid = 'rgba\(' \+ VEIL_RGB \+ ',0\.66\)', clear = 'rgba\(' \+ VEIL_RGB \+ ',0\)'/,
    'the fade is defined as solid-at-the-edge to fully transparent');
  assert.match(BRAND_SECTION, /createLinearGradient/, 'it is a gradient, not a filled band');
  assert.ok(!/ctx\.fillStyle = 'rgba\(7,18,7,0\.6/.test(BRAND_SECTION), 'no flat translucent band may be filled behind text');
  // And it only appears when measurement says the type cannot be read without it.
  assert.match(BRAND_SECTION, /if \(inkContrast\(ink, wStats\) < 4\.5\) \{/, 'the fade is contrast-gated, not always-on');
});

test('legibility is measured against the WORST end of the region, never its average', () => {
  // A bowl strip averaging mid-grey runs from black shadow to bright quinoa; an ink chosen against
  // the mean vanishes across half of it. That is the bug that made the kicker disappear.
  assert.match(BRAND_SECTION, /Math\.min\(contrastRatio\(l, lo\), contrastRatio\(l, hi\)\)/,
    'contrast is the worse of the band mean +/- its spread');
  assert.match(BRAND_SECTION, /stats\.lum - stats\.busy/, 'the spread is what makes the band');
});

test('the brand faces are actually LOADED, or canvas silently draws the system fallback', () => {
  assert.match(HTML, /fonts\.googleapis\.com\/css2\?family=Josefin\+Sans[^"]*Cormorant\+Garamond/,
    'the page must request the two brand faces');
  assert.match(HTML, /document\.fonts\.load\('600 96px "Cormorant Garamond"'\)/, 'and wait for them before compositing');
  assert.match(HTML, /Promise\.race\(\[wanted, timeout\]\)/, 'but never block the preview on a slow font CDN');
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

test('branding, carousel generation, the reference-variant tool, and the prompt-image tool are offered only on feed posts, not Reels/Stories', () => {
  // promptImageTool (2026-08-04, the "generate image of a single prompt" gap) joined the other
  // three on the same line — same isFeed gate, same reasoning: a Reel/Story has no still-photo
  // slide concept at all.
  assert.match(HTML, /\(isFeed \? brandingTool\(p\) \+ carouselTool\(p\) \+ referenceVariantTool\(p\) \+ promptImageTool\(p\) : ''\)/);
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
