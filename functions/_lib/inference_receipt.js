// Private, append-only evidence for the EXACT serialized text request sent to a model.
// Callers serialize ONCE, pass requestJson here, and use that identical string as fetch.body.
// This helper never calls a provider, reads credentials, logs prompts or creates public routes.
// input_recorded means storage succeeded; transport remains unknown until separately evidenced.
import { id } from './util.js';

export const INFERENCE_REQUEST_MAX_BYTES = 262144;
export const INFERENCE_COMPONENTS_MAX_BYTES = 65536;
const SURFACES = new Set(['team_lead', 'social_plan']);
const COMPONENTS = new Set(['brand', 'training', 'menu', 'briefs', 'intel', 'knowledge', 'operations', 'performance', 'retrospective', 'history', 'product_lines', 'asset_registry']);
const FIELDS = new Set(['schema', 'source', 'read_status', 'reads', 'rendered_sha256', 'original_chars', 'supplied_chars', 'truncated', 'rules', 'examples', 'documents', 'source_ids', 'id', 'updated_at', 'selection_limit', 'selection_may_be_limited', 'requested_sections', 'strict_sections', 'section_fallback', 'fallback_reason', 'asset_revision', 'content_sha256']);
const READ_STATES = new Set(['ok', 'empty', 'unavailable', 'partial', 'unknown', 'not_supplied']);
const SENSITIVE_KEY = /authorization|cookie|password|secret|credential|api.?key|access.?token|refresh.?token|headers/i;
const SENSITIVE_VALUE = /\b(?:sk-ant-|sk-proj-|sk_live_|sk_test_|Bearer\s+)[A-Za-z0-9_-]{8,}/i;
const bytes = text => new TextEncoder().encode(text);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(text))), b => b.toString(16).padStart(2, '0')).join('');

function safeStrings(value, depth = 0) {
  if (depth > 12) return false;
  if (typeof value === 'string') return !SENSITIVE_VALUE.test(value);
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every(v => safeStrings(v, depth + 1));
  if (!plain(value)) return false;
  return Object.entries(value).every(([key, v]) => !SENSITIVE_KEY.test(key) && safeStrings(v, depth + 1));
}

// A deliberately narrow subset for private text strategies: one closed object with
// required string/string-array fields. Do not permit provider tools, refs, open objects
// or arbitrary schema/config extensions into a supposedly text-only private receipt.
function validOutputConfig(config) {
  if (!plain(config) || Object.keys(config).length!==1 || !plain(config.format)) return false;
  const format=config.format;
  if (Object.keys(format).length!==2 || format.type!=='json_schema' || !plain(format.schema)) return false;
  const schema=format.schema;
  if (Object.keys(schema).length!==4 || schema.type!=='object' || schema.additionalProperties!==false || !plain(schema.properties) || !Array.isArray(schema.required)) return false;
  const fields=Object.keys(schema.properties);
  if (!fields.length || fields.length>32 || fields.some(k=>!/^[a-z][a-z0-9_]{0,63}$/.test(k)) || schema.required.length!==fields.length || new Set(schema.required).size!==fields.length || !schema.required.every(k=>fields.includes(k))) return false;
  const description=node=>node.description===undefined || typeof node.description==='string' && node.description.length<=500;
  const stringNode=node=>plain(node) && node.type==='string' && Object.keys(node).every(k=>['type','description','enum'].includes(k)) && description(node) &&
    (node.enum===undefined || Array.isArray(node.enum) && node.enum.length>0 && node.enum.length<=256 && new Set(node.enum).size===node.enum.length && node.enum.every(v=>typeof v==='string' && v.length>0 && v.length<=160));
  if (!fields.every(k=>{
    const node=schema.properties[k];
    return stringNode(node) || plain(node) && node.type==='array' && Object.keys(node).every(k=>['type','description','items'].includes(k)) && description(node) && stringNode(node.items);
  })) return false;
  return bytes(JSON.stringify(config)).length<=16384;
}

