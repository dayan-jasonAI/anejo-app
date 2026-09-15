// Owner-typed quote lines.
//
// Dayan, 2026-09-10: "my decision should override whatever the hub has as a standing rule ... I
// want you to add the option to manually modify pricing directly from the catering section in the
// hub instead of having the hub override me."
//
// The Agreed total already honoured what he typed. What did not exist was per-LINE control: the
// quote email printed whatever the estimator had computed, so a line he had priced by hand — the
// skewers he sold at $60 when the ladder said $80 — could not be shown to the customer at his
// number. That is the gap this closes.
//
// THE ONE RULE THAT MATTERS: the lines the customer reads and the amount the card is charged come
// from the SAME array. There is no second path. normalizeQuoteLines returns the subtotal it
// computed, the caller charges that, and a caller that also passes its own total is refused rather
// than reconciled — a quote whose lines say one thing and whose deposit says another is the exact
// failure this whole desk exists to prevent.
//
// Money is INTEGER CENTS. A float here is rejected, not rounded: a float means somebody put
// dollars in a cents field, and silently multiplying it by 100 is how a $60 line becomes $0.60.

export const MAX_LINES = 40;
export const MAX_NAME = 120;
export const MAX_DETAIL = 160;
export const MAX_QTY = 12;
// The same $100,000 ceiling the Agreed total uses — a quote is a number a human typed under time
// pressure, and the ceiling catches dollars-where-cents-were-meant before Square does.
export const MAX_TOTAL_CENTS = 10000000;

// Images are optional and only ever name a file under /assets/img/. Same shape the menu editor
// accepts: a bare filename or one subfolder deep, each segment starting with an alphanumeric so
// ".." and a leading "/" cannot get through.
const IMAGE = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|avif)$/;

const text = (v, max) => {
  if (v == null) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
};

/**
 * Validate and normalize the lines an owner typed in the Hub.
 *
 * @param {unknown} raw - the `lines` array off the request body.
 * @returns {{ok: true, lines: object[], subtotal_cents: number} | {ok: false, error: string}}
 */
export function normalizeQuoteLines(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'lines must be a list.' };
  if (raw.length === 0) return { ok: false, error: 'Add at least one line, or leave the lines out and type an agreed total.' };
  if (raw.length > MAX_LINES) return { ok: false, error: `That is more than ${MAX_LINES} lines — group them before sending.` };

  const lines = [];
  let subtotal = 0;

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    const at = `Line ${i + 1}`;
    if (!row || typeof row !== 'object') return { ok: false, error: `${at} is not a line.` };

    const name = text(row.name, MAX_NAME);
    if (!name) return { ok: false, error: `${at} needs a name — the customer has to read what she is paying for.` };

    // Number('') is 0 and Number(null) is 0. Both would price a line at nothing without saying so,
    // so an empty price is a refusal and not a zero.
    if (row.cents == null || row.cents === '') return { ok: false, error: `${at} ("${name}") needs a price.` };
    const cents = Number(row.cents);
    if (!Number.isInteger(cents)) return { ok: false, error: `${at} ("${name}") must be a whole number of cents.` };
    if (cents < 0) return { ok: false, error: `${at} ("${name}") cannot be negative.` };
    if (cents > MAX_TOTAL_CENTS) return { ok: false, error: `${at} ("${name}") is over $100,000 — enter cents, not dollars.` };

    const image = text(row.image, 200);
    if (image && !IMAGE.test(image)) {
      return { ok: false, error: `${at} ("${name}") has an image that is not a file under /assets/img/.` };
    }

    lines.push({
      name,
      name_es: text(row.name_es, MAX_NAME) || undefined,
      detail: text(row.detail, MAX_DETAIL) || undefined,
      detail_es: text(row.detail_es, MAX_DETAIL) || undefined,
      qty: text(row.qty, MAX_QTY) || undefined,
      cents,
      image: image || undefined,
    });
    subtotal += cents;
  }

  // A line may be $0 — "included, courtesy of the house" is a real line on a real quote. The whole
  // quote may not be: a $0 total would mint a Square link for nothing.
  if (subtotal <= 0) return { ok: false, error: 'The lines add up to $0.00 — at least one has to carry a price.' };
  if (subtotal > MAX_TOTAL_CENTS) return { ok: false, error: 'The lines add up to over $100,000 — check for dollars typed into a cents field.' };

  return { ok: true, lines, subtotal_cents: subtotal };
}
