// Añejo — plan renderer. Reads the plan stashed by intake.js and renders it. Bilingual (EN/ES).
const BOWL_TAGLINES = {
  en: {
    VIDA:'Tuna · mango · lime', FUEGO:'Steak · chimichurri', LIGERO:'Chicken · chimichurri',
    MAR:'Salmon · omega-rich', COCO:'Coconut · lime · shrimp',
    CONGREEN:'Congrí · tuna · avocado', RAIZ:'Crispy tofu · roots'
  },
  es: {
    VIDA:'Atún · mango · limón', FUEGO:'Bistec · chimichurri', LIGERO:'Pollo · chimichurri',
    MAR:'Salmón · rico en omega', COCO:'Coco · limón · camarón',
    CONGREEN:'Congrí · atún · aguacate', RAIZ:'Tofu crujiente · raíces'
  }
};
const BOWL_LABEL = { RAIZ:'RAÍZ' };
const TIER_LABEL = {
  en: { plan_5:'5 bowls / week', plan_10:'10 bowls / week', plan_12:'12 bowls / week' },
  es: { plan_5:'5 bowls / semana', plan_10:'10 bowls / semana', plan_12:'12 bowls / semana' }
};
const GOAL = {
  en: { fat_loss:'Fat loss', muscle_gain:'Muscle gain', recomp:'Recomposition', performance:'Performance', longevity:'Longevity' },
  es: { fat_loss:'Pérdida de grasa', muscle_gain:'Ganancia muscular', recomp:'Recomposición', performance:'Rendimiento', longevity:'Longevidad' }
};
const ACT = {
  en: { sedentary:'Sedentary', light:'Light', moderate:'Moderate', active:'Active', very_active:'Very active' },
  es: { sedentary:'Sedentario', light:'Ligero', moderate:'Moderado', active:'Activo', very_active:'Muy activo' }
};
const T = {
  en: { goal:'Goal:', activity:'Activity:', none:'No plan to display', build:'Build your plan →',
        planFor:function(w){return 'Plan for '+w;}, member:'Member plan', yours:'Your plan',
        loadErr:'Could not load plan: ',
        disclaimer:'This plan is for general fitness and wellness. It is not medical advice. Consult your healthcare provider before starting any new nutrition program.',
        macros:'Daily Macro Targets', cal:'Calories', pro:'Protein g', carb:'Carbs g', fat:'Fat g', fib:'Fiber g',
        bowlHead:'Your Añejo Bowl', perBowl:'per bowl', oz:'oz', perDay:function(n){return n+' bowls / day';},
        rotation:'Your Weekly Añejo Rotation', plansHead:'Choose Your Weekly Plan',
        bowls:'bowls', perWeek:'per week', recommended:'Recommended',
        editToggle:'Adjust my macros', editClose:'Hide editor',
        editTitle:'Adjust your daily macros',
        editHelp:'Change your targets and we’ll re-size your bowls and update pricing.',
        eCal:'Calories', ePro:'Protein g', eCarb:'Carbs g', eFat:'Fat g', eFib:'Fiber g', eMeals:'Bowls / day',
        recompute:'Recompute plan', cancel:'Cancel',
        editOk:'Updated — your bowls and pricing have been re-sized.',
        editErrRange:'Enter daily calories between 800 and 6000.',
        editErrFail:'Could not update the plan. Please try again.',
        editLow:'Heads-up: targets below 1,500 kcal/day are very low — consider a healthcare provider.',
        pbCal:'cal', pbPro:'P', pbCarb:'C', pbFat:'F', pbFib:'fiber',
        sizeNote:function(label,n){
          var m={ small:'Lighter, smaller bowls — your daily macros are spread across ~'+n+' bowls a day, so each bowl is portioned below standard and priced lower.',
                  standard:'Standard 16 oz Añejo bowls — your daily macros spread across ~'+n+' bowls a day.',
                  large:'Larger, higher-calorie bowls built to hit your macros across ~'+n+' bowls a day — bigger portions, priced higher.',
                  xl:'Extra-large, high-calorie bowls built to hit your macros across ~'+n+' bowls a day — our biggest portions, priced higher.' };
          return m[label]||m.standard; },
        sizeLabel:{ small:'Smaller bowl', standard:'Standard bowl', large:'Larger bowl', xl:'XL bowl' } },
  es: { goal:'Meta:', activity:'Actividad:', none:'No hay plan para mostrar', build:'Crea tu plan →',
        planFor:function(w){return 'Plan para '+w;}, member:'Plan del miembro', yours:'Tu plan',
        loadErr:'No se pudo cargar el plan: ',
        disclaimer:'Este plan es para fitness y bienestar general. No es consejo médico. Consulta a tu proveedor de salud antes de comenzar cualquier programa de nutrición.',
        macros:'Macros Diarios', cal:'Calorías', pro:'Proteína g', carb:'Carbohidratos g', fat:'Grasa g', fib:'Fibra g',
        bowlHead:'Tu Bowl Añejo', perBowl:'por bowl', oz:'oz', perDay:function(n){return n+' bowls / día';},
        rotation:'Tu Rotación Semanal Añejo', plansHead:'Elige Tu Plan Semanal',
        bowls:'bowls', perWeek:'por semana', recommended:'Recomendado',
        editToggle:'Ajustar mis macros', editClose:'Ocultar editor',
        editTitle:'Ajusta tus macros diarios',
        editHelp:'Cambia tus metas y ajustaremos el tamaño de tus bowls y el precio.',
        eCal:'Calorías', ePro:'Proteína g', eCarb:'Carbohidratos g', eFat:'Grasa g', eFib:'Fibra g', eMeals:'Bowls / día',
        recompute:'Recalcular plan', cancel:'Cancelar',
        editOk:'Actualizado — el tamaño de tus bowls y el precio se ajustaron.',
        editErrRange:'Ingresa calorías diarias entre 800 y 6000.',
        editErrFail:'No se pudo actualizar el plan. Inténtalo de nuevo.',
        editLow:'Aviso: metas por debajo de 1,500 kcal/día son muy bajas — considera consultar a un profesional de salud.',
        pbCal:'cal', pbPro:'P', pbCarb:'C', pbFat:'G', pbFib:'fibra',
        sizeNote:function(label,n){
          var m={ small:'Bowls más ligeros y pequeños — tus macros diarios se reparten en ~'+n+' bowls al día, así que cada bowl lleva menos porción y cuesta menos.',
                  standard:'Bowls Añejo estándar de 16 oz — tus macros diarios repartidos en ~'+n+' bowls al día.',
                  large:'Bowls más grandes y altos en calorías para alcanzar tus macros en ~'+n+' bowls al día — porciones mayores, precio más alto.',
                  xl:'Bowls extragrandes y altos en calorías para alcanzar tus macros en ~'+n+' bowls al día — nuestras porciones más grandes, precio más alto.' };
          return m[label]||m.standard; },
        sizeLabel:{ small:'Bowl más pequeño', standard:'Bowl estándar', large:'Bowl más grande', xl:'Bowl XL' } }
};
function money(n){ return (Math.round(Number(n)*100)/100).toFixed(2).replace(/\.00$/,''); }
function lng(){ return (window.AnejoLang && window.AnejoLang.get()) === 'es' ? 'es' : 'en'; }

