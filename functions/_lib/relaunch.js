// The Instagram relaunch: PREPARATION ONLY. Nothing here publishes, schedules, sends, or writes a
// post. Files under functions/_lib are NOT routed.
//
// WHAT THIS IS. The account has spent its life posting bowls, because until 2026-09-10 the
// marketing team could not see anything else (see marketing_context.js). The relaunch is the owner
// re-introducing the whole business in order: what Añejo is, then each line, then the two new ones.
// This file holds that running order as DATA — a list of prompts the owner can choose to run from
// the marketing Hub — plus the two honesty rules that must survive contact with a content
// pipeline.
//
// RULE 1 — OWNER APPROVAL IS UNCHANGED. A quick-prompt is a starting point for a DRAFT. It does not
// create one, it does not approve one, and nothing in this module touches social_posts.
//
// RULE 2 — ASSET PROVENANCE IS PART OF THE POST, NOT A FOOTNOTE.
//   · A real photograph of food Añejo cooked is DOCUMENTARY. It is evidence: this is the thing,
//     this is what you receive, someone stood over it with a camera.
//   · A generated image, and a menu-launch catalog illustration, is DESIGNED. It is promotional
//     art. It may be beautiful and it may be accurate and it is still not proof of anything.
// The brand brief says it plainly in §10: "AI-enhanced or generated illustrations must not be
// represented as documentary photos of delivered orders." So every entry below states which kind
// its image must be, and a post whose subject is a CLAIM about real food ("this is our lechón")
// carries `asset: 'documentary'` — no generated stand-in, at any deadline pressure.

/** The two kinds of image, and what each one is allowed to assert. */
export const ASSET_KINDS = Object.freeze({
  documentary: {
    key: 'documentary',
    label: 'Real photograph',
    means: 'A photograph of food Añejo actually cooked or an event Añejo actually catered. It is proof, and it must be true.',
    generated_allowed: false,
  },
  designed: {
    key: 'designed',
    label: 'Designed / illustrated',
    means: 'A generated image or an approved menu-launch catalog illustration. Promotional art — never captioned or implied to be a photo of a delivered order.',
    generated_allowed: true,
  },
});

/**
 * The relaunch running order.
 *
 * `pinned` marks the three the owner wants held at the top of the profile. La Cajita stands in for
 * Añejo Daily in the pinned three UNTIL Daily is actually live — a pinned post for a product that
 * cannot be ordered is an advert for a disappointment, so the swap is conditional on the Daily
 * schedule existing, and `pinnedNow()` below is what decides it from live data rather than from a
 * date somebody has to remember.
 *
 * `prompt` is what the owner would say to the Team Lead or the planner to get this post drafted.
 * It is a starting point, not a caption: nothing here is customer-facing copy.
 */
export const RELAUNCH_SEQUENCE = Object.freeze([
  {
    key: 'what_is_anejo', order: 1, title: 'What is Añejo?', family: 'brand_story',
    pinned: true, asset: 'documentary',
    asset_note: 'The founder/kitchen frame or a real spread. Whatever is shown must be ours.',
    prompt: 'Introduce Añejo Catering Co. from zero: one Cuban food family in Palm Beach County — catering & events, traditional Cuban plates and bites, La Cajita, Añejo Fit, Añejo Daily, and a standing office & clinic meal service. Warm, confident, no hype. End on where to order.',
  },
  {
    key: 'catering_events', order: 2, title: 'Catering & Events', family: 'catering',
    pinned: true, asset: 'documentary',
    asset_note: 'A real tray or a real spread we laid out. Brand brief §10: catering trays for catering, and lifestyle imagery must not imply clients or events that did not happen.',
    prompt: 'Añejo Catering: trays and full spreads for gatherings and teams, quoted per event. Scheduled delivery — never promise same-day. Point at the catering request form.',
  },
  {
    key: 'la_cajita', order: 3, title: 'La Cajita', family: 'cajita',
    pinned: false, asset: 'documentary',
    asset_note: 'The real boxes. Personalisation is the selling point and a generated box would show printing we cannot produce.',
    prompt: 'La Cajita: individually packed boxes, built and personalised per event. The newest addition to the family, not a separate brand. Point at the cajita builder; custom printing is quote-only and needs lead time.',
  },
  {
    key: 'croquetas', order: 4, title: 'Croquetas', family: 'traditional',
    pinned: false, asset: 'documentary',
    asset_note: 'Elongated oval Cuban croquetas, per the photo standard. A generated croqueta gets the shape wrong and the shape is the whole recognition.',
    prompt: 'The croquetas: one family, several fillings, sold by the piece, the box and the platter — and the dressed version is a different product from the regular one. Say what the dressed one adds.',
  },
  {
    key: 'traditional_cuban', order: 5, title: 'Traditional Cuban', family: 'traditional',
    pinned: false, asset: 'documentary',
    asset_note: 'The plated lechón with authentic Añejo congrí is the Traditional cover (brand brief §1). Congrí must keep its purple-brown colour and distinct grains — this is exactly the image a generator gets wrong.',
    prompt: 'Añejo Traditional: the lunch and dinner plates, the sandwiches and tacos, the sides and the desserts. Cuban comfort food, its own recipes — do not apply Fit macro language to it.',
  },
  {
    key: 'ensalada_fria', order: 6, title: 'Ensalada Fría', family: 'traditional',
    pinned: false, asset: 'documentary',
    asset_note: 'The cold macaroni salad as it is actually served — 6 oz individually, or the tray.',
    prompt: 'Ensalada fría: the cold macaroni salad, individually or by the tray. Small post, one dish, done properly.',
  },
  {
    key: 'office_clinic', order: 7, title: 'Office & Clinic Meal Service', family: 'catering',
    pinned: false, asset: 'designed',
    asset_note: 'GENERIC ONLY. No client name, no headcount, no clinic, no patient, no photograph taken inside a customer site. If a real photo is used it must be of the food, on our side of the door.',
    prompt: 'The standing weekday meal service for offices and clinics: a rotating menu, delivered on a schedule, one less decision for the team. Describe the SERVICE — never a customer, a headcount, or a location.',
  },
  {
    key: 'anejo_fit', order: 8, title: 'Añejo Fit', family: 'fit',
    pinned: false, asset: 'documentary',
    asset_note: 'MAR (salmon) is the Fit cover (brand brief §1). Full round bowl visible, sectional plating.',
    prompt: 'Añejo Fit: the seven bowls, the free macro calculator, the Macro Portal and the goal-sized weekly plans. Nutrition as approximate ranges only, never a medical claim, never an allergen safety claim.',
  },
  {
    key: 'anejo_daily', order: 9, title: 'Añejo Daily', family: 'daily',
    pinned: true, asset: 'documentary',
    asset_note: "The day's actual dish. A Daily post is a same-day offer — a stand-in image for a meal someone is about to receive is the most misleading frame on this list.",
    prompt: "Añejo Daily: one featured lunch each day, from a small allocation, ordered the same day until that day's cutoff, delivered. State the dish, the price and the cutoff EXACTLY as the live Daily context gives them, or do not state them at all.",
  },
]);

