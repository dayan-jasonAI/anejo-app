// Owner knowledge base: upload manuals, SOPs and DBPR documents the Creative Studio can answer from.
//
//   GET                          → list documents with status + chunk counts
//   POST { op:'upload', ... }    → convert → chunk → embed → index one file
//   POST { op:'delete', id }     → remove a document and its vectors
//   POST { op:'reindex', id }    → re-chunk and re-embed from the stored original
//   POST { op:'ask', question }  → retrieval-only probe, so the owner can SEE what the AI would
//                                  find before trusting it on a real question
//
// Owner-only. Files are converted with env.AI.toMarkdown (PDF, DOCX, images, spreadsheets…), so a
// scanned DBPR notice works as well as a typed manual.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { id, now, toJson } from '../../../_lib/hub.js';
import { decodeDataUrl } from '../../../_lib/media.js';
import { chunkMarkdown, indexChunks, deleteDocChunks, retrieve, formatPassages } from '../../../_lib/knowledge.js';
import { capture } from '../../../_lib/track.js';

const KINDS = ['manual', 'policy', 'procedure', 'dbpr', 'training', 'other'];
// 20MB. toMarkdown handles big PDFs, but a Worker request body has limits and a 200-page manual
// is comfortably under this.
const MAX_BYTES = 20 * 1024 * 1024;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let items = [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, title, source_kind, filename, bytes, lang, authority, chunk_count, chars,
              status, error, active, created_at, updated_at
         FROM kb_documents ORDER BY created_at DESC LIMIT 200`
    ).all();
    items = (r && r.results) || [];
  } catch { items = []; }

  // Surface the true searchable total, not just what was uploaded. A document with status 'ready'
  // but 0 embedded chunks is NOT answerable, and the owner must be able to see that.
  let searchable = 0;
  try {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM kb_chunks WHERE embedded = 1').first();
    searchable = (c && c.n) || 0;
  } catch { searchable = 0; }

  return json({
    ok: true,
    items,
    searchable_chunks: searchable,
    vectorize: !!env.VECTORIZE,
    ai: !!env.AI,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = b && b.op;

  // ---------- ask: show what retrieval actually finds ----------
  if (op === 'ask') {
    const q = String((b && b.question) || '').trim();
    if (!q) return bad('question is required.');
    const passages = await retrieve(env, q, { topK: 8 });
    return json({
      ok: true,
      found: passages.length,
      passages: passages.map((p) => ({
        title: p.title, heading: p.heading, page: p.page,
        score: Math.round(p.score * 1000) / 1000,
        authority: p.authority,
        excerpt: p.text.slice(0, 400),
      })),
    });
  }

  // ---------- delete ----------
  if (op === 'delete') {
    const docId = String((b && b.id) || '').trim();
    if (!docId) return bad('id is required.');
    await deleteDocChunks(env, docId);
    await env.DB.prepare('DELETE FROM kb_documents WHERE id = ?').bind(docId).run();
    return json({ ok: true, deleted: docId });
  }

  // ---------- upload ----------
  if (op !== 'upload') return bad('Unknown op.');

  const title = String((b && b.title) || '').trim().slice(0, 200);
  const filename = String((b && b.filename) || '').trim().slice(0, 200);
  const sourceKind = KINDS.includes(b && b.source_kind) ? b.source_kind : 'manual';
  // DBPR and anything else marked regulatory outranks internal docs when they disagree — the
  // Studio is told this explicitly so it never "helpfully" follows a house SOP over the law.
  const authority = (b && b.authority) === 'regulatory' || sourceKind === 'dbpr' ? 'regulatory' : 'internal';
  const dataUrl = String((b && b.file) || '');
  const rawText = String((b && b.text) || '');

  if (!title && !filename) return bad('A title or filename is required.');
  if (!dataUrl && !rawText) return bad('Provide either a file or text.');

  if (!env.AI && !rawText) return bad('Document conversion is unavailable (Workers AI not bound).', 503);
  if (!env.VECTORIZE) return bad('Search index is unavailable (Vectorize not bound).', 503);

  const ts = now();
  const docId = id('kbd');
  let bytes = 0, mime = null, markdown = rawText;

  if (dataUrl) {
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return bad('file must be a base64 data URL.');
    bytes = decoded.bytes.length;
    mime = decoded.contentType;
    if (bytes > MAX_BYTES) return bad('File too large (20MB max).', 413);

    try {
      const res = await env.AI.toMarkdown({
        name: filename || (title + '.pdf'),
        blob: new Blob([decoded.bytes], { type: mime || 'application/octet-stream' }),
      });
      const first = Array.isArray(res) ? res[0] : res;
      if (!first || first.format === 'error' || !first.data) {
        return bad('Could not read that file. Try exporting it as a PDF or pasting the text.', 422);
      }
      markdown = first.data;
    } catch (e) {
      return bad('Document conversion failed: ' + ((e && e.message) || 'unknown error'), 502);
    }
  }

  const chunks = chunkMarkdown(markdown);
  if (!chunks.length) {
    return bad('No readable text found in that document. If it is a scan, the pages may be images without text.', 422);
  }

  await env.DB.prepare(
    `INSERT INTO kb_documents (id, title, source_kind, filename, mime, bytes, lang, authority,
       chunk_count, chars, status, active, uploaded_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,'indexing',1,?,?,?)`
  ).bind(
    docId, title || filename, sourceKind, filename || null, mime, bytes,
    (b && b.lang) || null, authority, chunks.length, markdown.length,
    ctx.distinct_id || null, ts, ts,
  ).run();

  const { indexed, failed } = await indexChunks(env, docId, chunks, {
    title: title || filename, source_kind: sourceKind, authority,
  });

  // Status tells the truth. 'ready' ONLY when every chunk is searchable; a partial index is
  // reported as such, because a document the owner believes is loaded but is half-missing is
  // exactly how a confident wrong DBPR answer happens.
  const status = indexed === 0 ? 'failed' : (failed > 0 ? 'partial' : 'ready');
  const err = failed > 0 ? `${failed} of ${chunks.length} passages could not be indexed — reindex to retry.` : null;

  await env.DB.prepare(
    'UPDATE kb_documents SET status = ?, error = ?, chunk_count = ?, updated_at = ? WHERE id = ?'
  ).bind(status, err, chunks.length, now(), docId).run();

  await capture(env, {
    event: 'knowledge.document_indexed',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { doc_id: docId, source_kind: sourceKind, authority, chunks: chunks.length, indexed, failed, status },
  });

  return json({
    ok: indexed > 0,
    id: docId,
    status,
    chunks: chunks.length,
    indexed,
    failed,
    chars: markdown.length,
    error: err,
  });
};
