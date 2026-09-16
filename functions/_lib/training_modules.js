// What each role's training module currently teaches, and what changed since the last version.
// Files under functions/_lib are NOT routed.
//
// THE PROBLEM THIS SOLVES. Añejo changed a real kitchen procedure on 2026-09-15 — two photos before
// Mark ready, plus a prep clock — and the person who cooks the food was never told. The training
// modules were updated the same day (public/hub/training.html), but a completion row from months ago
// still said "trained", so nothing prompted her and nothing told the owner she was owed anything.
//
// A module therefore has a VERSION. A completion is only current if it recorded that same version.
// Anything else — an older version, or NULL because the row predates versioning — is out of date,
// and out of date is not the same as never trained (the owner needs to see the difference).
//
// ADDING AN UPDATE LATER. Bump that module's version in CURRENT_VERSION to a new date-stamped
// string, and add an UPDATES entry for that exact version with the bullets. Both are required: a
// version with no update text bumps everyone to "due" with nothing to show them, so `updateFor()`
// returns null and the sign-in gate stays quiet — the bullets ARE the reason to interrupt someone.
//
// SPANISH IS CURATED HERE, not machine-translated and not in the i18n dictionary: these lines are
// read by a cook whose HUB defaults to Spanish, and they describe a step that gates her work. The
// HUB chrome around them (the gate's title and button) lives in public/hub/assets/hub-i18n.js.

// Before versioning existed there was one training generation: the role tutorials as first shipped.
// A NULL `version` column means a row from that generation, so it normalizes to this string — which
// is why a driver who trained last year is still current (nothing changed for drivers) while a cook
// who trained the same day is not (the photo gate changed for her).
export const BASELINE_VERSION = '2026-06-23-baseline';

// module key → the version a completion must carry to count as current. The module IS the role (the
// staff-role list in roles.js), which is what /api/hub/owner/training-status joins on.
export const CURRENT_VERSION = Object.freeze({
  owner: BASELINE_VERSION,
  kitchen: '2026-09-16-photo-gate',
  driver: BASELINE_VERSION,
  marketing: BASELINE_VERSION,
  vendor: BASELINE_VERSION,
});

// version string → what changed, in the words the person doing the job would use. Keyed by VERSION
// rather than by module so an older completion never gets shown a newer module's changes by accident,
// and so the next update is a new key beside this one instead of an edit over the top of it.
export const UPDATES = Object.freeze({
  '2026-09-16-photo-gate': Object.freeze({
    module: 'kitchen',
    // One line. It is the whole reason the person is being stopped at sign-in.
    headline: Object.freeze({
      en: 'Marking an order ready changed: two photos are now required, and every order has a prep clock.',
      es: 'Marcar un pedido como listo cambió: ahora se requieren dos fotos, y cada pedido tiene un reloj de preparación.',
    }),
    changes: Object.freeze([
      Object.freeze({
        en: 'Before you mark an order ready, photograph the food inside the open container, then the container closed and packed.',
        es: 'Antes de marcar un pedido como listo, fotografía la comida dentro del envase abierto, y luego el envase cerrado y empacado.',
      }),
      Object.freeze({
        en: 'Mark Ready stays locked until both photos are saved. If an office changes its head count, the photos clear and you take them again.',
        es: 'Marcar Listo queda bloqueado hasta guardar las dos fotos. Si una oficina cambia su conteo, las fotos se borran y las tomas de nuevo.',
      }),
      Object.freeze({
        en: 'Each order now shows “Start by”, “Ready by”, and a countdown once you start prep — amber under five minutes, red when it runs over.',
        es: 'Cada pedido ahora muestra “Empezar a las”, “Listo a las”, y una cuenta regresiva al empezar la preparación — ámbar con menos de cinco minutos, rojo si se pasa.',
      }),
    ]),
  }),
});

/** The version `module` must have been completed at. Unknown module → null (never "due"). */
export function currentVersion(module) {
  return Object.prototype.hasOwnProperty.call(CURRENT_VERSION, module) ? CURRENT_VERSION[module] : null;
}

/**
 * The "what changed" block for `module`'s CURRENT version, or null when that version carries no
 * update text (every role but the kitchen today). Null is what keeps the sign-in gate quiet for a
 * role with nothing to say — see the note at the top.
 */
export function updateFor(module) {
  const v = currentVersion(module);
  const u = v ? UPDATES[v] : null;
  return u && u.module === module ? u : null;
}

// A stored completion version → the generation it belongs to. NULL/'' is the pre-versioning
// generation, NOT "whatever is current": backfilling it to current would silently mark the whole
// roster as having seen a change none of them has seen.
function storedVersion(v) {
  const s = v == null ? '' : String(v).trim();
  return s || BASELINE_VERSION;
}

/**
 * Status of one staffer against one module. `row` is their training_completions row, or null/undefined
 * when they have never completed it.
 *
 * Returns { module, current_version, completed_version, completed_at, lang, state, due, update }:
 *   state 'never'    no completion row at all — the owner's "has not been trained"
 *         'outdated' trained, but at an older (or pre-versioning) version — owes the new material
 *         'current'  trained at the current version
 *   due      true for 'never' and 'outdated'. It answers "does this person owe training?", which is
 *            the owner's question. It is NOT on its own the answer to "interrupt them at sign-in" —
 *            that needs `update` too, so a role with no update never blocks anyone.
 *   update   the bilingual block from UPDATES, or null.
 */
export function trainingStatus(module, row) {
  const current = currentVersion(module);
  const update = updateFor(module);
  if (!current) {
    return { module, current_version: null, completed_version: null, completed_at: null, lang: null, state: 'current', due: false, update: null };
  }
  if (!row || !row.completed_at) {
    return { module, current_version: current, completed_version: null, completed_at: null, lang: null, state: 'never', due: true, update };
  }
  const completed = storedVersion(row.version);
  const state = completed === current ? 'current' : 'outdated';
  return {
    module,
    current_version: current,
    completed_version: completed,
    completed_at: row.completed_at,
    lang: row.lang || null,
    state,
    due: state !== 'current',
    update: state === 'current' ? null : update,
  };
}

/**
 * Should this staffer be STOPPED at sign-in? Only when they owe training AND there is update text to
 * show them. "Complete that training first" is an interruption, and an interruption with nothing to
 * read is just a door in the way.
 */
export function shouldPromptAtSignIn(status) {
  return !!(status && status.due && status.update);
}
