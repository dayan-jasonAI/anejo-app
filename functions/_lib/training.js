// Team Training: renders the owner's plain-language rules + flagged reference-image notes into
// prompt-ready text for the marketing team (Team Lead chat, Content/Studio planners). Files under
// functions/_lib are not routed.
//
// THE PROBLEM THIS SOLVES. The only way to "teach the team" used to be editing
// docs/brand-standards-brief.md on a laptop and redeploying — the owner said plainly that this
// doesn't work for him, and that future owners need to train from the HUB itself.
// `tools/cardgen/references/` looks like a training folder but nothing reads it at runtime.
// This file is the runtime reader: one function, `trainingContext()`, that the planner / Team
// Lead prompt can call to find out what the owner has actually taught, today, from his phone.
//
// BUDGETED ON PURPOSE (same discipline as knowledge.js/studio_context.js). A brand brief that
// silently truncates is merely lossy; an unbounded pile of "never do this" notes injected into
// every prompt would eventually blow the context window and start dropping content with no
// signal that it happened. So: newest/most-recently-edited first, hard char cap, and anything
// past the cap is dropped from the OLDEST end — i.e. the guidance the owner is least likely to
// still be thinking about is what gets cut, not what he just wrote.
export const DEFAULT_MAX_CHARS = 6000; // headroom inside the Team Lead's larger prompt budgets

// ---------------------------------------------------------------------------
// Loading (D1)
// ---------------------------------------------------------------------------

/**
 * Load active rules + examples, each already ordered newest-edited-first within its own kind.
 * Returns { rules, examples } — plain rows, never throws (a DB hiccup must not crash whatever
 * planner is grounding on this; it degrades to "no training yet", not a 500).
 */
export async function loadTraining(env) {
  if (!env || !env.DB) return { rules: [], examples: [] };
  let rules = [];
  let examples = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, text, created_by, created_at, updated_at FROM training_rules WHERE active = 1 ORDER BY updated_at DESC LIMIT 500'
    ).all();
    rules = (r && r.results) || [];
  } catch { rules = []; }
  try {
    const r = await env.DB.prepare(
      'SELECT id, media_key, note, flag, created_by, created_at, updated_at FROM training_examples WHERE active = 1 ORDER BY updated_at DESC LIMIT 500'
    ).all();
    examples = (r && r.results) || [];
  } catch { examples = []; }
  return { rules, examples };
}

// ---------------------------------------------------------------------------
// Rendering (pure — testable without a database)
// ---------------------------------------------------------------------------

// One rule → one bullet line, or null for a whitespace-only rule (never rendered as an empty
// bullet). Whitespace-normalized so a pasted multi-line note doesn't break the bullet list.
function ruleLine(r) {
  const text = String((r && r.text) || '').replace(/\s+/g, ' ').trim();
  return text ? `- ${text}` : null;
}

// One example → one labeled block, or null for a whitespace-only note. The flag is spelled out
// in words ("GOOD EXAMPLE" / "AVOID THIS") rather than left as a bare badge, because this text is
// read by a model, not a human looking at a colored chip.
function exampleLine(e) {
  const note = String((e && e.note) || '').replace(/\s+/g, ' ').trim();
  if (!note) return null;
  const label = e.flag === 'bad' ? 'AVOID THIS' : 'GOOD EXAMPLE';
  return `- [${label}] ${note}`;
}

const HEADER = "=== OWNER'S TRAINING FOR THE MARKETING TEAM ===";
const RULES_LABEL = 'RULES (always follow):';
const EXAMPLES_LABEL = 'REFERENCE EXAMPLES (from photos the owner flagged):';

/**
 * Format loaded rows into the prompt block, budget-capped.
 * `rules`/`examples` must already be newest-first (loadTraining's ORDER BY); this function only
 * clamps and joins, so it stays a pure, order-preserving function that's easy to unit test
 * independent of D1.
 *
 * Returns { text, usedChars, totalChars, ruleCount, exampleCount, truncated }.
 * `truncated` is what the HUB page uses to warn the owner that not everything he wrote is
 * actually reaching the team — the anti-"generic AI" feature this whole page exists for.
 */
