// Pure private intent/result contract. No DB, provider, navigation or persistence.
export const DESTINATIONS = Object.freeze({
  photos: '/hub/owner/marketing.html#photos',
  create: '/hub/owner/marketing.html#create',
  drafts: '/hub/owner/marketing.html#create?filter=drafts',
});
const aliases = new Map([
  ['open photos','photos'], ['abrir fotos','photos'], ['photos','photos'], ['fotos','photos'],
  ['open create and schedule','create'], ['open create & schedule','create'], ['abrir crear y programar','create'],
  ['show drafts','drafts'], ['mostrar borradores','drafts'],
]);
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[?!.]+$/,'').replace(/\s+/g,' ');
export function privateIntent(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 2000) return { kind: 'invalid' };
  const command = normalize(raw);
  const brief = raw.match(/^(?:draft campaign brief|preparar brief|preparar resumen de campana)\s*:\s*(.*)$/i);
  if (brief) return brief[1].trim() ? { kind: 'brief_preview', title: brief[1].trim().slice(0,200), notes: brief[1].trim().slice(0,1000) } : { kind: 'invalid', reason: 'brief_topic_required' };

  // Denials are routing policy, never an attempt to identify every possible natural-language act.
  // Anything outside exact private aliases has no executable descriptor.
  if (/\b(publish|post|send|email|refund|pay|purchase|buy|password|credential|token|secret|schedule|publica|publicar|envia|enviar|pagar|compra|comprar|contrasena|credenciales|programa|programar)\b/.test(command) && !aliases.has(command)) {
    return { kind: 'refusal', reason: 'external_or_sensitive_action' };
  }
  if (aliases.has(command)) return { kind: 'navigate', destination: aliases.get(command) };
  if (['show audit status','audit status','estado de revision','mostrar estado de revision'].includes(command)) return { kind: 'audit_status' };
  return { kind: 'unmatched' };
}
export function navigationPath(descriptor) {
  return descriptor?.kind === 'navigate' && Object.hasOwn(DESTINATIONS, descriptor.destination) ? DESTINATIONS[descriptor.destination] : null;
}
export function auditSnapshot(posts, observedAt) {
  if (!Array.isArray(posts)) return { available: false, observed_at: observedAt, posts: null, scope: 'latest_60_posts' };
  return { available: true, observed_at: observedAt, scope: 'latest_60_posts', posts: posts.slice(0,60).map(p => {
    let detail = null;
    try { detail = typeof p.audit_detail_json === 'string' ? JSON.parse(p.audit_detail_json) : p.audit_detail_json; } catch { /* no fabricated metadata */ }
    const current = p.audit_current === 1 || p.audit_current === true;
    return { id: String(p.id), caption_excerpt: String(p.caption || '').slice(0,120), status: p.status, audit_status: p.audit_status ?? null,
      audit_current: current, audit_at: p.audit_at ?? null, audit_scope: p.audit_scope ?? null,
      audit_score: typeof p.audit_score === 'number' && Number.isFinite(p.audit_score) ? p.audit_score : null,
      rubric_version: detail?.rubric_version || null,
      state: !p.audit_at ? 'not_audited' : !current ? 'stale_or_unverified' : p.audit_status === 'pass' ? 'current_pass' : 'current_attention' };
  }) };
}
export function privateResult(intent) {
  const receipt = { mode: 'deterministic', mutation: false };
  if (navigationPath(intent)) return { ok: true, reply: 'Use the button to open this private marketing view. Nothing has been scheduled or published.', ui: intent, receipt };
  if (intent.kind === 'brief_preview') return { ok: true, reply: 'Unsaved campaign idea captured from your words. No campaign brief has been created or published.', ui: { ...intent, saved: false }, receipt };
  if (intent.kind === 'audit_status') return { ok: true, reply: 'Use the button to read saved audit status. This does not run a new audit or approve publication.', ui: intent, receipt };
  if (intent.kind === 'refusal') return { ok: false, error: 'private_operator_only', detail: 'This operator cannot publish, send, schedule, pay, or change credentials.', receipt };
  if (intent.kind === 'invalid') return { ok: false, error: intent.reason || 'invalid_command', detail: 'Provide a short private command or a topic after “draft campaign brief:”.', receipt };
  return null;
}

// Caller supplies the existing SOCIAL_AUDIT_CURRENT SQL constant, never user text.
// No legacy fallback: missing evidence columns/read failures remain unavailable.
export async function readAuditStatus(db, currentSql, at = Date.now()) {
  const observedAt = new Date(at).toISOString();
  try {
    const result = await db.prepare(`SELECT id, caption, status, audit_status, audit_at, audit_scope, audit_score, audit_detail_json, COALESCE(${currentSql},0) AS audit_current FROM social_posts ORDER BY created_at DESC LIMIT 60`).all();
    if (result?.success === false || !Array.isArray(result?.results)) throw new Error('audit_read_unavailable');
    return auditSnapshot(result.results, observedAt);
  } catch {
    return auditSnapshot(null, observedAt);
  }
}
