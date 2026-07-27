// Knowledge base: chunk, embed, and retrieve Añejo's manuals, SOPs and DBPR documents.
//
// THE PROBLEM THIS SOLVES. studio_context.js injects documents into every system prompt under a
// fixed character budget and clampJoin() silently drops the overflow. With one brand brief that is
// merely lossy (12% of the current brief is already being cut). With a real document library it is
// dangerous: upload 200 pages of DBPR material and ~98% never reaches the model, while the Studio
// answers food-safety and licensing questions with complete confidence from the 2% that fit.
//
// Retrieval inverts that. Every document is chunked and embedded once; at question time we embed
// the question and pull back only the passages that actually bear on it. Volume stops mattering —
// 10 pages and 10,000 pages both retrieve the same handful of relevant passages.
//
// EVERY RETRIEVED PASSAGE CARRIES ITS SOURCE. For DBPR and food safety, "the AI said so" is not an
// acceptable answer; a human has to be able to check the manual. Citations are not a nicety here.

const EMBED_MODEL = '@cf/baai/bge-m3';   // multilingual on purpose: Añejo operates in EN and ES,
                                         // and an English-only embedder cannot match a Spanish
                                         // question against an English SOP.
export const EMBED_DIMS = 1024;

// Chunking. Big enough to hold a complete procedure step with its context, small enough that a
// retrieved passage is mostly signal. The overlap stops a rule from being split down the middle
// and losing its qualifier ("...unless the product is held below 41°F").
const CHUNK_CHARS = 1400;
const CHUNK_OVERLAP = 200;
const MAX_EMBED_BATCH = 50;

const clean = (s) => String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

/**
 * Split markdown into chunks, remembering the nearest heading and page marker so a retrieved
 * passage can say WHERE it came from. Prefers to break on paragraph boundaries.
 */
export function chunkMarkdown(md) {
  const text = clean(md);
  if (!text) return [];

  const lines = text.split('\n');
  const chunks = [];
  let buf = '';
  let heading = null;
  let page = null;
  let bufHeading = null;
  let bufPage = null;

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push({ text: t, heading: bufHeading, page: bufPage });
    buf = '';
    bufHeading = heading;
    bufPage = page;
  };

  // A converted PDF often puts a whole paragraph — sometimes a whole page — on ONE line. Splitting
  // only on newlines then produced a single enormous chunk that blew past the embedding window and
  // retrieved uselessly. Break over-long lines on sentence boundaries first.
  const softLines = [];
  for (const raw of lines) {
    if (raw.length <= CHUNK_CHARS) { softLines.push(raw); continue; }
    let rest = raw;
    while (rest.length > CHUNK_CHARS) {
      const window = rest.slice(0, CHUNK_CHARS);
      // Prefer a sentence end, then any space, then a hard cut.
      let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
      if (cut < CHUNK_CHARS * 0.5) cut = window.lastIndexOf(' ');
      if (cut < CHUNK_CHARS * 0.5) cut = CHUNK_CHARS - 1;
      softLines.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1);
    }
    if (rest.trim()) softLines.push(rest.trim());
  }

  for (const line of softLines) {
    const h = /^#{1,6}\s+(.+)$/.exec(line);
    if (h) heading = h[1].trim().slice(0, 200);
    // toMarkdown emits "### Page 12" style markers for PDFs; keep the number for citations.
    const p = /^#{1,6}\s*Page\s+(\d+)\s*$/i.exec(line);
    if (p) page = parseInt(p[1], 10);

    if (bufHeading === null) bufHeading = heading;
    if (bufPage === null) bufPage = page;

    if (buf.length + line.length + 1 > CHUNK_CHARS && buf.trim()) {
      const carry = buf.slice(-CHUNK_OVERLAP);
      flush();
      buf = carry + '\n';
    }
    buf += line + '\n';
  }
  flush();

  return chunks.filter((c) => c.text.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').length >= 20);
}

/** Embed a list of strings. Returns an array of vectors (or null per failed item). */
export async function embedTexts(env, texts) {
  if (!env || !env.AI || !texts.length) return texts.map(() => null);
  const out = [];
  for (let i = 0; i < texts.length; i += MAX_EMBED_BATCH) {
    const batch = texts.slice(i, i + MAX_EMBED_BATCH);
    try {
      const r = await env.AI.run(EMBED_MODEL, { text: batch });
      const vecs = (r && (r.data || r.embeddings)) || [];
      for (let j = 0; j < batch.length; j++) out.push(Array.isArray(vecs[j]) ? vecs[j] : null);
    } catch {
      for (let j = 0; j < batch.length; j++) out.push(null);
    }
  }
  return out;
}

/**
 * Index one document's chunks. Writes chunk rows FIRST (so the text is never lost even if
 * embedding fails), then upserts vectors and marks the rows searchable.
 * Returns { indexed, failed }.
 */
