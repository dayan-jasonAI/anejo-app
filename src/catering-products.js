// The catering quote builder.
//
// WHAT THIS REPLACED, AND WHY (Dayan, 2026-09-09).
//
// Every product was a fieldset: a <select> you had to open to discover what was in it, a number
// box, a notes box and a Remove button — stacked down the page, one tall block per line, with no
// picture and no price anywhere. Choosing seven things built a wall of boxes taller than the
// screen, and the only number the customer ever saw was a single lump subtotal at the bottom,
// after they had already guessed at quantities. His own $1,200 birthday order went through that
// form and came out the other side with no price at all.
//
// So: browse products as cards with the photo and the real price on them; tap one and pick a
// quantity — 10 / 25 / 50 on everything, plus any other size the menu publishes, plus custom;
// everything chosen collapses into ONE running order summary instead of another box; sauces are
// suggested once there is food to put them on; and the total, the volume discount and both ways
// to pay are visible the whole time.
//
// Every price rendered here comes from /api/catering-catalog, which reads the same live menu and
// the same product→SKU mapping the estimate charges against. Nothing in this file knows a price.
import { cateringProducts } from '../public/assets/js/catering-products-catalog.js';
import { CAJITA_FLAVORS, CAJITA_DEFAULT_FLAVORS } from '../functions/_lib/cajita-food-options.js';

const root = document.getElementById('quote-products');
const form = document.getElementById('cateringForm');

let cart = [];            // [{ uid, category, id, flavor, quantity, notes }]
let catalog = null;       // /api/catering-catalog response, or null until it lands
let open = null;          // id of the product whose size picker is expanded
let estimate = null;      // last /api/catering-estimate result
let estimateSequence = 0;
let estimateTimer;
let uid = 0;

