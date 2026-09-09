import { CAJITA_FLAVORS, flavorLabel } from './cajita-food-options.js';
// Versioned, provider-free Cajita request contract. Keep this pure so the public lead route,
// owner desk, kitchen desk, and tests all agree on the exact validation and summary behavior.
const ITEM_IDS = new Set(['sandwich', 'empanada', 'croqueta', 'salad', 'grazing', 'tres-leches', 'skewer']);
const SURFACES = new Set(['box', 'liner', 'label', 'tag', 'logo', 'ribbon', 'pick']);
const MAX_JSON_BYTES = 48000;
const HEX = /^#[0-9a-f]{6}$/i;

const text = (value, max, field, multiline = false) => {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  if (value.length > max) throw new Error(`${field} is too long.`);
  if (/[<>]/.test(value) || [...value].some((char) => { const code = char.charCodeAt(0); return code < 32 && (!multiline || (code !== 10 && code !== 13)) || code === 127; })) throw new Error(`${field} contains unsafe characters.`);
  return value.trim();
};
const integer = (value, min, max, field) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${field} must be an integer from ${min} to ${max}.`);
  return value;
};
const color = (value, field) => {
  const v = text(value, 32, field);
  if (v && !HEX.test(v)) throw new Error(`${field} must be a six-digit hex color.`);
  return v || null;
};

export function normalizeCajitaConfiguration(input, { attachmentIds = new Set() } = {}) {
  if (input == null) return { ok: true, value: null, json: null, summary: '' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Cajita configuration must be an object.' };
  try {
    if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_JSON_BYTES) throw new Error('Cajita configuration is too large.');
    if (input.version !== 1) throw new Error('Cajita configuration version must be 1.');
    if (!Array.isArray(input.variants) || input.variants.length < 1 || input.variants.length > 20) throw new Error('Cajita variants must contain 1 to 20 versions.');
    const variantIds = new Set();
    const variants = input.variants.map((raw, vi) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`variants[${vi}] must be an object.`);
      const id = text(raw.id, 80, `variants[${vi}].id`);
      const name = text(raw.name, 120, `variants[${vi}].name`);
      if (!id || !name) throw new Error(`variants[${vi}] requires id and name.`);
      if (variantIds.has(id)) throw new Error(`Duplicate Cajita variant id: ${id}.`);
      variantIds.add(id);
      const quantity = integer(raw.quantity, 1, 5000, `variants[${vi}].quantity`);
      if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 20) throw new Error(`variants[${vi}].items must contain 1 to 20 items.`);
      const itemIds = new Set();
      const items = raw.items.map((item, ii) => {
        if (!item || typeof item !== 'object') throw new Error(`variants[${vi}].items[${ii}] must be an object.`);
        const itemId = text(item.id, 40, `variants[${vi}].items[${ii}].id`);
        if (!ITEM_IDS.has(itemId)) throw new Error(`Unknown Cajita item: ${itemId || '(blank)'}.`);
        if (itemIds.has(itemId)) throw new Error(`Duplicate item id in variant ${id}: ${itemId}.`);
        itemIds.add(itemId);
        const flavor = item.flavor == null ? '' : text(item.flavor, 40, 'Item flavor');
        if (flavor && !CAJITA_FLAVORS[itemId]?.some((option) => option[0] === flavor)) throw new Error('Unknown Cajita flavor.');
        return { id: itemId, quantity: integer(item.quantity, 0, 50, `variants[${vi}].items[${ii}].quantity`), ...(flavor ? { flavor } : {}) };
      });
      if (!items.some((item) => item.quantity > 0)) throw new Error(`Variant ${id} must contain at least one item.`);
      const t = raw.theme || {};
      const p = raw.personalization || {};
      const colors = t.colors || {};
      const artworks = Array.isArray(p.artworks) ? p.artworks : [];
      if (artworks.length > 20) throw new Error(`variants[${vi}].personalization.artworks is too large.`);
      const placementsRaw = Array.isArray(p.textPlacements) ? p.textPlacements : [];
      if (placementsRaw.length > 3) throw new Error(`variants[${vi}].personalization.textPlacements may contain at most 3 placements.`);
      const placementSurfaces = new Set();
      const artworkAttachmentId = t.artworkAttachmentId == null ? null : text(t.artworkAttachmentId, 80, `variants[${vi}].theme.artworkAttachmentId`);
      if (artworkAttachmentId && !attachmentIds.has(artworkAttachmentId)) throw new Error(`Theme artwork attachment is not part of this request: ${artworkAttachmentId}.`);
      return {
        id, name, quantity, items,
        theme: {
          preset: text(t.preset, 80, `variants[${vi}].theme.preset`) || null,
          name: text(t.name, 120, `variants[${vi}].theme.name`) || null,
          colors: Object.fromEntries(['background', 'box', 'liner', 'label', 'tag', 'logo', 'ribbon', 'pick'].map((key) => [key, color(colors[key], `variants[${vi}].theme.colors.${key}`)])),
          pattern: text(t.pattern, 100, `variants[${vi}].theme.pattern`) || null,
          pickShape: text(t.pickShape, 60, `variants[${vi}].theme.pickShape`) || null,
          prompt: text(t.prompt, 500, `variants[${vi}].theme.prompt`, true) || null,
          artworkAttachmentId,
        },
        personalization: {
          labelText: text(p.labelText, 300, `variants[${vi}].personalization.labelText`) || null,
          tagText: text(p.tagText, 300, `variants[${vi}].personalization.tagText`) || null,
          pickText: text(p.pickText, 300, `variants[${vi}].personalization.pickText`) || null,
          textPlacements: placementsRaw.map((placement, pi) => {
            if (!placement || typeof placement !== 'object') throw new Error(`Text placement ${vi}/${pi} must be an object.`);
            const surface = text(placement.surface, 20, `textPlacements[${vi}/${pi}].surface`);
            if (!new Set(['label', 'tag', 'pick']).has(surface)) throw new Error(`Unknown text placement surface: ${surface}.`);
            if (placementSurfaces.has(surface)) throw new Error(`Duplicate text placement surface in variant ${id}: ${surface}.`);
            placementSurfaces.add(surface);
            const unit = (value, field) => { if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${field} must be a unit coordinate from 0 to 1.`); return Number(value); };
            return { surface, x: unit(placement.x, `textPlacements[${vi}/${pi}].x`), y: unit(placement.y, `textPlacements[${vi}/${pi}].y`), scale: Number.isFinite(placement.scale) && placement.scale > 0 && placement.scale <= 20 ? Number(placement.scale) : (() => { throw new Error(`textPlacements[${vi}/${pi}].scale is invalid.`); })(), rotation: integer(placement.rotation, -360, 360, `textPlacements[${vi}/${pi}].rotation`) };
          }),
          artworks: artworks.map((art, ai) => {
            if (!art || typeof art !== 'object') throw new Error(`Artwork ${vi}/${ai} must be an object.`);
            const attachmentId = text(art.attachmentId, 80, `artworks[${vi}/${ai}].attachmentId`);
            if (!attachmentIds.has(attachmentId)) throw new Error(`Artwork attachment is not part of this request: ${attachmentId}.`);
            const surface = text(art.surface, 20, `artworks[${vi}/${ai}].surface`);
            if (!SURFACES.has(surface)) throw new Error(`Unknown artwork surface: ${surface}.`);
            return { attachmentId, surface, x: integer(art.x, -10000, 10000, `artworks[${vi}/${ai}].x`), y: integer(art.y, -10000, 10000, `artworks[${vi}/${ai}].y`), scale: Number.isFinite(art.scale) && art.scale > 0 && art.scale <= 20 ? Number(art.scale) : (() => { throw new Error(`artworks[${vi}/${ai}].scale is invalid.`); })(), rotation: integer(art.rotation, -360, 360, `artworks[${vi}/${ai}].rotation`) };
          }),
        },
        notes: text(raw.notes, 1000, `variants[${vi}].notes`, true) || null,
        packagingRequest: text(raw.packagingRequest, 300, `variants[${vi}].packagingRequest`, true) || null,
      };
    });
    const value = { version: 1, variants };
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).length > MAX_JSON_BYTES) throw new Error('Cajita configuration is too large.');
    return { ok: true, value, json, summary: summarizeCajitaConfiguration(value) };
  } catch (error) { return { ok: false, error: error.message || 'Invalid Cajita configuration.' }; }
}

