import { cateringProducts } from '../../public/assets/js/catering-products-catalog.js';
import { CAJITA_FLAVORS, CAJITA_DEFAULT_FLAVORS } from './cajita-food-options.js';

export function normalizeCateringProducts(input, menus) {
  if (input === undefined) return { ok: true, items: [], summary: '' }; // Older clients and builder remain compatible.
  if (!Array.isArray(input) || !input.length || input.length > 50) return { ok: false, error: 'Please select products and quantities.' };
  const items = [];
  for (const row of input) {
    const product = cateringProducts.find((p) => p.id === row?.id);
    if (!product || !menus.includes(product.category) || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 5000) {
      return { ok: false, error: 'Please check your product selections and quantities.' };
    }
    const flavor = product.flavorKey ? row.flavor || CAJITA_DEFAULT_FLAVORS[product.flavorKey] : null;
    const option = product.flavorKey && CAJITA_FLAVORS[product.flavorKey].find((f) => f[0] === flavor);
    if ((product.flavorKey && !option) || (!product.flavorKey && row.flavor)) return { ok: false, error: 'Please choose an available filling.' };
    const notes = String(row.notes || '').trim().slice(0, 500);
    if ((product.custom || product.id === 'cajita-custom') && !notes) return { ok: false, error: 'Please describe your custom product.' };
    items.push({ id: product.id, category: product.category, quantity: row.quantity, unit: product.unit[0], name_en: product.en, name_es: product.es, flavor, notes });
  }
  const summary = items.map((item) => {
    const p = cateringProducts.find((p) => p.id === item.id);
    const f = p.flavorKey && CAJITA_FLAVORS[p.flavorKey].find((f) => f[0] === item.flavor);
    return `${item.quantity} ${p.unit.join(' / ')} — ${p.en} / ${p.es}${f ? ` — ${f[1]} / ${f[2]}` : ''}${item.notes ? ` — ${item.notes}` : ''}`;
  }).join('\n');
  return { ok: true, items, summary };
}
