// PII-free evidence of inbox checks; distinct from the social publishing scheduler.
export const ANA_HEARTBEAT_KEY = 'social.inbox_heartbeat';
const STALE_MS = 5 * 60 * 1000;
const ERRORS = new Set(['heartbeat_write_failed','settings_read_failed','queue_read_failed','message_read_failed','breaker_read_failed','identity_unavailable','draft_failed','send_or_receipt_failed','processing_failed','anthropic_not_configured','tick_failed','tick_exception']);
const COUNTERS = ['drafted','sent','specials','escalated','skipped'];
function clean(record) {
  const time = value => Number.isFinite(value) && value > 0 && value <= 8640000000000000 ? value : null;
  return { started_at: time(record.started_at), completed_at: time(record.completed_at), last_success_at: time(record.last_success_at),
    source: record.source === 'cron' ? 'cron' : record.source === 'owner' ? 'owner' : 'unknown',
    errors: Array.isArray(record.errors) ? [...new Set(record.errors.filter(e => ERRORS.has(e)))] : [],
    counts: Object.fromEntries(COUNTERS.map(k => [k,Number.isSafeInteger(record.counts?.[k]) && record.counts[k]>=0 ? record.counts[k] : 0])) };
}
export async function loadAnaHeartbeat(env, at=Date.now()) {
  try {
    const row=await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(ANA_HEARTBEAT_KEY).first();
    if(!row?.value) return {status:'unknown',reason:'no_record'};
    const record=clean(JSON.parse(row.value));
    if(!record.started_at) return {status:'unknown',reason:'invalid_record'};
    return {...record,status:at-(record.completed_at||record.started_at)>STALE_MS?'stale':!record.completed_at?'started_not_completed':record.errors.length?'error':'recent'};
  } catch { return {status:'unknown',reason:'storage_unavailable'}; }
}
async function save(env,record) {
  try {
    const result=await env.DB.prepare(`INSERT INTO app_settings (key,value,updated_by,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at
      WHERE CAST(json_extract(app_settings.value,'$.started_at') AS INTEGER) <= excluded.updated_at`)
      .bind(ANA_HEARTBEAT_KEY,JSON.stringify(clean(record)),'social-inbox-tick',record.started_at).run();
    return result?.success !== false && result?.meta?.changes !== 0;
  } catch { return false; }
}
export async function recordAnaTick(env,source,run) {
  const prior=await loadAnaHeartbeat(env);
  const record={started_at:Date.now(),completed_at:null,last_success_at:prior.last_success_at||null,source,errors:[],counts:{}};
  const observe=code=>{if(ERRORS.has(code)&&!record.errors.includes(code))record.errors.push(code);};
  const startSaved=await save(env,record);
  if (!startSaved) observe('heartbeat_write_failed');
  let response;
  try {
    response=await run(observe);
    const result=await response.clone().json();
    for(const key of COUNTERS) record.counts[key]=result[key];
    if(!response.ok || !result.ok) observe('tick_failed');
    if(result.skipped==='anthropic_not_configured') observe('anthropic_not_configured');
  } catch(error) {
    observe('tick_exception');record.completed_at=Date.now();await save(env,record);
    throw error; // Preserve existing failure semantics; never retry an uncertain send here.
  }
  record.completed_at=Date.now();
  if(!record.errors.length) record.last_success_at=record.completed_at;
  const endSaved=await save(env,record);
  if(!startSaved || !endSaved) {
    response=new Response(response.body,response); response.headers.set('X-Ana-Heartbeat','unavailable');
  }
  return response;
}
export function anaHeartbeatText(record) {
  if(!record || record.status==='unknown') return 'Ana inbox execution evidence is unavailable.';
  const stamp=t=>t?new Date(t).toISOString():'not recorded';
  return `Ana inbox ${record.source} check: ${record.status}; started ${stamp(record.started_at)}, completed ${stamp(record.completed_at)}, last successful check ${stamp(record.last_success_at)}. Recorded errors: ${record.errors.join(', ')||'none'}. This is observed check evidence, not proof of current execution or customer delivery.`;
}