export function summarizeCajitaConfiguration(config) {
  if (!config) return '';
  const totals = {};
  const lines = [`Cajita configuration v${config.version}`, `Versions: ${config.variants.length}`];
  for (const v of config.variants) {
    lines.push(`Version ${v.name} (${v.quantity} boxes): ${v.items.map((i) => `${i.id} x${i.quantity}`).join(', ')}`);
    for (const i of v.items) totals[i.id] = (totals[i.id] || 0) + i.quantity * v.quantity;
    for (const i of v.items.filter((item) => item.quantity > 0 && CAJITA_FLAVORS[item.id])) {
      lines.push(`  ${i.id}: ${i.flavor ? flavorLabel(i.id, i.flavor) + ' / ' + flavorLabel(i.id, i.flavor, 'es') : 'Flavor not specified / Sabor sin especificar'}; ${i.quantity} per box / por caja; ${i.quantity * v.quantity} total`);
    }
    const c = Object.entries(v.theme.colors).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(', ');
    lines.push(`  Theme: ${v.theme.name || v.theme.preset || 'custom'}${c ? `; colors ${c}` : ''}; pattern=${v.theme.pattern || 'none'}; pick=${v.theme.pickShape || 'default'}; prompt=${v.theme.prompt || 'none'}; background-art=${v.theme.artworkAttachmentId || 'none'}`);
    lines.push(`  Labels: label=${v.personalization.labelText || 'none'}; tag=${v.personalization.tagText || 'none'}; pick=${v.personalization.pickText || 'none'}; text placements=${v.personalization.textPlacements.map((p) => `${p.surface}@${p.x},${p.y} scale ${p.scale} rot ${p.rotation}`).join(' | ') || 'none'}; artwork=${v.personalization.artworks.map((a) => `${a.attachmentId}@${a.surface}:${a.x},${a.y} scale ${a.scale} rot ${a.rotation}`).join(' | ') || 'none'}`);
    if (v.packagingRequest) lines.push(`  Packaging request: ${v.packagingRequest}`);
    if (v.notes) lines.push(`  Notes: ${v.notes}`);
  }
  lines.push(`Event ingredient totals: ${Object.entries(totals).map(([id, qty]) => `${id} x${qty}`).join(', ') || 'none'}`);
  return lines.join('\n');
}

export function extractCajitaConfiguration(message) {
  // The server appends this record LAST. Earlier lookalike lines in customer notes
  // must never override the kitchen's actual, validated configuration.
  const match = String(message || '').match(/(?:^|\n)Cajita configuration JSON: (\{[^\n]*\})\s*$/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const checked = normalizeCajitaConfiguration(parsed, { attachmentIds: new Set(parsed.variants.flatMap((v) => [
      ...((v.personalization && v.personalization.artworks) || []).map((a) => a.attachmentId),
      v.theme && v.theme.artworkAttachmentId,
    ].filter(Boolean))) });
    return checked.ok ? { config: checked.value, summary: checked.summary } : null;
  } catch { return null; }
}

export const cajitaItemIds = ITEM_IDS;
