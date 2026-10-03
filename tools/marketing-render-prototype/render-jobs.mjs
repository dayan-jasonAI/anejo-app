/** Local durable bookkeeping prototype; no rendering, storage, or publication integration.
 * Caller installs render-jobs.sql. DB contract is D1's prepare().bind().first()/run().
 * A rendered state records an asserted output receipt only, never approval/attachment/audit.
 * Caller supplies trusted current epoch milliseconds. Integration must recheck the current
 * post revision and source before attachment; descriptor binding does not prove freshness.
 * The private consumer uses postRevision from draft-revisions.sql, not a timestamp.
 * Claims enforce per-job exclusivity, not global concurrency or renderer resource readiness.
 */

const FIELDS = ['sourceKey', 'sourceSha256', 'sourceVersionId', 'sourceMetadataSha256', 'postId', 'postRevision', 'mediaId', 'rendererVersion', 'templateId', 'optionsHash'];
const MAX_ATTEMPTS = 3;

export class RenderJobError extends Error {
  constructor(code) { super(code); this.name = 'RenderJobError'; this.code = code; }
}
function string(value, name, max = 1024) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value))
    throw new RenderJobError(`invalid_${name}`);
  return value;
}
function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new RenderJobError(`invalid_${name}`);
  return value;
}
function exactObject(value, fields, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some(k => !Object.hasOwn(value, k)))
    throw new RenderJobError(`invalid_${name}`);
}
function digest(value, name) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new RenderJobError(`invalid_${name}`);
  return value;
}
function canonicalDescriptor(value) {
  exactObject(value, FIELDS, 'descriptor');
  return Object.fromEntries(FIELDS.map(k => [k, k === 'postRevision' ? integer(value[k], k)
    : k === 'sourceSha256' || k === 'sourceMetadataSha256' || k === 'optionsHash' ? digest(value[k], k)
    : string(value[k], k, k === 'sourceVersionId' ? 256 : 1024)]));
}
function canonicalReceipt(value) {
  exactObject(value, ['outputKey', 'sha256', 'outputBytes', 'width', 'height'], 'receipt');
  return { outputKey: string(value.outputKey, 'outputKey'), sha256: digest(value.sha256, 'sha256'),
    outputBytes: integer(value.outputBytes, 'outputBytes', 1), width: integer(value.width, 'width', 1),
    height: integer(value.height, 'height', 1) };
}
function job(row) {
  if (!row) return null;
  return { id: row.id, actorId: row.actor_id, requestId: row.request_id, fingerprint: row.fingerprint,
    descriptor: JSON.parse(row.descriptor_json), status: row.status, attempts: row.attempts,
    createdAt: row.created_at, updatedAt: row.updated_at, leaseToken: row.lease_token,
    leaseUntil: row.lease_until, receipt: row.receipt_json ? JSON.parse(row.receipt_json) : null,
    errorCode: row.error_code };
}

