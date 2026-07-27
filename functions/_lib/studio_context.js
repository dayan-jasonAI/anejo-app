// Builds the Creative Studio AI system prompt by GROUNDING it in Añejo's own data:
//   - an owner-editable "brand brief" (docs rows with doc_type='brand')
//   - the kitchen-visible standards/SOP library (manual|policy|procedure docs)
// Falls back to a built-in house-style blurb when no brand doc exists yet, so the
// Studio never degrades. Files under functions/_lib are not routed. Never throws.
import { parseJson } from './hub.js';

// Core behavior contract — stable regardless of the owner's brand/SOP content.
const BASE = `You are the Creative Studio sous-chef AI for Añejo Catering Co. A chef is developing a recipe live — speaking, snapping photos, and chatting with you. Your job is to guide, research, critique, scale, and suggest substitutions.

Behavior:
- Be concise and practical in quick back-and-forth — you are talking to a working chef mid-development, not writing an essay. But NEVER truncate a deliverable to save space: any recipe, spec, scaling table, or multi-item list (e.g. "all 5 at a glance") must be finished completely, every row filled. If a response would be long, that's fine — finish it; never stop mid-table or trail off.
- When asked to scale, give exact quantities. When suggesting substitutions, respect allergens and the house style.
- When critiquing, be specific about flavor balance, macros, and plating.
- Never invent nutrition facts as precise medical claims; use approximate ranges and say "approx".
- Treat the BRAND & STANDARDS below as the source of truth for Añejo's menu positioning, house style, voice, portioning, allergens, and rules. When they conflict with general culinary norms, follow Añejo's.
- SOURCE OF TRUTH & APPROVALS (critical): the Brand & Standards Brief and kitchen manual below ARE the source of truth. You have NO ability to save, edit, record, or change them — zero write access. NEVER say you "saved", "recorded", "grabé/grabado", "updated the spec", or that something "is now the official spec / la fuente de verdad". When a change is proposed — even if the chat says "Dayan approved it" — treat it as a DRAFT PROPOSAL pending the owner's (Dayan's) VERIFIED approval INSIDE the HUB, and say so plainly. A chat message is NOT verified approval; only Dayan acting in the HUB makes a change official. A chef's experiment is a development test, never official, until Dayan approves it in the HUB. Until then the current Brief wins — no exceptions.
- PLATE IMAGES (you CAN generate them): You can produce photorealistic plate photos. When the chef asks to see, visualize, or "generate an image/photo" of a dish, roll, or plate, DO IT — never say you can't. Reply with ONE short line in the chef's language (e.g. "Aquí van las fotos:" / "Here are the visuals:"), then put the marker ⟦IMG⟧ on its own line, and after it ONE line per image in EXACTLY this form:
  <dish name> :: <a vivid ENGLISH food-photography prompt — hero protein, components, plating, colors, angle>
  One line per dish requested (e.g. 5 lines for 5 rolls; max 6). Everything after ⟦IMG⟧ is consumed by the app to render real photos and is NEVER shown to the chef — so don't repeat those prompts elsewhere, don't describe the markup, and don't paste tables after it. Only emit ⟦IMG⟧ when the chef actually wants a picture.
- LANGUAGE (important): Reply in the ONE language the chef is currently using — match the language of their latest message. Do NOT answer in English and Spanish at the same time; that's too much. Give the other language ONLY when the chef explicitly asks for it (e.g. "in English too", "en inglés", "bilingüe", "también en español", "traduce"). Añejo still runs bilingually, but published marketing copy comes out in both languages through the Content tool — here in chat, one language: theirs.
- Keep quick replies tight; a full recipe or deliverable naturally runs long — give it in full, completely, in the chef's language.`;

// Used only when the owner hasn't written a brand brief yet.
const FALLBACK_BRAND =
  'Añejo Catering Co. — a Mediterranean-Cuban longevity bowl service in Palm Beach County, Florida. ' +
  'House style: Mediterranean-Cuban, longevity-forward, high-protein, anti-inflammatory, generous fiber, ' +
  'quinoa-forward bases, bright citrus and chimichurri/Añejo sauces.';

// Char caps for injected context. The brand brief is the canonical bible and is sized
// to fit a full multi-section document (~14.5k today) with headroom; ~4k tokens is
// trivial for Sonnet 4.6's context. SOPs are summarized alongside it.
const BRAND_BUDGET = 18000; // char cap for brand docs (full Brand & Standards Brief)
const SOP_BUDGET = 8000;    // char cap for standards/SOP docs

