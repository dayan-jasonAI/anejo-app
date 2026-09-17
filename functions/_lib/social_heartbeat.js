// Metadata only: no captions, recipients, tokens or raw provider errors.
export const SOCIAL_HEARTBEAT_KEY = 'social.tick_heartbeat';
export const STALE_MS = 5 * 60 * 1000;
const zero = () => ({ checked: 0, published: 0, failed: 0, missed: 0 });
export async function loadSocialHeartbeat(env, at = Date.now()) {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(SOCIAL_HEARTBEAT_KEY).first();
    if (!row?.value) return { status: 'unknown', reason: 'no_record' };
    const record = JSON.parse(row.value);
    if (!Number.isFinite(record.started_at) || record.started_at <= 0) return { status: 'unknown', reason: 'invalid_record' };
    const last = record.completed_at || record.started_at;
    const status = at - last > STALE_MS ? 'stale' : !record.completed_at ? 'running' : record.error ? 'error' : 'recent';
    return { ...record, status };
  } catch { return { status: 'unknown', reason: 'storage_unavailable' }; }
}
async function write(env, record) {
  try {
    await env.DB.prepare(`INSERT INTO app_settings (key,value,updated_by,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at
      WHERE CAST(json_extract(app_settings.value,'$.started_at') AS INTEGER) <= excluded.updated_at`)
      .bind(SOCIAL_HEARTBEAT_KEY,JSON.stringify(record),'social-tick',record.started_at).run();
    return true;
  } catch { return false; }
}
export async function recordSocialTick(env, source, run) {
  const prior = await loadSocialHeartbeat(env);
  const record = { started_at: Date.now(), completed_at: null, last_success_at: prior.last_success_at || null,
    source: source === 'cron' ? 'cron' : 'owner', error: null, counts: zero() };
  const savedStart = await write(env,record);
  let response;
  try {
    response = await run();
    const result = await response.clone().json();
    record.counts = { checked: Number(result.checked)||0, published: result.published?.length||0, failed: result.failed?.length||0, missed: result.missed?.length||0 };
    record.error = !response.ok || !result.ok ? 'tick_failed' : result.skipped ? 'instagram_not_configured' : record.counts.failed ? 'publish_failed' : record.counts.missed ? 'missed_schedule' : null;
    record.completed_at = Date.now();
    if (!record.error) record.last_success_at = record.completed_at;
  } catch {
    record.completed_at = Date.now(); record.error = 'tick_exception';
    response = new Response(JSON.stringify({ error: 'Social scheduler failed. Review its status before retrying.' }), { status:503,headers:{'Content-Type':'application/json'} });
  }
  const savedEnd = await write(env,record);
  if (!savedStart || !savedEnd) {
    // Header is observable in natural invocation diagnostics; a storage failure cannot claim health.
    response = new Response(response.body,response);
    response.headers.set('X-Social-Heartbeat','unavailable');
  }
  return response;
}
