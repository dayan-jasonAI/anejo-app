// Team Training — the owner teaches the marketing team from the HUB, no local file, no redeploy.
//
//   GET                                  → rules + examples + the exact preview text a planner
//                                           would be handed right now (see functions/_lib/training.js)
//   POST { op:'add_rule', text }
//   POST { op:'update_rule', id, text }
//   POST { op:'delete_rule', id }
//   POST { op:'add_example', media_key, note, flag }   (media_key from team-training-upload.js)
//   POST { op:'update_example', id, note, flag }
//   POST { op:'delete_example', id }
//
// Owner-only. This route is CRUD; the read-side contract other code imports is
// functions/_lib/training.js's `trainingContext()` — this file never duplicates that rendering
// logic, it only writes the rows trainingContext() reads.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { getMedia } from '../../../_lib/media.js';
import { loadTraining, formatTraining, DEFAULT_MAX_CHARS } from '../../../_lib/training.js';
import { capture } from '../../../_lib/track.js';

const MAX_RULE_CHARS = 2000;
const MAX_NOTE_CHARS = 1000;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  // One load, reused for both the raw list AND the rendered preview below — trainingPreview()
  // in _lib/training.js does the same thing in one call for OTHER callers, but this route
  // already needs the raw rows for the list view, so loading twice would just be a wasted
  // D1 round trip on every page load.
  const { rules, examples } = await loadTraining(env);
  const rendered = formatTraining({ rules, examples }, DEFAULT_MAX_CHARS);
  const preview = { ...rendered, totalRules: rules.length, totalExamples: examples.length, maxChars: DEFAULT_MAX_CHARS };

  return json({
    ok: true,
    rules,
    examples: examples.map((e) => ({ ...e, url: `/api/hub/media/${e.media_key}` })),
    // The literal text a planner gets right now, plus whether the library has outgrown the
    // budget — this IS the "see what the team currently believes" feature the page exists for.
    preview,
    trained: !!(rules.length || examples.length),
    media: !!env.MEDIA,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = b && b.op;
  const who = ctx.email || ctx.distinct_id || null;

  // ---------- rules ----------
  if (op === 'add_rule') {
    const text = String((b && b.text) || '').trim().slice(0, MAX_RULE_CHARS);
    if (!text) return bad('Write the rule first.');
    const ts = now();
    const ruleId = id('rul');
    await env.DB.prepare(
      'INSERT INTO training_rules (id, text, active, created_by, created_at, updated_at) VALUES (?,?,1,?,?,?)'
    ).bind(ruleId, text, who, ts, ts).run();
    await capture(env, { event: 'training.rule_added', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { id: ruleId } });
    return json({ ok: true, id: ruleId });
  }

  if (op === 'update_rule') {
    const ruleId = String((b && b.id) || '').trim();
    const text = String((b && b.text) || '').trim().slice(0, MAX_RULE_CHARS);
    if (!ruleId) return bad('id is required.');
    if (!text) return bad('Write the rule first.');
    const r = await env.DB.prepare(
      'UPDATE training_rules SET text = ?, updated_at = ? WHERE id = ? AND active = 1'
    ).bind(text, now(), ruleId).run();
    if (!r || !r.meta || !r.meta.changes) return bad('Rule not found.', 404);
    return json({ ok: true, id: ruleId });
  }

  if (op === 'delete_rule') {
    const ruleId = String((b && b.id) || '').trim();
    if (!ruleId) return bad('id is required.');
    await env.DB.prepare('UPDATE training_rules SET active = 0, updated_at = ? WHERE id = ?').bind(now(), ruleId).run();
    return json({ ok: true, deleted: ruleId });
  }

  // ---------- examples ----------
  if (op === 'add_example') {
    const mediaKey = String((b && b.media_key) || '').trim();
    const note = String((b && b.note) || '').trim().slice(0, MAX_NOTE_CHARS);
    const flag = (b && b.flag) === 'bad' ? 'bad' : 'good';
    if (!mediaKey) return bad('Upload an image first.');
    if (!note) return bad('Add a note explaining the example — an unlabeled photo teaches nothing.');
    // The key must actually be something team-training-upload.js just stored, not a guess at
    // another kind's key (proof/receipt/docimg) — this route must never make a private photo
    // (e.g. a delivery proof or a receipt) reachable through the training library.
    if (!mediaKey.startsWith('training/')) return bad('That image was not uploaded here.');
    if (env.MEDIA) {
      const obj = await getMedia(env, mediaKey);
      if (!obj) return bad('That upload could not be found — try uploading again.', 404);
    }
    const ts = now();
    const exId = id('trex');
    await env.DB.prepare(
      'INSERT INTO training_examples (id, media_key, note, flag, active, created_by, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)'
    ).bind(exId, mediaKey, note, flag, who, ts, ts).run();
    await capture(env, { event: 'training.example_added', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { id: exId, flag } });
    return json({ ok: true, id: exId });
  }

  if (op === 'update_example') {
    const exId = String((b && b.id) || '').trim();
    const note = String((b && b.note) || '').trim().slice(0, MAX_NOTE_CHARS);
    const flag = (b && b.flag) === 'bad' ? 'bad' : 'good';
    if (!exId) return bad('id is required.');
    if (!note) return bad('Add a note explaining the example.');
    const r = await env.DB.prepare(
      'UPDATE training_examples SET note = ?, flag = ?, updated_at = ? WHERE id = ? AND active = 1'
    ).bind(note, flag, now(), exId).run();
    if (!r || !r.meta || !r.meta.changes) return bad('Example not found.', 404);
    return json({ ok: true, id: exId });
  }

  if (op === 'delete_example') {
    const exId = String((b && b.id) || '').trim();
    if (!exId) return bad('id is required.');
    // Best-effort: drop the underlying R2 object too, so a removed "never do this" photo doesn't
    // linger reachable at its old URL. Row deactivation is the source of truth either way — if
    // R2 cleanup fails, the example is still gone from the library and from trainingContext().
    if (env.MEDIA) {
      try {
        const row = await env.DB.prepare('SELECT media_key FROM training_examples WHERE id = ?').bind(exId).first();
        if (row && row.media_key) await env.MEDIA.delete(row.media_key);
      } catch { /* best effort */ }
    }
    await env.DB.prepare('UPDATE training_examples SET active = 0, updated_at = ? WHERE id = ?').bind(now(), exId).run();
    return json({ ok: true, deleted: exId });
  }

  return bad('Unknown op.');
};
