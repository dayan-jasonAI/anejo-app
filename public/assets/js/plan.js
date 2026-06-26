// Añejo — plan renderer. Reads the plan stashed by intake.js and renders it. Bilingual (EN/ES).
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
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
// Bowl photos + the 16 oz macro template (mirrors functions/_lib/bowlspec.js) so the rotation can
// show each bowl scaled to the client's size factor.
const BOWL_IMG = {
  VIDA:'/assets/img/bowl_vida.jpg', FUEGO:'/assets/img/bowl_fuego.jpg', LIGERO:'/assets/img/bowl_ligero.jpg',
  MAR:'/assets/img/bowl_mar.jpg', COCO:'/assets/img/bowl_coco.jpg', CONGREEN:'/assets/img/bowl_congreen.jpg', RAIZ:'/assets/img/bowl_raiz.jpg'
};
const BOWL_BASE = {
  VIDA:{kcal:510,protein_g:40,carbs_g:36,fat_g:22}, FUEGO:{kcal:580,protein_g:42,carbs_g:35,fat_g:28},
  LIGERO:{kcal:520,protein_g:45,carbs_g:38,fat_g:20}, MAR:{kcal:620,protein_g:40,carbs_g:30,fat_g:32},
  COCO:{kcal:590,protein_g:40,carbs_g:37,fat_g:27}, CONGREEN:{kcal:575,protein_g:41,carbs_g:39,fat_g:25},
  RAIZ:{kcal:520,protein_g:35,carbs_g:38,fat_g:26}
};
const AVO_USD = 2; // avocado add-on, +$2 per bowl
let avoOn = false; // "add avocado to every bowl" toggle state
function scaledBowl(bowl, factor){
  const b = BOWL_BASE[bowl]; const f = Number(factor) > 0 ? Number(factor) : 1;
  if (!b) return null;
  return { kcal:Math.round(b.kcal*f), protein_g:Math.round(b.protein_g*f), carbs_g:Math.round(b.carbs_g*f), fat_g:Math.round(b.fat_g*f) };
}
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
        avoLabel:'Add avocado to every bowl', avoPriceEach:'+$2 each', avoTag:'+ ½ avocado',
        avoNote:'Fresh ½ avocado in every bowl — we keep your calories on target by adjusting the bowl’s other fats.',
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
        avoLabel:'Agregar aguacate a cada bowl', avoPriceEach:'+$2 c/u', avoTag:'+ ½ aguacate',
        avoNote:'Medio aguacate fresco en cada bowl — mantenemos tus calorías en la meta ajustando las otras grasas del bowl.',
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

// Trainer "send plan to member" flow copy (EN/ES). Shown when a trainer previews a member's plan.
const TT = {
  en: {
    send:'Send plan to member →', sending:'Sending…', sent:'Plan sent ✓',
    home:'Return to dashboard', another:'Add another member',
    sendErr:'Could not send the plan. Please try again.',
    previewNote:'This is your member’s plan preview. Adjust the macros if needed, then send it — they’ll review, accept & pay from their own login.',
    sentEmailed:function(n){ return 'Plan sent to '+(n||'your member')+'. They’ll get an email to log in, review, accept, and pay.'; },
    sentNoEmail:function(n){ return 'Plan marked as sent'+(n?' to '+n:'')+'. No email on file — the plan link was copied, so you can share it for them to review, accept & pay.'; }
  },
  es: {
    send:'Enviar plan al miembro →', sending:'Enviando…', sent:'Plan enviado ✓',
    home:'Volver al panel', another:'Agregar otro miembro',
    sendErr:'No se pudo enviar el plan. Inténtalo de nuevo.',
    previewNote:'Esta es la vista previa del plan de tu miembro. Ajusta los macros si es necesario y envíalo — el miembro revisa, acepta y paga desde su propio acceso.',
    sentEmailed:function(n){ return 'Plan enviado a '+(n||'tu miembro')+'. Recibirá un correo para iniciar sesión, revisar, aceptar y pagar.'; },
    sentNoEmail:function(n){ return 'Plan marcado como enviado'+(n?' a '+n:'')+'. No hay correo registrado — se copió el enlace del plan para que lo compartas y el miembro revise, acepte y pague.'; }
  }
};

const err = document.getElementById('error');
// Trainer-preview state (set in start() from the stash; survives language toggles).
let trainerPreview = false, curTrainerMeta = null, memberClientId = null;
let planSent = false, lastSentEmailed = false;

