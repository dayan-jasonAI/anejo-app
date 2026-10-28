// Optional, read-only localized views for staff. Source records remain authoritative.
// Translation payloads are loaded from the role-gated private D1 table, never bundled in code.
const encoder = new TextEncoder();
const LOCALE = 'es';

export function requestedReadingLocale(request) {
  return new URL(request.url).searchParams.get('lang')?.trim().toLowerCase() === LOCALE ? LOCALE : 'en';
}

export async function sha256Text(value) {
  if (typeof value !== 'string' || !globalThis.crypto?.subtle) return null;
  try {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function metadata(status, sourceHash = null, sourceVersion = null, sourceTitle = null) {
  return {
    status,
    locale: LOCALE,
    ...(sourceHash ? { source_hash: sourceHash } : {}),
    ...(sourceVersion !== null && sourceVersion !== undefined ? { source_version: sourceVersion } : {}),
    ...(sourceTitle ? { source_title: sourceTitle } : {}),
  };
}

function parsePayload(row) {
  if (!row || typeof row.payload_json !== 'string') return null;
  try {
    const payload = JSON.parse(row.payload_json);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function readEdition(env, kind, id) {
  if (!env?.DB || !id) return null;
  try {
    const row = await env.DB.prepare(`
      SELECT entity_kind, entity_id, locale, source_version, source_hash, source_title, payload_json
      FROM operating_reading_editions
      WHERE entity_kind = ? AND entity_id = ? AND locale = ?
    `).bind(kind, id, LOCALE).first();
    const payload = parsePayload(row);
    return row && payload ? { ...row, payload } : null;
  } catch {
    return null;
  }
}

export function resolveDocumentReadingEdition(doc, entry, observedHash, locale = LOCALE) {
  if (locale !== LOCALE) return null;
  if (!entry) return metadata('unavailable');
  const sourceTitle = entry.source_title || null;
  const bound = observedHash
    && String(doc?.version) === String(entry.source_version)
    && observedHash === entry.source_hash
    && (!sourceTitle || doc?.title === sourceTitle)
    && typeof entry.payload?.title === 'string'
    && typeof entry.payload?.body === 'string';
  if (!bound) return metadata(observedHash ? 'stale' : 'unavailable', entry.source_hash, entry.source_version, sourceTitle);
  return {
    ...metadata('current', entry.source_hash, entry.source_version, sourceTitle),
    title: entry.payload.title,
    body: entry.payload.body,
  };
}

export async function documentReadingEdition(env, doc, locale = LOCALE) {
  if (locale !== LOCALE) return null;
  const entry = await readEdition(env, 'document', doc?.id);
  const observedHash = await sha256Text(doc?.body);
  return resolveDocumentReadingEdition(doc, entry, observedHash, locale);
}

export async function documentListReadingEdition(env, doc, locale = LOCALE) {
  if (locale !== LOCALE) return null;
  const edition = await documentReadingEdition(env, doc, locale);
  return {
    title: edition?.status === 'current' ? edition.title : doc.title,
    source_title: doc.title,
    localization: edition ? Object.fromEntries(Object.entries(edition).filter(([key]) => !['title', 'body'].includes(key))) : metadata('unavailable'),
    searchable_title: edition?.status === 'current' ? edition.title : null,
  };
}

export function isLocalizedDocSearchMatch(edition, query) {
  return !!query && edition?.localization?.status === 'current'
    && String(edition.searchable_title || '').toLowerCase().includes(query);
}

export function resolveRecipeReadingEdition(recipe, entry, hasAnyRevision, observedHash, locale = LOCALE) {
  if (locale !== LOCALE) return null;
  if (!entry) return metadata('unavailable');
  if (hasAnyRevision !== false) return metadata(hasAnyRevision === true ? 'stale' : 'unavailable', entry.source_hash, entry.source_version, entry.source_title);
  const payload = entry.payload;
  const bound = entry.source_version === 'legacy'
    && observedHash
    && observedHash === entry.source_hash
    && typeof payload?.name === 'string'
    && Array.isArray(payload.ingredients)
    && Array.isArray(payload.steps);
  if (!bound) return metadata(observedHash ? 'stale' : 'unavailable', entry.source_hash, entry.source_version, entry.source_title);
  return {
    ...metadata('current', entry.source_hash, entry.source_version, entry.source_title),
    name: payload.name,
    ingredients: payload.ingredients,
    steps: payload.steps,
  };
}

export async function recipeReadingEdition(recipe, entry, hasAnyRevision, locale = LOCALE) {
  if (locale !== LOCALE) return null;
  const observedHash = await sha256Text(JSON.stringify({ name: recipe?.name, ingredients: recipe?.ingredients, steps: recipe?.steps }));
  return resolveRecipeReadingEdition(recipe, entry, hasAnyRevision, observedHash, locale);
}

export async function legacyRecipeReadingEdition(env, recipeId, locale = LOCALE) {
  if (locale !== LOCALE) return null;
  const entry = await readEdition(env, 'recipe', recipeId);
  if (!entry) return metadata('unavailable');
  try {
    const recipe = await env.DB.prepare('SELECT id,name,ingredients,steps FROM recipes WHERE id=?').bind(recipeId).first();
    if (!recipe) return metadata('unavailable', entry.source_hash, entry.source_version, entry.source_title);
    const revision = await env.DB.prepare('SELECT id FROM recipe_revisions WHERE recipe_id=? ORDER BY version DESC LIMIT 1').bind(recipeId).first();
    return recipeReadingEdition(recipe, entry, !!revision, locale);
  } catch {
    return metadata('unavailable', entry.source_hash, entry.source_version, entry.source_title);
  }
}
