// Header-only, bounded JPEG EXIF IFD0 orientation reader. No image decoding or metadata mutation.
// Other TIFF tags/IFDs are not followed or interpreted; this is not a general EXIF validator.
const MAX_BYTES = 5 * 1024 * 1024;
const invalid = detail => { throw new Error('Invalid JPEG EXIF orientation: ' + detail); };
function exifOrientation(payload) {
  // Caller recognized the ASCII Exif prefix; the full signature is mandatory.
  if (payload.length < 14 || payload[4] !== 0 || payload[5] !== 0) invalid('truncated or invalid EXIF signature');
  return tiffOrientation(payload.subarray(6));
}
function tiffOrientation(tiff, fail = invalid) {
  if (tiff.length < 8) fail('truncated TIFF header');
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) fail('invalid TIFF byte order');
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.getUint16(2, little) !== 42) fail('invalid TIFF magic');
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset > tiff.length - 2) fail('IFD0 offset out of bounds');
  const count = view.getUint16(offset, little);
  // Include the required next-IFD pointer, without following it or recursively scanning tags.
  if (count > Math.floor((tiff.length - offset - 6) / 12)) fail('truncated IFD0 entries');
  let orientation = null;
  for (let index = 0; index < count; index++) {
    const at = offset + 2 + index * 12;
    if (view.getUint16(at, little) !== 0x0112) continue;
    if (view.getUint16(at + 2, little) !== 3 || view.getUint32(at + 4, little) !== 1) fail('orientation must be SHORT with count 1');
    const value = view.getUint16(at + 8, little);
    if (value < 1 || value > 8) fail('orientation value outside 1–8');
    if (orientation !== null && orientation !== value) fail('conflicting orientation tags');
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

// PNG eXIf contains bare TIFF bytes (no JPEG Exif prefix). Parse every chunk,
// including metadata after IDAT, without decoding pixels or altering the input.
// https://www.w3.org/TR/png-3/#eXIf
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function pngSourceOrientation(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('PNG orientation requires Uint8Array bytes');
  if (bytes.length > MAX_BYTES) throw new Error('Compressed image exceeds 5 MiB');
  const fail = detail => { throw new Error('Invalid PNG EXIF orientation: ' + detail); };
  if (bytes.length < 8 || ![137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value)) fail('PNG signature missing');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let at = 8, exif = null, orientation = 1, seenData = false;
  while (at < bytes.length) {
    if (bytes.length - at < 12) fail('truncated chunk');
    const length = view.getUint32(at);
    if (length > 0x7fffffff || length > bytes.length - at - 12) fail('chunk length out of bounds');
    const end = at + length + 12;
    const type = String.fromCharCode(...bytes.subarray(at+4,at+8));
    if (at === 8 && (type !== 'IHDR' || length !== 13)) fail('IHDR missing or malformed');
    if (type === 'IDAT') seenData = true;
    if (type === 'eXIf') {
      if (exif) fail('duplicate eXIf chunks');
      if (crc32(bytes.subarray(at+4,end-4)) !== view.getUint32(end-4)) fail('eXIf CRC mismatch');
      orientation = tiffOrientation(bytes.subarray(at+8,end-4),fail) ?? 1;
      exif = {start:at,end};
    }
    if (type === 'IEND') {
      if (length !== 0 || !seenData || end !== bytes.length) fail('invalid end or missing image data');
      // Remove EXIF only from the decoder copy: avoid runtimes applying it again.
      // Originals and their provenance hashes remain untouched. Color metadata stays.
      if (!exif) return {orientation,decoderBytes:bytes};
      const decoderBytes = new Uint8Array(bytes.length-(exif.end-exif.start));
      decoderBytes.set(bytes.subarray(0,exif.start));
      decoderBytes.set(bytes.subarray(exif.end),exif.start);
      return {orientation,decoderBytes};
    }
    at = end;
  }
  fail('IEND missing');
}