/** Look one entry up by key. */
export const relaunchEntry = (key) => RELAUNCH_SEQUENCE.find((e) => e.key === key) || null;

/**
 * The three to pin, decided from live data.
 *
 * The owner's ruling: What is Añejo? · Catering & Events · Añejo Daily — with La Cajita standing in
 * for Daily until Daily is live. "Live" means there is actually a Daily scheduled (today or next),
 * which `dailyMarketingContext(env).scheduled` answers; pass that boolean in rather than having
 * this module read the database, so a prompt list stays a prompt list.
 */
export function pinnedNow({ dailyLive = false } = {}) {
  const keys = ['what_is_anejo', 'catering_events', dailyLive ? 'anejo_daily' : 'la_cajita'];
  return keys.map(relaunchEntry).filter(Boolean);
}

/**
 * Planner drafts that were written when the team could only see bowls.
 *
 * WHY IT IS MEASURED RATHER THAN DATED. "Everything before the deploy" needs a timestamp somebody
 * has to keep correct, and would sweep up a perfectly good bowl post written yesterday. What
 * actually makes a draft stale is its CONTENT: it names Fit bowls and nothing else, on an account
 * about to re-introduce six other product lines. So the caption is matched against the live
 * catalog, family by family, and a draft is reported stale only when every product it names is a
 * bowl (or it names no product at all and predates the relaunch prep).
 *
 * NOTHING IS DELETED AND NOTHING IS CHANGED HERE. This function READS. Archiving is a separate,
 * owner-invoked operation (`op: 'archive'` on /api/hub/owner/social) that sets status='archived' —
 * a status change, never a DELETE, because a stale draft is evidence of how the team used to think
 * and that is worth keeping.
 *
 * Returns [] on any failure: a surfacing that throws would take the marketing page down with it.
 */
export async function staleBowlOnlyDrafts(env, { families, limit = 60 } = {}) {
  if (!env || !env.DB) return [];
  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, caption, image_brief, category, created_at FROM social_posts
        WHERE status = 'draft' AND source = 'planner' ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all();
    rows = (r && r.results) || [];
  } catch { return []; }
  if (!rows.length) return [];

  // name → family key, from the live catalog. Short names are skipped: a two-letter product name
  // would match inside ordinary words and report every draft as being about it.
  const index = [];
  for (const fam of families || []) {
    for (const it of fam.items || []) {
      const name = String(it.name || '').trim();
      if (name.length < 3) continue;
      index.push({ family: fam.key, name, re: new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu') });
    }
  }

  const out = [];
  for (const row of rows) {
    const text = `${row.caption || ''}\n${row.image_brief || ''}`;
    const hit = new Set();
    for (const e of index) if (e.re.test(text)) hit.add(e.family);
    const families_named = [...hit];
    // Named a non-bowl family → it is not a bowl-only draft, whatever else is wrong with it.
    if (families_named.some((f) => f !== 'fit')) continue;
    out.push({
      id: row.id,
      created_at: row.created_at,
      category: row.category || null,
      excerpt: String(row.caption || '').split('\n')[0].slice(0, 120),
      families_named,
      reason: families_named.length
        ? 'Names only Añejo Fit bowls — written before the team could see the rest of the catalog.'
        : 'Names no product on the live catalog at all.',
    });
  }
  return out;
}