const es = () => document.documentElement.lang.startsWith('es');
const t = (en, spanish) => (es() ? spanish : en);
const menus = () => [...form.querySelectorAll('[name="menu_option"]:checked')].map((el) => el.value);
const money = (cents) => new Intl.NumberFormat(es() ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
const catalogFor = (id) => catalog?.products.find((p) => p.id === id) || null;
const productFor = (id) => cateringProducts.find((p) => p.id === id) || null;
const label = (p) => (p ? (es() ? p.es : p.en) : '');
const CATEGORY_ES = { 'Añejo Fit Menu': 'Menú Añejo Fit', 'Cuban Food': 'Comida cubana', 'Individual Cajitas': 'Cajitas individuales' };

// Rendered once. Scoped under .aq- so it cannot reach the rest of the page, and built from the
// site's own custom properties so it inherits the brand rather than approximating it.
const STYLE = `
.aq{--aq-r:14px;margin:0}
.aq h4{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:600;color:var(--green,#1A3D2E);margin:0 0 6px}
.aq .aq-sub{color:var(--muted,#62645f);font-size:14.5px;margin:0 0 18px;line-height:1.55}
.aq .aq-cat{font-size:11px;letter-spacing:2.4px;text-transform:uppercase;font-weight:700;color:var(--gold-dark,#8B6B3E);margin:26px 0 12px}
.aq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}
.aq-card{position:relative;border:1px solid var(--line,rgba(26,61,46,.18));border-radius:var(--aq-r);background:#fff;overflow:hidden;text-align:left;padding:0;cursor:pointer;font:inherit;color:inherit;display:flex;flex-direction:column;transition:box-shadow .18s,border-color .18s,transform .18s}
.aq-card:hover{border-color:var(--gold,#C6A85B);box-shadow:0 10px 26px rgba(26,61,46,.13);transform:translateY(-2px)}
.aq-card:focus-visible{outline:2px solid var(--gold,#C6A85B);outline-offset:2px}
.aq-card.is-open{border-color:var(--gold,#C6A85B);box-shadow:0 10px 26px rgba(26,61,46,.16)}
.aq-thumb{aspect-ratio:4/3;width:100%;object-fit:cover;background:var(--cream-dark,#EAE5D8);display:block}
.aq-thumb.aq-none{display:flex;align-items:center;justify-content:center;color:var(--gold-dark,#8B6B3E);font-family:'Cormorant Garamond',Georgia,serif;font-size:30px}
.aq-body{padding:11px 12px 13px;display:flex;flex-direction:column;gap:5px;flex:1}
.aq-name{font-size:14px;font-weight:600;line-height:1.35;color:var(--ink,#1A1A1A)}
.aq-price{font-size:13px;color:var(--green,#1A3D2E);font-weight:700}
.aq-price small{font-weight:500;color:var(--muted,#62645f)}
.aq-quoted{font-size:12.5px;color:var(--muted,#62645f);font-style:italic}
.aq-inbag{position:absolute;top:9px;right:9px;background:var(--green,#1A3D2E);color:var(--gold,#C6A85B);font-size:12px;font-weight:700;border-radius:999px;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;padding:0 7px}
.aq-pick{grid-column:1/-1;border:1px solid var(--gold,#C6A85B);border-radius:var(--aq-r);background:#fffdf7;padding:16px;display:grid;gap:13px}
.aq-pick h5{margin:0;font-size:15px;font-weight:700;color:var(--green,#1A3D2E)}
.aq-lab{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:var(--muted,#62645f);display:block;margin-bottom:7px}
.aq-sizes{display:flex;flex-wrap:wrap;gap:8px}
.aq-size{border:1px solid var(--line,rgba(26,61,46,.18));background:#fff;border-radius:10px;padding:9px 13px;cursor:pointer;font:inherit;font-size:13.5px;line-height:1.25;text-align:center;min-width:76px}
.aq-size b{display:block;font-size:15px;color:var(--green,#1A3D2E)}
.aq-size small{color:var(--muted,#62645f);font-size:11.5px}
.aq-size[aria-pressed="true"]{border-color:var(--green,#1A3D2E);background:var(--green,#1A3D2E);color:var(--cream,#F5F2EC)}
.aq-size[aria-pressed="true"] b,.aq-size[aria-pressed="true"] small{color:var(--cream,#F5F2EC)}
.aq-in,.aq-sel,.aq-note{width:100%;border:1px solid var(--line,rgba(26,61,46,.18));border-radius:9px;padding:10px 12px;font:inherit;font-size:15px;background:#fff}
.aq-in:focus,.aq-sel:focus,.aq-note:focus{outline:none;border-color:var(--gold,#C6A85B);box-shadow:0 0 0 3px rgba(198,168,91,.2)}
.aq-note{min-height:56px;resize:vertical;font-size:14px}
.aq-row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.aq-btn{border:0;border-radius:999px;padding:11px 20px;font:inherit;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;cursor:pointer;background:var(--green,#1A3D2E);color:var(--cream,#F5F2EC)}
.aq-btn.aq-gold{background:var(--gold,#C6A85B);color:var(--black,#0D0D0D)}
.aq-btn.aq-ghost{background:none;border:1px solid var(--line,rgba(26,61,46,.18));color:var(--muted,#62645f)}
.aq-btn:disabled{opacity:.5;cursor:default}
.aq-btn.aq-wide{width:100%;text-align:center;padding:15px}
.aq-sum{margin-top:26px;border:1px solid var(--line,rgba(26,61,46,.18));border-top:3px solid var(--gold,#C6A85B);border-radius:var(--aq-r);background:#fff;overflow:hidden}
.aq-sum-h{padding:14px 16px;border-bottom:1px solid var(--line,rgba(26,61,46,.18));font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:var(--green,#1A3D2E);display:flex;justify-content:space-between;align-items:center}
.aq-line{display:flex;gap:11px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--line,rgba(26,61,46,.18))}
.aq-line img{width:46px;height:46px;border-radius:8px;object-fit:cover;flex:0 0 auto;background:var(--cream-dark,#EAE5D8)}
.aq-line .aq-l-main{flex:1;min-width:0}
.aq-line .aq-l-name{font-size:14px;font-weight:600;line-height:1.3}
.aq-line .aq-l-meta{font-size:12.5px;color:var(--muted,#62645f);margin-top:2px}
.aq-line .aq-l-amt{font-weight:700;font-size:14px;color:var(--green,#1A3D2E);white-space:nowrap}
.aq-x{background:none;border:0;color:var(--muted,#62645f);font-size:20px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:6px}
.aq-x:hover{color:var(--danger,#8d2d26);background:rgba(141,45,38,.08)}
.aq-empty{padding:26px 16px;text-align:center;color:var(--muted,#62645f);font-size:14px}
.aq-tot{padding:14px 16px;display:grid;gap:7px;background:var(--cream,#F5F2EC)}
.aq-t{display:flex;justify-content:space-between;font-size:14px}
.aq-t.aq-save{color:var(--gold-dark,#8B6B3E);font-weight:700}
.aq-t.aq-grand{font-size:19px;font-weight:700;color:var(--green,#1A3D2E);border-top:1px solid var(--line,rgba(26,61,46,.18));padding-top:9px;margin-top:2px}
.aq-hint{font-size:12.5px;color:var(--gold-dark,#8B6B3E);background:#fffaf0;border:1px dashed var(--gold,#C6A85B);border-radius:9px;padding:9px 12px;margin:2px 16px 12px}
.aq-rev{margin:0;padding:11px 16px;background:#fdf6ee;border-top:1px solid var(--line,rgba(26,61,46,.18));font-size:13px;color:#6b5320}
.aq-rev ul{margin:6px 0 0;padding-left:18px}
.aq-pay{padding:14px 16px;display:grid;gap:9px;border-top:1px solid var(--line,rgba(26,61,46,.18))}
.aq-pay p{margin:0;font-size:12.5px;color:var(--muted,#62645f);line-height:1.5}
.aq-addons{margin-top:22px}
.aq-chips{display:flex;flex-wrap:wrap;gap:8px}
.aq-chip{border:1px solid var(--line,rgba(26,61,46,.18));background:#fff;border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;display:inline-flex;gap:7px;align-items:center}
.aq-chip:hover{border-color:var(--gold,#C6A85B)}
.aq-chip b{color:var(--green,#1A3D2E)}
.aq-ladder{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 0}
.aq-tier{font-size:11.5px;border:1px solid var(--line,rgba(26,61,46,.18));border-radius:999px;padding:5px 11px;color:var(--muted,#62645f)}
.aq-tier.on{border-color:var(--gold,#C6A85B);background:#fffaf0;color:var(--gold-dark,#8B6B3E);font-weight:700}
@media(max-width:600px){.aq-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}.aq h4{font-size:22px}}
`;

function styleOnce() {
  if (document.getElementById('aq-style')) return;
  const el = document.createElement('style');
  el.id = 'aq-style';
  el.textContent = STYLE;
  document.head.append(el);
}

const el = (tag, cls, parent, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (parent) parent.append(node);
  return node;
};

// The photo, or a monogram when the menu row has none. Never a broken image on a premium page.
function thumb(src, alt, parent, cls = 'aq-thumb') {
  if (src) {
    const img = el('img', cls, parent);
    img.src = src; img.alt = alt || ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { const f = el('div', `${cls} aq-none`, null, 'A'); img.replaceWith(f); });
    return img;
  }
  return el('div', `${cls} aq-none`, parent, 'A');
}

