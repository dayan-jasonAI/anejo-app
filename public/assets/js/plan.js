// Añejo — plan renderer. Reads the plan stashed by intake.js and renders it.
const BOWL_TAGLINES = {
  VIDA:'Tuna · mango · lime', FUEGO:'Steak · chimichurri', LIGERO:'Chicken · chimichurri',
  PESCA:'Salmon · mango · asparagus', FUERZA:'Cuban chicken · rice + beans',
  MANGO:'Tofu · plant-forward', CONGREEN:'Congrí · tuna · avocado', BOOST:'Greek yogurt · berries · seeds',
  COCO:'Coconut · lime · shrimp'
};
const TIER_LABEL = { plan_5:'5 bowls / week', plan_10:'10 bowls / week', plan_12:'12 bowls / week + 2 BOOST' };
const GOAL = { fat_loss:'Fat loss', muscle_gain:'Muscle gain', recomp:'Recomposition', performance:'Performance', longevity:'Longevity' };
const ACT  = { sedentary:'Sedentary', light:'Light', moderate:'Moderate', active:'Active', very_active:'Very active' };

const stash = sessionStorage.getItem('anejo:lastPlan');
const err = document.getElementById('error');

if (!stash) {
  document.getElementById('plan-title').textContent = 'No plan to display';
  document.getElementById('plan-subtitle').innerHTML = '<a class="backlink" href="/calculator">Build your plan →</a>';
} else {
  try { const { intake, plan } = JSON.parse(stash); render(intake, plan); }
  catch (e) { err.textContent = 'Could not load plan: ' + (e.message || e); err.style.display = 'block'; }
}

function render(intake, plan) {
  const trainer = intake.audience === 'trainer';
  const who = (intake.name || '').trim();
  document.getElementById('plan-title').textContent =
    who ? `Plan for ${who}` : (trainer ? 'Member plan' : 'Your plan');
  document.getElementById('plan-subtitle').innerHTML =
    `<span style="color:var(--gold)">Goal:</span> ${GOAL[intake.primary_goal]||intake.primary_goal} · ` +
    `<span style="color:var(--gold)">Activity:</span> ${ACT[intake.activity_level]||intake.activity_level}`;

  document.getElementById('m-cal').textContent  = plan.daily_calories;
  document.getElementById('m-pro').textContent  = plan.daily_protein_g;
  document.getElementById('m-carb').textContent = plan.daily_carbs_g;
  document.getElementById('m-fat').textContent  = plan.daily_fat_g;
  document.getElementById('m-fib').textContent  = plan.daily_fiber_g || '—';
  document.getElementById('m-tier').textContent = TIER_LABEL[plan.meal_plan_tier] || '';

  const grid = document.getElementById('bowl-grid');
  Object.entries(plan.bowl_rotation || {})
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .forEach(([bowl, count]) => {
      const el = document.createElement('div');
      el.className = 'bowl';
      el.innerHTML = `<div class="name">${bowl}</div><div class="count"><span class="x">×</span>${count}</div><div class="tagline">${BOWL_TAGLINES[bowl]||''}</div>`;
      grid.appendChild(el);
    });

  document.getElementById('m-rationale').textContent = plan.rationale || '';
  const notes = document.getElementById('m-notes');
  (plan.lifestyle_notes || []).forEach(n => { const li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });

  // "Start over" returns to whichever entry point they came from
  document.getElementById('restart').href = trainer ? '/intake.html' : '/calculator';

  document.getElementById('plan-body').style.display = 'block';
  document.getElementById('plan-disclaimer').style.display = 'block';
}
