// Read a PDF with Claude when the cheap paths fail.
//
// WHY. Two extractors ahead of this one both failed on the first real document — DBPR Industry
// Bulletin 2026-01:
//   • env.AI.toMarkdown returned the PDF's metadata and an EMPTY Contents section. 71,000
//     characters of text in the file, 807 characters of author/producer fields out.
//   • The built-in stream extractor (_lib/pdftext.js) recovered the prose but produced mojibake for
//     every run set in a subsetted font with a custom /Differences encoding — "$GYHUWLVLQJ³IUHVK´"
//     instead of "Advertising 'fresh'". Decoding that properly means parsing each font's ToUnicode
//     CMap, which is a lot of machinery to get subtly wrong.
//
// Claude reads PDFs natively — text layer AND page images — so it handles subsetted fonts, scans
// and tables without any of that. For a document library that will be quoted back as food-safety
// and licensing guidance, correctness beats cleverness, and we already have the API key.

import { budgetGate, recordSpend } from './ai_budget.js';

const MODEL = 'claude-sonnet-4-5';

// Claude's PDF support has a page ceiling per request, and a bulletin is a few pages while a full
// manual is not. Callers split large documents; this guards the single-request case.
export const MAX_PDF_BYTES = 12 * 1024 * 1024;

const PROMPT = `Transcribe this document to clean Markdown.

Rules:
- Reproduce the text EXACTLY as written. Do not summarize, paraphrase, shorten, or "improve" anything — this will be quoted back as regulatory and food-safety guidance, so every number, temperature, deadline, statute reference and defined term must survive verbatim.
- Keep the document's own headings and hierarchy. Use "### Page N" before the content of each page so passages can be cited by page.
- Render bullet and numbered lists as Markdown lists. Render tables as Markdown tables.
- Include headers, footers, form numbers, bulletin numbers, effective dates and signature blocks — in a regulatory document those ARE content.
- If a page is genuinely blank or purely decorative, write "### Page N" and nothing else.
- Output ONLY the transcription. No preamble, no commentary, no code fences.`;

function toBase64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/**
 * Transcribe a PDF with Claude. Returns markdown, or '' on any failure.
 * `bytes` is a Uint8Array of the raw PDF.
 */
export async function extractPdfWithClaude(env, bytes) {
  if (!env || !env.ANTHROPIC_API_KEY || !bytes || !bytes.length) return '';
  if (bytes.length > MAX_PDF_BYTES) return '';
  // Weekly AI budget spent → '' like every other failure here; a PDF transcription is the
  // single most expensive call in the codebase and must not be the one that blows the ceiling.
  if (!(await budgetGate(env)).ok) return '';

  let b64;
  try { b64 = toBase64(bytes); } catch { return ''; }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (!r.ok) {
      console.log('pdf claude extract failed:', r.status, (await r.text()).slice(0, 200));
      return '';
    }
    const data = await r.json();
    await recordSpend(env, { feature: 'pdf_extract', model: MODEL, usage: data.usage });
    let out = ((data.content && data.content[0] && data.content[0].text) || '').trim();
    if (out.indexOf('```') === 0) out = out.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    return out;
  } catch (e) {
    console.log('pdf claude extract error:', e && e.message);
    return '';
  }
}

/**
 * Does extracted text look like mojibake rather than prose?
 *
 * A subsetted font with a custom encoding yields runs like "$GYHUWLVLQJ³IUHVK´" — plenty of
 * letters, but almost no real words. Indexing that is worse than indexing nothing: it retrieves
 * on nonsense and gets cited as if it were the manual. Heuristic: real English/Spanish prose is
 * mostly short common words and normal spacing.
 */
export function looksGarbled(text) {
  const s = String(text || '');
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, '').length;
  if (letters < 200) return false;             // too short to judge

  const words = s.split(/\s+/).filter((w) => /[a-zA-ZÀ-ÿ]/.test(w));
  if (!words.length) return true;

  // Common function words in EN and ES. Real prose is full of them; mojibake has almost none.
  const COMMON = /^(the|and|of|to|a|in|is|for|or|that|with|as|be|are|on|not|this|by|from|it|an|at|if|must|may|shall|de|la|el|los|las|que|en|un|una|por|con|para|se|del|al|no|es|y|o)$/i;
  const hits = words.filter((w) => COMMON.test(w.replace(/[^a-zA-ZÀ-ÿ]/g, ''))).length;
  const ratio = hits / words.length;

  // Mixed-case-inside-word noise ("GYHUWLVLQJ") is another strong signal.
  const weird = words.filter((w) => /[a-z][A-Z]|[A-Z]{3,}[a-z]/.test(w)).length / words.length;

  return ratio < 0.04 || weird > 0.35;
}
