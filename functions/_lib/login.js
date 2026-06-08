// Shared login helpers: identifier normalization + staff lookup. _lib is not routed.
import { isEmail } from './util.js';

// Normalize a raw identifier into { kind, value }.
//   email  → lowercased email
//   phone  → digits only (last 10+ kept; US-friendly), for tolerant matching
export function normalizeIdentifier(raw) {
  const s = (raw || '').trim();
  if (!s) return { kind: 'unknown', value: '' };
  if (isEmail(s)) return { kind: 'email', value: s.toLowerCase() };
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length >= 7) return { kind: 'phone', value: digits };
  return { kind: 'unknown', value: s };
}

// Find an active-or-inactive staff row by email or phone. Returns the row or null.
// Phone match is tolerant: compares the trailing 10 digits to dodge +1 / formatting drift.
export async function findStaff(env, ident) {
  if (!env.DB) return null;
  if (ident.kind === 'email') {
    return env.DB.prepare('SELECT * FROM staff WHERE lower(email)=?').bind(ident.value).first();
  }
  if (ident.kind === 'phone') {
    const last10 = ident.value.slice(-10);
    // Compare digit-stripped phone column to the trailing 10 digits.
    return env.DB
      .prepare(
        "SELECT * FROM staff WHERE replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')','') LIKE ?"
      )
      .bind('%' + last10)
      .first();
  }
  return null;
}

// Is this email a known trainer or client (so we route them to magic-link sign-in)?
export async function findPortalUser(env, email) {
  if (!env.DB) return null;
  const tr = await env.DB.prepare('SELECT id FROM trainers WHERE lower(email)=?').bind(email).first();
  if (tr) return 'trainer';
  const cl = await env.DB.prepare('SELECT id FROM clients WHERE lower(email)=?').bind(email).first();
  if (cl) return 'client';
  return null;
}
