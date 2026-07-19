// /api/hub/owner/content — owner-only authoring for the docs library
// (manuals / policies / procedures / recipes) + recurring-reminder templates.
//   GET  ?type=&q=        → list (no bodies; body_len), newest first, archived included + flagged
//   GET  ?id=doc_xxx      → single full doc (for edit-in-place; includes image_key). When the
//                           doc links a recipe (recipe_id), also returns { recipe } with the
//                           Recipe COGS v1 fields (est_cost_cents, cost_updated_at, cost_breakdown)
//                           so the editor can show "Calc cost" for recipe-type docs.
//   POST { action:'create',  doc_type, title, body?, role_scope?, image_dataurl? }
//   POST { action:'update',  id, title?, body?, role_scope?, image_dataurl? }   (bumps version)
//   POST { action:'archive'|'restore', id }
//   POST { action:'remove_image', id }                          → clears docs.image_key (NULL)
//   POST { action:'create_reminder', title, reminder_type, team, body?, due_at?,
//          target_staff_id?, recurrence:{freq,at,dow?} }         → one-shot OR recurring template
//   POST { action:'list_reminders' }                            → { templates:[] } (is_template=1)
//   POST { action:'cancel_reminder', id }                       → soft-cancel (NEVER deletes)
// "Remove" is always a soft archive (active=0) — rows are NEVER deleted.
// Reads by staff fire doc.viewed elsewhere (kitchen/docs); authoring is not tracked.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { id as genId, now, today, parseJson, toJson } from '../../../_lib/hub.js';
import { putMedia } from '../../../_lib/media.js';

// 'brand' = the owner-authored Brand & Standards brief that grounds the Creative Studio AI.
const DOC_TYPES = ['brand', 'manual', 'policy', 'procedure', 'recipe', 'content_brief'];
const SCOPE_ROLES = ['owner', 'kitchen', 'driver', 'vendor'];

// ── Creative Studio: success conversations → brief + receipt ──────────────────
// A "success conversation" is a REAL 4–5★ post-delivery review with a comment
// (delivery_feedback). The Studio collects them so Dayan can turn a genuine
// customer moment into content — never a fabricated testimonial.
function maskClient(email) {
  const local = String(email || '').split('@')[0].trim();
  if (!local) return 'a customer';
  // first name / handle only, capitalized — enough for the owner to recognize, no full PII in content
  return local.charAt(0).toUpperCase() + local.slice(1, 14).replace(/[._-].*$/, '');
}
function stars(n) { const r = Math.max(0, Math.min(5, Number(n) || 0)); return '★'.repeat(r) + '☆'.repeat(5 - r); }
function fbDate(created_at) { try { return new Date(Number(created_at) * 1000).toISOString().slice(0, 10); } catch { return ''; } }

// Draft body = a RECEIPT (honest source-of-truth, verbatim + attributed) + a BRIEF
// (the content plan grounded in the brand voice). Dayan reviews/edits before anything ships.
function buildBriefBody({ fb, angle, brand }) {
  const brandLine = brand && brand.title ? brand.title : 'Brand & Standards Brief';
  const quote = fb ? String(fb.comment || '').trim() : '';
  const receipt = fb
    ? [
        '## 🧾 Receipt — real customer, verbatim (do not alter the quote)',
        `- **Source:** delivery_feedback \`${fb.id}\`${fb.order_id ? ' · order `' + fb.order_id + '`' : ''}`,
        `- **Customer:** ${maskClient(fb.client_email)}`,
        `- **Rating:** ${stars(fb.rating)} (${Number(fb.rating) || 0}/5)`,
        `- **Date:** ${fbDate(fb.created_at)}`,
        `- **What they actually said:**`,
        `  > ${quote.replace(/\n+/g, '\n  > ')}`,
        '',
        '_This receipt is the proof this testimonial is real. Any content below must stay true to it — never embellish the quote or invent details._',
      ].join('\n')
    : [
        '## 🧾 Receipt — source',
        '- **Source:** manual (no linked review) — supply the real customer moment before publishing.',
        '- _No fabricated testimonials: attach a real 4–5★ review or Dayan-verified quote before this ships._',
      ].join('\n');

  const pull = quote ? `"${quote.replace(/^["']|["']$/g, '')}" — ${fb ? maskClient(fb.client_email) : 'a customer'}` : '(add a verified customer quote)';
  const brief = [
    '## 📝 Brief — content plan',
    `- **Angle:** ${angle || 'Let the customer’s own words carry it — real Cuban catering, real reaction.'}`,
    '- **Pull-quote (ready to use, verbatim):**',
    `  > ${pull}`,
    '- **Suggested assets:**',
    '  - Instagram / Facebook post (quote card in Añejo brand colors)',
    '  - Website testimonial block (Añejo Catering — Success Stories)',
    '  - If ≥4★ and routed to Google: amplify the Google review',
    `- **Voice + guardrails:** follow **${brandLine}** — warm, proud, Cuban-family tone; Lake Worth / Palm Beach County only; no invented numbers or claims.`,
    '- **Owner review:** Dayan edits/approves this brief before any asset is produced or posted.',
  ].join('\n');

  return `# Success story → content\n\n${receipt}\n\n${brief}\n`;
}
const REMINDER_TYPES = ['prep', 'sanitation', 'order_cutoff', 'temp_check', 'custom'];
const REMINDER_TEAMS = ['kitchen', 'delivery'];

