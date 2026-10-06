// Bounded owner-command parsing. This module only reads and previews; authorization
// and the existing revision-checked inventory count endpoint remain caller responsibilities.
const MAX_COMMAND_LENGTH = 240;
const MAX_ON_HAND = 1000000;

export function parseInventoryCountCommand(command) {
  if (typeof command !== 'string' || command.length > MAX_COMMAND_LENGTH) return null;
  // No newline, conjunction, exponent, signed value, free-form name, or appended action.
  const match = /^(?:count inventory|contar inventario) ([A-Za-z0-9_-]{1,100}): (\d{1,7}(?:\.\d{1,6})?) ([A-Za-z][A-Za-z0-9_-]{0,23})$/.exec(command);
  if (!match) return null;
  const onHand = Number(match[2]);
  if (!Number.isFinite(onHand) || onHand < 0 || onHand > MAX_ON_HAND) return null;
  return { id: match[1], on_hand: onHand, unit: match[3] };
}

export async function previewInventoryCount(env, command, at = Date.now()) {
  const parsed = parseInventoryCountCommand(command);
  if (!parsed) return { ok: false, error: 'invalid_count_command' };
  if (!env?.DB || !Number.isSafeInteger(at) || at < 0) return { ok: false, error: 'preview_unavailable' };
  let item;
  try {
    item = await env.DB.prepare(
      'SELECT id,name,unit,on_hand,revision FROM inventory_items WHERE id=? AND active=1'
    ).bind(parsed.id).first();
  } catch { return { ok: false, error: 'inventory_read_failed' }; }
  if (!item) return { ok: false, error: 'inventory_item_not_found' };
  if (item.id !== parsed.id || typeof item.unit !== 'string' || parsed.unit !== item.unit) {
    return { ok: false, error: 'inventory_unit_mismatch' };
  }
  if (!Number.isSafeInteger(item.revision) || item.revision < 0) {
    return { ok: false, error: 'inventory_revision_unavailable' };
  }
  return {
    ok: true,
    preview: {
      id: item.id, name: item.name, on_hand: parsed.on_hand, unit: item.unit,
      expected_revision: item.revision, read_at: at,
    },
    previous_on_hand: item.on_hand,
  };
}
