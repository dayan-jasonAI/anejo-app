// This deliberately has no Google SDK, credentials, fetch or send capability.
export const GOOGLE_REVIEW_CAPABILITIES = Object.freeze({
  connected: false, provider: 'google_business_profile', mode: 'manual_drafts_only',
  review_sync: 'unavailable', reply_publish: 'unavailable',
  source_verification: 'unverified',
  prerequisites: ['Connect an authorized Google Business Profile integration.', 'Verify the target business and review identities.', 'Implement and validate owner-reviewed reply publication separately.'],
});
const keys = new Set(['op', 'request_id', 'id', 'version', 'review_text', 'rating', 'source_url', 'proposed_reply']);
export function validateReviewDraft(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'A draft object is required.' };
  if (Object.keys(body).some(k => !keys.has(k))) return { error: 'Unsupported field. Only a private proposed reply can be saved.' };
  if (!['create', 'edit', 'dismiss'].includes(body.op)) return { error: 'Only create, edit and dismiss are supported. Google sync and reply publication are unavailable.' };
  if (body.op === 'create' && (typeof body.request_id !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.request_id))) return { error: 'Use a stable request_id of 16–100 letters, digits, underscores or hyphens for retry protection.' };
  if (body.op !== 'create' && (typeof body.id !== 'string' || !/^grd_[a-f0-9]{20}$/.test(body.id) || !Number.isInteger(body.version) || body.version < 1)) return { error: 'A valid draft ID and current version are required.' };
  if (body.op === 'dismiss') {
    if (Object.keys(body).some(k => !['op','id','version'].includes(k))) return { error: 'Dismiss accepts only ID and version.' };
    return { value: { op: body.op, id: body.id, version: body.version } };
  }
  for (const [field, max] of [['review_text',5000],['proposed_reply',3000]]) {
    // Plain text accepts tabs and line breaks, but excludes other control characters.
    // eslint-disable-next-line no-control-regex
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body[field])) return { error: `${field} must contain 1–${max} characters of plain text.` };
  }
  if (body.rating != null && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) return { error: 'Rating must be an integer from 1 to 5, or omitted.' };
  let sourceUrl = null;
  if (body.source_url != null && body.source_url !== '') {
    try {
      if (typeof body.source_url !== 'string' || body.source_url.length > 2048) throw new Error();
      const url = new URL(body.source_url);
      const allowed = (['www.google.com','google.com'].includes(url.hostname) && url.pathname.startsWith('/maps')) || ['maps.google.com','maps.app.goo.gl','g.page'].includes(url.hostname);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) throw new Error();
      sourceUrl = url.href;
    } catch { return { error: 'Use an HTTPS Google Maps or review link, or leave source_url empty. Links are stored, not fetched or verified.' }; }
  }
  return { value: { ...body, review_text: body.review_text.trim(), proposed_reply: body.proposed_reply.trim(), rating: body.rating ?? null, source_url: sourceUrl } };
}