function priceLine(entry, parent) {
  if (!entry || entry.custom) { el('div', 'aq-quoted', parent, t('Quoted after review', 'Cotizado tras revisión')); return; }
  if (entry.from_cents == null) { el('div', 'aq-quoted', parent, t('Ask us for a price', 'Consúltanos el precio')); return; }
  const unit = productFor(entry.id)?.unit[es() ? 1 : 0] || '';
  const line = el('div', 'aq-price', parent, money(entry.from_cents));
  el('small', null, line, ` / ${unit.replace(/s$/, '')}`);
}

// ---------------------------------------------------------------- browse

function renderBrowse(parent) {
  const chosen = menus();
  if (!chosen.length) { el('p', 'aq-sub', parent, t('Select a category above to see its products.', 'Selecciona una categoría arriba para ver sus productos.')); return; }

  for (const category of chosen) {
    el('div', 'aq-cat', parent, es() ? CATEGORY_ES[category] : category);
    if (category === 'Individual Cajitas') {
      const p = el('p', 'aq-sub', parent, t('Standard: ham-spread Hawaiian roll, guava & cheese empanada, ham croqueta, 6 oz cold salad, one skewer and a 3–4 oz tres leches cup. ', 'Estándar: panecillo hawaiano con pasta de jamón, empanada de guayaba y queso, croqueta de jamón, 6 oz de ensalada fría, un pincho y un vasito de tres leches de 3–4 oz. '));
      const link = el('a', null, p, t('Open the Cajita designer', 'Abrir el personalizador de cajitas'));
      link.href = '/cajita-builder';
    }
    const grid = el('div', 'aq-grid', parent);
    for (const product of cateringProducts.filter((p) => p.category === category && !p.addon)) {
      const entry = catalogFor(product.id);
      const card = el('button', 'aq-card', grid);
      card.type = 'button';
      if (open === product.id) card.classList.add('is-open');
      thumb(entry?.image, label(product), card);
      const body = el('div', 'aq-body', card);
      el('div', 'aq-name', body, label(product));
      priceLine(entry, body);
      const count = cart.filter((r) => r.id === product.id).reduce((n, r) => n + r.quantity, 0);
      if (count) el('span', 'aq-inbag', card, String(count));
      card.addEventListener('click', () => { open = open === product.id ? null : product.id; render(); });
      if (open === product.id) grid.append(picker(product, entry));
    }
  }
}