const stash = sessionStorage.getItem('anejo:lastPlan');
const err = document.getElementById('error');

async function start(){
  const L = lng();
  // Shareable client link: /plan.html?token=<public_token> → fetch the saved plan.
  const token = new URLSearchParams(location.search).get('token');
  if (token) {
    try {
      const r = await fetch('/api/plan?token=' + encodeURIComponent(token));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'not found');
      render(data.intake, data.plan);
    } catch (e) {
      document.getElementById('plan-title').textContent = T[L].none;
      err.textContent = T[L].loadErr + (e.message || e); err.style.display = 'block';
    }
    return;
  }
  if (!stash) {
    document.getElementById('plan-title').textContent = T[L].none;
    document.getElementById('plan-subtitle').innerHTML = '<a class="backlink" href="/calculator">' + T[L].build + '</a>';
  } else {
    try { const { intake, plan } = JSON.parse(stash); render(intake, plan); }
    catch (e) { err.textContent = T[L].loadErr + (e.message || e); err.style.display = 'block'; }
  }
}

let curIntake = null, curPlan = null;

function render(intake, plan) {
  const L = lng();
  curIntake = intake; curPlan = plan;
  const trainer = intake.audience === 'trainer';
  const who = (intake.name || '').trim();
  document.getElementById('plan-title').textContent =
    who ? T[L].planFor(who) : (trainer ? T[L].member : T[L].yours);
  document.getElementById('plan-subtitle').innerHTML =
    `<span style="color:var(--gold)">${T[L].goal}</span> ${(GOAL[L][intake.primary_goal])||intake.primary_goal} · ` +
    `<span style="color:var(--gold)">${T[L].activity}</span> ${(ACT[L][intake.activity_level])||intake.activity_level}`;

  // Localized section labels (set here so EN/ES is reliable without the i18n dictionary).
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('lbl-macros', T[L].macros);
  setText('lbl-cal', T[L].cal); setText('lbl-pro', T[L].pro); setText('lbl-carb', T[L].carb);
  setText('lbl-fat', T[L].fat); setText('lbl-fib', T[L].fib);
  setText('lbl-bowl', T[L].bowlHead); setText('lbl-rotation', T[L].rotation); setText('lbl-plans', T[L].plansHead);
  setText('lbl-perbowl', T[L].perBowl);

  document.getElementById('m-cal').textContent  = plan.daily_calories;
  document.getElementById('m-pro').textContent  = plan.daily_protein_g;
  document.getElementById('m-carb').textContent = plan.daily_carbs_g;
  document.getElementById('m-fat').textContent  = plan.daily_fat_g;
  document.getElementById('m-fib').textContent  = plan.daily_fiber_g || '—';
  document.getElementById('m-tier').textContent = (TIER_LABEL[L][plan.meal_plan_tier]) || '';

  // Macro editor: localize labels + populate inputs with the current targets.
  setText('lbl-edit', T[L].editTitle); setText('lbl-edit-help', T[L].editHelp);
  setText('elbl-cal', T[L].eCal); setText('elbl-pro', T[L].ePro); setText('elbl-carb', T[L].eCarb);
  setText('elbl-fat', T[L].eFat); setText('elbl-fib', T[L].eFib); setText('elbl-meals', T[L].eMeals);
  setText('edit-apply', T[L].recompute); setText('edit-cancel', T[L].cancel);
  const editToggle = document.getElementById('edit-toggle');
  const panelOpen = document.getElementById('edit-panel') && document.getElementById('edit-panel').style.display !== 'none';
  if (editToggle) editToggle.textContent = panelOpen ? T[L].editClose : T[L].editToggle;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  setVal('e-cal', plan.daily_calories); setVal('e-pro', plan.daily_protein_g); setVal('e-carb', plan.daily_carbs_g);
  setVal('e-fat', plan.daily_fat_g); setVal('e-fib', plan.daily_fiber_g); setVal('e-meals', plan.meals_per_day || 3);

  // Sized bowl card: size label + ounces, per-bowl price, and per-bowl macros.
  const sizeKey = plan.bowl_size_label || 'standard';
  const meals = plan.meals_per_day || 3;
  setText('m-size-label', T[L].sizeLabel[sizeKey] || T[L].sizeLabel.standard);
  setText('m-size-oz', (plan.bowl_size_oz || 16) + ' ' + T[L].oz);
  setText('m-size-note', T[L].sizeNote(sizeKey, meals));
  setText('m-bowl-price', plan.per_bowl_price_usd != null ? '$' + money(plan.per_bowl_price_usd) : '—');
  const pb = plan.per_bowl_macros || {};
  const pbEl = document.getElementById('perbowl-macros');
  if (pbEl) {
    pbEl.innerHTML = [
      ['pb', pb.kcal, T[L].pbCal], ['pb', pb.protein_g, T[L].pbPro], ['pb', pb.carbs_g, T[L].pbCarb],
      ['pb', pb.fat_g, T[L].pbFat], ['pb', pb.fiber_g, T[L].pbFib]
    ].filter(r => r[1] != null).map(r => `<div class="${r[0]}"><b>${r[1]}</b> ${r[2]}</div>`).join('');
  }

  // Weekly plan options (5/10/12) — same sized per-bowl price, 12 flagged Recommended.
  const optsEl = document.getElementById('plan-opts');
  if (optsEl) {
    const opts = Array.isArray(plan.plan_options) ? plan.plan_options : [];
    optsEl.innerHTML = opts.map(o =>
      `<div class="plan-opt${o.recommended ? ' rec' : ''}">` +
      (o.recommended ? `<div class="po-badge">${T[L].recommended}</div>` : '') +
      `<div class="po-count">${o.bowls} ${T[L].bowls}</div>` +
      `<div class="po-price">$${money(o.weekly_price_usd)}</div>` +
      `<div class="po-per">${T[L].perWeek}</div></div>`
    ).join('');
  }

  const grid = document.getElementById('bowl-grid');
  grid.innerHTML = '';
  Object.entries(plan.bowl_rotation || {})
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .forEach(([bowl, count]) => {
      const el = document.createElement('div');
      el.className = 'bowl';
      el.innerHTML = `<div class="name">${BOWL_LABEL[bowl]||bowl}</div><div class="count"><span class="x">×</span>${count}</div><div class="tagline">${(BOWL_TAGLINES[L][bowl])||''}</div>`;
      grid.appendChild(el);
    });

  // Rationale + lifestyle notes are AI-generated prose (not in the i18n dictionary). Show the
  // version matching the current language, translating on demand when it differs from the language
  // the plan was written in.
  renderProse(L);

  document.getElementById('restart').href = trainer ? '/intake.html' : '/calculator';
  // Conversion: surface "Subscribe to this plan" (recommended tier) + "Order these bowls".
  var subBtn = document.getElementById('plan-subscribe');
  if (subBtn) {
    var sp = new URLSearchParams();
    sp.set('plan', plan.meal_plan_tier || 'plan_12');
    if (plan.per_bowl_price_usd != null) sp.set('pbp', plan.per_bowl_price_usd);
    if (plan.bowl_size_oz) sp.set('oz', plan.bowl_size_oz);
    subBtn.href = '/subscribe?' + sp.toString();
    subBtn.style.display = '';
  }
  var ordBtn = document.getElementById('plan-order');
  if (ordBtn) ordBtn.style.display = '';
  document.getElementById('plan-body').style.display = 'block';
  document.getElementById('plan-disclaimer').style.display = 'block';
  wireEditor();
}