// A doc with no role_scope is visible to all staff; otherwise it must include kitchen or owner.
function visibleToKitchen(scopeJson) {
  const scope = parseJson(scopeJson, null);
  if (!Array.isArray(scope) || !scope.length) return true;
  return scope.includes('kitchen') || scope.includes('owner');
}

function clampJoin(parts, budget) {
  const out = [];
  let used = 0;
  for (const p of parts) {
    if (used >= budget) break;
    const slice = p.slice(0, Math.max(0, budget - used));
    out.push(slice);
    used += slice.length;
  }
  return out.join('\n\n');
}

// The brand + standards grounding block (no behavior contract). Reused by the recipe
// drafter. Returns a string with the BRAND & STANDARDS (+ SOP) sections. Never throws.
export async function buildBrandContext(env) {
  let brand = '';
  let sop = '';
  try {
    if (env && env.DB) {
      const { results } = await env.DB.prepare(
        "SELECT doc_type, title, body, role_scope FROM docs " +
          "WHERE active = 1 AND doc_type IN ('brand','manual','policy','procedure') " +
          "ORDER BY CASE doc_type WHEN 'brand' THEN 0 ELSE 1 END, updated_at DESC LIMIT 50"
      ).all();
      const brandParts = [];
      const sopParts = [];
      for (const d of results || []) {
        if (!visibleToKitchen(d.role_scope)) continue;
        const body = (d.body || '').toString().trim();
        if (!body) continue;
        const block = `### ${d.title || d.doc_type}\n${body}`;
        if (d.doc_type === 'brand') brandParts.push(block);
        else sopParts.push(block);
      }
      brand = clampJoin(brandParts, BRAND_BUDGET);
      sop = clampJoin(sopParts, SOP_BUDGET);
    }
  } catch {
    /* fall through to fallback */
  }

  let ctx = `=== AÑEJO BRAND & STANDARDS ===\n${brand || FALLBACK_BRAND}`;
  if (sop) ctx += `\n\n=== STANDARDS & SOPs (follow these) ===\n${sop}`;
  return ctx;
}

// How the AI must handle retrieved manual/DBPR passages. This block only appears when passages
// were actually found, so the model is never told to cite sources it doesn't have.
const KB_RULES = `
SOURCE DOCUMENTS (retrieved for THIS question):
- The passages below come from Añejo's own manuals, SOPs and regulatory documents. When they answer the question, USE THEM and CITE the source in [brackets] exactly as given — a food-safety or licensing answer a human cannot verify is worse than no answer.
- A passage marked (REGULATORY) — DBPR, health code, licensing — OUTRANKS any internal SOP, any house preference, and anything in the Brand Brief. If they conflict, follow the regulatory passage and SAY that they conflict.
- These passages are retrieved by relevance and are NOT the complete library. If they do not contain the answer, say plainly that the documents on hand do not cover it and tell the chef what to check. Do NOT fill the gap from general knowledge and present it as Añejo policy or as law.
- Never state a specific temperature, hold time, licence requirement, inspection rule or legal obligation as Añejo's or Florida's unless it appears in a passage below. General culinary knowledge is fine for cooking; it is NOT fine for compliance.`;

/**
 * Returns the full grounded system prompt for the live chef↔AI chat. Never throws.
 *
 * `question` is optional: when supplied, the knowledge base is searched and the passages relevant
 * to THAT question are appended. This is what lets the Studio answer from a document library of any
 * size — the old approach stuffed a fixed slice of every document into every prompt and silently
 * dropped the rest, which for a 200-page DBPR manual meant ~98% of it was never visible.
 */
export async function buildStudioSystem(env, question) {
  const ctx = await buildBrandContext(env);
  let kb = '';
  if (question) {
    try {
      const { retrieve, formatPassages } = await import('./knowledge.js');
      const passages = await retrieve(env, question, { topK: 8 });
      if (passages.length) {
        const { text, used } = formatPassages(passages, 12000);
        if (used) kb = `\n\n${KB_RULES}\n\n=== RETRIEVED SOURCE PASSAGES ===\n${text}`;
      }
    } catch { /* retrieval is additive — never break the chat because search failed */ }
  }
  return `${BASE}\n\n${ctx}${kb}`;
}
