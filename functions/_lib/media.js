// R2 media storage helpers for the HUB. Files under functions/_lib are not routed.
// env.MEDIA (R2) MAY BE ABSENT (bucket binding awaits a dashboard click) — every
// helper feature-detects and degrades: putMedia returns { stored:false } so callers
// keep their existing inline/ref behavior. Never throws.
//   putMedia(env, { kind:'proof'|'studio'|'receipt', dataUrl?, bytes?, contentType?, ext? })
//     → { stored:true, key, url } | { stored:false, error? }
//   getMedia(env, key) → R2ObjectBody | null
import { id } from './util.js';

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // 5MB cap

const KINDS = ['proof', 'studio', 'receipt', 'docimg'];

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

const TYPE_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', webm: 'audio/webm', ogg: 'audio/ogg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', pdf: 'application/pdf',
};

// Decode a base64 data URL → { bytes:Uint8Array, contentType } or null on garbage.
export function decodeDataUrl(dataUrl) {
  try {
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
    if (!m || !m[2]) return null; // only base64 payloads carry binary media
    const contentType = (m[1] || 'application/octet-stream').toLowerCase();
    const bin = atob(m[3].replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, contentType };
  } catch {
    return null;
  }
}

// Best-guess Content-Type from a storage key's extension.
export function contentTypeForKey(key) {
  const ext = String(key || '').split('.').pop().toLowerCase();
  return TYPE_BY_EXT[ext] || 'application/octet-stream';
}

// Store a media blob in R2. Accepts a base64 dataUrl OR raw bytes + contentType.
// Returns { stored:false } when the binding is absent or input is unusable — never throws.
export async function putMedia(env, { kind, dataUrl, bytes, contentType, ext } = {}) {
  try {
    if (!env || !env.MEDIA) return { stored: false };
    if (!KINDS.includes(kind)) return { stored: false, error: 'bad_kind' };

    let body = bytes || null;
    let type = contentType || null;
    if (!body && dataUrl) {
      const decoded = decodeDataUrl(dataUrl);
      if (!decoded) return { stored: false, error: 'bad_data_url' };
      body = decoded.bytes;
      type = type || decoded.contentType;
    }
    if (!body || !body.length) return { stored: false, error: 'empty' };
    if (body.length > MAX_MEDIA_BYTES) return { stored: false, error: 'too_large' };
    type = type || 'application/octet-stream';

    const useExt = (ext || EXT_BY_TYPE[type] || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const yyyymm = new Date().toISOString().slice(0, 7); // yyyy-mm
    const key = `${kind}/${yyyymm}/${id('med')}.${useExt}`;

    await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
    return { stored: true, key, url: `/api/hub/media/${key}` };
  } catch {
    return { stored: false, error: 'put_failed' };
  }
}

// Fetch an R2 object by key. Returns null when the binding or object is absent.
export async function getMedia(env, key) {
  try {
    if (!env || !env.MEDIA || !key) return null;
    return await env.MEDIA.get(key);
  } catch {
    return null;
  }
}
