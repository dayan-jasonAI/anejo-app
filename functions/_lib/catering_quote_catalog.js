// Owner picker uses the existing D1 catalog; Square is not a second price authority.
import { candidates } from './catering-estimate.js';
import { cateringProducts } from '../../public/assets/js/catering-products-catalog.js';
import { CAJITA_FLAVORS } from './cajita-food-options.js';
import { loadMenu, isAvailable, isOrderable } from './menu.js';

export async function ownerQuoteCatalog(env) {
  const menu = await loadMenu(env);
  if (menu.source !== 'd1') return { ok: false, error: 'Live menu unavailable. Saved negotiated prices remain available; catalog additions require a live price.' };
  const packs=new Map();
  for(const product of cateringProducts){
    const flavors=product.flavorKey?(CAJITA_FLAVORS[product.flavorKey]||[]).map(f=>f[0]):[null];
    for(const flavor of flavors)for(const [sku,count] of candidates({id:product.id,flavor}))
      packs.set(sku,{pack_size:count,unit_label:count===1?'1 '+(product.unit?.[0]||'item'):('pack of '+count+' '+(product.unit?.[0]||'items'))});
  }
  const items = menu.items.filter(item => item.active !== 0 && item.active !== false
    && isAvailable(item) && isOrderable(item)
    && (!menu.availability?.[item.id] || menu.availability[item.id] === 'available')
    && Number.isSafeInteger(item.price_cents) && item.price_cents > 0).map(item => ({
    id: item.id, name_en: item.name_en || item.name || item.id,
    name_es: item.name_es || item.name || item.id,
    image: item.image || null, detail: item.description_en || item.description || item.desc || '',
    unit_cents: item.price_cents, ...(packs.get(item.id)||{pack_size:1,unit_label:item.unit_label||item.portion||'1 catalog item'}),
    stock_available: Number.isSafeInteger(item.stock_count)?item.stock_count:null,
    category: item.category || item.kind || 'Menu', available: true,
  }));
  return { ok: true, source: 'd1', items };
}

// New catalog selections use the exact selected SKU/pack, never a fuzzy name match.
// Historical negotiated lines and explicit owner overrides retain their agreed rates.
export async function validateCatalogQuoteLines(env, lines) {
  if (!Array.isArray(lines) || !lines.some(line => line?.pricing_mode === 'catalog')) return { ok: true };
  const catalog = await ownerQuoteCatalog(env);
  if (!catalog.ok) return catalog;
  for (const [i, line] of lines.entries()) {
    if (line?.pricing_mode !== 'catalog') continue;
    const item = catalog.items.find(item => item.id === line.product_id);
    const qty = Number(line.qty);
    if (!item) return { ok: false, error: `Line ${i + 1}: this catalog item is no longer available. Choose another item or explicitly agree a custom price.` };
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 999) return { ok: false, error: `Line ${i + 1}: enter 1–999 catalog items / packs.` };
    if(item.stock_available!==null && qty>item.stock_available)return {ok:false,error:`Line ${i+1}: only ${item.stock_available} catalog items / packs are recorded in stock. Review production before agreeing a custom order.`};
    if (line.unit_cents !== item.unit_cents || line.cents !== item.unit_cents * qty) return { ok: false, error: `Line ${i + 1}: the catalog price changed or the quantity and total disagree. Select the item again, or explicitly agree a custom price.` };
  }
  return { ok: true };
}
