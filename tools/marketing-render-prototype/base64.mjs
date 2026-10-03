const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Divisible by three so padding can occur only in the final chunk.
const INPUT_CHUNK_BYTES = 12 * 1024;

function requireBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Base64 input must be a Uint8Array');
  }
}

/** Encode bytes as canonical padded base64, using the native method if exposed. */
export function encodeBase64(bytes) {
  requireBytes(bytes);
  const nativeEncode = Uint8Array.prototype.toBase64;
  if (typeof nativeEncode === 'function') {
    return nativeEncode.call(bytes);
  }
  return encodeBase64Fallback(bytes);
}

/** Bounded fallback: no binary-string copy or argument expansion of the input. */
export function encodeBase64Fallback(bytes) {
  requireBytes(bytes);
  const chunks = [];
  for (let start = 0; start < bytes.length; start += INPUT_CHUNK_BYTES) {
    const end = Math.min(start + INPUT_CHUNK_BYTES, bytes.length);
    const characters = new Array(Math.ceil((end - start) / 3) * 4);
    let output = 0;
    for (let index = start; index < end; index += 3) {
      const first = bytes[index];
      const hasSecond = index + 1 < end;
      const hasThird = index + 2 < end;
      const second = hasSecond ? bytes[index + 1] : 0;
      const third = hasThird ? bytes[index + 2] : 0;
      characters[output++] = ALPHABET[first >>> 2];
      characters[output++] = ALPHABET[((first & 3) << 4) | (second >>> 4)];
      characters[output++] = hasSecond ? ALPHABET[((second & 15) << 2) | (third >>> 6)] : '=';
      characters[output++] = hasThird ? ALPHABET[third & 63] : '=';
    }
    chunks.push(characters.join(''));
  }
  return chunks.join('');
}
