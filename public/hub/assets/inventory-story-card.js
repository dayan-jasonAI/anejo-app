(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InventoryStoryCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 1080;
  const HEIGHT = 1920;
  const RASTER_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;
  const FONT_DATA_URL = /^data:font\/ttf;base64,([A-Za-z0-9+/]+={0,2})$/i;

  function fail(message) { throw new TypeError(`InventoryStoryCard: ${message}`); }
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  }
  function safeText(value, label, maxLength) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label} is invalid`);
    if (value.split(/\s+/).some((word) => word.length > 32)) fail(`${label} contains an unbroken word that is too long`);
    return value.trim();
  }
  function dataUrl(value, label, type) {
    if (value == null) return null;
    if (typeof value !== 'string' || value.length > 20_000_000) fail(`${label} is invalid`);
    const match = (type === 'font' ? FONT_DATA_URL : RASTER_DATA_URL).exec(value);
    if (!match || !match[type === 'font' ? 1 : 2] || value.includes('#')) fail(`${label} must be an embedded ${type === 'font' ? 'TTF font' : 'PNG, JPEG, or WEBP raster image'}`);
    const encoded = type === 'font' ? match[1] : match[2];
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail(`${label} has invalid base64`);
    return value;
  }
  function productId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fail('productId is invalid');
    return value;
  }
  function dimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000) fail('sourceWidth and sourceHeight must be positive integers up to 10000');
  }
  function prepare(model) {
    if (!model || typeof model !== 'object' || Array.isArray(model)) fail('model is required');
    const locale = model.locale;
    if (locale !== 'en' && locale !== 'es') fail('locale must be en or es');
    if (!Number.isInteger(model.quantity) || model.quantity <= 0 || model.quantity > 9999) fail('quantity must be an exact positive integer up to 9999');
    if (!Number.isInteger(model.priceCents) || model.priceCents <= 0 || model.priceCents > 100_000_000) fail('priceCents must be a positive integer');
    const id = productId(model.productId);
    const ctaUrl = `/order?product=${encodeURIComponent(id)}`;
    if (model.ctaUrl !== ctaUrl) fail('ctaUrl must be the same-origin order URL for the exact productId');
    if (model.sourceWidth != null || model.sourceHeight != null) dimensions(model.sourceWidth, model.sourceHeight);
    const name = safeText(model.productName, 'productName', 159);
    const source = dataUrl(model.sourceDataUrl, 'sourceDataUrl', 'image');
    if (!source) fail('sourceDataUrl is required');
    const background = dataUrl(model.backgroundDataUrl, 'backgroundDataUrl', 'image');
    const emblem = dataUrl(model.emblemDataUrl, 'emblemDataUrl', 'image');
    const titleFont = dataUrl(model.fontDataUrl, 'fontDataUrl', 'font');
    const bodyFont = dataUrl(model.sansFontDataUrl, 'sansFontDataUrl', 'font');
    const checkedAt = safeText(model.checkedAt, 'checkedAt', 60);
    const unitLabel = safeText(locale === 'es' ? model.unitLabelEs : model.unitLabel, 'unitLabel', 32);
    return { locale, quantity: model.quantity, priceCents: model.priceCents, id, ctaUrl, name, source, background, emblem, titleFont, bodyFont, checkedAt, unitLabel, sourceWidth: model.sourceWidth, sourceHeight: model.sourceHeight };
  }
  function wrapName(name) {
    const words = name.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > 28 && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > 3) fail('productName is too long to fit the title area');
    return lines;
  }
  function currency(cents, locale) {
    const amount = (cents / 100).toFixed(2);
    return locale === 'es' ? `$${amount}` : `$${amount}`;
  }
  function buildSvg(model) {
    const m = prepare(model);
    const titleLines = wrapName(m.name);
    const titleSize=Math.min(titleLines.length===1?72:titleLines.length===2?58:45,Math.floor(840/(Math.max(...titleLines.map(x=>x.length))*.72)));
    const titleY=titleLines.length===1?474:titleLines.length===2?436:419, titleStep=titleLines.length===2?66:52;
    const title = titleLines.map((line, index) => `<text x="540" y="${titleY + index * titleStep}" class="title" style="font-size:${titleSize}px">${esc(line)}</text>`).join('');
    const qtyLabel = m.locale === 'es' ? 'DISPONIBLE PARA PEDIR' : 'AVAILABLE TO ORDER';
    const cta = m.locale === 'es' ? 'PIDE EN LÍNEA' : 'ORDER ONLINE';
    const safeQtyLabel = esc(qtyLabel);
    const safeCta = esc(cta);
    const imageLayer = m.background
      ? `<image href="${esc(m.background)}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid meet"/>`
      : '<rect width="1080" height="1920" fill="url(#forest)"/><rect x="38" y="38" width="1004" height="1844" rx="26" fill="none" stroke="#c9a65b" stroke-opacity=".7" stroke-width="2"/>';
    const emblem = m.emblem && !m.background ? `<image href="${esc(m.emblem)}" x="494" y="150" width="92" height="92" preserveAspectRatio="xMidYMid meet"/>` : '';
    const fontRules = `${m.titleFont ? `@font-face{font-family:StoryCormorant;src:url('${m.titleFont}') format('truetype');}` : ''}${m.bodyFont ? `@font-face{font-family:StoryJosefin;src:url('${m.bodyFont}') format('truetype');}` : ''}`;
    const titleFamily = m.titleFont ? 'StoryCormorant' : 'Georgia';
    const bodyFamily = m.bodyFont ? 'StoryJosefin' : 'Arial';
    const singular=({units:'unit',unidades:'unidad',packs:'pack',paquetes:'paquete',bowls:'bowl',tazones:'tazón'})[m.unitLabel]||m.unitLabel;
    const unit = `${currency(m.priceCents, m.locale)} / ${singular}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role="img" aria-label="${esc(m.name)} inventory story">
