import { loadQuoteEmailArgs } from './catering_quote_delivery.js';
import { cateringQuoteEmail } from './catering_quote_email.js';

// Freshness evidence binds the reviewed email, recipient and stored revision. This is
// owner-authenticated, not a bearer authorization or a replacement for human approval.
export async function savedQuoteReview(env,row,baseUrl) {
  const rendered=cateringQuoteEmail(await loadQuoteEmailArgs(env,row,{baseUrl}));
  const bytes=new TextEncoder().encode(JSON.stringify({id:row.id,version:row.updated_at,
    to:row.customer_email,phone:row.customer_phone,subject:rendered.subject,html:rendered.html,text:rendered.text}));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const review_hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  return {...rendered,review_hash};
}