// --- AI prose (rationale + lifestyle notes) localization -------------------------------------
// The plan's prose is generated once, in the user's language. When the visitor toggles language we
// translate on demand and cache it so subsequent toggles are instant. The cache is module-level
// (keyed by a signature of the base prose) because start()/render() rebuild the plan object on each
// language change — a per-object cache wouldn't survive.
let proseI18n = {};       // { en:{rationale,lifestyle_notes}, es:{...} }
let proseSig = '';        // signature of the current plan's base prose; changes reset the cache
let translating = {};

function baseProseLang() { return (curIntake && curIntake.lang === 'es') ? 'es' : 'en'; }

function ensureBaseCached() {
  const base = baseProseLang();
  const sig = base + '|' + (curPlan.rationale || '').slice(0, 80) + '|' + (curPlan.lifestyle_notes || []).length;
  if (sig !== proseSig) { proseSig = sig; proseI18n = {}; translating = {}; } // new/changed plan → reset
  if (!proseI18n[base]) {
    proseI18n[base] = { rationale: curPlan.rationale || '', lifestyle_notes: (curPlan.lifestyle_notes || []).slice() };
  }
  return base;
}

function renderProse(L) {
  const base = ensureBaseCached();
  const src = proseI18n[L] || proseI18n[base];
  const rEl = document.getElementById('m-rationale');
  const notes = document.getElementById('m-notes');
  if (rEl) rEl.textContent = src.rationale || '';
  if (notes) {
    notes.innerHTML = '';
    const list = (src.lifestyle_notes || []).slice();
    // Always render the legal disclaimer as the final bullet, in the current language.
    if (list.length) list[list.length - 1] = T[L].disclaimer; else list.push(T[L].disclaimer);
    list.forEach(n => { const li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });
  }
  // Missing a translation for the current (non-base) language → fetch it.
  if (!proseI18n[L] && L !== base) ensureTranslation(L);
}