// ---------------------------------------------------------------- the size picker

function picker(product, entry) {
  const box = el('div', 'aq-pick');
  el('h5', null, box, label(product));

  const state = { quantity: null, flavor: product.flavorKey ? CAJITA_DEFAULT_FLAVORS[product.flavorKey] : undefined, notes: '' };

  let flavorSel;
  if (product.flavorKey) {
    const wrap = el('div', null, box);
    el('span', 'aq-lab', wrap, t('Filling / flavor', 'Relleno / sabor'));
    flavorSel = el('select', 'aq-sel', wrap);
    flavorSel.setAttribute('aria-label', t('Filling / flavor', 'Relleno / sabor'));
    for (const [key, en, spanish] of CAJITA_FLAVORS[product.flavorKey]) {
      const priced = entry?.flavors?.[key]?.from_cents;
      const opt = el('option', null, flavorSel, `${es() ? spanish : en}${priced != null ? ` — ${money(priced)}` : ` — ${t('quoted', 'cotizado')}`}`);
      opt.value = key;
    }
    flavorSel.value = state.flavor;
    flavorSel.addEventListener('change', () => { state.flavor = flavorSel.value; open = product.id; render(); });
  }

  // The tray sizes the menu actually publishes for this product, plus a custom amount. A number
  // box on its own made every customer guess; these are the quantities the kitchen builds.
  const packs = (product.flavorKey ? entry?.flavors?.[state.flavor]?.packs : entry?.packs) || [];
  // 10 / 25 / 50 ON EVERY TRAY ITEM (Dayan, 2026-09-09), plus whatever else the menu publishes.
  //
  // The menu does not publish all three for anything: servings come as 10 and 25, pieces as 25 and
  // 50, dessert cups by the 12. Showing only the published sizes meant no product ever offered the
  // three he asked for. It does not have to: the pricer builds any quantity out of the trays it
  // has — 50 servings of lechón is two 25 trays — so the button can exist and still be an exact
  // price. `exactCost` mirrors that combination locally just to LABEL the button; the cart total
  // and everything charged still come from the server's own pricing.
  const offered = [...new Set([10, 25, 50, ...packs.filter((p) => p.size > 1).map((p) => p.size)])].sort((a, b) => a - b);
  const trays = offered.map((size) => ({ size, cents: exactCost(packs, size) })).filter((x) => x.cents != null);
  if (trays.length) {
    const wrap = el('div', null, box);
    el('span', 'aq-lab', wrap, t('Choose a quantity', 'Elige una cantidad'));
    const sizes = el('div', 'aq-sizes', wrap);
    for (const pack of trays) {
      const b = el('button', 'aq-size', sizes);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      el('b', null, b, String(pack.size));
      el('small', null, b, money(pack.cents));
      b.addEventListener('click', () => { state.quantity = pack.size; qty.value = String(pack.size); mark(); });
    }
    var markSizes = () => sizes.querySelectorAll('.aq-size').forEach((b, i) => b.setAttribute('aria-pressed', String(trays[i].size === state.quantity)));
  }

  const wrapQ = el('div', null, box);
  el('span', 'aq-lab', wrapQ, `${t('Quantity', 'Cantidad')} (${product.unit[es() ? 1 : 0]})`);
  const qty = el('input', 'aq-in', wrapQ);
  Object.assign(qty, { type: 'number', min: '1', max: '5000', step: '1', value: '' });
  qty.inputMode = 'numeric';
  qty.placeholder = t('Any amount', 'Cualquier cantidad');
  qty.setAttribute('aria-label', t('Quantity', 'Cantidad'));

  const wrapN = el('div', null, box);
  el('span', 'aq-lab', wrapN, t('Changes or special instructions', 'Cambios o instrucciones especiales'));
  const notes = el('textarea', 'aq-note', wrapN);
  notes.maxLength = 500;
  notes.setAttribute('aria-label', t('Changes or special instructions', 'Cambios o instrucciones especiales'));
  const mustDescribe = Boolean(product.custom || product.id === 'cajita-custom');
  if (mustDescribe) notes.required = true;
  el('p', 'aq-sub', box, mustDescribe
    ? t('Tell us what you need and we will price it by hand.', 'Cuéntanos qué necesitas y lo cotizamos a mano.')
    : t('Anything written here means we price this line by hand instead of charging the standard price.', 'Cualquier nota aquí significa que cotizamos esta línea a mano en vez de cobrar el precio estándar.'));

  const row = el('div', 'aq-row', box);
  const add = el('button', 'aq-btn', row, t('Add to quote', 'Agregar a la cotización'));
  add.type = 'button';
  const cancel = el('button', 'aq-btn aq-ghost', row, t('Cancel', 'Cancelar'));
  cancel.type = 'button';
  cancel.addEventListener('click', () => { open = null; render(); });

  function mark() { if (typeof markSizes === 'function') markSizes(); update(); }
  function update() {
    const n = Number(qty.value);
    const pack = packs.find((p) => p.size === n);
    add.disabled = !(Number.isInteger(n) && n > 0) || (mustDescribe && !notes.value.trim());
    add.textContent = pack ? t(`Add — ${money(pack.cents)}`, `Agregar — ${money(pack.cents)}`) : t('Add to quote', 'Agregar a la cotización');
  }
  qty.addEventListener('input', () => { state.quantity = Number(qty.value); mark(); });
  notes.addEventListener('input', update);
  update();

  add.addEventListener('click', () => {
    const n = Number(qty.value);
    if (!Number.isInteger(n) || n < 1 || n > 5000) return;
    if (cart.length >= 50) return;
    cart.push({ uid: ++uid, category: product.category, id: product.id, flavor: state.flavor, quantity: n, notes: notes.value.trim() });
    open = null;
    render();
  });

  // Clicking inside the panel must not bubble to the card and collapse it.
  box.addEventListener('click', (e) => e.stopPropagation());
  return box;
}

