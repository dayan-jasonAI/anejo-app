// The gift reveal, as it appears on a paid quote.
//
// Dayan, 2026-09-10: "no deposit means no gift animation, she is only getting this if she makes
// the payment."
//
// TWO gates, both server-side and both required:
//   1. the quote's deposit_status is 'paid' — the Square webhook sets that, nothing else does; and
//   2. the quote's own quote_json carries a `gift`.
//
// The second one exists because the reveal SAYS a cake is included, free. If it played for every
// paid deposit it would be promising a free tres leches to every catering customer who books —
// a thing the kitchen would then owe them. A gift is a decision recorded on one quote, not a
// behaviour of the checkout.
export const GIFTS = {
  'tres-leches-fresa': {
    en: { eyebrow: 'A gift from Añejo', sub: 'Your strawberry tres leches is included — on the house, to celebrate your day.' },
    es: { eyebrow: 'Un regalo de Añejo', sub: 'Su tres leches de fresa va incluido — cortesía de la casa, para celebrar su día.' },
  },
};

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {object} opts
 * @param {string} opts.gift  key into GIFTS; an unknown key renders nothing at all
 * @param {string} opts.name  the customer's first name, for the headline
 * @param {'en'|'es'} opts.lang
 * @returns {string} HTML, or '' when there is no such gift
 */
export function cakeRevealHtml({ gift, name, lang } = {}) {
  const g = GIFTS[gift];
  if (!g) return '';
  const L = lang === 'es' ? 'es' : 'en';
  const copy = g[L];
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const headline = L === 'es'
    ? (first ? `Feliz cumpleaños, ${first}` : '¡Feliz cumpleaños!')
    : (first ? `Happy birthday, ${first}` : 'Happy birthday!');

  return `<style>${CSS}</style>
<div id="cr-root" data-name="${esc(first)}" data-lang="${L}">
  <div id="cr-stage">
    <div id="cr-beat"></div>
    <div id="cr-copy">
      <p class="cr-eyebrow">${esc(copy.eyebrow)}</p>
      <p class="cr-name">${esc(headline)}</p>
      <p class="cr-sub">${esc(copy.sub)}</p>
    </div>
  </div>
  <div id="cr-foot">
    <span class="cr-mark">AÑEJO</span>
    <button id="cr-replay" type="button">${L === 'es' ? 'Verlo otra vez' : 'Play again'}</button>
  </div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="/assets/js/cake-reveal.js"></script>`;
}

const CSS = `#cr-root{position:relative;background:var(--ivory);color:var(--ink);font-family:var(--sans);font-weight:300;border-radius:12px;overflow:hidden;max-width:560px;margin:0 auto 20px;box-shadow:0 10px 30px rgba(40,30,15,.14)}
#cr-stage{position:relative;height:min(74vh,560px)}
/* Palette lifted from her invitation: parchment ground, antique gold, ivory florals, and the one
   loud thing in the whole piece — the red of the bow and the strawberries. */
:root{
  --ivory:#F7F2E7; --cream:#FFFDF8; --parchment:#EFE6D4;
  --gold:#B0904F; --gold-lt:#D8C48A;
  --crimson:#B31E28;
  --ink:#4A3F30; --muted:#8A7B63;
  --display:"Cormorant Garamond",Georgia,serif;
  --script:"Great Vibes","Cormorant Garamond",cursive;
  --sans:"Josefin Sans","Helvetica Neue",Arial,sans-serif;
}
#cr-root *{box-sizing:border-box}

#cr-stage{position:relative;flex:1;min-height:64svh}
canvas{display:block;width:100%;height:100%}
/* Lens vignette and sensor grain. Nothing shot through glass is evenly bright corner to corner,
   and nothing recorded by a sensor is perfectly clean — leaving both out is part of what makes a
   clean render read as a render. */
#cr-stage::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(ellipse 82% 74% at 50% 44%,rgba(0,0,0,0) 62%,rgba(60,48,30,.08) 90%,rgba(50,38,22,.16) 100%),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='.05'/></svg>");
  mix-blend-mode:multiply}

/* The copy lands only at the end, on a parchment scrim so it never fights the cake for the eye. */
#cr-copy{position:absolute;inset:auto 0 0 0;padding:78px 20px 30px;text-align:center;pointer-events:none;
  background:linear-gradient(to top,rgba(247,242,231,.96) 44%,rgba(247,242,231,.74) 70%,rgba(247,242,231,0) 100%)}
.cr-eyebrow{font-size:.66rem;letter-spacing:.30em;text-transform:uppercase;color:var(--gold);margin:0;
  opacity:0;transform:translateY(8px);transition:opacity .9s ease,transform .9s ease}
.cr-name{font-family:var(--script);font-size:clamp(2.8rem,12vw,4.4rem);line-height:1;margin:2px 0 0;
  color:var(--gold);opacity:0;transform:translateY(16px) scale(.96);
  transition:opacity 1.1s ease .18s,transform 1.1s cubic-bezier(.2,.9,.3,1.2) .18s}
.cr-sub{font-family:var(--display);font-size:clamp(1rem,3.4vw,1.25rem);color:var(--ink);max-width:30ch;
  margin:10px auto 0;line-height:1.5;font-style:italic;
  opacity:0;transform:translateY(10px);transition:opacity 1s ease .5s,transform 1s ease .5s}
#cr-root.revealed .cr-eyebrow,#cr-root.revealed .cr-name,#cr-root.revealed .cr-sub{opacity:1;transform:none}

/* The build-up caption, above the box while it is still closed. */
#cr-beat{position:absolute;inset:auto 0 auto 0;top:7%;text-align:center;font-family:var(--display);
  font-size:clamp(1.05rem,3.6vw,1.4rem);font-style:italic;color:var(--muted);opacity:0;
  transition:opacity .7s ease;pointer-events:none;padding:0 22px}
#cr-beat.on{opacity:1}

#cr-foot{padding:16px 20px 22px;border-top:1px solid var(--parchment);display:flex;flex-wrap:wrap;
  gap:12px;align-items:center;justify-content:space-between;background:var(--cream)}
.cr-mark{font-family:var(--display);font-size:1.05rem;letter-spacing:4px;color:var(--gold)}
.cr-note{font-size:.74rem;color:var(--muted);max-width:44ch;line-height:1.5}
#cr-root button{font-family:var(--sans);font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;
  background:transparent;color:var(--gold);border:1px solid var(--gold-lt);border-radius:999px;
  padding:10px 22px;cursor:pointer}
#cr-root button:hover{background:var(--parchment)}
#cr-root button:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
@media (prefers-reduced-motion:reduce){.cr-eyebrow,.cr-name,.cr-sub{transition:none}}`;