// Normalize a role_scope payload → array of known roles, or null (= visible to all staff).
function cleanScope(v) {
  if (!Array.isArray(v)) return null;
  const roles = v.map((r) => String(r)).filter((r) => SCOPE_ROLES.includes(r));
  return roles.length ? roles : null;
}

// Validate a recurrence payload → { freq, at, dow? } or null when 'none'/garbage.
function cleanRecurrence(v) {
  if (!v || typeof v !== 'object') return null;
  const freq = (v.freq || 'none').toString();
  if (freq !== 'daily' && freq !== 'weekly') return null;
  const at = /^(\d{1,2}):(\d{2})$/.test(String(v.at || '')) ? String(v.at) : '09:00';
  const out = { freq, at };
  if (freq === 'weekly') {
    const dow = Number(v.dow);
    out.dow = Number.isInteger(dow) && dow >= 0 && dow <= 6 ? dow : 1; // default Monday
  }
  return out;
}

// Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD in tz.
function dowFor(dateStr, tz = 'America/New_York') {
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(dateStr + 'T12:00:00Z'));
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
  } catch {
    return new Date(dateStr + 'T12:00:00Z').getUTCDay();
  }
}

// Unix ms for `${dateStr} ${HH:MM}` in America/New_York (approx via longOffset).
function dueAtFor(dateStr, hhmm, tz = 'America/New_York') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '09:00'));
  const hh = m ? Math.min(23, parseInt(m[1], 10)) : 9;
  const mm = m ? Math.min(59, parseInt(m[2], 10)) : 0;
  let offMin = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date(dateStr + 'T12:00:00Z'));
    const tzn = (parts.find((p) => p.type === 'timeZoneName') || {}).value || 'GMT+00:00';
    const om = /GMT([+-])(\d{2}):?(\d{2})/.exec(tzn);
    if (om) {
      const sign = om[1] === '-' ? -1 : 1;
      offMin = sign * (parseInt(om[2], 10) * 60 + parseInt(om[3], 10));
    }
  } catch { /* default offset 0 */ }
  const baseUtc = Date.parse(dateStr + 'T00:00:00Z');
  return baseUtc + (hh * 60 + mm - offMin) * 60 * 1000;
}

