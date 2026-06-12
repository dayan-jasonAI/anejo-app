# /order — Per-Bowl Customization (build spec / handoff)

**Status:** NOT built. Assigned to the **"Añejo CRM/Internal app" session** (Dayan's call, 2026-06-12).
**Requested by:** Dayan. **Written by:** website session (handoff — see Collision note).

## Goal
On `/order`, show a photo for each bowl and let the customer **customize every bowl individually** —
remove ingredients, swap the base, and add extras — with all pricing enforced server-side.

## Requirements (verbatim intent from Dayan)
1. **Bowl photos** on the menu. Images already exist: `/assets/img/bowl_<key>.jpg`
   (vida, fuego, ligero, mar, coco, congreen, raiz, fuerza). They're referenced by
   `functions/_lib/bowlspec.js` `image:` — reuse those, don't regenerate.
2. **Per-bowl INDIVIDUAL customization.** Each bowl added to the cart is its own line with its own
   mods — e.g. two VIDA: one "no cucumber", one "+avocado, base→brown rice". This means reworking
   the cart from the current `cart[id] = qty` map into a **list of bowl instances**:
   `{ key, removed: [], baseSwap: null|'brown_rice', addedSauces: [], extras: [] }`.
3. **Remove ingredients:** any topping / vegetable / sauce from that bowl's `bowlspec.js` `build[]`.
   **KEEP the protein** (not removable — prevents a "VIDA with no tuna").
4. **Base swap:** the grain base can be swapped to **brown rice**.
5. **Add sauces:** customer can add any other house sauce (Mango Omega, Ajo Cítrico, Chimichurri
   Vital, Golden Turmeric, etc. — enumerate from `bowlspec.js`).
6. **Extras:** an **extra portion of any ingredient already on that bowl**, plus **sweet potato**.
   Keep the standard add-ons too (Avocado ½, Extra Protein 4 oz, Extra Signature Sauce).

## Source of truth
- `functions/_lib/bowlspec.js` → `BOWLS[]`: per-bowl `build[]` (item + oz) = the removable/extra-able
  ingredient list; plus `image`, `description`, macros, and the house sauces. Drive the whole UI from it.

## Server-side (functions/api/checkout.js) — integrity + kitchen
- Price EVERY extra/swap **server-side** (never trust a client amount). Reuse the pattern from the
  reverted commit **e5ad7ce** (`addon: true` catalog items, priced in `CATALOG`).
- Put each bowl's mods on the Square order `note` AND the kitchen ticket so the kitchen sees e.g.
  `VIDA — no cucumber · base→brown rice · +avocado · extra tuna`. Extend `kitchenBowlLine` (also
  from e5ad7ce) to carry the mods, and recompute macros from `build[]` when ingredients change.
- Each customized bowl is its own line item (qty 1), so two differently-customized VIDAs are 2 lines.

## OPEN pricing decisions (Dayan to confirm before/at build)
- "Extra of every ingredient" — flat per-extra price, or per-ingredient (by oz)?
- Sweet potato add-on price.
- Brown-rice base swap — free, or +$?
- Added sauces — free, or +$ (existing Extra Signature Sauce is $1.50)?
- Confirm reuse of the reverted prices: Avocado ½ **$2.00**, Extra Protein 4 oz **$4.50**, Extra Sauce **$1.50**.

## Reference / salvage
- Reverted add-ons attempt: commit **e5ad7ce** (added Avocado/Extra Protein/Extra Sauce + bowl builds
  on the kitchen ticket), reverted in **029b872** with no reason given. Salvage its server-side
  pricing + `kitchenBowlLine` logic; this spec supersedes it with full per-bowl customization.

## Collision note (IMPORTANT)
`public/order.html` and `functions/api/checkout.js` must have **ONE owner at a time**. This feature is
assigned to the CRM session. The website session will **stay out of these two files** while it's in
progress. The website session most recently shipped (already on main): driver tips (`allow_tipping`
+ `orders.tip_cents`), `/order` made indexable (canonical/OG/sitemap) — coordinate around those.
