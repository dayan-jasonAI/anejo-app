// Pure contract foundation; no OAuth, network, storage, approval or publication capability.
// Official method/resource references checked 2026-09-26:
// https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/get
// https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply
// https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews#ReviewReply
// ReviewReply.comment has a 4096-BYTE limit; moderation approval is not observed public visibility.
export const GOOGLE_REVIEW_REPLY_MAX_BYTES = 4096;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = error => ({ ok: false, error });
const locationPattern = /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/;
const reviewPattern = /^(accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+)\/reviews\/([A-Za-z0-9_-]+)$/;
const provenance = () => ({ source: 'provider_response', verification: 'not_performed' });

// Caller supplies a previously authorized location name. Syntactic matching is NOT proof
// that the caller owns the location, that the project is approved, or that OAuth succeeded.
export function validateGoogleReviewScope(locationName, reviewName) {
  if (typeof locationName !== 'string' || !locationPattern.test(locationName)) return fail('invalid_location_name');
  if (typeof reviewName !== 'string') return fail('invalid_review_name');
  const match = reviewPattern.exec(reviewName);
  if (!match) return fail('invalid_review_name');
  if (match[1] !== locationName) return fail('review_outside_location');
  return { ok: true, location_name: locationName, review_name: reviewName, review_id: match[2] };
}

export function validateGoogleReviewReplyRequest({ locationName, reviewName, comment } = {}) {
  const scope = validateGoogleReviewScope(locationName, reviewName);
  if (!scope.ok) return scope;
  if (typeof comment !== 'string' || !comment.trim()) return fail('empty_reply');
  // Refuse malformed Unicode rather than silently replacing it during UTF-8 encoding.
  if (!comment.isWellFormed()) return fail('invalid_reply_unicode');
  const bytes = new TextEncoder().encode(comment).byteLength;
  if (bytes > GOOGLE_REVIEW_REPLY_MAX_BYTES) return fail('reply_too_large');
  // Retain the exact reviewed text; do not trim or normalize a publication intent.
  return { ...scope, body: { comment }, byte_length: bytes };
}

// `acknowledged` is a caller assertion about its transport result, not inferred from JSON.
// This pure module cannot establish receipt provenance, delivery or public visibility.
export function normalizeGoogleReviewReply(raw, { acknowledged = false } = {}) {
  if (!plain(raw) || typeof raw.comment !== 'string' || !raw.comment.isWellFormed()) return fail('invalid_provider_reply');
  if (typeof acknowledged !== 'boolean') return fail('invalid_acknowledgment');
  if (raw.updateTime != null && typeof raw.updateTime !== 'string') return fail('invalid_provider_reply');
  if (raw.reviewReplyState != null && typeof raw.reviewReplyState !== 'string') return fail('invalid_moderation_state');
  if (raw.policyViolation != null && typeof raw.policyViolation !== 'string') return fail('invalid_policy_violation');
  const state = raw.reviewReplyState ?? null;
  const moderation = { PENDING: 'pending', REJECTED: 'rejected', APPROVED: 'approved', REVIEW_REPLY_STATE_UNSPECIFIED: 'unspecified' };
  return {
    ok: true,
    provenance: provenance(),
    comment: raw.comment,
    update_time: raw.updateTime ?? null,
    acknowledged,
    moderation: state === null ? 'unspecified' : Object.hasOwn(moderation, state) ? moderation[state] : 'unknown',
    provider_moderation_state: state,
    policy_violation: raw.policyViolation ?? null,
    public_visibility: 'unverified',
  };
}

// A supplied provider-shaped review stays distinct from the manual_unverified draft desk.
// Optional review text is absent for rating-only reviews; never invent an empty quoted review.
export function normalizeGoogleReview(raw, { locationName } = {}) {
  if (!plain(raw)) return fail('invalid_provider_review');
  const scope = validateGoogleReviewScope(locationName, raw.name);
  if (!scope.ok) return scope;
  if (raw.reviewId !== scope.review_id) return fail('review_identity_mismatch');
  if (raw.comment != null && typeof raw.comment !== 'string') return fail('invalid_review_comment');
  if (raw.updateTime != null && typeof raw.updateTime !== 'string') return fail('invalid_provider_review');
  if (raw.starRating != null && typeof raw.starRating !== 'string') return fail('invalid_review_rating');
  const reply = raw.reviewReply == null ? null : normalizeGoogleReviewReply(raw.reviewReply);
  if (reply && !reply.ok) return reply;
  const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return {
    ...scope,
    provenance: provenance(),
    comment: raw.comment ?? null,
    rating: Object.hasOwn(stars, raw.starRating) ? stars[raw.starRating] : null,
    provider_star_rating: raw.starRating ?? null,
    update_time: raw.updateTime ?? null,
    reply,
  };
}
