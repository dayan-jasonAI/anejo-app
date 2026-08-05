const products = [
  { id: "vida", name: "VIDA", label: "Fresh Tuna Mango Bowl", price: 19.99, img: "/assets/img/bowl_vida.jpg", tags: ["pescatarian", "flagship"], kcal: 510, protein: 40, desc: "Seared tuna, mango, cucumber, quinoa, greens, chia, Mango Omega, and Ajo Citrico." },
  { id: "fuego", name: "FUEGO", label: "Steak Bowl", price: 22.99, img: "/assets/img/bowl_fuego.jpg", tags: ["high-protein"], kcal: 580, protein: 42, desc: "Chimichurri steak, quinoa, roasted zucchini and peppers, arugula, pickled onions, pepitas." },
  { id: "ligero", name: "LIGERO", label: "Grilled Chicken Wellness Bowl", price: 18.99, img: "/assets/img/bowl_ligero.jpg", tags: ["high-protein", "lean"], kcal: 520, protein: 45, desc: "Golden Turmeric chicken, quinoa or brown rice, roasted vegetables, spinach, tomato, cucumber, almonds." },
  { id: "mar", name: "MAR", label: "Salmon Bowl", price: 22.99, img: "/assets/img/bowl_mar.jpg", tags: ["pescatarian", "high-protein"], kcal: 620, protein: 40, desc: "Premium salmon, quinoa, arugula, roasted vegetables, asparagus, pickled onions, black sesame." },
  { id: "coco", name: "COCO", label: "Coconut Lime Shrimp Bowl", price: 22.99, img: "/assets/img/bowl_coco.jpg", tags: ["pescatarian", "lean"], kcal: 590, protein: 40, desc: "Coconut-lime shrimp, quinoa-corn-edamame, spinach, tomatoes, avocado, cucumber, sesame." },
  { id: "congreen", name: "CONGREEN", label: "Tuna Green Bowl", price: 20.99, img: "/assets/img/bowl_congreen.jpg", tags: ["pescatarian"], kcal: 575, protein: 41, desc: "Tuna-mango-lime saute, quinoa-blueberry congri, spinach, tomato, avocado, queso fresco." },
  { id: "raiz", name: "RAIZ", label: "Crispy Tofu Bowl", price: 18.99, img: "/assets/img/bowl_raiz.jpg", tags: ["plant-forward"], kcal: 520, protein: 35, desc: "Crispy tofu, quinoa, slaw, roasted vegetables, sweet potato, black sesame, house sauces." },
  { id: "fit_gold", name: "GOLD", label: "Añejo Fit Drink", price: 9.99, img: "/assets/img/fit_gold.jpg", tags: ["drink"], kcal: 0, protein: 0, desc: "Pineapple, ginger, turmeric, chia. Add-on drink fixture from existing menu fallback." },
];

const plans = [
  { id: "plan_5", name: "5 bowls / week", price: 99, schedule: "Mon-Fri, one bowl per day", details: ["Choose lunch or dinner window", "Standard fallback tier", "Pause or cancel through account flow"] },
  { id: "plan_10", name: "10 bowls / week", price: 189, schedule: "Mon-Fri, lunch and dinner", details: ["Two daily deliveries/windows", "Built for workweek consistency", "Standard fallback tier"] },
  { id: "plan_12", name: "12 bowls / week", price: 219, schedule: "Mon-Sat, lunch and dinner", details: ["Default recommendation in existing flow", "Best price per standard bowl", "Macro sizing can override quote"] },
];

