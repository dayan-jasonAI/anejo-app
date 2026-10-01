/* Shared geometry only. This plan does not certify typography, pixels, contrast or publication. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AnejoEditorialPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var version = 'anejo-editorial-geometry-1';
  var profiles = {
    'reposado-square': { aspect: 1, textRegion: { x: .07, y: .915, w: .73, h: .065 }, emblemRegion: { x: .87, y: .915, w: .065, h: .065 } },
    'reposado-dense': { aspect: 1, textRegion: { x: .07, y: .955, w: .82, h: .04 }, emblemRegion: { x: .015, y: .012, w: .06, h: .06 } },
    'reposado-portrait': { aspect: 1, vertical: true, textRegion: { x: .93, y: .36, w: .05, h: .45 }, emblemRegion: { x: .915, y: .06, w: .075, h: .075 } },
    'reposado-wide': { aspect: 4 / 3, textRegion: { x: .065, y: .815, w: .30, h: .12 }, emblemRegion: { x: .30, y: .94, w: .05, h: .055 } },
    'reposado-cajita': { aspect: 4 / 3, textRegion: { x: .56, y: .20, w: .29, h: .23 }, emblemRegion: { x: .32, y: .77, w: .075, h: .1 } }
  };
  function profile(name) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(profiles, name)) throw new Error('Unknown editorial template.');
    return JSON.parse(JSON.stringify(profiles[name]));
  }
  function positive(value) { return Number.isFinite(value) && value > 0; }
  function aspectRatio(aspect) {
    if (!Number.isFinite(aspect) || aspect < .8 || aspect > 1.91) throw new Error('Unsupported social image aspect ratio.');
  }
  function contain(sourceWidth, sourceHeight, aspect) {
    if (!positive(sourceWidth) || !positive(sourceHeight)) throw new Error('Invalid source image dimensions.');
    aspectRatio(aspect);
    var width = 1080, height = Math.round(width / aspect), scale = Math.min(width / sourceWidth, height / sourceHeight);
    var w = sourceWidth * scale, h = sourceHeight * scale;
    if (!positive(w) || !positive(h) || !positive(scale)) throw new Error('Invalid fitted photo geometry.');
    var photo = { x: (width - w) / 2, y: (height - h) / 2, w: w, h: h };
    return { width: width, height: height, photo: photo, extended: photo.x > .5 || photo.y > .5 };
  }
  function normalized(rect) {
    if (!rect || !['x', 'y', 'w', 'h'].every(function (key) { return Number.isFinite(rect[key]); }) || rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0 || rect.x + rect.w > 1 || rect.y + rect.h > 1) throw new Error('Protected photo areas must fit inside the original image.');
    return rect;
  }
  function scaled(rect, width, height) {
    normalized(rect);
    return { x: rect.x * width, y: rect.y * height, w: rect.w * width, h: rect.h * height };
  }
  function projectProtectedAreas(regions, photo) {
    if (!Array.isArray(regions) || regions.length > 20) throw new Error('Invalid protected photo areas.');
    if (!photo || !['x', 'y', 'w', 'h'].every(function (key) { return Number.isFinite(photo[key]); }) || photo.x < 0 || photo.y < 0 || photo.w <= 0 || photo.h <= 0) throw new Error('Invalid fitted photo geometry.');
    return regions.map(function (region) {
      var rect = scaled(region, photo.w, photo.h);
      rect.x += photo.x; rect.y += photo.y;
      return rect;
    });
  }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function plan(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Editorial plan options required.');
    var templateId = options.templateId === undefined ? 'custom_editorial' : options.templateId;
    var base = templateId === 'custom_editorial' ? { aspect: 1, textRegion: { x: .08, y: .9, w: .74, h: .085 }, emblemRegion: { x: .86, y: .89, w: .095, h: .095 } } : profile(templateId);
    var aspect = options.aspect === undefined ? base.aspect : options.aspect;
    var vertical = options.vertical === undefined ? !!base.vertical : options.vertical;
    if (typeof vertical !== 'boolean') throw new Error('Editorial vertical option must be boolean.');
    var fitted = contain(options.sourceWidth, options.sourceHeight, aspect);
    var textRegion = scaled(options.textRegion === undefined ? base.textRegion : options.textRegion, fitted.width, fitted.height);
    var emblemRegion = scaled(options.emblemRegion === undefined ? base.emblemRegion : options.emblemRegion, fitted.width, fitted.height);
    var regions = projectProtectedAreas(options.protectedRegions === undefined ? [] : options.protectedRegions, fitted.photo);
    if (overlaps(textRegion, emblemRegion)) throw new Error('The emblem and wording need separate areas.');
    if (regions.some(function (r) { return overlaps(r, textRegion) || overlaps(r, emblemRegion); })) throw new Error('Branding overlaps a protected food or packaging area.');
    return {
      version: version, templateId: templateId, aspect: aspect, vertical: vertical,
      width: fitted.width, height: fitted.height, photo: fitted.photo, backgroundExtended: fitted.extended,
      textRegion: textRegion, emblemRegion: emblemRegion, protectedRects: regions,
      protectionSource: regions.length ? 'provided_regions' : 'visual_review_required',
      protectedCoordinateSpace: 'source_normalized', overlayCoordinateSpace: 'canvas_pixels',
      visualReviewRequired: true, geometryOnly: true
    };
  }
  return Object.freeze({ version: version, profile: profile, contain: contain, projectProtectedAreas: projectProtectedAreas, plan: plan });
});
