import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGoogleReviewScope, validateGoogleReviewReplyRequest, normalizeGoogleReviewReply, normalizeGoogleReview } from '../../functions/_lib/google_business_review_contract.js';
import { GOOGLE_REVIEW_CAPABILITIES, validateReviewDraft } from '../../functions/_lib/google_review_drafts.js';

const locationName = 'accounts/123/locations/456';
const reviewName = locationName + '/reviews/opaque_Ab-9';
const request = comment => validateGoogleReviewReplyRequest({ locationName, reviewName, comment });

test('resource names bind exact account and location; URLs, traversal and encoded paths are rejected', () => {
  assert.equal(validateGoogleReviewScope(locationName, reviewName).review_id, 'opaque_Ab-9');
  for (const wrong of ['accounts/124/locations/456/reviews/opaque_Ab-9', 'accounts/123/locations/457/reviews/opaque_Ab-9'])
    assert.equal(validateGoogleReviewScope(locationName, wrong).error, 'review_outside_location');
  for (const wrong of ['https://mybusiness.googleapis.com/v4/' + reviewName, reviewName + '/reply', reviewName + '?x=1', reviewName + '#fragment', reviewName + '/..', reviewName + '%2Fother', reviewName + '\n'])
    assert.equal(validateGoogleReviewScope(locationName, wrong).ok, false);
  assert.equal(validateGoogleReviewScope('accounts/123/locations/../456', reviewName).ok, false);
});

test('exact reviewed text respects UTF-8 byte boundary, including multibyte Spanish and emoji', () => {
  for (const comment of ['a'.repeat(4096), 'é'.repeat(2048), '🍲'.repeat(1024)]) {
    const r = request(comment); assert.equal(r.ok, true); assert.equal(r.byte_length, 4096); assert.equal(r.body.comment, comment);
    assert.equal(request(comment + 'a').error, 'reply_too_large');
  }
  assert.equal(request('  Gracias por visitarnos.\n').body.comment, '  Gracias por visitarnos.\n');
  for (const comment of ['', ' \n\t', null]) assert.equal(request(comment).error, 'empty_reply');
  assert.equal(request('\ud800').error, 'invalid_reply_unicode');
});

test('acknowledgment and moderation never become observed publication; unknown enums are retained', () => {
  for (const [state, normalized] of [['PENDING','pending'],['REJECTED','rejected'],['APPROVED','approved'],['REVIEW_REPLY_STATE_UNSPECIFIED','unspecified'],['FUTURE_STATE','unknown'],['toString','unknown']]) {
    const result = normalizeGoogleReviewReply({ comment: 'Synthetic reply', reviewReplyState: state, policyViolation: 'FUTURE_REASON' }, { acknowledged: true });
    assert.equal(result.acknowledged, true); assert.equal(result.moderation, normalized);
    assert.equal(result.provider_moderation_state, state); assert.equal(result.policy_violation, 'FUTURE_REASON');
    assert.equal(result.public_visibility, 'unverified'); assert.equal(result.provenance.verification, 'not_performed');
  }
  const readback = normalizeGoogleReviewReply({ comment: 'Synthetic reply', reviewReplyState: 'APPROVED' });
  assert.equal(readback.acknowledged, false, 'reading a reply does not establish this application wrote it');
  assert.equal(normalizeGoogleReviewReply({ comment: 'Synthetic' }).moderation, 'unspecified');
  assert.equal(normalizeGoogleReviewReply({ comment: 'Synthetic' }, { acknowledged: 'yes' }).ok, false);
  assert.equal(normalizeGoogleReviewReply({ comment: 'Synthetic', reviewReplyState: {} }).ok, false);
});

test('provider-shaped reviews retain explicit unverified provenance and support rating-only reviews', () => {
  const r = normalizeGoogleReview({ name: reviewName, reviewId: 'opaque_Ab-9', starRating: 'FIVE', reviewReply: { comment: 'Synthetic response', reviewReplyState: 'PENDING' } }, { locationName });
  assert.equal(r.ok, true); assert.equal(r.comment, null); assert.equal(r.rating, 5);
  assert.deepEqual(r.provenance, { source: 'provider_response', verification: 'not_performed' });
  assert.equal(r.reply.moderation, 'pending'); assert.equal(r.reply.acknowledged, false);
  assert.equal(normalizeGoogleReview({ name: reviewName, reviewId: 'wrong' }, { locationName }).error, 'review_identity_mismatch');
  const future = normalizeGoogleReview({ name: reviewName, reviewId: 'opaque_Ab-9', starRating: 'NEW_RATING' }, { locationName });
  assert.equal(future.rating, null); assert.equal(future.provider_star_rating, 'NEW_RATING');
});

test('contract foundation does not grant connection or change manual draft publication authority', () => {
  assert.equal(GOOGLE_REVIEW_CAPABILITIES.connected, false);
  assert.equal(GOOGLE_REVIEW_CAPABILITIES.reply_publish, 'unavailable');
  assert.ok(validateReviewDraft({ op: 'send' }).error);
  const manual = { op: 'create', request_id: 'synthetic_request_1', review_text: 'Manual synthetic review', proposed_reply: 'Private draft' };
  assert.ok(validateReviewDraft(manual).value);
  assert.ok(validateReviewDraft({ ...manual, source_kind: 'provider_response' }).error);
});