// ---------------------------------------------------------------- add-ons

function renderAddons(parent) {
  if (!catalog || !cart.some((r) => !productFor(r.id)?.addon)) return;
  const sauces = catalog.products.filter((p) => p.addon && p.from_cents != null && !cart.some((r) => r.id === p.id));
  if (!sauces.length) return;
  const box = el('div', 'aq-addons', parent);
  el('div', 'aq-cat', box, t('Add a sauce', 'Agrega una salsa'));
  el('p', 'aq-sub', box, t('Sold by the 8-serving tub. Tap to add one.', 'Se venden en envase de 8 porciones. Toca para agregar.'));
  const chips = el('div', 'aq-chips', box);
  for (const sauce of sauces.slice(0, 8)) {
    const chip = el('button', 'aq-chip', chips);
    chip.type = 'button';
    el('span', null, chip, `+ ${label(productFor(sauce.id) || sauce)}`);
    el('b', null, chip, money(sauce.packs.find((p) => p.size === 8)?.cents ?? sauce.from_cents));
    chip.addEventListener('click', () => {
      const pack = sauce.packs.find((p) => p.size === 8) || sauce.packs[0];
      cart.push({ uid: ++uid, category: sauce.category, id: sauce.id, quantity: pack ? pack.size : 8, notes: '' });
      render();
    });
  }
}

// ---------------------------------------------------------------- the running order

// Cheapest EXACT combination of the published packs for a quantity, or null when the packs cannot
// make it exactly. A small DP, deliberately the same rule the server's knapsack follows: never
// round a customer up to a quantity they did not ask for. Quantities here are preset-sized, so the
// table stays tiny. Used only for button labels and the running line totals — never to charge.
function exactCost(packs, qty) {
  if (!packs.length || !Number.isInteger(qty) || qty < 1 || qty > 5000) return null;
  const dp = new Array(qty + 1).fill(Infinity);
  dp[0] = 0;
  for (let q = 1; q <= qty; q++) {
    for (const pack of packs) {
      if (pack.size <= q && dp[q - pack.size] + pack.cents < dp[q]) dp[q] = dp[q - pack.size] + pack.cents;
    }
  }
  return dp[qty] === Infinity ? null : dp[qty];
}

