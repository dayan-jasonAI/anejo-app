  var MARK_SRC = { emblem: '/public/assets/img/emblem.png', lockup: '/public/assets/img/logo_full.png' };

  // The kit's inks (public/assets/brand.css). A mark or a line of type is drawn in one of these and
  // nothing else — no white, no neutral grey, no invented colour.
  //
  // PARCHMENT, NOT CREAM (owner note 2026-08-05: "the wording only have white color"). --cream
  // #F5F2EC is very nearly white, and against a dark forest field it reads as exactly that: white
  // text on a photo, which is the generic look every brand has. --parchment #E8E2CA is the aged
  // paper tone the reference posters actually set their titles in — warmer, quieter, and unmistakably
  // Añejo. Cream is gone from the type path entirely.
  var BRAND_INK = {
    gold:      { css: '#C8BC6E', rgb: [200, 188, 110] },  // --gold, the antique accent
    parchment: { css: '#E8E2CA', rgb: [232, 226, 202] },  // --parchment, the title tone
    deep:      { css: '#0A180C', rgb: [10, 24, 12] }      // --forest, a shade deeper
  };
  var VEIL_RGB = '7,18,7'; // --forest, used only ever as a gradient that reaches zero alpha

  function loadImageEl(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('image_load_failed')); };
      img.src = src;
    });
  }

  // Canvas can only draw a face the DOCUMENT has already loaded — an unloaded family in ctx.font is
  // not an error, it is a silent fallback to the generic. That is exactly what used to happen here.
  // Resolved once per page; a slow or blocked font CDN loses the race after 3s and the composite
  // goes ahead on the Georgia/Helvetica fallbacks named in the stacks below. Wrong face, right
  // words — never a hung preview button.
  var brandFontsReady = null;
  function ensureBrandFonts() {
    if (brandFontsReady) return brandFontsReady;
    if (!document.fonts || !document.fonts.load) { brandFontsReady = Promise.resolve(false); return brandFontsReady; }
    var wanted = Promise.all([
      document.fonts.load('600 96px "Cormorant Garamond"'),
      document.fonts.load('500 96px "Josefin Sans"')
    ]).then(function () { return true; }).catch(function () { return false; });
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(false); }, 3000); });
    brandFontsReady = Promise.race([wanted, timeout]);
    return brandFontsReady;
  }
  function headlineFont(px) { return '600 ' + px + 'px "Cormorant Garamond", Georgia, "Times New Roman", serif'; }
  function kickerFont(px) { return '500 ' + px + 'px "Josefin Sans", "Helvetica Neue", Arial, sans-serif'; }

  // WCAG relative luminance + contrast ratio. Used for real decisions below, not decoration: which
  // ink to draw in, whether a wording block needs the fade, which corner the mark goes to.
  function chanLum(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function relLum(rgb) { return 0.2126 * chanLum(rgb[0]) + 0.7152 * chanLum(rgb[1]) + 0.0722 * chanLum(rgb[2]); }
  function contrastRatio(a, b) { var hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }

  // What is actually under a rect: how bright (mean luminance) and how BUSY (std deviation of it).
  // Busy matters independently of bright — a mark over a mid-grey wall and a mark over a mid-grey
  // pile of chopped herbs measure the same average and look nothing alike. Sampled on a stride so
  // this stays cheap on a 2048px photo. If getImageData ever throws (a tainted canvas), the caller
  // gets neutral-dark stats and the composite degrades to a sensible default instead of failing.
  function regionStats(ctx, canvas, x, y, w, h) {
    x = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
    w = Math.max(1, Math.min(canvas.width - x, Math.round(w)));
    h = Math.max(1, Math.min(canvas.height - y, Math.round(h)));
    try {
      var data = ctx.getImageData(x, y, w, h).data;
      var total = w * h;
      var stride = Math.max(1, Math.floor(total / 1500));
      var sum = 0, sumSq = 0, n = 0;
      for (var i = 0; i < total; i += stride) {
        var o = i * 4;
        var l = relLum([data[o], data[o + 1], data[o + 2]]);
        sum += l; sumSq += l * l; n++;
      }
      var mean = sum / n;
      return { lum: mean, busy: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
    } catch (e) {
      return { lum: 0.3, busy: 0.12 };
    }
  }

  // Contrast against the WORST end of the region, never against its average. This is the single
  // measurement that decides whether type over a photograph can be read, and averaging it is how
  // the first attempt at this got it wrong: a strip of bowl measuring mean 0.19 with a spread of
  // 0.20 runs from black shadow to mid-grey quinoa, and an ink picked against 0.19 is invisible
  // across half of it — which is exactly how a kicker disappears into a plate. Treating the region
  // as the band mean ± spread and scoring the worse end encodes the thing that actually matters:
  // a busy background is hostile to type no matter how its average comes out.
  function inkContrast(ink, stats) {
    var l = relLum(ink.rgb);
    var lo = Math.max(0, stats.lum - stats.busy);
    var hi = Math.min(1, stats.lum + stats.busy);
    return Math.min(contrastRatio(l, lo), contrastRatio(l, hi));
  }

  // TWO INKS, not one — read straight off the reference posters. The big serif title is set in
  // PARCHMENT; the kicker, the hairline rules and the mark are GOLD. That split is what makes a
  // layout read as Añejo instead of as white type on a photo: gold carries the brand, parchment
  // carries the words, and neither is asked to do the other's job.
  //
  // On a LIGHT frame both collapse to deep forest. Gold on pale stone is mush, and the references
  // never put gold on anything bright — the gold in them always sits on the dark green field.
  function pickTitleInk(stats) {
    return inkContrast(BRAND_INK.parchment, stats) >= inkContrast(BRAND_INK.deep, stats)
      ? BRAND_INK.parchment : BRAND_INK.deep;
  }
  // Gold wherever gold holds — 3:1 is WCAG's floor for large graphic objects, which is what an
  // accent rule, a letterspaced kicker and the mark all are.
  function pickAccentInk(stats) {
    if (inkContrast(BRAND_INK.gold, stats) >= 3) return BRAND_INK.gold;
    return pickTitleInk(stats);
  }
  // The generic "best ink here", used by the mark and by the placement scoring so a corner is
  // always judged in the ink it will actually be drawn in. The mark is an accent element.
  function pickInk(stats) { return pickAccentInk(stats); }
  // The halo is the opposite polarity of the ink, always weak and always wide — separation without
  // an edge. This is what replaced the plate.
  function haloFor(ink) { return relLum(ink.rgb) > 0.4 ? 'rgba(7,18,7,0.42)' : 'rgba(245,242,236,0.5)'; }

  // Re-ink the mark: draw it into an offscreen canvas, then flood that canvas through the mark's own
  // alpha with `source-in`. The result is the REAL asset's exact silhouette in one brand colour —
  // no redrawn glyphs, no traced shapes, nothing generated.
  function tintMark(img, w, h, css) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = css;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Letterspacing, by hand. ctx.letterSpacing exists in Chromium and nowhere else that matters, and
  // a kicker without tracking is not a kicker — it is just small text.
  function trackedWidth(ctx, str, tracking) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += ctx.measureText(str.charAt(i)).width;
    return w + tracking * Math.max(0, str.length - 1);
  }
  function drawTracked(ctx, str, x, y, tracking) {
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + tracking;
    }
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = text.split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var next = cur ? cur + ' ' + words[i] : words[i];
      if (!cur || ctx.measureText(next).width <= maxWidth) cur = next;
      else { lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Auto-fit: start at the ideal size for this image and step down until the headline fits the safe
  // measure in at most two lines. This is the "must be able to resize" requirement — one typed
  // string composes on a square Studio render and a 4:5 phone photo without being retyped.
  function fitHeadline(ctx, text, maxWidth, startPx, minPx) {
    var px = startPx, lines = [text];
    while (px > minPx) {
      ctx.font = headlineFont(px);
      lines = wrapLines(ctx, text, maxWidth);
      var widest = 0;
      for (var i = 0; i < lines.length; i++) widest = Math.max(widest, ctx.measureText(lines[i]).width);
      if (lines.length <= 2 && widest <= maxWidth) break;
      px = Math.max(minPx, Math.round(px * 0.93));
    }
    ctx.font = headlineFont(px);
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length > 2 || lines.some(function(line){return ctx.measureText(line).width > maxWidth;})) {
      throw new Error('Shorten the headline so every word fits without covering the food.');
    }
    return { px: px, lines: lines };
  }

  // Where the wording goes when the owner leaves it on Auto. Compares the calm of the bottom band
  // against the top band, and — inside whichever wins at the bottom — whether the left half is
  // meaningfully calmer than the right. Busy is weighted far above contrast because contrast can be
  // fixed by re-inking and clutter cannot.
  function chooseLayout(ctx, canvas) {
    var W = canvas.width, H = canvas.height;
    function calm(r) { var s = regionStats(ctx, canvas, r[0], r[1], r[2], r[3]); return { s: s, score: Math.min(inkContrast(pickInk(s), s), 8) * 0.5 - s.busy * 8 }; }
    var bottom = calm([W * 0.08, H * 0.62, W * 0.84, H * 0.30]);
    var top = calm([W * 0.08, H * 0.06, W * 0.84, H * 0.26]);
    if (top.score > bottom.score + 0.6) return 'masthead';
    var bl = calm([W * 0.08, H * 0.62, W * 0.46, H * 0.30]);
    var br = calm([W * 0.46, H * 0.62, W * 0.46, H * 0.30]);
    return bl.score > br.score + 0.5 ? 'caption' : 'editorial';
  }

  // ---------------------------------------------------------------------------------------------
  // REPOSADO POSTER — the full editorial composition from the owner's reference posters, rather
  // than a mark and two lines dropped onto a photograph.
  //
  // THE DIVISION OF LABOUR, and it is the whole design: the GENERATOR makes the scene — the dark
  // stone, the draped fabric, the olive branches, the calm upper third (see BRAND_PHOTO_STANDARD)
  // — and this composes the FRAME AND THE TYPE onto it. Nothing here draws a botanical or a
  // texture, because a canvas cannot fake one convincingly and the photograph already has real
  // ones. And nothing there sets a word, because a model cannot be trusted with the mark or with
  // spelling. Each side does the half it cannot get wrong.
  // ---------------------------------------------------------------------------------------------
  var POSTER_RATIO = 9 / 16;

  // A four-point star, drawn as a PATH. The reference posters use one between blocks, and the
  // obvious implementation — setting '✦' as text — renders a tofu box in the middle of a finished
  // poster on any device whose font stack lacks the glyph. A path cannot go missing.
  function drawStar(ctx, cx, cy, r) {
    var inner = r * 0.3;
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var ang = (Math.PI / 4) * i - Math.PI / 2;
      var rad = i % 2 === 0 ? r : inner;
      var px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // The hairline frame. STROKED, never filled — it is a rule, not a plate, and the guard test that
  // keeps plates out of this file checks exactly that distinction.
  function hairlineFramePath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function averageColour(ctx, x, y, w, h) {
    try {
      var d = ctx.getImageData(x, y, w, h).data;
      var n = w * h, stride = Math.max(1, Math.floor(n / 800)), r = 0, g = 0, b = 0, c = 0;
      for (var i = 0; i < n; i += stride) { var o = i * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; c++; }
      return [Math.round(r / c), Math.round(g / c), Math.round(b / c)];
    } catch (e) { return [12, 26, 18]; }
  }

  // Give the photograph the height the layout needs, by EXTENDING it — never by stretching or
  // cropping. Stretching deforms the bowl, which the food rules forbid outright; cropping eats the
  // food, which is the whole subject. So the photo keeps its exact pixels and sits at the bottom
  // of a taller canvas, and the space above it is filled with a field sampled FROM THIS PHOTO'S
  // OWN TOP EDGE — a continuation of this frame rather than a swatch stuck above it — with the
  // join feathered so there is no seam to find. A photo already at least 9:16 is used untouched.
  function posterCanvas(photo) {
    var pw = photo.naturalWidth || photo.width, ph = photo.naturalHeight || photo.height;
    var c = document.createElement('canvas');
    var H = Math.round(pw / POSTER_RATIO);
    if (ph >= H) { c.width = pw; c.height = ph; c.getContext('2d').drawImage(photo, 0, 0); return c; }
    c.width = pw; c.height = H;
    var x = c.getContext('2d');
    var probe = document.createElement('canvas');
    probe.width = pw; probe.height = ph;
    var pctx = probe.getContext('2d');
    pctx.drawImage(photo, 0, 0);
    // PULLED TOWARDS THE BRAND, not sampled raw. Sampling alone was the first attempt and it is
    // wrong for exactly the photos that need extending most: a bowl shot on pale stone averages
    // beige at the top, so the poster grew a beige field, and gold on beige is mush — the opposite
    // of the deep forest world the references are built in. Mixing three parts forest to one part
    // photo keeps a trace of this frame's own hue while landing the field firmly in the brand.
    // A photo that is ALREADY dark barely moves, which is the case the generators now produce.
    var sampled = averageColour(pctx, 0, 0, pw, Math.max(1, Math.round(ph * 0.06)));
    var FOREST = [11, 26, 18];
    var f = [0, 1, 2].map(function (i) { return Math.round(sampled[i] * 0.25 + FOREST[i] * 0.75); });
    var rgb = f[0] + ',' + f[1] + ',' + f[2];
    x.fillStyle = 'rgb(' + rgb + ')';
    x.fillRect(0, 0, pw, H);
    var dy = H - ph;
    x.drawImage(photo, 0, dy, pw, ph);
    var featherTop = Math.max(0, dy - Math.round(H * 0.10));
    var g = x.createLinearGradient(0, featherTop, 0, dy + Math.round(H * 0.10));
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(0.45, 'rgba(' + rgb + ',0.9)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, featherTop, pw, dy + Math.round(H * 0.10) - featherTop);
    return c;
  }

  function composePoster(photo, mark, opts) {
    var canvas = posterCanvas(photo);
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var gold = BRAND_INK.gold, parch = BRAND_INK.parchment;
    var inset = Math.round(W * 0.045);

    // The frame.
    ctx.save();
    ctx.strokeStyle = gold.css;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, Math.round(W * 0.002));
    hairlineFramePath(ctx, inset, inset, W - inset * 2, H - inset * 2, Math.round(W * 0.022));
    ctx.stroke();
    ctx.restore();

    var cx = Math.round(W / 2);
    var maxW = W - inset * 2 - Math.round(W * 0.08);
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(7,18,7,0.35)';
    ctx.shadowBlur = Math.round(W * 0.012);

    var y = inset + Math.round(W * 0.055);

    // The mark, then the company name set as TYPE. Drawing "AÑEJO CATERING CO." in Josefin is not
    // a logo — the logo is the emblem above it, composited from the real asset. The references set
    // that line as letterspaced sans exactly this way, separate from the mark.
    var mw = Math.round(W * 0.16);
    var mh = Math.round(mw * ((mark.naturalHeight || mark.height) / (mark.naturalWidth || mark.width)));
    ctx.drawImage(tintMark(mark, mw, mh, gold.css), Math.round(cx - mw / 2), y, mw, mh);
    y += mh + Math.round(W * 0.028);

    ctx.fillStyle = gold.css;
    var namePx = Math.round(W * 0.026);
    ctx.font = kickerFont(namePx);
    ctx.textAlign = 'left';
    var nameTrack = namePx * 0.36;
    var nameW = trackedWidth(ctx, 'AÑEJO CATERING CO.', nameTrack);
    drawTracked(ctx, 'AÑEJO CATERING CO.', Math.round(cx - nameW / 2), y, nameTrack);
    y += namePx + Math.round(W * 0.042);

    drawStar(ctx, cx, y + Math.round(W * 0.012), Math.round(W * 0.013));
    y += Math.round(W * 0.05);

    // TITLE — uppercased. The references set bowl names in caps, and casing is presentation, not
    // spelling: the owner's exact characters are still the only source, so this cannot introduce a
    // typo the way a model rendering the word could.
    var title = String(opts.text || '').trim().slice(0, 28).toUpperCase();
    if (title) {
      var tPx = Math.round(W * 0.135), tTrack;
      while (tPx > Math.round(W * 0.05)) {
        ctx.font = headlineFont(tPx);
        if (trackedWidth(ctx, title, tPx * 0.04) <= maxW) break;
        tPx = Math.round(tPx * 0.94);
      }
      ctx.font = headlineFont(tPx);
      tTrack = tPx * 0.04;
      ctx.fillStyle = parch.css;
      var tw = trackedWidth(ctx, title, tTrack);
      drawTracked(ctx, title, Math.round(cx - tw / 2), y, tTrack);
      y += Math.round(tPx * 1.12);
    }

    // Subtitle — letterspaced caps, gold.
    var sub = String(opts.kicker || '').trim().slice(0, 40).toUpperCase();
    if (sub) {
      var sPx = Math.max(Math.round(W * 0.028), 10);
      ctx.font = kickerFont(sPx);
      ctx.fillStyle = gold.css;
      var sTrack = sPx * 0.3;
      var sw = trackedWidth(ctx, sub, sTrack);
      while (sw > maxW && sPx > 9) { sPx = Math.round(sPx * 0.94); ctx.font = kickerFont(sPx); sTrack = sPx * 0.3; sw = trackedWidth(ctx, sub, sTrack); }
      drawTracked(ctx, sub, Math.round(cx - sw / 2), y, sTrack);
      y += sPx + Math.round(W * 0.03);
    }

    // Accent — one restrained italic serif line. The style calls for exactly one; the field is
    // capped short so it stays that way.
    var accent = String(opts.accent || '').trim().slice(0, 44);
    if (accent) {
      var aPx = Math.round(W * 0.048);
      ctx.font = 'italic 500 ' + aPx + 'px "Cormorant Garamond", Georgia, serif';
      while (ctx.measureText(accent).width > maxW && aPx > 12) { aPx = Math.round(aPx * 0.94); ctx.font = 'italic 500 ' + aPx + 'px "Cormorant Garamond", Georgia, serif'; }
      ctx.fillStyle = gold.css;
      ctx.textAlign = 'center';
      ctx.fillText(accent, cx, y);
      y += Math.round(aPx * 1.3);
      ctx.textAlign = 'left';
    }

    // Rule with a centred star, closing the title block off from the food below it.
    ctx.fillStyle = gold.css;
    var ruleY = y + Math.round(W * 0.012);
    var half = Math.round(W * 0.22), gap = Math.round(W * 0.035);
    var rh = Math.max(1, Math.round(W * 0.0016));
    ctx.globalAlpha = 0.6;
    ctx.fillRect(cx - half, ruleY, half - gap, rh);
    ctx.fillRect(cx + gap, ruleY, half - gap, rh);
    ctx.globalAlpha = 1;
    drawStar(ctx, cx, ruleY + Math.round(rh / 2), Math.round(W * 0.011));

    // Footer — the second italic line, sitting above the bottom frame edge.
    var footer = String(opts.footer || '').trim().slice(0, 52);
    if (footer) {
      var fPx = Math.round(W * 0.040);
      ctx.font = 'italic 500 ' + fPx + 'px "Cormorant Garamond", Georgia, serif';
      while (ctx.measureText(footer).width > maxW && fPx > 11) { fPx = Math.round(fPx * 0.94); ctx.font = 'italic 500 ' + fPx + 'px "Cormorant Garamond", Georgia, serif'; }
      var fy = H - inset - Math.round(W * 0.055) - fPx;
      // The closing line sits at the BOTTOM, which on a poster is over the photograph itself —
      // and a bowl is the brightest thing in the frame. Measured, not assumed: MAR's line landed
      // on a pale ceramic rim and vanished. If gold cannot hold there, the same edge-anchored
      // fade the overlay uses goes down first — a gradient to zero alpha, never a bar.
      var fStats = regionStats(ctx, canvas, inset, fy - Math.round(W * 0.06), W - inset * 2, fPx + Math.round(W * 0.09));
      if (inkContrast(gold, fStats) < 3) {
        var fadeTop = Math.round(H * 0.72);
        var fg = ctx.createLinearGradient(0, fadeTop, 0, H);
        fg.addColorStop(0, 'rgba(' + VEIL_RGB + ',0)');
        fg.addColorStop(1, 'rgba(' + VEIL_RGB + ',0.72)');
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = fg;
        ctx.fillRect(0, fadeTop, W, H - fadeTop);
        ctx.restore();
      }
      drawStar(ctx, cx, fy - Math.round(W * 0.035), Math.round(W * 0.011));
      ctx.fillStyle = gold.css;
      ctx.textAlign = 'center';
      ctx.fillText(footer, cx, fy);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // photoUrl: the HUB-authenticated media route for the slide being branded (same-origin, so the
  // canvas is never "tainted" and both getImageData and toDataURL work). Returns a
  // Promise<string> of a JPEG data URL.
  function compositeBranding(photoUrl, opts) {
    opts = opts || {};
    // Poster mode always uses the EMBLEM: it sets the company name as type on its own line, so the
    // full lockup would print that name twice, once as artwork and once as type, at two different
    // sizes in two different faces. The references use the emblem for exactly this reason.
    var markKey = opts.preset === 'poster' ? 'emblem' : opts.preset === 'reposado' ? 'emblem' : (opts.mark === 'lockup' ? 'lockup' : 'emblem');
    return ensureBrandFonts()
      .then(function () { return Promise.all([loadImageEl(photoUrl), loadImageEl(MARK_SRC[markKey])]); })
      .then(function (imgs) {
      if (opts.preset === 'poster') return composePoster(imgs[0], imgs[1], opts);
      var photo = imgs[0], logo = imgs[1];
      var canvas = document.createElement('canvas');
      canvas.width = photo.naturalWidth || photo.width;
      canvas.height = photo.naturalHeight || photo.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

      var W = canvas.width, H = canvas.height;
      var S = Math.min(W, H);                    // every size below derives from the SHORTER side,
      var M = Math.round(S * 0.075);             // so a square render and a tall photo compose alike
      var safeW = W - M * 2;
      var fullFrame = opts.preset === 'reposado';
      // Source pixels fill the entire canvas at their native aspect ratio. No inset photo,
      // stretched food, generated background or silent crop is introduced by this preset.
      if (fullFrame) {
        var frameInset = Math.round(S * 0.035);
        var frameInk = pickInk(regionStats(ctx, canvas, frameInset, frameInset, W - frameInset * 2, Math.max(1, S * 0.025)));
        ctx.save(); ctx.strokeStyle = frameInk.css; ctx.globalAlpha = 0.55;
        ctx.lineWidth = Math.max(1, Math.round(S * 0.0015));
        hairlineFramePath(ctx, frameInset, frameInset, W-frameInset*2, H-frameInset*2, Math.round(S*0.015));
        ctx.stroke(); ctx.restore();
      }

      // ---- WORDING ---------------------------------------------------------------------------
      // Drawn first so the mark can be told where NOT to go. The headline keeps the owner's exact
      // characters and casing; only the kicker is uppercased, because a letterspaced cap kicker is
      // the form itself, not a transform of meaning.
      var headline = String(opts.text || '').trim().slice(0, 48);
      var kicker = String(opts.kicker || '').trim().slice(0, 28).toUpperCase();
      var layout = opts.layout && opts.layout !== 'auto' ? opts.layout : ((headline || kicker) ? chooseLayout(ctx, canvas) : 'editorial');
      var wordRect = null;

      if (headline || kicker) {
        var align = layout === 'caption' ? 'left' : 'center';
        var atTop = layout === 'masthead';

        var head = headline ? fitHeadline(ctx, headline, safeW, Math.round(S * (fullFrame ? 0.068 : 0.088)), Math.round(S * 0.042)) : { px: 0, lines: [] };
        var kickPx = Math.max(Math.round((head.px || S * 0.075) * 0.27), Math.round(S * 0.021));
        var tracking = kickPx * 0.34;
        var lineH = Math.round(head.px * 1.16);
        var ruleH = Math.max(1, Math.round(S * 0.0028));
        var ruleW = Math.round(S * 0.085);
        var gapRule = Math.round(kickPx * 0.95);
        var gapKick = kicker ? Math.round((head.px || kickPx) * 0.44) : 0;

        // Canvas measures from the em-box TOP, so a line of size px hangs its descenders BELOW
        // top + px. Without this allowance the last line of a bottom-anchored block runs off the
        // bottom of the photo — which is precisely what a two-line auto-fit headline did.
        var descAllow = head.lines.length ? Math.round(head.px * 0.32) : 0;
        var blockH = ruleH + gapRule + (kicker ? kickPx + gapKick : 0) + head.lines.length * lineH + descAllow;
        if (fullFrame && blockH > H * 0.24) throw new Error('Shorten the wording to keep the center of the photograph clear.');
        var top = atTop ? M : H - M - blockH;

        // Measure what is actually behind the block, then decide ink. Type is held to 4.5:1 (the
        // WCAG floor for text, not the looser one for large graphics) across the whole band, and
        // only when the best available ink cannot reach it does the edge fade appear — a gradient
        // that reaches zero alpha, so there is no line anywhere on it to read as a box.
        var wStats = regionStats(ctx, canvas, M, top - S * 0.02, align === 'left' ? Math.round(safeW * 0.68) : safeW, blockH + S * 0.04);
        var titleInk = pickTitleInk(wStats);
        var accentInk = pickAccentInk(wStats);
        // Gated on the TITLE, because it is the biggest and most-read element: if the title needs
        // the fade to be legible, the accents riding with it need it too.
        if (inkContrast(titleInk, wStats) < 4.5) {
          var fadeSpan = Math.round(S * 0.22);
          var solid = 'rgba(' + VEIL_RGB + ',0.66)', clear = 'rgba(' + VEIL_RGB + ',0)';
          var g = atTop
            ? ctx.createLinearGradient(0, 0, 0, top + blockH + fadeSpan)
            : ctx.createLinearGradient(0, top - fadeSpan, 0, H);
          g.addColorStop(0, atTop ? solid : clear);   // the edge it is anchored to is the only
          g.addColorStop(1, atTop ? clear : solid);   // opaque end; the other reaches zero alpha
          ctx.fillStyle = g;
          if (atTop) ctx.fillRect(0, 0, W, top + blockH + fadeSpan);
          else ctx.fillRect(0, top - fadeSpan, W, H - (top - fadeSpan));
          // The fade lays down the same deep forest field the reference posters are built on, and
          // on that field the brand pairing stops being a judgement call: parchment title, gold
          // accents, exactly as printed.
          titleInk = BRAND_INK.parchment;
          accentInk = BRAND_INK.gold;
        }

        var cx = align === 'left' ? M : Math.round(W / 2);
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.shadowBlur = Math.round(S * 0.018);

        // Rule and kicker: GOLD.
        var y = top;
        var ruleX = align === 'left' ? M : Math.round(cx - ruleW / 2);
        ctx.fillStyle = accentInk.css;
        ctx.shadowColor = haloFor(accentInk);
        ctx.fillRect(ruleX, y, ruleW, ruleH);
        y += ruleH + gapRule;

        if (kicker) {
          ctx.font = kickerFont(kickPx);
          ctx.textAlign = 'left';
          var kw = trackedWidth(ctx, kicker, tracking);
          drawTracked(ctx, kicker, align === 'left' ? M : Math.round(cx - kw / 2), y, tracking);
          y += kickPx + gapKick;
        }
        // Title: PARCHMENT.
        if (head.lines.length) {
          ctx.fillStyle = titleInk.css;
          ctx.shadowColor = haloFor(titleInk);
          ctx.font = headlineFont(head.px);
          ctx.textAlign = align === 'left' ? 'left' : 'center';
          for (var li = 0; li < head.lines.length; li++) {
            ctx.fillText(head.lines[li], align === 'left' ? M : cx, y);
            y += lineH;
          }
        }
        ctx.restore();
        wordRect = { x: M, y: top, w: align === 'left' ? Math.round(safeW * 0.68) : safeW, h: blockH };
      }

      // ---- THE MARK --------------------------------------------------------------------------
      // Sized restrained (the lockup is a tall three-part composition; at the old 22% it dominated
      // a square render). Placement is measured, not assumed, and never lands on the wording.
      var markW = Math.round(S * (markKey === 'lockup' ? 0.17 : 0.115));
      var markH = Math.round(markW * ((logo.naturalHeight || logo.height) / (logo.naturalWidth || logo.width)));
      // Six anchors, not four. TOP CENTRE is where the reference posters put the mark — centred
      // above the title, the whole layout hanging off it — and BOTTOM CENTRE is its mirror for a
      // photo whose subject sits high. Both are in the Auto pool too, so a centred layout can
      // actually choose the centred mark instead of being forced into a corner.
      var cxMark = Math.round((W - markW) / 2);
      var anchors = {
        tl: [M, M],          tc: [cxMark, M],          tr: [W - markW - M, M],
        bl: [M, H - markH - M], bc: [cxMark, H - markH - M], br: [W - markW - M, H - markH - M]
      };
      function collides(a) {
        if (!wordRect) return false;
        var pad = Math.round(M * 0.6);
        return !(a[0] + markW + pad < wordRect.x || a[0] > wordRect.x + wordRect.w + pad ||
                 a[1] + markH + pad < wordRect.y || a[1] > wordRect.y + wordRect.h + pad);
      }

      var chosen = anchors[opts.position] || null;
      if (fullFrame && chosen && collides(chosen)) chosen = null;
      if (!chosen) {
        var keys = Object.keys(anchors).filter(function (k) { return !collides(anchors[k]); });
        if (!keys.length && fullFrame) throw new Error('No clear logo position remains. Shorten the wording and preview again.');
        if (!keys.length) keys = Object.keys(anchors);
        var best = null;
        keys.forEach(function (k) {
          var a = anchors[k];
          var st = regionStats(ctx, canvas, a[0], a[1], markW, markH);
          // Contrast is capped because past a point more of it buys nothing, while clutter keeps
          // costing — a calm corner at 5:1 beats a cluttered one at 12:1 every time. Busy is only
          // lightly weighted here on top of that because inkContrast already charges for it.
          var score = Math.min(inkContrast(pickInk(st), st), 8) - st.busy * 5;
          if (!best || score > best.score) best = { score: score, a: a, st: st };
        });
        chosen = best.a;
      }

      var mStats = regionStats(ctx, canvas, chosen[0], chosen[1], markW, markH);
      var mInk = pickInk(mStats);
      var drawable = opts.finish === 'original' ? logo : tintMark(logo, markW, markH, mInk.css);
      ctx.save();
      ctx.shadowColor = haloFor(opts.finish === 'original' ? BRAND_INK.gold : mInk);
      ctx.shadowBlur = Math.round(S * 0.045);
      ctx.drawImage(drawable, chosen[0], chosen[1], markW, markH);
      ctx.restore();

      return canvas.toDataURL('image/jpeg', 0.92);
    });
  }


window.AnejoBranding={compose:compositeBranding};
