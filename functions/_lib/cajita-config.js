// Versioned, provider-free Cajita request contract. Keep this pure so the public lead route,
// owner desk, kitchen desk, and tests all agree on the exact validation and summary behavior.
const ITEM_IDS = new Set(['sandwich', 'empanada', 'croqueta', 'salad', 'grazing', 'tres-leches', 'skewer']);
const SURFACES = new Set(['box', 'liner', 'label', 'tag', 'logo', 'ribbon', 'pick']);
const MAX_JSON_BYTES = 48000;
const HEX = /^#[0-9a-f]{6}$/i;

const text = (value, max, field) => {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  if (value.length > max) throw new Error(`${field} is too long.`);
  if (/[<>]/.test(value) || [...value].some((char) => { const code = char.charCodeAt(0); return code < 32 || code === 127; })) throw new Error(`${field} contains unsafe characters.`);
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
    if (input.version !== 1) throw new Error('Cajita configuration version must be 1.');
    if (!Array.isArray(input.variants) || input.variants.length < 1 || input.variants.length > 20) throw new Error('Cajita variants must contain 1 to 20 versions.');
    const variants = input.variants.map((raw, vi) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`variants[${vi}] must be an object.`);
      const id = text(raw.id, 80, `variants[${vi}].id`);
      const name = text(raw.name, 120, `variants[${vi}].name`);
      if (!id || !name) throw new Error(`variants[${vi}] requires id and name.`);
      const quantity = integer(raw.quantity, 1, 5000, `variants[${vi}].quantity`);
      if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 20) throw new Error(`variants[${vi}].items must contain 1 to 20 items.`);
      const items = raw.items.map((item, ii) => {
        if (!item || typeof item !== 'object') throw new Error(`variants[${vi}].items[${ii}] must be an object.`);
        const itemId = text(item.id, 40, `variants[${vi}].items[${ii}].id`);
        if (!ITEM_IDS.has(itemId)) throw new Error(`Unknown Cajita item: ${itemId || '(blank)'}.`);
        return { id: itemId, quantity: integer(item.quantity, 0, 5000, `variants[${vi}].items[${ii}].quantity`) };
      });
      const t = raw.theme || {};
      const p = raw.personalization || {};
      const colors = t.colors || {};
      const artworks = Array.isArray(p.artworks) ? p.artworks : [];
      if (artworks.length > 20) throw new Error(`variants[${vi}].personalization.artworks is too large.`);
      return {
        id, name, quantity, items,
        theme: {
          preset: text(t.preset, 80, `variants[${vi}].theme.preset`) || null,
          name: text(t.name, 120, `variants[${vi}].theme.name`) || null,
          colors: Object.fromEntries(['background', 'box', 'liner', 'label', 'tag', 'logo', 'ribbon', 'pick'].map((key) => [key, color(colors[key], `variants[${vi}].theme.colors.${key}`)])),
          pattern: text(t.pattern, 100, `variants[${vi}].theme.pattern`) || null,
          pickShape: text(t.pickShape, 60, `variants[${vi}].theme.pickShape`) || null,
        },
        personalization: {
          labelText: text(p.labelText, 300, `variants[${vi}].personalization.labelText`) || null,
          tagText: text(p.tagText, 300, `variants[${vi}].personalization.tagText`) || null,
          pickText: text(p.pickText, 300, `variants[${vi}].personalization.pickText`) || null,
          artworks: artworks.map((art, ai) => {
            if (!art || typeof art !== 'object') throw new Error(`Artwork ${vi}/${ai} must be an object.`);
            const attachmentId = text(art.attachmentId, 80, `artworks[${vi}/${ai}].attachmentId`);
            if (!attachmentIds.has(attachmentId)) throw new Error(`Artwork attachment is not part of this request: ${attachmentId}.`);
            const surface = text(art.surface, 20, `artworks[${vi}/${ai}].surface`);
            if (!SURFACES.has(surface)) throw new Error(`Unknown artwork surface: ${surface}.`);
            return { attachmentId, surface, x: integer(art.x, -10000, 10000, `artworks[${vi}/${ai}].x`), y: integer(art.y, -10000, 10000, `artworks[${vi}/${ai}].y`), scale: Number.isFinite(art.scale) && art.scale > 0 && art.scale <= 20 ? Number(art.scale) : (() => { throw new Error(`artworks[${vi}/${ai}].scale is invalid.`); })(), rotation: integer(art.rotation, -360, 360, `artworks[${vi}/${ai}].rotation`) };
          }),
        },
        notes: text(raw.notes, 1000, `variants[${vi}].notes`) || null,
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
    const c = Object.entries(v.theme.colors).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(', ');
    lines.push(`  Theme: ${v.theme.name || v.theme.preset || 'custom'}${c ? `; colors ${c}` : ''}; pattern=${v.theme.pattern || 'none'}; pick=${v.theme.pickShape || 'default'}`);
    lines.push(`  Labels: label=${v.personalization.labelText || 'none'}; tag=${v.personalization.tagText || 'none'}; pick=${v.personalization.pickText || 'none'}; artwork=${v.personalization.artworks.length}`);
    if (v.notes) lines.push(`  Notes: ${v.notes}`);
  }
  lines.push(`Event ingredient totals: ${Object.entries(totals).map(([id, qty]) => `${id} x${qty}`).join(', ') || 'none'}`);
  return lines.join('\n');
}

export function extractCajitaConfiguration(message) {
  const match = String(message || '').match(/Cajita configuration JSON: (\{.*\})$/m);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const checked = normalizeCajitaConfiguration(parsed, { attachmentIds: new Set(parsed.variants.flatMap((v) => (v.personalization && v.personalization.artworks || []).map((a) => a.attachmentId))) });
    return checked.ok ? { config: checked.value, summary: checked.summary } : null;
  } catch { return null; }
}

export const cajitaItemIds = ITEM_IDS;
