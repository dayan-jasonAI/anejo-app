// Svix webhook signature verification (Resend signs its webhooks with Svix). Manual scheme per
// docs.svix.com/receiving/verifying-payloads/how-manual:
//   secret  = `whsec_<base64>`  → HMAC key is base64decode(the part after the prefix)
//   signed  = `${svix-id}.${svix-timestamp}.${raw body}`
//   expected= base64( HMAC_SHA256(key, signed) )
//   header `svix-signature` is space-delimited `v1,<sig> v1,<sig>` — match ANY entry (constant-time).
// Also reject timestamps outside a tolerance window to defend against replay.
// Files under _lib are NOT routed.

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
// Constant-time compare of two base64 signature strings.
function constEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Verify a Svix-signed request. `headers` is a Headers object, `body` is the RAW request text.
// Returns { ok, reason }.
export async function verifySvix(secret, headers, body, opts) {
  const { toleranceSec = 300, nowMs = Date.now() } = opts || {};
  if (!secret) return { ok: false, reason: 'no-secret' };
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return { ok: false, reason: 'missing-headers' };
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(nowMs / 1000 - tsNum) > toleranceSec) {
    return { ok: false, reason: 'stale-timestamp' };
  }
  const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes;
  try { keyBytes = b64ToBytes(keyB64); } catch { return { ok: false, reason: 'bad-secret' }; }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = bytesToB64(mac);
  const provided = sigHeader.split(' ').map((p) => { const i = p.indexOf(','); return i >= 0 ? p.slice(i + 1) : p; });
  const ok = provided.some((sig) => constEq(sig, expected));
  return { ok, reason: ok ? null : 'mismatch' };
}
