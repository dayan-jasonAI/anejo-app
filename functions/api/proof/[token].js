// GET /api/proof/:token — public, unguessable proof-of-delivery photo.
// The token is the delivery's random public_token (set when the driver uploads the photo).
// Used as the MMS MediaUrl Twilio fetches, the photo link in the SMS/email fallback, and the
// image shown on the customer's "delivered" notice. Streams the object from the MEDIA R2 bucket.
export const onRequestGet = async ({ params, env }) => {
  const token = (params && params.token || '').toString();
  if (!token || !env.DB) return new Response('Not found', { status: 404 });

  let row = null;
  try {
    row = await env.DB.prepare('SELECT proof_photo FROM deliveries WHERE public_token = ? LIMIT 1')
      .bind(token).first();
  } catch { /* fall through to 404 */ }
  if (!row || !row.proof_photo) return new Response('Not found', { status: 404 });
  if (!env.MEDIA) return new Response('Storage unavailable', { status: 503 });

  const obj = await env.MEDIA.get(row.proof_photo);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  headers.set('Content-Disposition', 'inline; filename="anejo-delivery.jpg"');
  return new Response(obj.body, { headers });
};
