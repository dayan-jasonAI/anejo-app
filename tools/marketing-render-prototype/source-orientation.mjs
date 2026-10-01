// Header-only, bounded JPEG EXIF IFD0 orientation reader. No image decoding or metadata mutation.
// Other TIFF tags/IFDs are not followed or interpreted; this is not a general EXIF validator.
const MAX_BYTES = 5 * 1024 * 1024;
const invalid = detail => { throw new Error('Invalid JPEG EXIF orientation: ' + detail); };
function exifOrientation(payload) {
  // Caller recognized the ASCII Exif prefix; the full signature is mandatory.
  if (payload.length < 14 || payload[4] !== 0 || payload[5] !== 0) invalid('truncated or invalid EXIF signature');
  const tiff = payload.subarray(6);
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) invalid('invalid TIFF byte order');
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.getUint16(2, little) !== 42) invalid('invalid TIFF magic');
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset > tiff.length - 2) invalid('IFD0 offset out of bounds');
  const count = view.getUint16(offset, little);
  // Include the required next-IFD pointer, without following it or recursively scanning tags.
  if (count > Math.floor((tiff.length - offset - 6) / 12)) invalid('truncated IFD0 entries');
  let orientation = null;
  for (let index = 0; index < count; index++) {
    const at = offset + 2 + index * 12;
    if (view.getUint16(at, little) !== 0x0112) continue;
    if (view.getUint16(at + 2, little) !== 3 || view.getUint32(at + 4, little) !== 1) invalid('orientation must be SHORT with count 1');
    const value = view.getUint16(at + 8, little);
    if (value < 1 || value > 8) invalid('orientation value outside 1–8');
    if (orientation !== null && orientation !== value) invalid('conflicting orientation tags');
    orientation = value;
  }
  return orientation;
}
export function jpegOrientation(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('JPEG orientation requires Uint8Array bytes');
  if (bytes.byteLength > MAX_BYTES) throw new Error('Compressed image exceeds 5 MiB');
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid('JPEG SOI missing');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2, result = null;
  while (at < bytes.length) {
    if (bytes[at++] !== 0xff) invalid('invalid JPEG marker');
    while (at < bytes.length && bytes[at] === 0xff) at++;
    if (at >= bytes.length) invalid('truncated JPEG marker');
    const marker = bytes[at++];
    if (marker === 0xd9) return result === null ? 1 : result;
    if (marker === 0 || marker === 0xd8) invalid('unexpected JPEG marker');
    // TEM and restart markers have no segment-length field.
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (at + 2 > bytes.length) invalid('truncated segment length');
    const length = view.getUint16(at);
    if (length < 2 || length > bytes.length - at) invalid('segment length out of bounds');
    // EXIF is a header segment. Do not search compressed entropy for marker-like bytes.
    if (marker === 0xda) return result === null ? 1 : result;
    if (marker === 0xe1) {
      const payload = bytes.subarray(at + 2, at + length);
      if (payload.length >= 4 && payload[0] === 0x45 && payload[1] === 0x78 && payload[2] === 0x69 && payload[3] === 0x66) {
        const orientation = exifOrientation(payload);
        if (orientation !== null) {
          if (result !== null && result !== orientation) invalid('conflicting APP1 orientations');
          result = orientation;
        }
      }
    }
    at += length;
  }
  invalid('JPEG header has no scan or end marker');
}
