// POST /api/plans/translate — translate a plan's AI prose (rationale + lifestyle notes) into the
// requested language so the plan page can switch EN⇄ES without regenerating the plan.
// Body: { target_lang: 'en'|'es', rationale: string, lifestyle_notes: string[] }
// Returns: { rationale, lifestyle_notes } in the target language. Stateless; rate-limited.
import { json, bad } from '../../_lib/util.js';
import { limitOr429 } from '../../_lib/ratelimit.js';

const MODEL = 'claude-sonnet-4-6';

// Canonical legal disclaimer per language — must match functions/api/plans/generate.js.
const DISCLAIMER = {
  en: 'This plan is for general fitness and wellness. It is not medical advice. Consult your healthcare provider before starting any new nutrition program.',
  es: 'Este plan es para fitness y bienestar general. No es consejo médico. Consulta a tu proveedor de salud antes de comenzar cualquier programa de nutrición.',
};

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'translate', limit: 12, windowSec: 60 });
  if (limited) return limited;
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'Translation is not available right now.' }, 503);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const target = b.target_lang === 'es' ? 'es' : 'en';
  const rationale = typeof b.rationale === 'string' ? b.rationale.slice(0, 4000) : '';
  const notes = Array.isArray(b.lifestyle_notes)
    ? b.lifestyle_notes.slice(0, 12).map((n) => String(n).slice(0, 500))
    : [];
  if (!rationale && !notes.length) return bad('Nothing to translate.');

  const langName = target === 'es' ? 'natural, fluent Latin American Spanish' : 'natural, fluent English';
  const system = `You are a translator for Añejo Catering Co. Translate the given meal-plan text into ${langName}, preserving meaning, tone, and any numbers. Do NOT translate brand or bowl names (Añejo, VIDA, FUEGO, LIGERO, MAR, COCO, CONGREEN, RAÍZ). Return ONLY a JSON object — no prose, no markdown fences — of the form {"rationale": "...", "lifestyle_notes": ["...", "..."]}. Keep the same number of lifestyle_notes items, in order. The FINAL lifestyle_notes item MUST be exactly: "${DISCLAIMER[target]}"`;

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: JSON.stringify({ rationale, lifestyle_notes: notes }) }],
      }),
    });
  } catch (e) {
    return json({ error: 'Upstream translation call failed.' }, 502);
  }
  if (!r.ok) return json({ error: 'Translation service is briefly unavailable.' }, 502);

  const data = await r.json();
  const text = (data.content || []).map((c) => c.text || '').join('');

  let out;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('no JSON');
    out = JSON.parse(cleaned.slice(first, last + 1));
  } catch (e) {
    return json({ error: 'Translation could not be parsed.' }, 502);
  }

  out.rationale = typeof out.rationale === 'string' ? out.rationale : rationale;
  out.lifestyle_notes = Array.isArray(out.lifestyle_notes) ? out.lifestyle_notes : notes;
  // Enforce the canonical disclaimer as the final bullet regardless of what the model returned.
  if (out.lifestyle_notes.length) out.lifestyle_notes[out.lifestyle_notes.length - 1] = DISCLAIMER[target];
  else out.lifestyle_notes = [DISCLAIMER[target]];

  return json(out);
};

export const onRequest = ({ request }) => {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed. Use POST.' }, 405);
};