<defs><linearGradient id="forest" x2=".9" y2="1"><stop stop-color="#082b22"/><stop offset=".52" stop-color="#153f31"/><stop offset="1" stop-color="#071c17"/></linearGradient><linearGradient id="gold" x2="0" y2="1"><stop stop-color="#f1d28a"/><stop offset="1" stop-color="#bd9040"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter><style>${fontRules}.title{font-family:${titleFamily},Georgia,serif;font-size:72px;font-weight:400;letter-spacing:2px;fill:#fff2d5;text-anchor:middle}.body{font-family:${bodyFamily},Arial,sans-serif;fill:#fff2d5;text-anchor:middle;letter-spacing:3px}.gold{fill:#e3c078}.price{font-family:${titleFamily},Georgia,serif;font-size:65px;fill:#fff2d5;text-anchor:middle}.small{font-family:${bodyFamily},Arial,sans-serif;font-size:24px;fill:#f1e7d4;text-anchor:middle;letter-spacing:1px}</style></defs>
${imageLayer}${m.background ? '' : '<rect width="1080" height="1920" fill="#061a14" fill-opacity=".17"/>'}
${emblem}
<text x="540" y="365" class="body gold" font-size="22">AÑEJO CATERING CO.</text>${title}
<text x="540" y="566" class="body" font-size="27">${safeQtyLabel}</text><text x="540" y="622" class="body gold" font-size="45" font-weight="700">${m.quantity} ${esc(m.unitLabel)}</text>
<ellipse cx="540" cy="1045" rx="404" ry="373" fill="#000" fill-opacity=".35" filter="url(#shadow)"/><rect x="98" y="650" width="884" height="750" rx="20" fill="#f7f0e5"/><image href="${esc(m.source)}" x="98" y="650" width="884" height="750" preserveAspectRatio="xMidYMid meet"/>
<text x="540" y="1480" class="price">${esc(unit)}</text><path d="M180 1584h150M750 1584h150" stroke="#e3c078" stroke-width="2"/><a href="${esc(m.ctaUrl)}"><text x="540" y="1594" font-family="${bodyFamily},Arial,sans-serif" font-size="30" font-weight="700" letter-spacing="3" text-anchor="middle" fill="#fff2d5">${safeCta}</text></a>
<text x="540" y="1680" class="small">anejocateringco.com/order</text><text x="540" y="1722" class="small">${esc(m.checkedAt)}</text></svg>`;
  }
  function rasterize(svg) {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') return Promise.reject(new Error('InventoryStoryCard.rasterize requires a browser canvas'));
    if (typeof svg !== 'string' || !svg.startsWith('<svg ') || /<(?:script|foreignObject)\b/i.test(svg)) return Promise.reject(new TypeError('InventoryStoryCard.rasterize requires a safe SVG string'));
    return new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = WIDTH; canvas.height = HEIGHT;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D context is unavailable');
          context.drawImage(image, 0, 0, WIDTH, HEIGHT);
          URL.revokeObjectURL(objectUrl);
          resolve(canvas.toDataURL('image/jpeg', 0.94));
        } catch (error) { URL.revokeObjectURL(objectUrl); reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Unable to render Story SVG')); };
      image.src = objectUrl;
    });
  }
  return { buildSvg, rasterize };
});