export function formatTraining({ rules = [], examples = [] } = {}, maxChars = DEFAULT_MAX_CHARS) {
  const ruleLines = rules.map(ruleLine).filter(Boolean);
  const exampleLines = examples.map(exampleLine).filter(Boolean);

  if (!ruleLines.length && !exampleLines.length) {
    return { text: '', usedChars: 0, totalChars: 0, ruleCount: 0, exampleCount: 0, truncated: false };
  }

  const fullText = [
    HEADER,
    ruleLines.length ? `${RULES_LABEL}\n${ruleLines.join('\n')}` : '',
    exampleLines.length ? `${EXAMPLES_LABEL}\n${exampleLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  const totalChars = fullText.length;

  if (totalChars <= maxChars) {
    return { text: fullText, usedChars: totalChars, totalChars, ruleCount: ruleLines.length, exampleCount: exampleLines.length, truncated: false };
  }

  // Over budget: rebuild block-by-block instead of slicing the joined string, so a cut always
  // lands on a whole line, never mid-sentence. `rules`/`examples` arrive newest-first (see
  // loadTraining's ORDER BY), so lines are kept from the FRONT of each array and dropped off the
  // back — the guidance the owner is least likely to still be thinking about is what gets cut.
  // Rules are fit before examples: they're direct instructions the team must act on, so a rule
  // written five minutes ago must never lose its budget seat to an older example photo's note.
  let used = HEADER.length;
  const parts = [HEADER];

  function fitBlock(lines, label) {
    const openCost = 2 /* '\n\n' before this block */ + label.length + 1 /* label's own '\n' */;
    if (used + openCost > maxChars) return 0;
    const kept = [];
    let cost = used + openCost;
    for (const line of lines) {
      const lineCost = line.length + (kept.length ? 1 : 0); // '\n' joining to the previous kept line
      if (cost + lineCost > maxChars) break;
      kept.push(line);
      cost += lineCost;
    }
    if (!kept.length) return 0;
    parts.push(`${label}\n${kept.join('\n')}`);
    used = cost;
    return kept.length;
  }

  const ruleCount = fitBlock(ruleLines, RULES_LABEL);
  const exampleCount = fitBlock(exampleLines, EXAMPLES_LABEL);

  const text = parts.join('\n\n');
  return { text, usedChars: text.length, totalChars, ruleCount, exampleCount, truncated: true };
}

// ---------------------------------------------------------------------------
// The contract other modules import
// ---------------------------------------------------------------------------

/**
 * Returns the owner's training rendered as prompt-ready text, budget-capped at `maxChars`.
 * On a fresh install (no rules, no examples) this returns '' — an EMPTY STRING, not a fallback
 * blurb — so a caller that concatenates it into a system prompt adds nothing, and the HUB page
 * can honestly tell the owner "the team has not been trained yet" instead of implying guidance
 * exists when it doesn't.
 *
 *   const guidance = await trainingContext(env, { maxChars: 4000 });
 *   if (guidance) systemPrompt += `\n\n${guidance}`;
 *
 * Never throws: a DB or query failure degrades to '' exactly like "no training yet", because a
 * planner that can't ground itself should fall back to its existing behavior, not error out.
 */
export async function trainingContext(env, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  try {
    const { rules, examples } = await loadTraining(env);
    if (!rules.length && !examples.length) return '';
    return formatTraining({ rules, examples }, maxChars).text;
  } catch {
    return '';
  }
}

/**
 * Same data, richer shape — for the HUB page's "see what the team currently believes" panel.
 * This is the literal text `trainingContext()` would inject (same formatter, same ordering)
 * plus the stats needed to warn the owner when his library has grown past what fits: total
 * counts, how many made it in, and whether anything was cut.
 */
export async function trainingPreview(env, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const { rules, examples } = await loadTraining(env);
  const formatted = formatTraining({ rules, examples }, maxChars);
  return {
    ...formatted,
    totalRules: rules.length,
    totalExamples: examples.length,
    maxChars,
  };
}