const cart = new Map();
let selectedProduct = products[1];
const money = (n) => "$" + Number(n).toFixed(2);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function renderProducts(filter = "all") {
  const list = filter === "all" ? products : products.filter((p) => p.tags.includes(filter));
  $("#productGrid").innerHTML = list.map((p) => {
    const unavailable = p.id === "fit_gold";
    return `
      <article class="product-card">
        <img src="${p.img}" alt="${p.name} ${p.label}">
        <div class="product-body">
          <span class="product-meta">${p.tags[0].replace("-", " ")}</span>
          <h3>${p.name}</h3>
          <p>${p.label}. ${p.desc}</p>
          <div class="product-facts">
            ${p.kcal ? `<span>~${p.kcal} cal</span><span>${p.protein}g protein</span>` : `<span>add-on</span>`}
            <span>never frozen</span>
          </div>
          <div class="card-actions">
            <strong class="price">${money(p.price)}</strong>
            <button class="mini-btn ${unavailable ? "" : "secondary"}" type="button" data-product="${p.id}" ${unavailable ? "disabled" : ""}>${unavailable ? "Sold out" : "View"}</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderPlans() {
  $("#planGrid").innerHTML = plans.map((plan) => `
    <article class="plan-card">
      <h3>${plan.name}</h3>
      <div class="plan-price">$${plan.price}<span style="font-size:14px;color:var(--muted)"> / week</span></div>
      <p>${plan.schedule}</p>
      <ul>${plan.details.map((d) => `<li>${d}</li>`).join("")}</ul>
      <button class="mini-btn secondary" type="button" data-plan="${plan.id}">Select plan</button>
    </article>`).join("");
}

function addItem(id) {
  const product = products.find((p) => p.id === id);
  if (!product || id === "fit_gold") return;
  cart.set(id, (cart.get(id) || 0) + 1);
  renderCart();
}

function renderCart() {
  const entries = Array.from(cart.entries()).map(([id, qty]) => ({ ...products.find((p) => p.id === id), qty }));
  $("#cartLines").innerHTML = entries.length
    ? entries.map((item) => `<div class="cart-line"><div><strong>${item.name}</strong><br><span>${item.qty} x ${money(item.price)}</span></div><strong>${money(item.qty * item.price)}</strong></div>`).join("")
    : `<div class="cart-empty">Your cart is empty. Add a bowl to see checkout context.</div>`;
  const subtotal = entries.reduce((sum, item) => sum + item.qty * item.price, 0);
  const delivery = subtotal >= 25 ? 5 : 0;
  const tax = subtotal * 0.07;
  $("#subtotal").textContent = money(subtotal);
  $("#delivery").textContent = subtotal > 0 && subtotal < 25 ? "$0.00 until minimum" : money(delivery);
  $("#tax").textContent = money(tax);
  $("#total").textContent = money(subtotal + delivery + tax);
}

function standardState() {
  const p = selectedProduct;
  return `
    <div class="state-layout">
      <img src="${p.img}" alt="${p.name} ${p.label}">
      <div class="state-copy">
        <span class="state-label">Standard product detail</span>
        <h2>${p.name} ${p.label}</h2>
        <p>${p.desc}</p>
        <div class="product-facts">
          <span>16 oz standard bowl</span><span>~${p.kcal} cal</span><span>${p.protein}g protein</span><span>${money(p.price)}</span>
        </div>
        <div class="choice-row" style="margin:18px 0">
          <button class="choice is-selected" type="button"><strong>Keep as built</strong><br><span>Chef-balanced recipe</span></button>
          <button class="choice" type="button"><strong>No nuts/seeds</strong><br><span>Preference noted</span></button>
          <button class="choice" type="button"><strong>Extra sauce</strong><br><span>+$1.50 after first</span></button>
        </div>
        <button class="btn btn-gold" type="button" data-add="${p.id}">Add to Order</button>
      </div>
    </div>`;
}

function macroState() {
  return `
    <div class="macro-panel">
      <span class="state-label">Macro-personalized entry</span>
      <div class="state-copy"><h2>Build meals around your goal.</h2><p>Prototype copy explains the existing Macro Portal without forcing standard customers through it. Nutrition is estimated and not medical advice.</p></div>
      <div class="form-grid">
        <label>Goal<select><option>Build lean muscle</option><option>Maintain performance</option><option>Support fat loss</option></select></label>
        <label>Meals per day<select><option>2 meals</option><option>3 meals</option></select></label>
        <label>Training rhythm<select><option>3-5 days / week</option><option>Daily</option><option>Light activity</option></select></label>
        <label>Preferences<input value="No shrimp, extra chimichurri"></label>
      </div>
      <div class="empty-card">
        <strong>Example result:</strong> 18 oz bowls, ~650 calories, 48g protein, 46g carbs, 28g fat. Añejo adjusts ingredient weights and kitchen tickets; the bowl count stays tied to the weekly plan.
      </div>
      <button class="btn btn-gold" type="button" data-goto="plan">See plan options</button>
    </div>`;
}

function planState() {
  return `
    <div class="macro-panel">
      <span class="state-label">Plan-selection experience</span>
      <div class="choice-row">
        ${plans.map((p, i) => `<button class="choice ${i === 2 ? "is-selected" : ""}" type="button"><strong>${p.name}</strong><br><span>$${p.price}/week · ${p.schedule}</span></button>`).join("")}
      </div>
      <div class="empty-card status-paused">
        <strong>Flexibility shown before payment:</strong> pause, skip, or cancel from the account flow. Delivery days come from the existing tier configuration.
      </div>
      <button class="btn btn-gold" type="button" data-goto="cart">Review order summary</button>
    </div>`;
}

function cartState() {
  return `
    <div class="checkout-card">
      <span class="state-label">Cart or order-summary state</span>
      <div class="state-copy"><h2>Review the food, price, delivery, and next step.</h2><p>The cart keeps the customer oriented before Square. It surfaces the $25 minimum, $5 default delivery fee, 7% estimated tax, and same-day/scheduled delivery choice.</p></div>
      <div class="form-grid">
        <label>Delivery mode<select><option>ASAP today</option><option>Schedule a day and window</option></select></label>
        <label>Window<select><option>Lunch · 11 AM-2 PM</option><option>Dinner · 5 PM-8 PM</option></select></label>
      </div>
      <button class="btn btn-gold" type="button" data-goto="checkout">Proceed to checkout</button>
    </div>`;
}

function checkoutState() {
  return `
    <div class="checkout-card">
      <span class="state-label">Checkout-entry state</span>
      <div class="state-copy"><h2>Enter delivery details, then continue to secure payment.</h2><p>This prototype does not create Square orders or write to production. It shows the intended communication layer before the existing checkout link.</p></div>
      <div class="form-grid">
        <label>First name<input value="Alex"></label>
        <label>Email<input value="alex@example.com"></label>
        <label class="field-error">ZIP code<input value="33101"><small>Outside prototype service area. Use a Palm Beach County ZIP.</small></label>
        <label>Delivery notes<input value="Front desk is fine"></label>
      </div>
      <button class="btn btn-gold" type="button" data-goto="confirm">Continue to secure Square checkout</button>
    </div>`;
}

function confirmState() {
  return `
    <div class="confirm-card">
      <span class="state-label">Order-confirmation state</span>
      <div class="state-copy"><h2>Your Añejo order is in.</h2><p>We will cook it fresh, pack sauces on the side, and text delivery updates if you opted in.</p></div>
      <div class="system-grid">
        <div class="empty-card"><strong>What happens next</strong><p>Kitchen receives a paid ticket only after Square confirms payment.</p></div>
        <div class="empty-card"><strong>Delivery timing</strong><p>Lunch: 11 AM-2 PM. Dinner: 5 PM-8 PM.</p></div>
      </div>
    </div>`;
}

function systemStates() {
  return `
    <div class="system-states">
      <span class="state-label">Empty, loading, error, sold-out, pause/skip</span>
      <div class="system-grid">
        <div class="empty-card"><strong>Empty state</strong><p>No bowls selected yet. Choose one fresh bowl to start your order.</p></div>
        <div class="empty-card"><strong>Loading state</strong><p class="loading-line"></p><p class="loading-line" style="width:72%"></p></div>
        <div class="empty-card status-error"><strong>Delivery-area error</strong><p>That ZIP is outside today's delivery route. Try a Palm Beach County delivery address or contact Añejo.</p></div>
        <div class="empty-card status-error"><strong>Sold out</strong><p>Gold Vitality is sold out today. Keep browsing or check tomorrow's prep.</p></div>
        <div class="empty-card status-paused"><strong>Skip day</strong><p>Friday dinner is skipped. Your plan resumes on the next scheduled delivery day.</p></div>
        <div class="empty-card status-paused"><strong>Paused delivery</strong><p>Your weekly plan is paused until Aug 18. No meals will be prepared during the pause.</p></div>
      </div>
    </div>`;
}

function messageState() {
  return `
    <div class="message-grid">
      <div class="phone-preview" aria-label="SMS preview">
        <div class="bubble">Añejo: Your FUEGO bowl is being packed now. Sauce is on the side and your lunch window is 11-2.</div>
        <div class="bubble">Añejo: Delivery is next. Reply HELP for help or STOP to cancel texts.</div>
      </div>
      <div class="email-preview" aria-label="Email preview">
        <div class="email-head">AÑEJO ORDER CONFIRMATION</div>
        <div class="message-card">
          <strong>Fresh food, clear next steps.</strong>
          <p>Your order summary, delivery window, address, items, estimated tax, delivery fee, and support path appear here. The tone is warm and specific without sentimental overreach.</p>
          <button class="mini-btn secondary" type="button">View order</button>
        </div>
      </div>
    </div>`;
}

const stateTemplates = {
  standard: standardState,
  macro: macroState,
  plan: planState,
  cart: cartState,
  checkout: checkoutState,
  confirm: confirmState,
  states: systemStates,
  messages: messageState,
};

function setState(name) {
  $$(".state-tabs button").forEach((b) => b.classList.toggle("is-active", b.dataset.state === name));
  $("#stateView").innerHTML = stateTemplates[name]();
}

document.addEventListener("click", (event) => {
  const productBtn = event.target.closest("[data-product]");
  if (productBtn) {
    selectedProduct = products.find((p) => p.id === productBtn.dataset.product) || selectedProduct;
    setState("standard");
    document.getElementById("order-flow").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const addBtn = event.target.closest("[data-add]");
  if (addBtn) addItem(addBtn.dataset.add);
  const stateBtn = event.target.closest("[data-state]");
  if (stateBtn) setState(stateBtn.dataset.state);
  const goBtn = event.target.closest("[data-goto]");
  if (goBtn) setState(goBtn.dataset.goto);
  const planBtn = event.target.closest("[data-plan]");
  if (planBtn) setState("plan");
  const filterBtn = event.target.closest("[data-filter]");
  if (filterBtn) {
    $$(".chip").forEach((b) => b.classList.toggle("is-selected", b === filterBtn));
    renderProducts(filterBtn.dataset.filter);
  }
});

function updateMobileOrderBar() {
  const bar = document.querySelector(".mobile-order-bar");
  if (!bar) return;
  const orderFlow = document.querySelector("#order-flow");
  const flowTop = orderFlow ? orderFlow.getBoundingClientRect().top : Infinity;
  bar.classList.toggle("is-visible", window.scrollY > 420 && flowTop > window.innerHeight * 0.72);
}

async function hydrateHeroVideo() {
  const card = document.querySelector("[data-hero-video-card]");
  const video = document.querySelector(".hero-video");
  if (!card || !video) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const src = window.matchMedia("(max-width: 820px)").matches ? video.dataset.mobileSrc : video.dataset.desktopSrc;
  if (!src) return;
  try {
    const available = await fetch(src, { method: "HEAD" });
    if (!available.ok) return;
    const source = document.createElement("source");
    source.src = src;
    source.type = src.endsWith(".webm") ? "video/webm" : "video/mp4";
    video.appendChild(source);
    await video.play().catch(() => {});
    card.classList.add("has-video");
  } catch {
    // Missing draft video keeps the still-frame animatic in place.
  }
}

window.addEventListener("scroll", updateMobileOrderBar, { passive: true });
updateMobileOrderBar();
renderProducts();
renderPlans();
renderCart();
const requestedState = new URLSearchParams(window.location.search).get("state");
setState(stateTemplates[requestedState] ? requestedState : "standard");
hydrateHeroVideo();
