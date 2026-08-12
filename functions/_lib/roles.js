// Role resolution + guard for HUB routes, built on the existing session helpers.
//   const ctx = await requireRole(request, env, ['owner','kitchen']);
//   if (ctx instanceof Response) return ctx;   // 401/403 already formed
//   ctx => { role, distinct_id, team, email, type, staff }
// Files under functions/_lib are not routed.
import { currentUser } from './session.js';
import { json } from './util.js';

// 'marketing' — the Marketing Expert / strategy manager (added 2026-08-11). She runs the
// marketing system daily, tests it end to end, and reports back to Dayan. Her remit is the
// marketing desk: the marketing workspace and its team, the website's own copy, affiliates,
// and communication. It is deliberately NOT the owner role: money (finance, payouts, autopay,
// pricing, invoices), the kitchen, the customer book, and staff administration stay with Dayan.
// See MARKETING_DESK below for the machine-readable version of that sentence.
export const HUB_ROLES = ['owner', 'kitchen', 'driver', 'marketing', 'trainer', 'client', 'vendor'];

// Roles a person can actually be EMPLOYED as — i.e. what a staff row's `role` may hold, and so
// what the owner's staff dropdown offers. 'trainer' and 'client' are in HUB_ROLES but are not
// staff: they come from the portal, not the roster.
// This is the list; call sites import it rather than re-typing the literal, which is how the
// previous role additions ended up enumerated inconsistently across a dozen files.
export const STAFF_ROLES = ['owner', 'kitchen', 'driver', 'marketing', 'vendor'];

// The marketing desk: who may reach a marketing/website/affiliate/communication surface.
// The owner keeps everything he had; the marketing expert is added alongside him. Import this
// rather than writing ['owner','marketing'] inline, so widening or narrowing her remit later is
// one edit and not a grep.
export const MARKETING_DESK = ['owner', 'marketing'];

// Teams a staff row may belong to. 'marketing' is the marketing expert's own team — she is the
// lead of it, which is what gives her visibilityScope() over the marketing team's records
// without giving her the owner's all:true.
export const STAFF_TEAMS = ['kitchen', 'delivery', 'marketing', 'training', 'front_office', 'vendors'];

// Map a raw session object to a normalized role context.
// Staff sessions:   { type:'staff',   uid, role, team, email }
// Trainer sessions: { type:'trainer', uid, email }       → role 'trainer'
// Client sessions:  { type:'client',  email, [uid] }     → role 'client'
function contextFromSession(sess) {
  if (!sess) return null;
  if (sess.type === 'staff') {
    return {
      type: 'staff',
      role: sess.role || 'kitchen',
      distinct_id: sess.uid || null,
      team: sess.team || null,
      email: sess.email || null,
      is_lead: !!sess.is_lead,
    };
  }
  if (sess.type === 'trainer') {
    return { type: 'trainer', role: 'trainer', distinct_id: sess.uid || null, team: 'training', email: sess.email || null };
  }
  if (sess.type === 'client') {
    return { type: 'client', role: 'client', distinct_id: sess.uid || null, team: null, email: sess.email || null };
  }
  return null;
}

// Resolve the current role context for a request, or null if unauthenticated.
export async function currentRole(env, request) {
  const sess = await currentUser(env, request);
  return contextFromSession(sess);
}

// Load the staff record for the current session (or null). Requires env.DB.
export async function currentStaff(env, request) {
  const ctx = await currentRole(env, request);
  if (!ctx || ctx.type !== 'staff' || !env.DB) return null;
  const where = ctx.distinct_id ? 'id=?' : 'email=?';
  const arg = ctx.distinct_id || ctx.email;
  if (!arg) return null;
  return env.DB.prepare(`SELECT * FROM staff WHERE ${where}`).bind(arg).first();
}

// Guard: returns the role context, or a Response (401/403) to return directly.
// Staff sessions are re-checked against staff.active so a deactivated employee's
// still-unexpired session loses access immediately, not at idle timeout.
export async function requireRole(request, env, allowedRoles = []) {
  const ctx = await currentRole(env, request);
  if (!ctx) return json({ error: 'Not signed in.' }, 401);
  if (allowedRoles.length && !allowedRoles.includes(ctx.role)) {
    return json({ error: 'Forbidden for this role.' }, 403);
  }
  if (ctx.type === 'staff' && env && env.DB) {
    const where = ctx.distinct_id ? 'id=?' : 'email=?';
    const arg = ctx.distinct_id || ctx.email;
    if (arg) {
      try {
        const row = await env.DB.prepare(`SELECT active FROM staff WHERE ${where}`).bind(arg).first();
        if (!row || !row.active) return json({ error: 'Account deactivated.' }, 401);
      } catch { /* schema without staff table (early envs) — fall through */ }
    }
  }
  return ctx;
}

// Guard specifically for staff (any staff role).
export function requireStaff(request, env) {
  return requireRole(request, env, STAFF_ROLES);
}

// Visibility scope for list endpoints (manager/lead tier):
//   owner            → everything   ({ all:true })
//   lead             → their whole team ({ team })
//   regular staff    → only themselves ({ self: staff_id })
// Endpoints use this to decide whether to filter a query to one person or a team.
export function visibilityScope(ctx) {
  if (!ctx || ctx.type !== 'staff') return { self: ctx ? ctx.distinct_id : null };
  if (ctx.role === 'owner') return { all: true };
  if (ctx.is_lead) return { team: ctx.team, lead: true };
  return { self: ctx.distinct_id };
}

// True if ctx may view/act on resources owned by `targetStaffId` (with that target's team).
export function canSeeStaff(ctx, targetStaffId, targetTeam) {
  if (!ctx) return false;
  if (ctx.role === 'owner') return true;
  if (ctx.distinct_id && ctx.distinct_id === targetStaffId) return true;
  if (ctx.is_lead && ctx.team && targetTeam && ctx.team === targetTeam) return true;
  return false;
}