function lineAmount(row) {
  const entry = catalogFor(row.id);
  const packs = (entry?.flavors ? entry.flavors[row.flavor]?.packs : entry?.packs) || [];
  return exactCost(packs, row.quantity);
}

function renderSummary(parent) {
  const box = el('div', 'aq-sum', parent);
  const head = el('div', 'aq-sum-h', box);
  el('span', null, head, t('Your order', 'Tu pedido'));
  el('span', null, head, cart.length ? `${cart.reduce((n, r) => n + r.quantity, 0)} ${t('items', 'productos')}` : '');

  if (!cart.length) {
    el('div', 'aq-empty', box, t('Nothing added yet — tap a product above to start.', 'Aún no has agregado nada — toca un producto arriba para empezar.'));
    return;
  }

  for (const row of cart) {
    const product = productFor(row.id);
    const entry = catalogFor(row.id);
    const line = el('div', 'aq-line', box);
    thumb(entry?.image, '', line, '');
    const main = el('div', 'aq-l-main', line);
    el('div', 'aq-l-name', main, label(product));
    const flavor = row.flavor && product?.flavorKey ? CAJITA_FLAVORS[product.flavorKey].find((f) => f[0] === row.flavor) : null;
    const bits = [`${row.quantity} ${product?.unit[es() ? 1 : 0] || ''}`];
    if (flavor) bits.push(flavor[es() ? 2 : 1]);
    if (row.notes) bits.push(t('quoted by hand', 'cotizado a mano'));
    el('div', 'aq-l-meta', main, bits.join(' · '));
    const amount = row.notes ? null : lineAmount(row);
    el('div', 'aq-l-amt', line, amount == null ? '—' : money(amount));
    const x = el('button', 'aq-x', line, '×');
    x.type = 'button';
    x.setAttribute('aria-label', t(`Remove ${label(product)}`, `Quitar ${label(product)}`));
    x.addEventListener('click', () => { cart = cart.filter((r) => r.uid !== row.uid); render(); });
  }

  // The money lives in its own host so an arriving estimate can repaint JUST this. Repainting the
  // whole builder was destroying an open size picker mid-tap: the customer chose a tray, the
  // previous request's total came back, the panel they were standing in was rebuilt underneath
  // them and the Add button went back to disabled. Caught in the browser, not by a test.
  el('div', 'aq-price-host', box);
  paintPrice();
}

function paintPrice() {
  const box = root.querySelector('.aq-price-host');
  if (!box) return;
  box.replaceChildren();
  const totals = el('div', 'aq-tot', box);
  if (!estimate) { el('div', 'aq-t', totals, t('Pricing…', 'Calculando…')); return; }

  const sub = el('div', 'aq-t', totals);
  el('span', null, sub, t('Food subtotal', 'Subtotal de comida'));
  el('span', null, sub, money(estimate.subtotal_cents));

  if (estimate.discount_cents > 0) {
    // The AMOUNT, not the effective rate. At $546 the blended rate is 0.4%, which reads as an
    // insult next to a real $2.30 saving; the ladder below already shows what each tier pays.
    const line = el('div', 'aq-t aq-save', totals);
    el('span', null, line, t('Volume discount', 'Descuento por volumen'));
    el('span', null, line, `− ${money(estimate.discount_cents)}`);
  }

  const grand = el('div', 'aq-t aq-grand', totals);
  el('span', null, grand, t('Total', 'Total'));
  el('span', null, grand, money(estimate.total_cents));
  el('p', 'aq-sub', totals, t('Delivery and tax are calculated at checkout.', 'Entrega e impuestos se calculan al pagar.')).style.margin = '0';

  ladder(totals);

  if (estimate.next_tier) {
    el('div', 'aq-hint', box, t(
      `Add ${money(estimate.next_tier.extra_cents)} more and everything above ${money(estimate.next_tier.at_cents)} comes off at ${Math.round(estimate.next_tier.rate_after * 100)}%.`,
      `Agrega ${money(estimate.next_tier.extra_cents)} más y todo lo que pase de ${money(estimate.next_tier.at_cents)} lleva ${Math.round(estimate.next_tier.rate_after * 100)}% de descuento.`));
  }

  if (estimate.unpriced?.length) {
    const rev = el('div', 'aq-rev', box);
    el('strong', null, rev, t('We will price these by hand and send them to you:', 'Cotizaremos esto a mano y te lo enviaremos:'));
    const list = el('ul', null, rev);
    for (const item of estimate.unpriced) {
      const product = productFor(item.id);
      el('li', null, list, `${item.quantity ?? ''} × ${product ? label(product) : item.id}`);
    }
  }

  renderPay(box);
}