async function start(){
  const L = lng();
  // Shareable client link: /plan.html?token=<public_token> → the member (or trainer) reviewing a
  // SAVED plan. This is the member's review / accept & pay view — never the trainer-send view.
  const token = new URLSearchParams(location.search).get('token');
  if (token) {
    trainerPreview = false; curTrainerMeta = null;
    try {
      const r = await fetch('/api/plan?token=' + encodeURIComponent(token));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'not found');
      memberClientId = data.client_id || null;
      render(data.intake, data.plan);
    } catch (e) {
      document.getElementById('plan-title').textContent = T[L].none;
      err.textContent = T[L].loadErr + (e.message || e); err.style.display = 'block';
    }
    return;
  }
  // Read fresh each call so language toggles (and post-edit re-stashes) see the latest plan.
  const stash = sessionStorage.getItem('anejo:lastPlan');
  if (!stash) {
    document.getElementById('plan-title').textContent = T[L].none;
    document.getElementById('plan-subtitle').innerHTML = '<a class="backlink" href="/calculator">' + T[L].build + '</a>';
  } else {
    try {
      const parsed = JSON.parse(stash);
      // A trainer who just generated this member's plan carries the saved-plan handles → offer
      // "Send plan to member" instead of the public subscribe/checkout CTAs.
      curTrainerMeta = parsed.trainer || null;
      trainerPreview = !!(curTrainerMeta && curTrainerMeta.plan_id && parsed.intake && parsed.intake.audience === 'trainer');
      if (curTrainerMeta && curTrainerMeta.client_id) memberClientId = curTrainerMeta.client_id;
      render(parsed.intake, parsed.plan);
    }
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
  const perBowlShown = plan.per_bowl_price_usd != null ? plan.per_bowl_price_usd + (avoOn ? AVO_USD : 0) : null;
  setText('m-bowl-price', perBowlShown != null ? '$' + money(perBowlShown) : '—');

  // Avocado add-on toggle (localized; reflects current state).
  setText('lbl-avo', T[L].avoLabel); setText('lbl-avo-price', T[L].avoPriceEach); setText('lbl-avo-note', T[L].avoNote);
  const avoEl = document.getElementById('avo-toggle'); if (avoEl) avoEl.checked = avoOn;
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
    optsEl.innerHTML = opts.map(o => {
      const weekly = o.weekly_price_usd + (avoOn ? AVO_USD * o.bowls : 0);
      return `<div class="plan-opt${o.recommended ? ' rec' : ''}">` +
      (o.recommended ? `<div class="po-badge">${T[L].recommended}</div>` : '') +
      `<div class="po-count">${o.bowls} ${T[L].bowls}</div>` +
      `<div class="po-price">$${money(weekly)}</div>` +
      `<div class="po-per">${T[L].perWeek}</div></div>`;
    }).join('');
  }

  const grid = document.getElementById('bowl-grid');
  grid.innerHTML = '';
  Object.entries(plan.bowl_rotation || {})
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .forEach(([bowl, count]) => {
      const el = document.createElement('div');
      el.className = 'bowl';
      const img = BOWL_IMG[bowl] ? `<img class="bowl-img" src="${BOWL_IMG[bowl]}" alt="${BOWL_LABEL[bowl]||bowl} bowl" loading="lazy" />` : '';
      const m = scaledBowl(bowl, plan.bowl_size_factor);
      const macros = m ? `<div class="bowl-macros"><b>${m.kcal}</b> kcal · ${m.protein_g}P / ${m.carbs_g}C / ${m.fat_g}F</div>` : '';
      const avo = avoOn ? `<div class="avo-tag">${T[L].avoTag}</div>` : '';
      el.innerHTML = img +
        `<div class="name">${esc(BOWL_LABEL[bowl]||bowl)}</div><div class="count"><span class="x">×</span>${count}</div>` +
        `<div class="tagline">${(BOWL_TAGLINES[L][bowl])||''}</div>` + macros + avo;
      grid.appendChild(el);
    });

  // Rationale + lifestyle notes are AI-generated prose (not in the i18n dictionary). Show the
  // version matching the current language, translating on demand when it differs from the language
  // the plan was written in.
  renderProse(L);

  document.getElementById('restart').href = trainer ? '/intake.html' : '/calculator';

  // CTAs split by who's viewing:
  //  • trainer previewing a member's freshly generated plan → "Send plan to member" + "Return to dashboard"
  //  • everyone else (public calculator, or the member opening their emailed link) → subscribe / accept & pay
  var planCta = document.getElementById('plan-cta');
  var trainerCta = document.getElementById('trainer-cta');
  var pvNote = document.getElementById('trainer-preview-note');
  if (trainerPreview) {
    if (planCta) planCta.style.display = 'none';
    if (trainerCta) trainerCta.style.display = 'flex';
    if (pvNote) { pvNote.textContent = TT[L].previewNote; pvNote.style.display = 'block'; }
    wireTrainerCta(L);
  } else {
    if (trainerCta) trainerCta.style.display = 'none';
    if (pvNote) pvNote.style.display = 'none';
    if (planCta) planCta.style.display = 'flex';
    // Conversion: surface "Subscribe to this plan" (recommended tier) + "Order these bowls".
    var subBtn = document.getElementById('plan-subscribe');
    if (subBtn) {
      var sp = new URLSearchParams();
      sp.set('plan', plan.meal_plan_tier || 'plan_12');
      if (plan.per_bowl_price_usd != null) sp.set('pbp', plan.per_bowl_price_usd);
      if (plan.bowl_size_oz) sp.set('oz', plan.bowl_size_oz);
      if (avoOn) sp.set('avo', '1');
      // Member opening their emailed plan link → attribute the subscription to their trainer's client record.
      if (memberClientId) sp.set('client', memberClientId);
      subBtn.href = '/subscribe?' + sp.toString();
      subBtn.style.display = '';
    }
    var ordBtn = document.getElementById('plan-order');
    if (ordBtn) ordBtn.style.display = '';
  }
  document.getElementById('plan-body').style.display = 'block';
  document.getElementById('plan-disclaimer').style.display = 'block';
  wireEditor();
}

