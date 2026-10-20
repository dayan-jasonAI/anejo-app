import { id } from './util.js';

const blocked = error => ({ ok:false,error });
export async function sendInProgress(env, quoteId) {
  const row = await env.DB.prepare("SELECT quote_id FROM catering_quote_send_reviews WHERE quote_id=? AND state IN ('sending','unknown')")
    .bind(quoteId).first();
  return Boolean(row);
}

// The caller has rendered/recomputed the exact reviewed content before entering.
// This claim is the shared fence: checkout revision/retirement must use its inverse
// in their own atomic claims, not only check it earlier in application code.
export async function beginReviewedQuoteSend(env, {quoteId,reviewHash,expectedUpdatedAt,smsAuthorized=false}) {
  if (!quoteId || !/^[a-f0-9]{64}$/.test(String(reviewHash)) || !Number.isSafeInteger(expectedUpdatedAt)) {
    return blocked('Review the saved quote again before sending.');
  }
  const claimId=id('qsend'), stamp=Date.now();
  const result=await env.DB.prepare(`INSERT INTO catering_quote_send_reviews
    (quote_id,claim_id,review_hash,expected_updated_at,sms_authorized,state,created_at,updated_at)
    SELECT ?,?,?,?,?,'sending',?,? WHERE EXISTS
      (SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status='unpaid' AND updated_at=?)
      AND NOT EXISTS (SELECT 1 FROM catering_quote_revisions WHERE source_quote_id=? OR (replacement_quote_id=? AND state!='complete'))
      AND NOT EXISTS (SELECT 1 FROM catering_quote_duplicate_retirements WHERE (source_quote_id=? OR target_quote_id=?) AND state!='complete')
    ON CONFLICT(quote_id) DO UPDATE SET claim_id=excluded.claim_id,review_hash=excluded.review_hash,
      expected_updated_at=excluded.expected_updated_at,sms_authorized=excluded.sms_authorized,
      state='sending',outcome_json=NULL,updated_at=excluded.updated_at
      WHERE catering_quote_send_reviews.state='nosend' OR
        (catering_quote_send_reviews.state='accepted' AND catering_quote_send_reviews.review_hash!=excluded.review_hash)`)
    .bind(quoteId,claimId,reviewHash,expectedUpdatedAt,smsAuthorized?1:0,stamp,stamp,
      quoteId,expectedUpdatedAt,quoteId,quoteId,quoteId,quoteId).run();
  if (result.meta?.changes===1) return {ok:true,send:true,claim_id:claimId};
  const current=await env.DB.prepare('SELECT * FROM catering_quote_send_reviews WHERE quote_id=?').bind(quoteId).first();
  if(current?.state==='accepted' && current.review_hash===reviewHash) {
    return {ok:true,send:false,replayed:true,outcome:JSON.parse(current.outcome_json||'{}')};
  }
  return blocked(current && ['sending','unknown'].includes(current.state)
    ? 'A quote send is in progress or uncertain. Reconcile its saved receipt before sending or changing checkout.'
    : 'The quote changed or is being replaced. Reload and review the current quote.');
}

const receipt = value => typeof value==='string' && /^[A-Za-z0-9_-]{1,192}$/.test(value) ? value : null;
export async function finishReviewedQuoteSend(env, claimId, delivery) {
  const claim=await env.DB.prepare('SELECT * FROM catering_quote_send_reviews WHERE claim_id=?').bind(claimId).first();
  if(!claim) throw new Error('Quote send claim unavailable');
  if(claim.state!=='sending') return {ok:true,state:claim.state,replayed:true};
  const emailReceipt=receipt(delivery?.email?.receipt_id);
  const smsReceipt=claim.sms_authorized ? receipt(delivery?.sms?.provider_sid) : null;
  const emailAccepted=Boolean(emailReceipt), smsAccepted=Boolean(smsReceipt);
  const knownSkipped=channel=>channel?.sent===false && typeof channel.skipped==='string' && channel.skipped.length>0;
  const emailSkipped=knownSkipped(delivery?.email);
  const smsSkipped=!claim.sms_authorized || knownSkipped(delivery?.sms);
  // A missing/failed local receipt write may follow provider acceptance. It must
  // retain the fence even if another channel has an acceptance receipt.
  const uncertain=Boolean(delivery?.record_error || delivery?.conversation_error)
    || (!emailAccepted && !emailSkipped) || (!smsAccepted && !smsSkipped);
  const state=uncertain?'unknown':emailAccepted||smsAccepted?'accepted':'nosend';
  const outcome={state,email:{provider_accepted:emailAccepted,receipt_id:emailReceipt},
    sms:{provider_accepted:smsAccepted,receipt_id:smsReceipt},delivery_verified:false};
  const stamp=Date.now();
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE catering_quote_send_reviews SET state=?,outcome_json=?,updated_at=? WHERE claim_id=? AND state='sending'")
      .bind(state,JSON.stringify(outcome),stamp,claimId),
    env.DB.prepare(`INSERT OR IGNORE INTO activity_log(id,event,actor_type,properties,created_at)
      VALUES (?,'catering.quote_send.receipt','system',?,?)`)
      .bind('quote_send_'+claimId,JSON.stringify({quote_id:claim.quote_id,review_hash:claim.review_hash,...outcome}),stamp),
  ]);
  if(results[0]?.meta?.changes!==1)throw new Error('Quote send receipt changed; reconcile before retrying');
  return {ok:true,...outcome};
}
