// Añejo — shared intake handler for both the public calculator and the trainer portal.
// Detects audience from the form's data-audience attribute, posts to /api/plans/generate,
// stashes the result, then renders it on /plan.html.

const form = document.getElementById('intake-form');
const audience = form.dataset.audience || 'public';

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('submit-btn');
  const err = document.getElementById('error');
  err.style.display = 'none';
  btn.disabled = true;
  const label = btn.textContent;
  const lang = (window.AnejoLang && window.AnejoLang.get() === 'es') ? 'es' : 'en';
  btn.innerHTML = '<span class="spinner"></span>' + (lang === 'es' ? 'Creando tu plan…' : 'Building your plan…');

  const data = new FormData(form);
  const conditions = Array.from(form.querySelectorAll('input[name=conditions]:checked')).map(el => el.value);
  const allergens  = Array.from(form.querySelectorAll('input[name=allergens]:checked')).map(el => el.value);

  // Imperial → metric (the engine speaks Mifflin–St Jeor in metric).
  const heightCm = +(Number(data.get('height_in')) * 2.54).toFixed(1);
  const weightKg = +(Number(data.get('weight_lb')) * 0.4535924).toFixed(1);

  const payload = {
    audience,
    name: (data.get('name') || '').trim(),
    age: Number(data.get('age')),
    sex: data.get('sex'),
    height_cm: heightCm,
    weight_kg: weightKg,
    activity_level: data.get('activity_level'),
    primary_goal: data.get('primary_goal'),
    conditions,
    allergens,
    preferences: (data.get('preferences') || '').trim(),
    lang
  };

  try {
    const resp = await fetch('/api/plans/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || `Request failed (${resp.status})`);
    sessionStorage.setItem('anejo:lastPlan', JSON.stringify({ intake: payload, plan: result }));
    window.location.href = '/plan.html';
  } catch (e) {
    btn.disabled = false;
    btn.textContent = label;
    err.textContent = e.message || (lang === 'es' ? 'Algo salió mal. Inténtalo de nuevo.' : 'Something went wrong. Please try again.');
    err.style.display = 'block';
  }
});