// --- Trainer "send plan to member" -----------------------------------------------------------
let trainerCtaWired = false;
function lastSentNote(L){
  const n = (curIntake && curIntake.name) || '';
  return lastSentEmailed ? TT[L].sentEmailed(n) : TT[L].sentNoEmail(n);
}
function wireTrainerCta(L){
  const sendBtn = document.getElementById('trainer-send');
  const homeBtn = document.getElementById('trainer-home');
  const moreBtn = document.getElementById('trainer-restart');
  if (homeBtn) homeBtn.textContent = TT[L].home;
  if (moreBtn) moreBtn.textContent = TT[L].another;
  if (sendBtn) { sendBtn.textContent = planSent ? TT[L].sent : TT[L].send; sendBtn.disabled = planSent; }
  const note = document.getElementById('trainer-sent-note');
  if (note && planSent) { note.textContent = lastSentNote(L); note.style.color = ''; note.style.display = 'block'; }
  if (!trainerCtaWired && sendBtn) { trainerCtaWired = true; sendBtn.addEventListener('click', sendTrainerPlan); }
}
async function sendTrainerPlan(){
  const L = lng();
  const btn = document.getElementById('trainer-send');
  const note = document.getElementById('trainer-sent-note');
  if (!curTrainerMeta || !curTrainerMeta.plan_id) return;
  btn.disabled = true; btn.textContent = TT[L].sending;
  try {
    const r = await fetch('/api/plans/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: curTrainerMeta.plan_id })
    });
    const d = await r.json().catch(function(){ return {}; });
    if (!r.ok || !d.ok) throw new Error(d.error || TT[L].sendErr);
    planSent = true; lastSentEmailed = !!d.emailed;
    // No email on file → the API returns the shareable link; copy it so the trainer can pass it on.
    if (!d.emailed && d.link) { try { await navigator.clipboard.writeText(d.link); } catch (_) {} }
    btn.textContent = TT[L].sent; btn.disabled = true;
    if (note) { note.textContent = lastSentNote(L); note.style.color = ''; note.style.display = 'block'; }
  } catch (e) {
    btn.disabled = false; btn.textContent = TT[L].send;
    if (note) { note.textContent = (e && e.message) || TT[L].sendErr; note.style.color = '#b3261e'; note.style.display = 'block'; }
  }
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
  const avo = document.getElementById('avo-toggle');
  if (avo) avo.addEventListener('change', () => { avoOn = avo.checked; if (curIntake && curPlan) render(curIntake, curPlan); });
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

    // Trainer preview: persist the edit to the saved draft so the member receives exactly what the
    // trainer sees here (the resize call above is stateless and only drives the on-screen numbers).
    if (trainerPreview && curTrainerMeta && curTrainerMeta.plan_id) {
      const pr = await fetch('/api/plans/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ plan_id: curTrainerMeta.plan_id }, edited))
      });
      const pd = await pr.json().catch(function(){ return {}; });
      if (!pr.ok || !pd.ok) throw new Error((pd && pd.error) || T[L].editErrFail);
    }

    // Apply edited macros + recomputed sizing to the live plan, then re-render everything.
    Object.assign(curPlan, edited, sizing);
    const restash = { intake: curIntake, plan: curPlan };
    if (curTrainerMeta) restash.trainer = curTrainerMeta;   // keep the send handles across edits / language toggles
    sessionStorage.setItem('anejo:lastPlan', JSON.stringify(restash));
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
