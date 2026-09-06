// POST /api/catering-uploads
//   JSON {op:"create"}                         -> short-lived upload session
//   raw JPEG/PNG/PDF + X-Upload-Session/name   -> private R2 object + D1 metadata
//
// These files are never exposed from a public URL. A successful /api/leads submission claims
// the session for its lead; only the authenticated owner route can read the resulting objects.
import { json, bad, id, now } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const SESSION_MS = 2 * 60 * 60 * 1000;

const TYPES = [
  { contentType: 'image/jpeg', ext: 'jpg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { contentType: 'image/png', ext: 'png', check: (b) => b.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v, i) => b[i] === v) },
  { contentType: 'application/pdf', ext: 'pdf', check: (b) => b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === '%PDF-' },
];

function cleanFilename(value, ext) {
  let name = '';
  try { name = decodeURIComponent(String(value || '')); } catch { name = String(value || ''); }
  name = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '-').trim().slice(0, 180);
  return name || `design-request.${ext}`;
}

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'catering-uploads', limit: 18, windowSec: 60 });
  if (limited) return limited;
  if (!env.DB || !env.MEDIA) return bad('Design uploads are briefly unavailable. You can still send a quote request without files.', 503);

  const incomingType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (incomingType === 'application/json') {
    let body;
    try { body = await request.json(); } catch { return bad('Invalid request body.'); }
    if (!body || body.op !== 'create') return bad('Unknown upload action.');
    const sessionId = id('cup');
    const created = now();
    try {
      await env.DB.prepare(
        'INSERT INTO catering_upload_sessions (id, created_at, expires_at) VALUES (?, ?, ?)'
      ).bind(sessionId, created, created + SESSION_MS).run();
      return json({ ok: true, session_id: sessionId, max_files: MAX_FILES, max_bytes: MAX_BYTES });
    } catch {
      return bad('Could not start a secure upload. Please try again.', 500);
    }
  }

  const sessionId = String(request.headers.get('x-upload-session') || '').trim();
  if (!/^cup_[0-9a-f]{20}$/.test(sessionId)) return bad('Invalid upload session.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return bad('Each design file must be 10MB or smaller.', 413);

  let session;
  try {
    session = await env.DB.prepare(
      'SELECT id, expires_at, claimed_lead_id FROM catering_upload_sessions WHERE id=?'
    ).bind(sessionId).first();
  } catch { return bad('Could not verify the upload session.', 500); }
  if (!session || session.claimed_lead_id || Number(session.expires_at) <= now()) {
    return bad('This upload session has expired. Please start the request again.', 410);
  }

  let countRow;
  try {
    countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM catering_attachments WHERE session_id=?'
    ).bind(sessionId).first();
  } catch { return bad('Could not check the uploaded files.', 500); }
  const slot = Number((countRow && countRow.n) || 0) + 1;
  if (slot > MAX_FILES) return bad('You can attach up to five files.', 400);

  let bytes;
  try { bytes = new Uint8Array(await request.arrayBuffer()); }
  catch { return bad('Could not read that file.'); }
  if (!bytes.length) return bad('That file is empty.');
  if (bytes.length > MAX_BYTES) return bad('Each design file must be 10MB or smaller.', 413);
  const type = TYPES.find((candidate) => candidate.check(bytes));
  if (!type) return bad('Use a PDF, JPG, or PNG file. The file contents did not match a supported format.');

  const attachmentId = id('cat');
  const filename = cleanFilename(request.headers.get('x-file-name'), type.ext);
  const month = new Date().toISOString().slice(0, 7);
  const key = `catering-requests/${month}/${sessionId}/${attachmentId}.${type.ext}`;
  try {
    await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: type.contentType },
      customMetadata: { attachmentId, sessionId },
    });
    await env.DB.prepare(
      `INSERT INTO catering_attachments
         (id, session_id, lead_id, slot, r2_key, filename, content_type, byte_size, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`
    ).bind(attachmentId, sessionId, slot, key, filename, type.contentType, bytes.length, now()).run();
  } catch {
    try { await env.MEDIA.delete(key); } catch { /* best-effort rollback */ }
    return bad('Could not securely store that file. Please try again.', 500);
  }

  return json({ ok: true, attachment_id: attachmentId, filename, content_type: type.contentType, bytes: bytes.length, slot });
};
