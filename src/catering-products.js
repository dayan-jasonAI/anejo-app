import { cateringProducts } from '../public/assets/js/catering-products-catalog.js';
import { CAJITA_FLAVORS, CAJITA_DEFAULT_FLAVORS } from '../functions/_lib/cajita-food-options.js';

const root = document.getElementById('quote-products');
const form = document.getElementById('cateringForm');
let rows = [];
const es = () => document.documentElement.lang.startsWith('es');
const t = (en, spanish) => es() ? spanish : en;
const menus = () => [...form.querySelectorAll('[name="menu_option"]:checked')].map((el) => el.value);
const categories = { 'Añejo Fit Menu': 'Menú Añejo Fit', 'Cuban Food': 'Comida cubana', 'Individual Cajitas': 'Cajitas individuales' };
function element(tag, text, parent) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  parent.append(el);
  return el;
}
function render() {
  if (!root.isConnected) return;
  root.replaceChildren();
  element('h4', t('Choose products and quantities', 'Elige los productos y las cantidades'), root);
  element('p', t('Quantities are totals for your event, not per guest. Add another line for a different filling or box version. Pricing is confirmed after review.', 'Las cantidades son totales para tu evento, no por invitado. Agrega otra línea para un relleno o una versión de cajita diferente. El precio se confirma después de revisar.'), root);
  if (!menus().length) element('p', t('Select a category above to see its products.', 'Selecciona una categoría arriba para ver sus productos.'), root);
  for (const category of menus()) {
    const group = element('fieldset', '', root);
    group.style.cssText = 'border:1px solid #c9cfca;padding:16px;margin:16px 0;border-radius:8px;min-width:0';
    element('legend', es() ? categories[category] : category, group);
    if (category === 'Individual Cajitas') {
      element('p', t('Standard: ham-spread Hawaiian roll, guava & cheese empanada, ham croqueta, 6 oz cold salad, one skewer and a 3–4 oz tres leches cup.', 'Estándar: panecillo hawaiano con pasta de jamón, empanada de guayaba y queso, croqueta de jamón, 6 oz de ensalada fría, un pincho y un vasito de tres leches de 3–4 oz.'), group);
      const link = element('a', t('Open the Cajita designer', 'Abrir el personalizador de cajitas'), group);
      link.href = '/cajita-builder';
      element('p', t('Or describe each version below, including removals, duplicates and personalized picks.', 'O describe cada versión abajo, incluyendo productos retirados, duplicados y palillos personalizados.'), group);
    }
    rows.filter((r) => r.category === category).forEach((row) => {
      const card = element('div', '', group);
      card.style.cssText = 'border-top:1px solid #c9cfca;padding:14px 0;display:grid;gap:10px';
      const label = element('label', t('Product', 'Producto'), card);
      const select = element('select', '', label);
      select.required = true;
      const empty = element('option', t('Choose a product', 'Elige un producto'), select); empty.value = '';
      cateringProducts.filter((p) => p.category === category).forEach((p) => { const option = element('option', es() ? p.es : p.en, select); option.value = p.id; });
      select.value = row.id;
      select.addEventListener('change', () => { row.id = select.value; const p = cateringProducts.find((p) => p.id === row.id); row.flavor = p?.flavorKey ? CAJITA_DEFAULT_FLAVORS[p.flavorKey] : undefined; render(); });
      const product = cateringProducts.find((p) => p.id === row.id);
      if (product?.flavorKey) {
        const label = element('label', t('Filling / flavor', 'Relleno / sabor'), card);
        const flavor = element('select', '', label);
        CAJITA_FLAVORS[product.flavorKey].forEach((f) => { const option = element('option', f[es() ? 2 : 1], flavor); option.value = f[0]; });
        flavor.value = row.flavor;
        flavor.addEventListener('change', () => { row.flavor = flavor.value; });
      }
      const qtyLabel = element('label', `${t('Total quantity', 'Cantidad total')}${product ? ` (${product.unit[es() ? 1 : 0]})` : ''}`, card);
      const qty = element('input', '', qtyLabel);
      Object.assign(qty, { type: 'number', min: '1', max: '5000', step: '1', required: true, value: row.quantity });
      qty.inputMode = 'numeric';
      qty.addEventListener('input', () => { row.quantity = Number(qty.value); });
      const notesLabel = element('label', t('Changes or special instructions', 'Cambios o instrucciones especiales'), card);
      const notes = element('textarea', '', notesLabel);
      notes.maxLength = 500; notes.value = row.notes;
      notes.required = !!(product?.custom || product?.id === 'cajita-custom');
      notes.addEventListener('input', () => { row.notes = notes.value; });
      const remove = element('button', t('Remove product', 'Quitar producto'), card); remove.type = 'button';
      remove.addEventListener('click', () => { rows = rows.filter((r) => r !== row); render(); });
    });
    const add = element('button', t('+ Add a product', '+ Agregar un producto'), group); add.type = 'button';
    add.addEventListener('click', () => { if (rows.length >= 50) return; rows.push({ category, id: '', quantity: 1, notes: '' }); render(); });
  }
}
function sync() {
  // Keep deselected categories in memory, but exclude them from submission.
  menus().forEach((category) => { if (!rows.some((r) => r.category === category)) rows.push({ category, id: '', quantity: 1, notes: '' }); });
  render();
}
form.querySelectorAll('[name="menu_option"]').forEach((el) => el.addEventListener('change', sync));
document.addEventListener('anejo:langchange', () => { if (!form.querySelector('#submitBtn')?.disabled) render(); });
const requested = new URLSearchParams(location.search).get('item');
const product = cateringProducts.find((p) => p.id === requested);
if (product && menus().includes(product.category)) rows.push({ category: product.category, id: product.id, quantity: 1, notes: '' });
sync();
window.AnejoQuoteProducts = {
  read: () => rows.filter((r) => menus().includes(r.category)).map(({ id, quantity, flavor, notes }) => ({ id, quantity, flavor, notes })),
  valid: () => menus().every((category) => rows.some((r) => r.category === category && r.id)),
};