// Next occurrence (unix ms) for a recurrence, starting from today in tz.
function nextOccurrence(rec, tz = 'America/New_York') {
  const day = today(tz);
  if (rec.freq === 'daily') {
    const t = dueAtFor(day, rec.at, tz);
    return t > now() ? t : t + 24 * 3600 * 1000;
  }
  // weekly: find the next date whose dow matches.
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.parse(day + 'T12:00:00Z') + i * 24 * 3600 * 1000);
    const ds = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    if (dowFor(ds, tz) === rec.dow) {
      const t = dueAtFor(ds, rec.at, tz);
      if (t > now()) return t;
    }
  }
  return dueAtFor(day, rec.at, tz);
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const docId = (url.searchParams.get('id') || '').trim();

  // Single full doc for the editor panel.
  if (docId) {
    const doc = await env.DB.prepare('SELECT * FROM docs WHERE id = ?').bind(docId).first();
    if (!doc) return bad('Doc not found.', 404);

    let recipe = null;
    if (doc.recipe_id) {
      const r = await env.DB.prepare(
        'SELECT id, est_cost_cents, cost_updated_at, cost_breakdown FROM recipes WHERE id = ?'
      ).bind(doc.recipe_id).first();
      if (r) {
        recipe = {
          id: r.id,
          est_cost_cents: r.est_cost_cents == null ? null : Number(r.est_cost_cents),
          cost_updated_at: r.cost_updated_at || null,
          cost_breakdown: parseJson(r.cost_breakdown, []),
        };
      }
    }

    return json({
      ok: true,
      doc: {
        id: doc.id, doc_type: doc.doc_type, title: doc.title, body: doc.body || '',
        recipe_id: doc.recipe_id, role_scope: parseJson(doc.role_scope, null),
        version: doc.version, active: doc.active, image_key: doc.image_key || null,
        created_at: doc.created_at, updated_at: doc.updated_at,
      },
      recipe,
    });
  }

  // Library index — newest first, archived rows included and flagged via `active`.
  const type = (url.searchParams.get('type') || '').trim();
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();

  let stmt;
  const cols =
    "SELECT id, doc_type, title, recipe_id, role_scope, version, active, image_key, updated_at, LENGTH(COALESCE(body,'')) AS body_len FROM docs";
  if (type && DOC_TYPES.includes(type)) {
    stmt = env.DB.prepare(`${cols} WHERE doc_type = ? ORDER BY updated_at DESC`).bind(type);
  } else {
    stmt = env.DB.prepare(`${cols} ORDER BY updated_at DESC`);
  }
  const { results } = await stmt.all();

  const docs = (results || [])
    .filter((d) => !q || (d.title || '').toLowerCase().includes(q))
    .map((d) => ({
      id: d.id, doc_type: d.doc_type, title: d.title, recipe_id: d.recipe_id,
      role_scope: parseJson(d.role_scope, null), version: d.version,
      active: d.active, image_key: d.image_key || null, updated_at: d.updated_at, body_len: d.body_len,
    }));

  return json({ ok: true, docs });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const action = (b && b.action || '').toString().trim();
  const ts = now();

  // ---------- Creative Studio: success conversations ----------
  // Collect the current success conversations = real 4–5★ post-delivery reviews with a comment.
  if (action === 'list_success') {
    let rows = { results: [] };
    try {
      rows = await env.DB.prepare(
        "SELECT id, order_id, client_email, rating, comment, created_at FROM delivery_feedback " +
        "WHERE rating >= 4 AND TRIM(COALESCE(comment,'')) != '' ORDER BY created_at DESC LIMIT 100"
      ).all();
    } catch { /* table may not exist in a fresh env — return empty, never 500 */ }
    // which conversations already have a drafted brief (so the UI shows "drafted")
    let seeded = new Set();
    try {
      const d = await env.DB.prepare("SELECT body FROM docs WHERE doc_type='content_brief'").all();
      for (const r of (d.results || [])) { const m = String(r.body || '').match(/delivery_feedback `([^`]+)`/); if (m) seeded.add(m[1]); }
    } catch { /* ignore */ }
    const conversations = (rows.results || []).map((r) => ({
      id: r.id, rating: Number(r.rating) || 0, comment: r.comment || '',
      client: maskClient(r.client_email), date: fbDate(r.created_at), drafted: seeded.has(r.id),
    }));
    return json({ ok: true, conversations });
  }

  // Draft a content brief + receipt from a reviewed success conversation (or a manual angle).
  if (action === 'draft_content_brief') {
    const fbId = (b.feedback_id || '').toString().trim();
    const angle = (b.angle || '').toString().trim().slice(0, 400);
    let fb = null;
    if (fbId) {
      try { fb = await env.DB.prepare('SELECT * FROM delivery_feedback WHERE id = ?').bind(fbId).first(); }
      catch { /* ignore */ }
      if (!fb) return bad('Success conversation not found.', 404);
    }
    if (!fb && !angle) return bad('Pick a success conversation or provide an angle.');
    let brand = null;
    try { brand = await env.DB.prepare("SELECT title, body FROM docs WHERE doc_type='brand' AND active=1 ORDER BY updated_at DESC LIMIT 1").first(); }
    catch { /* ignore */ }
    const body = buildBriefBody({ fb, angle, brand });
    const docId = genId();
    const title = fb ? `Success story — ${maskClient(fb.client_email)} (${Number(fb.rating) || 0}★)` : `Content brief — ${angle.slice(0, 40) || 'new'}`;
    await env.DB.prepare(
      'INSERT INTO docs (id, doc_type, title, body, version, active, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(docId, 'content_brief', title, body, 1, 1, (ctx.staff && ctx.staff.id) || null, ts, ts).run();
    return json({ ok: true, id: docId, title, body });
  }

  // ---------- Docs ----------
  if (action === 'create') {
    const doc_type = (b.doc_type || '').toString().trim();
    if (!DOC_TYPES.includes(doc_type)) return bad('Invalid doc_type.');
    const title = (b.title || '').toString().trim();
    if (!title) return bad('Title is required.');
    const body = b.body == null ? null : String(b.body);
    const scope = cleanScope(b.role_scope);

    // Optional image attachment → R2 (gracefully skipped when R2 absent).
    let imageKey = null;
    if (b.image_dataurl) {
      const put = await putMedia(env, { kind: 'docimg', dataUrl: String(b.image_dataurl) });
      if (put && put.stored) imageKey = put.url;
    }

    const docId = genId('doc');
    await env.DB
      .prepare(
        'INSERT INTO docs (id, doc_type, title, body, role_scope, image_key, version, active, created_by, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)'
      )
      .bind(docId, doc_type, title, body, toJson(scope), imageKey, ctx.distinct_id || null, ts, ts)
      .run();
    return json({ ok: true, id: docId, version: 1, image_key: imageKey });
  }

  if (action === 'update') {
    const docId = (b.id || '').toString().trim();
    if (!docId) return bad('Missing doc id.');
    const doc = await env.DB.prepare('SELECT id, version FROM docs WHERE id = ?').bind(docId).first();
    if (!doc) return bad('Doc not found.', 404);

    const sets = [];
    const args = [];
    if (b.title !== undefined) {
      const title = (b.title || '').toString().trim();
      if (!title) return bad('Title cannot be empty.');
      sets.push('title=?'); args.push(title);
    }
    if (b.body !== undefined) { sets.push('body=?'); args.push(b.body == null ? null : String(b.body)); }
    if (b.role_scope !== undefined) { sets.push('role_scope=?'); args.push(toJson(cleanScope(b.role_scope))); }

    // Optional new image attachment → R2. Only overwrites image_key on a successful store.
    if (b.image_dataurl) {
      const put = await putMedia(env, { kind: 'docimg', dataUrl: String(b.image_dataurl) });
      if (put && put.stored) { sets.push('image_key=?'); args.push(put.url); }
    }
    if (!sets.length) return bad('Nothing to update.');

    sets.push('version=version+1');
    sets.push('updated_at=?'); args.push(ts);
    args.push(docId);
    await env.DB.prepare(`UPDATE docs SET ${sets.join(', ')} WHERE id=?`).bind(...args).run();
    return json({ ok: true, id: docId, version: (doc.version || 1) + 1 });
  }

  if (action === 'remove_image') {
    // Clears the attached image only — never deletes the doc/row.
    const docId = (b.id || '').toString().trim();
    if (!docId) return bad('Missing doc id.');
    const doc = await env.DB.prepare('SELECT id FROM docs WHERE id = ?').bind(docId).first();
    if (!doc) return bad('Doc not found.', 404);
    await env.DB.prepare('UPDATE docs SET image_key=NULL, updated_at=? WHERE id=?').bind(ts, docId).run();
    return json({ ok: true, id: docId, image_key: null });
  }

  if (action === 'archive' || action === 'restore') {
    const docId = (b.id || '').toString().trim();
    if (!docId) return bad('Missing doc id.');
    const doc = await env.DB.prepare('SELECT id FROM docs WHERE id = ?').bind(docId).first();
    if (!doc) return bad('Doc not found.', 404);
    // Soft archive only — never DELETE.
    await env.DB
      .prepare('UPDATE docs SET active=?, updated_at=? WHERE id=?')
      .bind(action === 'archive' ? 0 : 1, ts, docId)
      .run();
    return json({ ok: true, id: docId, active: action === 'archive' ? 0 : 1 });
  }

  // ---------- Reminders ----------
  if (action === 'create_reminder') {
    const title = (b.title || '').toString().trim();
    if (!title) return bad('Title is required.');
    const reminder_type = (b.reminder_type || '').toString().trim();
    if (!REMINDER_TYPES.includes(reminder_type)) return bad('Invalid reminder type.');
    const team = (b.team || '').toString().trim();
    if (!REMINDER_TEAMS.includes(team)) return bad('Team must be kitchen or delivery.');
    const body = (b.body || '').toString().trim() || null;

    let target = (b.target_staff_id || '').toString().trim() || null;
    if (target) {
      const t = await env.DB.prepare('SELECT id FROM staff WHERE id = ?').bind(target).first();
      if (!t) return bad('Target staff member not found.', 404);
    }

    const rec = cleanRecurrence(b.recurrence);

    if (rec) {
      // Recurring → insert a TEMPLATE row. due_at = next occurrence (informational);
      // the daily tick spawns concrete instances. acknowledged stays 0, not materialized yet.
      const due = nextOccurrence(rec);
      const rid = genId('rem');
      await env.DB.prepare(
        'INSERT INTO reminders (id, reminder_type, title, body, team, target_staff_id, due_at, recurrence, ' +
        'is_template, parent_id, last_materialized_date, acknowledged, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, 0, ?, ?)'
      ).bind(rid, reminder_type, title, body, team, target, due, toJson(rec), ts, ts).run();
      return json({ ok: true, id: rid, template: true });
    }

    // One-shot (freq 'none' / no recurrence). Requires an explicit due_at (unix ms).
    const due_at = Number(b.due_at);
    if (!Number.isFinite(due_at) || due_at <= 0) return bad('A due date/time (unix ms) is required.');
    const rid = genId('rem');
    await env.DB.prepare(
      'INSERT INTO reminders (id, reminder_type, title, body, team, target_staff_id, due_at, ' +
      'is_template, acknowledged, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)'
    ).bind(rid, reminder_type, title, body, team, target, due_at, ts, ts).run();
    return json({ ok: true, id: rid, template: false });
  }

  if (action === 'list_reminders') {
    const tpl = await env.DB.prepare(
      'SELECT * FROM reminders WHERE is_template = 1 ORDER BY created_at DESC LIMIT 100'
    ).all();
    const templates = ((tpl && tpl.results) || []).map((r) => ({
      id: r.id, reminder_type: r.reminder_type, title: r.title, body: r.body,
      team: r.team, target_staff_id: r.target_staff_id, due_at: r.due_at,
      recurrence: parseJson(r.recurrence, null),
      last_materialized_date: r.last_materialized_date || null,
      created_at: r.created_at,
    }));
    return json({ ok: true, templates });
  }

  if (action === 'cancel_reminder') {
    const rId = (b.id || '').toString().trim();
    if (!rId) return bad('Missing reminder id.');
    const rem = await env.DB.prepare('SELECT id, is_template, body FROM reminders WHERE id = ?').bind(rId).first();
    if (!rem) return bad('Reminder not found.', 404);
    // Soft-cancel only — NEVER delete.
    if (rem.is_template) {
      // Deactivate the template so the tick stops spawning instances; annotate the body.
      const note = '[canceled ' + today() + ']';
      const newBody = rem.body ? (rem.body + ' ' + note) : note;
      await env.DB.prepare(
        'UPDATE reminders SET is_template = 0, body = ?, updated_at = ? WHERE id = ?'
      ).bind(newBody, ts, rId).run();
    } else {
      // One-shot → mark acknowledged so it drops off the upcoming list.
      await env.DB.prepare(
        'UPDATE reminders SET acknowledged = 1, acknowledged_at = ?, updated_at = ? WHERE id = ?'
      ).bind(ts, ts, rId).run();
    }
    return json({ ok: true, id: rId });
  }

  return bad('Unknown action.');
};
