// Auth guards for trainer API routes.
import { currentUser } from './session.js';
import { json } from './util.js';

// Returns the trainer session, or null if not authed (or the partner has been removed).
export async function trainerSession(env, request) {
  const u = await currentUser(env, request);
  if (!(u && u.type === 'trainer' && u.uid)) return null;
  if (!await trainerIsActive(env, u.uid)) return null;
  return u;
}

export async function trainerIsActive(env, uid) {
  if (!uid) return false;
  // Honor the owner's "remove": a deactivated partner's live session stops working immediately.
  // An unavailable roster cannot establish access; missing rows and lookup failures deny it.
  try {
    const row = await env.DB.prepare('SELECT COALESCE(active,1) active FROM trainers WHERE id=?').bind(uid).first();
    if (!row || row.active !== 1) return false;
  } catch { return false; }
  return true;
}

// Convenience: throws a Response (401) if not a trainer. Usage:
//   const sess = await requireTrainer(env, request); if (sess instanceof Response) return sess;
export async function requireTrainer(env, request) {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ error: 'Not signed in.' }, 401);
  return sess;
}