function ladder(parent) {
  if (!catalog?.discount_tiers?.length) return;
  const row = el('div', 'aq-ladder', parent);
  for (const tier of catalog.discount_tiers) {
    const on = estimate && estimate.subtotal_cents >= tier.from_cents;
    el('span', `aq-tier${on ? ' on' : ''}`, row, t(
      `${money(tier.from_cents)}+ → ${Math.round(tier.rate * 100)}% off`,
      `${money(tier.from_cents)}+ → ${Math.round(tier.rate * 100)}% dto.`));
  }
}

// ---------------------------------------------------------------- paying

function renderPay(box) {
  if (!estimate?.checkout_eligible) {
    if (cart.length) el('p', 'aq-rev', box, t('Send the request below and we will come back with your quote.', 'Envía la solicitud abajo y te enviaremos tu cotización.'));
    return;
  }
  const pay = el('div', 'aq-pay', box);
  el('p', null, pay, t(
    'Pay now and your date is booked. Delivery address and contact details come next. Custom packaging and any hand-quoted lines above are not included in this payment.',
    'Paga ahora y tu fecha queda reservada. La dirección y los datos de contacto vienen después. El empaque personalizado y las líneas cotizadas a mano no se incluyen en este pago.'));

  const full = el('button', 'aq-btn aq-gold aq-wide', pay, t(`Pay in full — ${money(estimate.total_cents)}`, `Pagar completo — ${money(estimate.total_cents)}`));
  full.type = 'button';
  full.addEventListener('click', () => handoff('full'));

  // NEVER hardcode the deposit rate here. It lived as 0.25 in this file until 2026-09-09, when
  // the server moved to 50% and this button carried on offering half the real figure. The rate
  // comes from /api/catering-catalog; if it is missing we show no deposit button rather than
  // guess, because a button that names the wrong number is worse than no button.
  const pct = Number(catalog?.deposit_pct);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 1) return;
  const deposit = Math.round(estimate.total_cents * pct);
  const label = `${Math.round(pct * 100)}%`;
  const hold = el('button', 'aq-btn aq-wide', pay, t(`Hold the date — ${label} deposit, ${money(deposit)}`, `Reserva la fecha — ${label} de depósito, ${money(deposit)}`));
  hold.type = 'button';
  hold.addEventListener('click', () => startDeposit(hold));
  el('p', null, pay, t(
    `The balance of ${money(estimate.total_cents - deposit)} is due the day before the event.`,
    `El saldo de ${money(estimate.total_cents - deposit)} vence el día antes del evento.`));
}

// Hand the priced cart to the full-payment checkout. The items are SKUs and quantities only —
// every price is recomputed server-side, so nothing a browser can edit decides what is charged.
function handoff(mode) {
  try {
    sessionStorage.setItem('anejo-catering-cart', JSON.stringify({ items: estimate.items, mode, created: Date.now() }));
  } catch {
    alert(t('Please enable browser storage, or order through the menu.', 'Activa el almacenamiento del navegador, o compra desde el menú.'));
    return;
  }
  location.href = `/order?category=catering&from=catering&pay=${mode}`;
}

// The deposit goes to its own endpoint, NOT through /order.
//
// /order is a pay-in-full checkout and has no concept of a deposit: routing this button there
// would have named a deposit on the button and then charged the customer the full total. Note
// this comment names no rate — the rate lives in catering_terms.js and reaches the page through
// the catalogue, and a copy of it written down anywhere else is the bug of 2026-09-09. The path
// mints a Square link for the deposit alone and records the quote, the balance and the terms — the
// same machinery the Hub uses, reached from the public form.
//
// It needs a name, an email, a date and a head count, because a deposit against a blank name is
// money nobody can reconcile to an event. Rather than refusing, it walks the customer to the first
// field it is missing.
const DEPOSIT_FIELDS = [['name', 'name'], ['email', 'email'], ['event-date', 'event_date'], ['guests', 'guests']];