async function ensureTranslation(L) {
  if (translating[L]) return;
  const base = proseI18n[baseProseLang()];
  if (!base || (!base.rationale && !(base.lifestyle_notes || []).length)) return;
  translating[L] = true;
  const rEl = document.getElementById('m-rationale');
  const notes = document.getElementById('m-notes');
  if (rEl) rEl.style.opacity = '0.5';
  if (notes) notes.style.opacity = '0.5';
  try {
    const r = await fetch('/api/plans/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_lang: L, rationale: base.rationale, lifestyle_notes: base.lifestyle_notes }),
    });
    const data = await r.json();
    if (r.ok && data && !data.error) {
      proseI18n[L] = {
        rationale: typeof data.rationale === 'string' ? data.rationale : base.rationale,
        lifestyle_notes: Array.isArray(data.lifestyle_notes) ? data.lifestyle_notes : base.lifestyle_notes,
      };
    }
  } catch (_) { /* keep showing base text on failure */ }
  finally {
    translating[L] = false;
    if (rEl) rEl.style.opacity = '';
    if (notes) notes.style.opacity = '';
    if (lng() === L) renderProse(L); // re-render if the visitor is still on this language
  }
}

let editorWired = false;
function wireEditor() {
  if (editorWired) return; editorWired = true;
  const panel = document.getElementById('edit-panel');
  const toggle = document.getElementById('edit-toggle');
  const cancel = document.getElementById('edit-cancel');
  const apply = document.getElementById('edit-apply');
  if (!panel || !toggle) return;
  const setOpen = (open) => {
    panel.style.display = open ? 'block' : 'none';
    toggle.textContent = open ? T[lng()].editClose : T[lng()].editToggle;
    if (open) { const f = document.getElementById('e-cal'); if (f) f.focus(); }
  };
  toggle.addEventListener('click', () => setOpen(panel.style.display === 'none'));
  if (cancel) cancel.addEventListener('click', () => { setOpen(false); if (curIntake && curPlan) render(curIntake, curPlan); });
  if (apply) apply.addEventListener('click', applyEdit);
}

