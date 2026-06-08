// DEV-ONLY instant staff login for the local HUB walkthrough.
//   GET /api/dev/login?role=owner|kitchen|driver
// Reusable (unlike single-use magic links). Creates a staff session and drops you
// into /hub/. HARD-GUARDED to localhost: returns 404 on any non-local host, so it
// can never act as a backdoor on the deployed site (prod host is anejocateringco.com).
import { createSession, sessionCookie, isSecureRequest } from '../../_lib/session.js';
import { json } from '../../_lib/util.js';

const STAFF = {
  owner:   { uid: 'stf_owner',  role: 'owner',   team: 'front_office', email: 'owner@anejo.test' },
  kitchen: { uid: 'stf_chef',   role: 'kitchen', team: 'kitchen',      email: 'chef@anejo.test' },
  driver:  { uid: 'stf_driver', role: 'driver',  team: 'delivery',     email: 'driver@anejo.test' },
};

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const host = url.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
  if (!isLocal) return json({ error: 'Not found' }, 404);

  const who = STAFF[(url.searchParams.get('role') || 'owner').toLowerCase()];
  if (!who) return json({ error: 'Unknown role. Use role=owner|kitchen|driver.' }, 400);

  const sess = await createSession(env, { type: 'staff', uid: who.uid, role: who.role, team: who.team, email: who.email });
  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}/hub/`, 'Set-Cookie': sessionCookie(sess, undefined, isSecureRequest(request)) },
  });
};
