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
    // Trainer intake persists (creates the client + saves the plan); public calculator is stateless.
    const endpoint = audience === 'trainer' ? '/api/clients' : '/api/plans/generate';
    let resp, attempt = 0;
    while (true) {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // Auto-retry transient server hiccups (e.g. mid-deploy) up to 2x; never retry 4xx.
      if (resp.status >= 500 && attempt < 2) { attempt++; await new Promise(function (r) { setTimeout(r, 900 * attempt); }); continue; }
      break;
    }
    if (resp.status === 401) {
      throw new Error(lang === 'es'
        ? 'Inicia sesión como entrenador para guardar a este miembro.'
        : 'Please sign in as a trainer (open the dashboard) to save this member.');
    }
    const result = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      if (resp.status >= 500) throw new Error(lang === 'es'
        ? 'No pudimos crear tu plan ahora mismo. Inténtalo de nuevo en un momento.'
        : 'We couldn’t build your plan right now — please try again in a moment.');
      throw new Error(result.error || `Request failed (${resp.status})`);
    }
    // /api/clients wraps the plan in { client_id, plan_id, public_token, plan }; generate returns it directly.
    const plan = (audience === 'trainer') ? result.plan : result;
    sessionStorage.setItem('anejo:lastPlan', JSON.stringify({ intake: payload, plan }));
    window.location.href = '/plan.html';
  } catch (e) {
    btn.disabled = false;
    btn.textContent = label;
    err.textContent = e.message || (lang === 'es' ? 'Algo salió mal. Inténtalo de nuevo.' : 'Something went wrong. Please try again.');
    err.style.display = 'block';
  }
});
