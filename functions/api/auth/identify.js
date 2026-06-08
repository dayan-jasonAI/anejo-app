// POST /api/auth/identify  { identifier }
// Unified login step 1: decide HOW this person signs in.
//   → staff (active, phone or email)     => { method: 'pin', name }
//   → trainer/client (email)             => { method: 'magic_link' }
//   → unknown                            => { method: 'magic_link' } if email, else 404-ish
// Deliberately low-disclosure: we don't confirm/deny portal accounts, but staff must be
// prompted for a PIN, so staff existence is implicitly surfaced (acceptable for an
// internal, owner-provisioned workforce app).
import { json, bad } from '../../_lib/util.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { normalizeIdentifier, findStaff, findPortalUser } from '../../_lib/login.js';

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'identify', limit: 20, windowSec: 60 });
  if (limited) return limited;
  if (!env.DB) return bad('Server not configured.', 500);

  let body;
  try { body = await request.json(); } catch { return bad('Invalid request.'); }
  const ident = normalizeIdentifier(body.identifier);
  if (ident.kind === 'unknown') return bad('Enter your phone number or email.');

  const staff = await findStaff(env, ident);
  if (staff && staff.active) {
    return json({
      ok: true,
      method: 'pin',
      name: staff.name || null,
      needs_setup: !staff.pin_hash,            // owner created them but no PIN yet
    });
  }

  if (ident.kind === 'email') {
    // Trainer/client (or unknown email) → magic link. portal_type drives the link flavor.
    const ptype = await findPortalUser(env, ident.value);
    return json({ ok: true, method: 'magic_link', email: ident.value, portal_type: ptype || 'trainer' });
  }

  // A phone number with no matching staff account.
  return json({ ok: false, error: 'No account found for that number. Ask the owner to add you.' }, 404);
};
