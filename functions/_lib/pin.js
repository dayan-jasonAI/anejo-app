// PIN credential helpers for staff sign-in. PBKDF2-SHA256 via WebCrypto (Workers-native).
// PINs are NEVER stored in plaintext — only {salt, hash}. Files under _lib are not routed.
const ENC = new TextEncoder();
const ITER = 100000;

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export async function hashPin(pin, salt) {
  const keyMaterial = await crypto.subtle.importKey('raw', ENC.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: ENC.encode(String(salt)), iterations: ITER, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toHex(bits);
}

// Constant-time-ish comparison to avoid trivial timing leaks.
export async function verifyPin(pin, salt, hash) {
  if (!salt || !hash) return false;
  const h = await hashPin(pin, salt);
  if (h.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// PIN policy. NEW PINs must be 6–10 digits (set-time, validPinFormat) — raises the brute-force
// keyspace from 10k (4-digit) to ≥1M. ENTRY accepts 4–10 (validPinEntry) so already-enrolled
// staff with shorter PINs keep working until they rotate (no lockout on a policy change).
export function validPinFormat(pin) {
  return typeof pin === 'string' && /^[0-9]{6,10}$/.test(pin);
}
export function validPinEntry(pin) {
  return typeof pin === 'string' && /^[0-9]{4,10}$/.test(pin);
}

// Generate a random 6-digit PIN (for owner-issued initial credentials).
export function randomPin() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, '0');
}