async function bookDeposit(button) {
  const values = {};
  for (const [domId, key] of DEPOSIT_FIELDS) {
    const field = document.getElementById(domId);
    const value = (field?.value || '').trim();
    if (!value) {
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.focus();
      button.insertAdjacentElement('afterend', el('p', 'aq-rev', null,
        t('Just need your details below first — then the date is yours.', 'Solo faltan tus datos abajo — luego la fecha es tuya.')));
      return;
    }
    values[key] = value;
  }
  values.phone = (document.getElementById('phone')?.value || '').trim();

  const original = button.textContent;
  button.disabled = true;
  button.textContent = t('Opening secure checkout…', 'Abriendo el pago seguro…');
  try {
    const response = await fetch('/api/catering-deposit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, products: readCart() }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.url) throw new Error(result?.error || 'deposit');
    location.href = result.url;
  } catch (err) {
    button.disabled = false;
    button.textContent = original;
    button.insertAdjacentElement('afterend', el('p', 'aq-rev', null,
      String(err.message) !== 'deposit' && String(err.message)
        ? err.message
        : t('We could not open the deposit checkout. Send the request below and we will send you a link.',
            'No pudimos abrir el pago del depósito. Envía la solicitud abajo y te enviamos un enlace.')));
  }
}

// ---------------------------------------------------------------- render + estimate

function render() {
  if (!root.isConnected) return;
  styleOnce();
  root.replaceChildren();
  root.classList.add('aq');
  el('h4', null, root, t('Build your order', 'Arma tu pedido'));
  el('p', 'aq-sub', root, t(
    'Prices are live from today’s menu. Quantities are totals for your event, not per guest.',
    'Los precios son los del menú de hoy. Las cantidades son totales para tu evento, no por invitado.'));
  if (catalog && !catalog.live) {
    el('p', 'aq-rev', root, t('Live prices are unavailable right now — send the request below and we will quote it.', 'Los precios en vivo no están disponibles — envía la solicitud y te la cotizamos.'));
  }
  renderBrowse(root);
  renderAddons(root);
  renderSummary(root);
  el('p', 'aq-sub', root, t('Standard catering: minimum 48 hours. Custom printing: minimum 72 hours.', 'Catering estándar: mínimo 48 horas. Impresión personalizada: mínimo 72 horas.')).style.marginTop = '16px';
  queueEstimate();
}

function queueEstimate() {
  const sequence = ++estimateSequence;
  clearTimeout(estimateTimer);
  const products = readCart();
  if (!products.length) { estimate = null; return; }
  const needsReview = ['event-theme', 'theme-colors', 'design-notes', 'dietary', 'details'].some((id) => document.getElementById(id)?.value?.trim())
    || [...form.querySelectorAll('input[type=file]')].some((elm) => elm.files.length);
  estimateTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/catering-estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, needs_review: needsReview }),
      });
      if (!response.ok) throw new Error('estimate');
      const result = await response.json();
      if (sequence !== estimateSequence) return;
      estimate = result;
      paintPrice();
    } catch {
      if (sequence !== estimateSequence) return;
      estimate = null;
      const box = root.querySelector('.aq-price-host');
      if (box) { box.replaceChildren(); el('div', 'aq-tot', box, t('Instant pricing is unavailable — you can still send the request below.', 'El precio instantáneo no está disponible — puedes enviar la solicitud abajo.')); }
    }
  }, 300);
}

const readCart = () => cart
  .filter((r) => menus().includes(r.category) && r.id)
  .map(({ id, quantity, flavor, notes }) => ({ id, quantity, flavor, notes }));

form.addEventListener('input', queueEstimate);
form.addEventListener('change', queueEstimate);
form.querySelectorAll('[name="menu_option"]').forEach((elm) => elm.addEventListener('change', render));
document.addEventListener('anejo:langchange', () => {
  // A language switch must never recreate controls that a locked retry disabled.
  if (!root.querySelector('button:disabled, select:disabled, input:disabled')) render();
});

// Deep link from the menu: /catering?item=lechon opens that product's size picker.
const requested = new URLSearchParams(location.search).get('item');
const deepLinked = cateringProducts.find((p) => p.id === requested);
if (deepLinked && menus().includes(deepLinked.category)) open = deepLinked.id;

render();
fetch('/api/catering-catalog')
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => { if (data) { catalog = data; render(); } })
  .catch(() => { /* the form still submits; it just cannot show prices */ });

window.AnejoQuoteProducts = {
  read: readCart,
  valid: () => menus().every((category) => cart.some((r) => r.category === category && r.id)),
};
