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
        loadErr:'Could not load plan: ' },
  es: { goal:'Meta:', activity:'Actividad:', none:'No hay plan para mostrar', build:'Crea tu plan →',
        planFor:function(w){return 'Plan para '+w;}, member:'Plan del miembro', yours:'Tu plan',
        loadErr:'No se pudo cargar el plan: ' }
};
function lng(){ return (window.AnejoLang && window.AnejoLang.get()) === 'es' ? 'es' : 'en'; }

const stash = sessionStorage.getItem('anejo:lastPlan');
const err = document.getElementById('error');

function start(){
  const L = lng();
  if (!stash) {
    document.getElementById('plan-title').textContent = T[L].none;
    document.getElementById('plan-subtitle').innerHTML = '<a class="backlink" href="/calculator">' + T[L].build + '</a>';
  } else {
    try { const { intake, plan } = JSON.parse(stash); render(intake, plan); }
    catch (e) { err.textContent = T[L].loadErr + (e.message || e); err.style.display = 'block'; }
  }
}

function render(intake, plan) {
  const L = lng();
  const trainer = intake.audience === 'trainer';
  const who = (intake.name || '').trim();
  document.getElementById('plan-title').textContent =
    who ? T[L].planFor(who) : (trainer ? T[L].member : T[L].yours);
  document.getElementById('plan-subtitle').innerHTML =
    `<span style="color:var(--gold)">${T[L].goal}</span> ${(GOAL[L][intake.primary_goal])||intake.primary_goal} · ` +
    `<span style="color:var(--gold)">${T[L].activity}</span> ${(ACT[L][intake.activity_level])||intake.activity_level}`;

  document.getElementById('m-cal').textContent  = plan.daily_calories;
  document.getElementById('m-pro').textContent  = plan.daily_protein_g;
  document.getElementById('m-carb').textContent = plan.daily_carbs_g;
  document.getElementById('m-fat').textContent  = plan.daily_fat_g;
  document.getElementById('m-fib').textContent  = plan.daily_fiber_g || '—';
  document.getElementById('m-tier').textContent = (TIER_LABEL[L][plan.meal_plan_tier]) || '';

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

  document.getElementById('m-rationale').textContent = plan.rationale || '';
  const notes = document.getElementById('m-notes');
  notes.innerHTML = '';
  (plan.lifestyle_notes || []).forEach(n => { const li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });

  document.getElementById('restart').href = trainer ? '/intake.html' : '/calculator';
  document.getElementById('plan-body').style.display = 'block';
  document.getElementById('plan-disclaimer').style.display = 'block';
}

// Re-render dynamic labels when language toggles (static text is handled by i18n.js)
document.addEventListener('anejo:langchange', start);
if (window.AnejoLang) start();
else document.addEventListener('DOMContentLoaded', start);
