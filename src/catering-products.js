import { cateringProducts } from '../public/assets/js/catering-products-catalog.js';
import { CAJITA_FLAVORS, CAJITA_DEFAULT_FLAVORS } from '../functions/_lib/cajita-food-options.js';

const root = document.getElementById('quote-products');
const form = document.getElementById('cateringForm');
let rows = [];
let estimateSequence = 0;
let estimateTimer;
const es = () => document.documentElement.lang.startsWith('es');
const t = (en, spanish) => es() ? spanish : en;
const menus = () => [...form.querySelectorAll('[name="menu_option"]:checked')].map((el) => el.value);
const categories = { 'Añejo Fit Menu': 'Menú Añejo Fit', 'Cuban Food': 'Comida cubana', 'Individual Cajitas': 'Cajitas individuales' };
function element(tag, text, parent) {
  const el = document.createElement(tag);
  if (['input', 'select', 'textarea'].includes(tag)) el.setAttribute('aria-label', parent.textContent);
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
  const pricing = element('section', '', root);
  pricing.id = 'catering-instant-price';
  pricing.setAttribute('aria-live', 'polite');
  queueEstimate();
}
function queueEstimate() {
  const sequence = ++estimateSequence;
  clearTimeout(estimateTimer);
  const panel = document.getElementById('catering-instant-price');
  if (!panel) return;
  panel.replaceChildren();
  element('p', t('Standard catering: minimum 48 hours. Custom printing: minimum 72 hours.', 'Catering estándar: mínimo 48 horas. Impresión personalizada: mínimo 72 horas.'), panel);
  const products = rows.filter(r => menus().includes(r.category)).map(({id, quantity, flavor, notes}) => ({id, quantity, flavor, notes}));
  if (!products.length || products.some(p => !p.id || !Number.isInteger(p.quantity) || p.quantity < 1)) return;
  const needsReview = ['event-theme', 'theme-colors', 'design-notes', 'dietary', 'details'].some(id => document.getElementById(id)?.value?.trim()) || [...form.querySelectorAll('input[type=file]')].some(el => el.files.length);
  const status = element('p', t('Checking current food prices…', 'Consultando precios actuales…'), panel);
  estimateTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/catering-estimate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({products, needs_review:needsReview})});
      if (!response.ok) throw new Error('estimate');
      const result = await response.json();
      if (sequence !== estimateSequence) return;
      const amount = new Intl.NumberFormat(es() ? 'es-US' : 'en-US', {style:'currency', currency:'USD'}).format(result.subtotal_cents / 100);
      status.textContent = result.unpriced.length ? t(`Priced items: ${amount}. Some selections need a custom price; this is not the full total.`, `Productos con precio: ${amount}. Algunas selecciones requieren precio personalizado; este no es el total completo.`) : t(`Food subtotal: ${amount}. Delivery and tax are calculated at checkout.`, `Subtotal de comida: ${amount}. Entrega e impuestos se calculan al pagar.`);
      if (result.unpriced.length) {
        const list = element('ul', '', panel);
        result.unpriced.forEach(item => { const product = cateringProducts.find(p => p.id === item.id); element('li', `${item.quantity} × ${product ? (es() ? product.es : product.en) : item.id} — ${t('price / availability needs review', 'precio / disponibilidad por revisar')}`, list); });
      }
      if (result.checkout_eligible) {
        element('p', t('Buy these standard food items now. Choose your delivery date, address and contact details on the next page. No custom packaging is included.', 'Compra estos productos estándar ahora. Elige fecha, dirección y datos de contacto en la siguiente página. No incluye empaque personalizado.'), panel);
        const buy = element('button', t('Continue to secure checkout', 'Continuar al pago seguro'), panel);
        buy.type = 'button';
        buy.addEventListener('click', () => {
          try { sessionStorage.setItem('anejo-catering-cart', JSON.stringify({items:result.items, created:Date.now()})); location.href='/order?category=catering&from=catering'; }
          catch { status.textContent=t('Please enable browser storage or order through the menu.', 'Activa el almacenamiento del navegador o compra desde el menú.'); }
        });
      } else element('p', t('For these custom selections, send the complete request below. For Fit bowls, use the menu bowl editor.', 'Para estas selecciones personalizadas, envía la solicitud completa abajo. Para bowls Fit, usa el personalizador del menú.'), panel);
    } catch {
      if (sequence === estimateSequence) status.textContent=t('Instant pricing is unavailable. Your quote request can still be submitted below.', 'El precio instantáneo no está disponible. Puedes enviar la solicitud abajo.');
    }
  }, 350);
}
form.addEventListener('input', queueEstimate);
form.addEventListener('change', queueEstimate);
function sync() {
  // Keep deselected categories in memory, but exclude them from submission.
  menus().forEach((category) => { if (!rows.some((r) => r.category === category)) rows.push({ category, id: '', quantity: 1, notes: '' }); });
  render();
}
form.querySelectorAll('[name="menu_option"]').forEach((el) => el.addEventListener('change', sync));
document.addEventListener('anejo:langchange', () => {
  // Language changes must not recreate enabled controls during an ambiguous retry.
  if (!root.querySelector('select')?.disabled) render();
});
const requested = new URLSearchParams(location.search).get('item');
const product = cateringProducts.find((p) => p.id === requested);
if (product && menus().includes(product.category)) rows.push({ category: product.category, id: product.id, quantity: 1, notes: '' });
sync();
window.AnejoQuoteProducts = {
  read: () => rows.filter((r) => menus().includes(r.category)).map(({ id, quantity, flavor, notes }) => ({ id, quantity, flavor, notes })),
  valid: () => menus().every((category) => rows.some((r) => r.category === category && r.id)),
};
