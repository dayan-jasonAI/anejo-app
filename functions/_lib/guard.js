// Auth guards for trainer API routes.
import { currentUser } from './session.js';
import { json } from './util.js';

// Returns the trainer session, or null if not authed.
export async function trainerSession(env, request) {
  const u = await currentUser(env, request);
  return u && u.type === 'trainer' && u.uid ? u : null;
}

// Convenience: throws a Response (401) if not a trainer. Usage:
//   const sess = await requireTrainer(env, request); if (sess instanceof Response) return sess;
export async function requireTrainer(env, request) {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ error: 'Not signed in.' }, 401);
  return sess;
}