export async function indexChunks(env, docId, chunks, meta = {}) {
  if (!env.DB || !chunks.length) return { indexed: 0, failed: 0 };
  const ts = Date.now();

  const rows = chunks.map((c, i) => ({
    id: `kbc_${docId}_${i}`,
    ord: i,
    heading: c.heading || null,
    page: c.page == null ? null : c.page,
    text: c.text,
  }));

  for (const r of rows) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO kb_chunks (id, doc_id, ord, heading, page, text, chars, embedded, created_at)
       VALUES (?,?,?,?,?,?,?,0,?)`
    ).bind(r.id, docId, r.ord, r.heading, r.page, r.text, r.text.length, ts).run();
  }

  if (!env.VECTORIZE) return { indexed: 0, failed: rows.length };

  const vectors = await embedTexts(env, rows.map((r) => r.text));
  const upserts = [];
  const okIds = [];
  rows.forEach((r, i) => {
    const values = vectors[i];
    if (!values) return;
    upserts.push({
      id: r.id,
      values,
      metadata: {
        doc_id: docId,
        title: String(meta.title || '').slice(0, 200),
        source_kind: String(meta.source_kind || 'manual'),
        authority: String(meta.authority || 'internal'),
        heading: r.heading ? String(r.heading).slice(0, 200) : '',
        page: r.page == null ? 0 : r.page,
        ord: r.ord,
      },
    });
    okIds.push(r.id);
  });

  if (upserts.length) {
    for (let i = 0; i < upserts.length; i += 100) {
      await env.VECTORIZE.upsert(upserts.slice(i, i + 100));
    }
    for (let i = 0; i < okIds.length; i += 50) {
      const slice = okIds.slice(i, i + 50);
      await env.DB.prepare(
        `UPDATE kb_chunks SET embedded = 1 WHERE id IN (${slice.map(() => '?').join(',')})`
      ).bind(...slice).run();
    }
  }

  return { indexed: upserts.length, failed: rows.length - upserts.length };
}

/** Remove a document's chunks from both stores. */
export async function deleteDocChunks(env, docId) {
  if (!env.DB) return;
  let ids = [];
  try {
    const r = await env.DB.prepare('SELECT id FROM kb_chunks WHERE doc_id = ?').bind(docId).all();
    ids = ((r && r.results) || []).map((x) => x.id);
  } catch { ids = []; }
  if (env.VECTORIZE && ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      try { await env.VECTORIZE.deleteByIds(ids.slice(i, i + 100)); } catch { /* best effort */ }
    }
  }
  try { await env.DB.prepare('DELETE FROM kb_chunks WHERE doc_id = ?').bind(docId).run(); } catch { /* */ }
}

/**
 * Retrieve passages relevant to a question.
 * Returns [{ text, title, heading, page, score, authority }] ordered best-first.
 */
export async function retrieve(env, question, { topK = 8, minScore = 0.35 } = {}) {
  const q = String(question || '').trim();
  if (!q || !env.VECTORIZE || !env.AI) return [];

  const [qv] = await embedTexts(env, [q.slice(0, 2000)]);
  if (!qv) return [];

  let matches = [];
  try {
    const res = await env.VECTORIZE.query(qv, { topK, returnMetadata: 'all' });
    matches = (res && res.matches) || [];
  } catch { return []; }

  // Below the floor a "match" is just the nearest thing in the index, not an answer. Feeding those
  // to the model invites it to build a confident answer out of unrelated text — the exact failure
  // mode that makes a DBPR answer dangerous.
  const good = matches.filter((m) => typeof m.score === 'number' && m.score >= minScore);
  if (!good.length) return [];

  // Pull the authoritative text from D1 rather than trusting vector metadata to carry it.
  const ids = good.map((m) => m.id);
  let byId = {};
  try {
    const r = await env.DB.prepare(
      `SELECT id, text, heading, page, doc_id FROM kb_chunks WHERE id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).all();
    for (const row of (r && r.results) || []) byId[row.id] = row;
  } catch { byId = {}; }

  return good.map((m) => {
    const row = byId[m.id] || {};
    const md = m.metadata || {};
    return {
      text: row.text || '',
      title: md.title || '',
      heading: row.heading || md.heading || '',
      page: row.page || (md.page || 0) || null,
      authority: md.authority || 'internal',
      score: m.score,
    };
  }).filter((x) => x.text);
}

/**
 * Format retrieved passages for injection, with citations attached to each one.
 * `budget` caps total characters so retrieval can never reintroduce the truncation problem
 * silently — anything dropped here is dropped from the LEAST relevant end, and the caller is
 * told how many made it.
 */
export function formatPassages(passages, budget = 12000) {
  const out = [];
  let used = 0;
  for (const p of passages) {
    const cite = [p.title, p.heading, p.page ? `p.${p.page}` : ''].filter(Boolean).join(' · ');
    const block = `[${cite || 'Añejo document'}]${p.authority === 'regulatory' ? ' (REGULATORY)' : ''}\n${p.text}`;
    if (used + block.length > budget) break;
    out.push(block);
    used += block.length;
  }
  return { text: out.join('\n\n---\n\n'), used: out.length };
}