function validRequest(request) {
  if (!plain(request) || !safeStrings(request)) return false;
  const allowed = new Set(['model', 'max_tokens', 'system', 'messages', 'temperature', 'stop_sequences', 'output_config']);
  if (Object.keys(request).some(key => !allowed.has(key))) return false;
  if (request.output_config !== undefined && !validOutputConfig(request.output_config)) return false;
  if (typeof request.model !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,150}$/.test(request.model)) return false;
  if (!Number.isSafeInteger(request.max_tokens) || request.max_tokens < 1 || request.max_tokens > 64000) return false;
  if (typeof request.system !== 'string') return false;
  if (!Array.isArray(request.messages) || !request.messages.length || request.messages.length > 50) return false;
  if (!request.messages.every(m => plain(m) && Object.keys(m).every(k => ['role', 'content'].includes(k)) && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')) return false;
  if (request.temperature !== undefined && (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 1)) return false;
  if (request.stop_sequences !== undefined && (!Array.isArray(request.stop_sequences) || request.stop_sequences.length > 20 || !request.stop_sequences.every(s => typeof s === 'string'))) return false;
  return true;
}

function validMetadata(value, depth = 0) {
  if (depth > 10 || !safeStrings(value)) return false;
  if (Array.isArray(value)) return value.every(v => validMetadata(v, depth + 1));
  if (!plain(value)) return value === null || ['string', 'number', 'boolean'].includes(typeof value);
  return Object.entries(value).every(([key, v]) => {
    if (!FIELDS.has(key)) return false;
    if (key === 'strict_sections' && typeof v !== 'boolean') return false;
    if (key === 'read_status' && !READ_STATES.has(v)) return false;
    if (key === 'rendered_sha256' && !/^[0-9a-f]{64}$/.test(v)) return false;
    if (key === 'reads') return plain(v) && Object.entries(v).every(([k, state]) => ['rules', 'examples'].includes(k) && READ_STATES.has(state));
    if (key === 'selection_may_be_limited' && plain(v)) return Object.entries(v).every(([k, flag]) => ['rules', 'examples'].includes(k) && typeof flag === 'boolean');
    return validMetadata(v, depth + 1);
  });
}

/** No raw inputs or database error messages are returned on refusal. */
export async function persistInferenceReceipt(env, { surface, requestJson, components = {} } = {}) {
  if (!SURFACES.has(surface)) return { ok: false, persisted: false, reason: 'unsupported_surface' };
  if (typeof requestJson !== 'string' || bytes(requestJson).length > INFERENCE_REQUEST_MAX_BYTES) return { ok: false, persisted: false, reason: 'request_size_or_type' };
  let request, componentsJson;
  try {
    request = JSON.parse(requestJson);
    // Accept JSON.stringify output with optional pretty-print whitespace. Reject duplicate
    // keys/alternative string encodings: validation must cover EVERY byte retained, not
    // only the last value JSON.parse chooses for a duplicated content/header field.
    const compact = requestJson.replace(/"(?:\\.|[^"\\])*"|\s+/g, token => token.startsWith('"') ? token : '');
    if (compact !== JSON.stringify(request)) return { ok: false, persisted: false, reason: 'ambiguous_serialization' };
    if (!validRequest(request)) return { ok: false, persisted: false, reason: 'unsupported_or_sensitive_request' };
    if (!plain(components) || !Object.entries(components).every(([key, value]) => COMPONENTS.has(key) && plain(value) && validMetadata(value))) return { ok: false, persisted: false, reason: 'unsupported_or_sensitive_metadata' };
    componentsJson = JSON.stringify(components);
    if (bytes(componentsJson).length > INFERENCE_COMPONENTS_MAX_BYTES) return { ok: false, persisted: false, reason: 'metadata_size' };
  } catch { return { ok: false, persisted: false, reason: 'invalid_input' }; }
  if (!env?.DB) return { ok: false, persisted: false, reason: 'storage_unavailable' };
  try {
    const receiptId = id('inf');
    const hash = await digest(requestJson);
    const createdAt = Date.now();
    const result = await env.DB.prepare(`INSERT INTO inference_receipts
      (id, surface, model, request_json, request_sha256, components_json, evidence_status, transport_status, created_at)
      VALUES (?,?,?,?,?,?,'input_recorded','unknown',?)`)
      .bind(receiptId, surface, request.model, requestJson, hash, componentsJson, createdAt).run();
    if (result?.success === false || result?.meta?.changes !== 1) return { ok: false, persisted: false, reason: 'storage_write_unconfirmed' };
    return { ok: true, persisted: true, receipt_id: receiptId, request_sha256: hash, created_at: createdAt, evidence_status: 'input_recorded', transport_status: 'unknown' };
  } catch { return { ok: false, persisted: false, reason: 'storage_write_failed' }; }
}
