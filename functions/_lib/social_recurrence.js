import { cateringEventTimestamp } from './catering-notice.js';
import { etDayParts } from './operating.js';
import { CAROUSEL_MAX, JPEG_ONLY, VIDEO_ONLY } from './instagram.js';
import { foodFirstOrder, loadPostMedia } from './social_publish.js';
import { id, randToken } from './util.js';

const DAY = 86400000;
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const calendarDay = value => {
  if (typeof value !== 'string' || !/^(?:20|21)\d\d-\d\d-\d\d$/.test(value)) return NaN;
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
};

export function normalizeRecurrence(rule) {
  if (!rule || !['daily', 'alternate', 'weekdays', 'custom'].includes(rule.frequency)) return null;
  const { frequency, start, end = null } = rule;
  if (!Number.isFinite(calendarDay(start)) ||
      (end !== null && (!Number.isFinite(calendarDay(end)) || end < start))) return null;
  if (frequency !== 'custom') {
    return validTime(rule.time) ? { frequency, start, end, time: rule.time } : null;
  }
  const times = rule.times;
  if (!times || typeof times !== 'object' || Array.isArray(times)) return null;
  const entries = Object.entries(times);
  if (!entries.length || entries.some(([day, time]) => !/^[0-6]$/.test(day) || !validTime(time))) return null;
  return { frequency, start, end, times: Object.fromEntries(entries) };
}

export function nextOccurrence(rule, after) {
  const anchor = calendarDay(rule.start);
  const firstDay = Math.max(anchor, calendarDay(etDayParts(new Date(after)).date));
  const endDay = rule.end ? calendarDay(rule.end) : Infinity;
  // At most one eligible weekday per week is enough. A second week covers a missing DST hour.
  for (let day = firstDay; day <= endDay && day < firstDay + 15 * DAY; day += DAY) {
    const date = new Date(day);
    const weekday = date.getUTCDay();
    if (rule.frequency === 'weekdays' && (weekday === 0 || weekday === 6)) continue;
    if (rule.frequency === 'alternate' && ((day - anchor) / DAY) % 2 !== 0) continue;
    const time = rule.frequency === 'custom' ? rule.times[weekday] : rule.time;
    const candidate = cateringEventTimestamp(date.toISOString().slice(0, 10), time);
    if (candidate !== null && candidate > after) return candidate;
  }
  return null;
}

export async function reviewRecurringPost(env, postId) {
  const post = await env.DB.prepare(`SELECT caption, media_type, status FROM social_posts
    WHERE id=? AND platform='instagram' AND campaign_cycle_id IS NULL AND source NOT IN ('inventory','recurring')`).bind(postId).first();
  if (!post || !['draft', 'failed', 'published'].includes(post.status)) return { error: 'post_unavailable' };
  const type = post.media_type;
  const slides = await loadPostMedia(env, postId);
  if (!slides.length || slides.length > CAROUSEL_MAX ||
    slides.some(({ media_key }) => !/^(studio|marketing-library)\/[a-zA-Z0-9/_ .-]+$/.test(media_key) || /\.\.|\/\//.test(media_key))) {
    return { error: 'media_unavailable' };
  }
  const special = type === 'STORIES' || type === 'REELS';
  const hasFormat = special
    ? slides.length === 1 && (VIDEO_ONLY.test(slides[0].media_key) || (type === 'STORIES' && JPEG_ONLY.test(slides[0].media_key)))
    : slides.every(slide => JPEG_ONLY.test(slide.media_key));
  if (!hasFormat) return { error: 'media_format' };
  const ordered = special ? slides : foodFirstOrder(slides).media;
  const media = await Promise.all(ordered.map(async slide => ({
    key: slide.media_key,
    etag: (await env.MEDIA?.head(slide.media_key))?.etag || null,
  })));
  if (media.some(slide => !slide.etag)) return { error: 'media_unavailable' };
  // Instagram's Stories API publishes only the rendered media.
  const snapshot = { caption: type === 'STORIES' ? '' : post.caption || '', type, media };
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  return { snapshot, hash };
}

export async function dueRecurrence(env, at) {
  return env.DB.prepare(`SELECT * FROM social_recurrences
    WHERE status='active' AND next_at<=? ORDER BY next_at,id LIMIT 1`).bind(at).first();
}

export async function claimRecurrence(env, series, at, graceMs) {
  const rule = JSON.parse(series.rule_json);
  const next = nextOccurrence(rule, at);
  const status = next === null ? 'ended' : 'active';
  if (at - series.next_at > graceMs) {
    const skipped = await env.DB.prepare(`UPDATE social_recurrences
      SET next_at=?,status=?,missed_at=?,version=version+1 WHERE id=? AND version=? AND status='active' AND next_at=?`)
      .bind(next, status, series.next_at, series.id, series.version, series.next_at).run();
    return skipped.meta?.changes === 1 ? { missed: true } : null;
  }
  const postId = id('recurring_post');
  const { caption, type, media } = JSON.parse(series.snapshot_json);
  const advance = env.DB.prepare(`UPDATE social_recurrences
    SET next_at=?,status=?,last_post_id=?,version=version+1 WHERE id=? AND version=? AND status='active' AND next_at=?`)
    .bind(next, status, postId, series.id, series.version, series.next_at);
  const create = env.DB.prepare(`INSERT INTO social_posts
    (id,platform,caption,media_key,media_type,public_token,status,source,scheduled_at,created_by,created_at,updated_at)
    SELECT ?,'instagram',?,?,?,?,'publishing','recurring',?,?,?,? FROM social_recurrences WHERE id=? AND last_post_id=?`)
    .bind(postId, caption, media[0].key, type, randToken(24), series.next_at, series.approved_by, at, at, series.id, postId);
  const slides = media.map(({ key, etag }, seq) => env.DB.prepare(`INSERT INTO social_post_media
    (id,post_id,seq,media_key,public_token,created_at,recurring_etag)
    SELECT ?,?,?,?,?,?,? FROM social_recurrences WHERE id=? AND last_post_id=?`)
    .bind(id('spm'), postId, seq, key, randToken(24), at, etag, series.id, postId));
  const [result] = await env.DB.batch([advance, create, ...slides]);
  return result.meta?.changes === 1
    ? { post: { id: postId, platform: 'instagram', caption, media_type: type, source: 'recurring' } }
    : null;
}
