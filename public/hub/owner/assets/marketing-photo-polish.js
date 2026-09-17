/* Conservative pixel adjustments only: no generative image edits or object reconstruction. */
(function () {
  'use strict';
  var PRESETS = {
    natural: { exposure: 1.025, contrast: 1.015, balance: [1, 1, 1] },
    bright: { exposure: 1.07, contrast: 1.02, balance: [1, 1, 1] },
    warm: { exposure: 1.025, contrast: 1.015, balance: [1.015, 1, 0.985] }
  };
  function transformPixels(pixels, preset) {
    var config = PRESETS[preset];
    if (!config) throw new Error('Choose natural, bright or warm polish.');
    for (var i = 0; i < pixels.length; i += 4) {
      // Blend transparency onto white for JPEG. Keep alpha itself unchanged so this
      // operation can be tested independently from the opaque canvas export.
      var alpha = pixels[i + 3] / 255;
      for (var channel = 0; channel < 3; channel++) {
        var input = pixels[i + channel] * alpha + 255 * (1 - alpha);
        var exposed = input * config.exposure * config.balance[channel];
        pixels[i + channel] = Math.max(0, Math.min(255, Math.round((exposed - 128) * config.contrast + 128)));
      }
    }
    return pixels;
  }
  async function create(photo, preset) {
    if (!PRESETS[preset]) throw new Error('Choose natural, bright or warm polish.');
    if (!photo || !photo.media_key || !photo.url) throw new Error('Choose a saved photo first.');
    var image = new Image();
    await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { image.onload = null; image.onerror = null; reject(new Error('Photo loading timed out. Try again.')); }, 30000);
      image.onload = function () { clearTimeout(timer); resolve(); };
      image.onerror = function () { clearTimeout(timer); reject(new Error('Could not load this photo. Your original is unchanged.')); };
      image.src = photo.url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This photo has no readable dimensions.');
    var scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    var context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Photo editing is unavailable in this browser.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    var data;
    try {
      data = context.getImageData(0, 0, canvas.width, canvas.height);
      transformPixels(data.data, preset);
      context.putImageData(data, 0, 0);
    } catch (_) { throw new Error('Could not read the photo pixels. Your original is unchanged.'); }
    var url;
    try { url = canvas.toDataURL('image/jpeg', 0.92); }
    catch (_) { throw new Error('Could not prepare the JPEG copy. Your original is unchanged.'); }
    if (!url.startsWith('data:image/jpeg;base64,')) throw new Error('Could not prepare a JPEG in this browser.');
    // The private library accepts at most 5 MiB. Never silently shrink or lower quality
    // further: the user should know if this particular copy could not be saved.
    var payload = url.slice(url.indexOf(',') + 1);
    var bytes = Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
    if (bytes > 5 * 1024 * 1024) throw new Error('The polished JPEG exceeds 5 MB. Use a smaller source photo. Your original is unchanged.');
    var result = await Hub.api('/api/hub/owner/marketing-library', { method: 'POST', body: {
      name: String(photo.name || 'Photo').replace(/\.[^.]+$/, '').slice(0, 130) + ' ' + preset + ' polish.jpg',
      folder: photo.folder || '', tags: [], data_url: url,
      polish: { source_key: photo.media_key, preset: preset }
    } });
    if (!result || !result.ok || !result.photo) throw new Error(result && result.error || 'Could not save the polished copy. Your original is unchanged.');
    return result.photo;
  }
  window.MarketingPhotoPolish = { create: create, transformPixels: transformPixels };
})();
