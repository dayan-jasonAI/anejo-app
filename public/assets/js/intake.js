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

  // Imperial → metric (the engine speaks Mifflin–St Jeor in metric). Height is ft + in.
  const totalIn = (Number(data.get('height_ft')) || 0) * 12 + (Number(data.get('height_in')) || 0);
  const heightCm = +(totalIn * 2.54).toFixed(1);
  const weightKg = +(Number(data.get('weight_lb')) * 0.4535924).toFixed(1);

  const payload = {
    audience,
    name: (data.get('name') || '').trim(),
    email: (data.get('email') || '').trim(),
    phone: (data.get('phone') || '').trim(),
    sms_consent: !!(form.querySelector('input[name=sms_consent]') && form.querySelector('input[name=sms_consent]').checked),
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
      // Per-attempt timeout so a stalled edge/network can never leave the button
      // spinning forever — if the request doesn't settle, abort and surface an error.
      const ctrl = new AbortController();
      const timer = setTimeout(function () { ctrl.abort(); }, 40000);
      try {
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
      } catch (fetchErr) {
        clearTimeout(timer);
        // Timed out / network drop — retry a couple of times, then give a clear error.
        if (attempt < 2) { attempt++; await new Promise(function (r) { setTimeout(r, 900 * attempt); }); continue; }
        throw new Error(lang === 'es'
          ? 'La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo.'
          : 'The request timed out. Please check your connection and try again.');
      }
      clearTimeout(timer);
      // Auto-retry transient server hiccups (e.g. mid-deploy) up to 2x; never retry 4xx.
      if (resp.status >= 500 && attempt < 2) { attempt++; await new Promise(function (r) { setTimeout(r, 900 * attempt); }); continue; }
      break;
    }
    if (resp.status === 401) {
      // Not signed in. Don't dead-end: the form stays filled, so give a clickable sign-in link
      // (opens the trainer dashboard / account in a new tab) and let them resubmit after signing in.
      btn.disabled = false; btn.textContent = label;
      err.innerHTML = (lang === 'es'
        ? 'Inicia sesión como entrenador para guardar a este miembro. <a href="/trainer/dashboard" target="_blank" rel="noopener"><strong>Iniciar sesión →</strong></a> Tu formulario queda lleno: inicia sesión y vuelve a enviar.'
        : 'Please sign in as a trainer to save this member. <a href="/trainer/dashboard" target="_blank" rel="noopener"><strong>Sign in →</strong></a> Your form stays filled — sign in, then submit again.');
      err.style.display = 'block';
      return;
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
    const stash = { intake: payload, plan };
    // Trainer flow: carry the saved-plan handles so /plan.html can offer "Send plan to member"
    // (and attribute the member's later subscription) instead of the public subscribe/checkout CTAs.
    if (audience === 'trainer') {
      stash.trainer = { plan_id: result.plan_id, public_token: result.public_token, client_id: result.client_id };
    }
    sessionStorage.setItem('anejo:lastPlan', JSON.stringify(stash));
    window.location.href = '/plan.html';
  } catch (e) {
    btn.disabled = false;
    btn.textContent = label;
    err.textContent = e.message || (lang === 'es' ? 'Algo salió mal. Inténtalo de nuevo.' : 'Something went wrong. Please try again.');
    err.style.display = 'block';
  }
});