export function createRenderJobStore(db) {
  if (!db || typeof db.prepare !== 'function') throw new RenderJobError('invalid_database');
  const first = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const run = (sql, ...args) => db.prepare(sql).bind(...args).run();
  const identity = (actorId, id) => [string(actorId, 'actorId', 256), string(id, 'id', 256)];
  return Object.freeze({
    async enqueue({ actorId, requestId, descriptor, now }) {
      identity(actorId, requestId); integer(now, 'now');
      const descriptorJson = JSON.stringify(canonicalDescriptor(descriptor));
      // Canonical fixed-order fields bind the exact source/render/template/options request.
      const fingerprint = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(descriptorJson))), byte => byte.toString(16).padStart(2, '0')).join('');
      const inserted = await first(`INSERT INTO prototype_render_jobs
        (id, actor_id, request_id, fingerprint, descriptor_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)
        ON CONFLICT(actor_id, request_id) DO NOTHING RETURNING *`,
      globalThis.crypto.randomUUID(), actorId, requestId, fingerprint, descriptorJson, now, now);
      if (inserted) return { job: job(inserted), replayed: false };
      const existing = await first('SELECT * FROM prototype_render_jobs WHERE actor_id = ? AND request_id = ?', actorId, requestId);
      if (!existing) throw new RenderJobError('enqueue_conflict_missing');
      // Compare canonical bytes as well as hash: even a hash collision must not reuse a job.
      if (existing.fingerprint !== fingerprint || existing.descriptor_json !== descriptorJson)
        throw new RenderJobError('request_conflict');
      return { job: job(existing), replayed: true };
    },
    async get({ actorId, jobId }) {
      identity(actorId, jobId);
      return job(await first('SELECT * FROM prototype_render_jobs WHERE actor_id = ? AND id = ?', actorId, jobId));
    },
    async claim({ actorId, now, leaseMs }) {
      string(actorId, 'actorId', 256); integer(now, 'now'); integer(leaseMs, 'leaseMs', 1);
      if (leaseMs > 300_000) throw new RenderJobError('invalid_leaseMs');
      const until = integer(now + leaseMs, 'leaseUntil');
      // Expired final attempts become terminal; no worker may silently retry them.
      await run(`UPDATE prototype_render_jobs SET status = 'dead', lease_token = NULL,
        lease_until = NULL, updated_at = ?, error_code = 'lease_expired_attempt_limit'
        WHERE actor_id = ? AND status = 'rendering' AND lease_until <= ? AND attempts >= ?`, now, actorId, now, MAX_ATTEMPTS);
      // Selection and claim are one atomic statement, including recovery of expired leases.
      return job(await first(`UPDATE prototype_render_jobs SET status = 'rendering',
        attempts = attempts + 1, lease_token = ?, lease_until = ?, updated_at = ?, error_code = NULL
        WHERE id = (SELECT id FROM prototype_render_jobs WHERE actor_id = ? AND attempts < ?
          AND (status IN ('queued','failed') OR (status = 'rendering' AND lease_until <= ?))
          ORDER BY created_at, id LIMIT 1)
        AND actor_id = ? AND attempts < ?
        AND (status IN ('queued','failed') OR (status = 'rendering' AND lease_until <= ?)) RETURNING *`,
      globalThis.crypto.randomUUID(), until, now, actorId, MAX_ATTEMPTS, now, actorId, MAX_ATTEMPTS, now));
    },
    async complete({ actorId, jobId, leaseToken, receipt, now }) {
      identity(actorId, jobId); string(leaseToken, 'leaseToken', 256); integer(now, 'now');
      const receiptJson = JSON.stringify(canonicalReceipt(receipt));
      const updated = await first(`UPDATE prototype_render_jobs SET status = 'rendered',
        receipt_json = ?, lease_token = NULL, lease_until = NULL, updated_at = ?, error_code = NULL
        WHERE actor_id = ? AND id = ? AND status = 'rendering' AND lease_token = ? AND lease_until > ? RETURNING *`,
      receiptJson, now, actorId, jobId, leaseToken, now);
      if (!updated) throw new RenderJobError('lease_not_live');
      return job(updated);
    },
    async fail({ actorId, jobId, leaseToken, errorCode, now }) {
      identity(actorId, jobId); string(leaseToken, 'leaseToken', 256); integer(now, 'now');
      if (typeof errorCode !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(errorCode))
        throw new RenderJobError('invalid_errorCode');
      const updated = await first(`UPDATE prototype_render_jobs
        SET status = CASE WHEN attempts >= ? THEN 'dead' ELSE 'failed' END,
        error_code = ?, lease_token = NULL, lease_until = NULL, updated_at = ?
        WHERE actor_id = ? AND id = ? AND status = 'rendering' AND lease_token = ? AND lease_until > ? RETURNING *`,
      MAX_ATTEMPTS, errorCode, now, actorId, jobId, leaseToken, now);
      if (!updated) throw new RenderJobError('lease_not_live');
      return job(updated);
    },
  });
}
