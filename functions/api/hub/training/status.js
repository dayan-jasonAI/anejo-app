// GET /api/hub/training/status[?module=kitchen] — "do I owe training, and what changed?"
//   → { ok, module, own_module, current_version, completed_version, completed_at, state, due, prompt, update }
// No `module` → the signed-in staffer's own role module (what the sign-in gate asks for). A `module`
// argument answers for that module instead, which is how the training page shows "What's new" on a
// tutorial the reader is browsing rather than the one they are employed under.
// `update` is the bilingual what-changed block (EN + curated ES) so the caller can render it in the
// reader's own language; the kitchen HUB defaults to Spanish.
//
// This is what the sign-in gate in public/hub/assets/hub.js polls once per page load, so it answers
// for the signed-in person only and never needs a role argument. Owner-wide compliance is a
// different question with a different audience: /api/hub/owner/training-status.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff, STAFF_ROLES } from '../../../_lib/roles.js';
import { trainingStatus, shouldPromptAtSignIn, updateFor } from '../../../_lib/training_modules.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, STAFF_ROLES);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff session.', 401);

  // The module IS the role. Read the staff row's role rather than the session's: a role change
  // takes effect the moment the owner saves it, and the training someone owes must follow it.
  const ownModule = staff.role || ctx.role;
  const asked = new URL(request.url).searchParams.get('module');
  const module = asked && STAFF_ROLES.includes(asked) ? asked : ownModule;
  let row = null;
  try {
    row = await env.DB.prepare(
      'SELECT module, lang, version, completed_at FROM training_completions WHERE staff_id = ? AND module = ?'
    ).bind(staff.id, module).first();
  } catch (_) { /* a missing row and an unreadable table both mean "not known to be trained" */ }

  const status = trainingStatus(module, row);
  // `prompt` is "stop this person at sign-in", so it can only ever be true for their OWN module.
  // Browsing another role's tutorial must not raise a gate against a module they do not work under.
  const prompt = module === ownModule && shouldPromptAtSignIn(status);
  // `update` is what this reader still OWES (null once they are current); `module_update` is what the
  // module's current version changed, full stop. The training page shows the second one — the
  // "What's new" section is the module's own content and must not vanish the moment it is completed,
  // or a cook who wants to re-read the new procedure has nowhere to find it.
  return json({ ok: true, own_module: ownModule, ...status, prompt, module_update: updateFor(module) });
};