async function applyEdit() {
  const L = lng();
  const msg = document.getElementById('edit-msg');
  const apply = document.getElementById('edit-apply');
  const numOf = (id) => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : Math.round(v); };
  const showMsg = (text, ok) => { if (!msg) return; msg.textContent = text; msg.className = 'edit-msg' + (ok ? ' ok' : ''); msg.style.display = 'block'; };

  const cal = numOf('e-cal');
  if (!cal || cal < 800 || cal > 6000) { showMsg(T[L].editErrRange, false); return; }
  const meals = numOf('e-meals') || curPlan.meals_per_day || 3;
  const orCur = (v, k) => (v == null ? curPlan[k] : v);
  const edited = {
    daily_calories: cal,
    daily_protein_g: orCur(numOf('e-pro'), 'daily_protein_g'),
    daily_carbs_g: orCur(numOf('e-carb'), 'daily_carbs_g'),
    daily_fat_g: orCur(numOf('e-fat'), 'daily_fat_g'),
    daily_fiber_g: orCur(numOf('e-fib'), 'daily_fiber_g'),
    meals_per_day: meals,
  };

  apply.disabled = true; const lbl = apply.textContent; apply.textContent = '…';
  try {
    // Saved plans (shareable link) persist via the token endpoint; calculator-only plans recompute statelessly.
    const token = new URLSearchParams(location.search).get('token');
    const url = token ? ('/api/plan?token=' + encodeURIComponent(token)) : '/api/plans/resize';
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edited) });
    const sizing = await r.json();
    if (!r.ok) throw new Error(sizing && sizing.error);

    // Apply edited macros + recomputed sizing to the live plan, then re-render everything.
    Object.assign(curPlan, edited, sizing);
    sessionStorage.setItem('anejo:lastPlan', JSON.stringify({ intake: curIntake, plan: curPlan }));
    render(curIntake, curPlan);
    showMsg(cal < 1500 ? (T[L].editOk + ' ' + T[L].editLow) : T[L].editOk, true);
  } catch (e) {
    showMsg((e && e.message) || T[L].editErrFail, false);
  } finally {
    apply.disabled = false; apply.textContent = lbl;
  }
}

// Re-render dynamic labels when language toggles (static text is handled by i18n.js)
document.addEventListener('anejo:langchange', start);
if (window.AnejoLang) start();
else document.addEventListener('DOMContentLoaded', start);
