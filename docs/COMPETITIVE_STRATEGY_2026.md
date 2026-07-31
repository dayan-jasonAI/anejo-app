# Añejo vs. the field — what to copy, what to ignore, what to own

*Competitive teardown and growth plan, 2026-07-31. Benchmarks: Methodology (gomethodology.com,
@methodology, 132K followers), the Forbes Health "best meal delivery" tier, and a scan of ~35 named
operators across Palm Beach, Broward and Miami-Dade. Every number about Añejo was queried from
production, not remembered.*

---

## 0. The two facts that should drive every decision

**Fact one — Añejo is priced above its entire local market.**

The verified South Florida meal-prep band runs **$6.99 to $16 per meal**, clustering at **$8–$12.50**.
Añejo sells at **$19.99–$24.99**. That is **1.6× to 2.5× the top of the local band**, and no local
operator was found selling packaged bowls above $16. Above that price there is only the
personal-chef tier (Chef Tori, Palm Beach Elite) — no online ordering, no plans, no scale.

That whitespace is real and defensible. But it means **Añejo has no local price anchor and must
build one.** Right now a Palm Beach shopper comparing Añejo to Ideal Nutrition ($8.49) or
CateredFit ($8.75–$11.50) sees roughly double the price and, on the page, no stated reason.

**Fact two — Añejo is pre-traction and that's fine, but it dictates the playbook.**

| | Añejo | Methodology |
|---|---|---|
| Instagram | **37 followers, 7 posts** | 132,000 followers |
| Orders to date | **11** | 5.8 million meals sold |
| Delivery | PBC, **fresh daily Mon–Sat** | 48 states, FedEx, **Mondays only** |
| Price | **$19.99–$24.99 / bowl** | $25–$35 / meal; **$160–$535 weekly** bundles |
| Protein | **35–45 g** per 16 oz bowl | 30–50 g per meal |
| Purchase | one-time **or** subscription | **subscription only** |
| Allergies | accommodated, fully labeled | **explicitly refused** in their FAQ |

At 37 followers, Añejo does not win by posting more. It wins by being **findable, provable, and
sold through other people's audiences.** Copy Methodology's evidence discipline, not their content
volume.

---

## 1. The single biggest unlock: publish the macros

**Añejo has Methodology-grade nutrition data and hides it.**

`functions/_lib/bowlspec.js` carries the kitchen manual's per-bowl numbers verbatim:

| Bowl | Calories | Protein | Carbs | Fat | Fiber |
|---|---|---|---|---|---|
| LIGERO | 520 | 45 g | 38 g | 20 g | 9 g |
| FUERZA | 600 | 45 g | 40 g | 27 g | 13 g |
| FUEGO | 580 | 42 g | 35 g | 28 g | 9 g |
| CONGREEN | 575 | 41 g | 39 g | 25 g | 11 g |
| VIDA | 510 | 40 g | 36 g | 22 g | 12 g |
| MAR | 620 | 40 g | 30 g | 32 g | 8 g |
| COCO | 590 | 40 g | 37 g | 27 g | 9 g |
| RAÍZ | 520 | 35 g | 38 g | 26 g | 11 g |

None of it appears on any public page. The live COCO page says *"portioned to your macro goals"*
and then shows **no macros at all**. Methodology puts full macros for every meal on its homepage.
Eat Well Miami prints macros on every label. AthleticsFit's entire pitch is "macros ready."

The gap has been papered over downstream: Aña is under a hard rule to **never state grams or
calories**, because the numbers weren't published anywhere she could trust. For a brand whose
promise is macro discipline, the assistant cannot answer the most common question a macro customer
asks — and that same question is the one that justifies the price.

**Do this first:**
1. Macro block on all 8 bowl pages and the `/order` cards, as approximate ranges per the brief's §4.
2. `NutritionInformation` schema markup per bowl — this is what wins nutrition-query search results.
3. Lift Aña's grams ban to *"quote only from the published spec."*
4. Show real totals in the macro calculator's recommended rotation.

Everything else here is worth less than this one item.

---

## 2. Own the position nobody has claimed

The local scan produced a genuinely rare finding: **Cuban-American identity in Palm Beach County is
completely unclaimed.** Every PBC operator checked — Jet Fuel, Ideal Nutrition, CateredFit, Fresh
Meal Plan, Clean Eatz, Fitlife, MealPro — is culturally generic. Every Cuban/Latin operator sits
south, in Miami-Dade or Broward, and **all of them frame Cuban food as diet food**:

- **LatinLite by Fat Busters** — deepest Cuban menu (vaca frita, congrí, picadillo), but the brand
  is literally named after fat loss, ~$10.58/day.
- **Green Kitchen 305** — sells a "Cantina Latina" plan; ropa vieja at $12.
- **Chiqui Fit** — Cuban chef-founder, but leads with "organic/healthy."
- **Spartan** — Latin-adjacent menu and a Spanish site, no cultural positioning.

**Nobody sells Cuban food as a premium, culturally proud product. And Cuban × Mediterranean has
zero claimants in any of the three counties.**

That is Añejo's moat, and it happens to be exactly what the brand brief already says. It is also
the honest answer to "why is this twice the price": *this is not diet food with a Latin label — it
is chef-built Cuban cuisine engineered to Mediterranean nutrition standards, cooked and delivered
fresh the same day.* A national brand cannot cross that, and the Miami Cuban brands have positioned
themselves out of it.

Adjacent free ground in PBC: **Spanish-language** (only Spartan, in Miami, runs a Spanish site —
Añejo already has `/es` built), and **macro-labeled office lunch** (PBC corporate catering is
generic caterers and ezCater; nobody is meal-prep-native with labeled macros).

---

## 3. Justify the premium — or don't charge it

Since Añejo is the most expensive option in its market, the page must answer *why* before the
visitor bounces. Everything below is verified and currently unstated:

| Proof point | Status |
|---|---|
| Fresh, cooked and delivered daily, never frozen | true, barely surfaced |
| **Allergies accommodated + every allergen labeled** | true — Methodology *refuses* this in writing |
| Order until 8 PM for next day | true, unstated |
| 35–45 g protein per bowl | true, unpublished |
| No added sugars, no unhealthy oils | in the brief, unstated publicly |
| ~40/30/30 macro Golden Rule | stated on `/go`, not on the money pages |
| Per-bowl customization, skip grains/dairy | built, under-sold |
| Trainer portal, accountability check-ins | built, idle |

Methodology's "Checks All Your Boxes" spec sheet — ten checkable claims **including the price** —
is the device to copy. Radical specificity reads as confidence. Añejo can build a truthful version
today from the table above.

**Also add a low-friction way in.** Competitors acquire with heavy first-order ladders (Fresh Meal
Plan runs 40/30/20/10% off the first four orders). Añejo doesn't need to discount the brand, but at
11 orders it needs a trial that doesn't require believing the premium up front — a small first-week
sampler, or a single-bowl trial at a fixed price. Discount the *trial*, never the *brand*.

---

## 3b. Where the category leader is weak — and Añejo already isn't

A teardown of Methodology's funnel found four gaps that Añejo can press immediately, because in
each case Añejo has already built the thing they're missing:

**1. They have no referral, no affiliate, and no money-back guarantee — at all.** A DOM search for
`refer`, `affiliate`, `ambassador`, `guarantee` returns zero hits across the site. On a $160–$535
per week subscription with 100+ glowing testimonials and 132K followers, they have built no
mechanism to turn advocacy into acquisition. **Añejo has the affiliate program, the commission
engine, and the loyalty tiers built and idle.** Turning them on is not catching up — it's doing
something the leader doesn't do.

**2. Allergens are their loudest complaint and Añejo's quiet advantage.** Their FAQ states plainly
that they *"cannot accommodate custom dietary restrictions or food allergies"* beyond gluten and
sugar, and third-party reviewers flag customization as the recurring weakness. Añejo labels every
allergen and customizes per bowl. For any household with an allergy, that ends the comparison — and
nothing on Añejo's site says so.

**3. They hide their price behind a name-and-email gate.** Their quiz demands first name, last
name, email and ZIP at step one, before showing any price, menu or program. It filters for
high intent and forfeits every comparison shopper — who then finds the price in a review anyway.
Añejo publishes prices. In a market where **Fresh Meal Plan, Fitlife, MealPro, Health Rush and
Crafted all hide per-meal pricing**, transparent pricing is a cheap trust differentiator.

**4. Their personalization is algorithmic; Añejo's is human.** Their moat claim is biomarker
personalization — upload your bloodwork, meals get "weighted." Impressive, and there is **no
nutritionist, no coach, and no named chef anywhere on the site.** Añejo's trainer portal,
accountability check-ins and a concierge that answers in seconds in either language are a different
kind of personalization, and the kind a local brand can actually deliver.

**One more, and it's counterintuitive:** their entire sitemap is **13 URLs** — no city pages, no
per-dish pages, no recipe library, and a Journal with exactly one article. **Añejo has more organic
search surface than a brand with 132K followers**: 8 bowl pages, 6 city pages, diet pages, Spanish
pages. That asset is real. It is currently wasted only because the bowl pages don't publish the
macros people search for (§1).

Two things worth copying precisely: they name **their actual suppliers with logos on the homepage**
(Bariani olive oil, Coke Farm, Frog Hollow) — the strongest and rarest proof device in the category
— and they print **"Food as Medicine®" on the glass jar itself**, making the packaging the logo.
Añejo's packaging carries no line at all.

*One caution on borrowing from them: their homepage press bar (TIME, WSJ, Rolling Stone, Forbes)
links to nothing, and the only verifiable "Forbes" association is a paid Business Council directory
listing, not editorial. Their weight-loss averages are published with no sample size or method.
Do not imitate the unverifiable parts — that is exactly the credibility Añejo can win on.*

---

## 4. What else to copy from Methodology

**Lead with the customer's problem.** Their hero: *"Beat Bloating, Banish Cravings, and Fight
Fatigue"* — three symptoms, with the proof underneath (*"30-50g protein / meal and 0g refined
sugar"*). Añejo's hero — *"Clean Fuel. Bold Flavor. Built for Life."* — is beautiful and entirely
about Añejo. Keep it as the signature; put a problem-and-proof line above it.

**Sell programs, not plan sizes.** They sell the "Signature Program" and the "Sustain GLP-1
Program." Añejo's 5/10/12-bowl weeks are quantities with no names and no promises.

**Give each bowl a purpose line.** *"Brain Health Bangkok Salmon Bowl."* COCO/FUEGO/LIGERO are
strong brand assets worth protecting — add what each is *for*, don't rename them.

**Make the menu an event.** Their story highlights are menu drops (Brunch, Vietnam, Matcha) and
customers say *"I get so excited on Mondays."* Añejo's 7 fixed bowls give no reason to come back.
A monthly limited drop — one bowl, two weeks, gone — is a retention mechanic and a content engine
at once, without touching the core menu.

**Tell the founder's story properly.** Julie Nguyen's has a villain (sacrificed Sundays), a
credential (*"waited 3 hours alone in the rain in Tokyo"*), and a thesis: *"Instead of trying to
change you, we change your context."* Añejo has one line — "Inspired by family. Built for legacy."
That gestures at a story Dayan actually has and has never written down.

---

## 5. What NOT to copy

- **Their outcome claims.** Methodology advertises *"3.75 lbs per week"* against a Stanford study
  they paid for. Añejo's brief bans outcome promises and Aña is certified against them. **Keep that
  rule.** The honest equivalents are facts (macros), other people's words (reviews), and validation
  actually earned.
- **Subscription-only.** They killed one-time purchases. At 11 orders, the one-time order is
  Añejo's trial mechanism.
- **National shipping.** It is what forces them into Monday-only FedEx. Fresh daily local is the
  better product — say it louder.
- **Competing on price.** Do not chase $8.49. That fight belongs to operators with vastly more
  volume, and winning it would destroy the only position that's open.

---

## 6. The GLP-1 opening — and it's closing

The GLP-1 companion nutrition market is projected to grow from about **$2.4B in 2026 to $10.9B by
2036**, with **high protein the leading nutritional focus segment**, because GLP-1 users must
preserve lean muscle while eating far less. Methodology has built a whole second program for it.
Locally, **Health Rush in Broward is the only operator found with a dedicated GLP-1 plan** — the
window is open in Palm Beach County and won't stay open.

An Añejo bowl is *already* the right product: 35–45 g protein, 8–13 g fiber, 510–620 calories, in a
portion a suppressed appetite can finish — and the kitchen already scales every bowl by
`bowl_size_factor`, so smaller sizes need no new recipe.

**No new product needed — a named landing page and honest framing.** State only what's true: high
protein per bowl, high fiber, portion-controlled, smaller sizes available. Never claim a medical
benefit, never name a drug, route anything clinical to a doctor. Framed that way it is the largest
addressable audience Añejo can claim this year.

---

## 7. The proof problem, and where the real awards are

Añejo has **zero third-party reviews indexed anywhere**, and a brand search returns unrelated
"Anejo" Mexican restaurants in Daytona, Orlando and Ponte Vedra that own the name.

### First, the uncomfortable truth about the Forbes list

**The Forbes Health "Best Meal Delivery Services" page is advertising inventory, not an award.**
It carries this disclosure verbatim at the top:

> *"We earn a commission from the offers on this page, **which impacts their display**."*

There is no scoring rubric, no dietitian panel, no star ratings and no "best for" awards anywhere
in it — just explainer copy plus advertiser disclaimers for HelloFresh and Green Chef. The URL sits
on Forbes' `/health/l/` marketplace path, not the editorial `/health/nutrition/` path. Forbes Health
*does* publish real methodology for other rankings (three advisory-board experts, six metrics), and
**the meal-delivery page does not route through it.** Chasing that page means buying a slot.

The genuinely editorial lists — CNET, Good Housekeeping's Institute, EatingWell — do real testing,
and **all of them gate on national shipping**. They write for a national audience; a
Palm-Beach-only brand is unrecommendable to 99% of their readers no matter how good the food is.
That is not a PR problem to solve, it's a structural mismatch. Note also that no outlet publishes
its scoring *weights*, and several roundup "winners" are one company — HelloFresh SE owns
HelloFresh, Green Chef, EveryPlate and Factor.

So: **do not spend a dollar or an hour chasing national roundups.** Take from them only the
credentials they reward, which are obtainable at any size (below).

### What is actually winnable

- **Palm Beach County Community's Choice Awards** (Palm Beach Post / Gannett) — the highest-value
  target by far. Free to enter, two stages (open nominations, then a voting round where supporters
  can vote **once per day**). It rewards precisely what a local brand has and a national brand
  doesn't: a customer list you can mobilize daily. Verify the current stage — the 2026 cycle
  appeared open as of today.
- **Boca Raton Observer Readers' Choice** — 100+ categories, winners published in the October Food
  + Drink issue. **Nominations closed July 12, 2026** — this year is missed; calendar the ~June
  window for 2027.
- **New Times Broward-Palm Beach "Best Of"** — editorial Best Of plus a readers' poll. Program
  confirmed, current window not. This is the local equivalent of the trophy Jet Fuel Meals and
  AthleticsFit put in their bios.
- **Certifications you can simply earn** — the same credentials national winners advertise, open to
  any producer meeting the standard regardless of footprint: USDA Organic, Non-GMO Project,
  Certified Gluten-Free, Whole30 Approved. These give press something concrete and travel into
  every future list.
- **Local TV lifestyle segments** — the West Palm Beach market (WPTV, WPBF 25, CBS12, WFLX) runs
  morning segments that need local food guests. Booking contacts need verifying before outreach.
- **"Best for GLP-1 users" is the newest and least crowded category** in the national taxonomy —
  further reason to move on §6 now.

### And the unglamorous work that matters more than any award

- **Readers'-choice awards are the local trophy.** Jet Fuel Meals won Miami New Times Best Meal
  Prep Service 2026; AthleticsFit claims Best of Miami 2025 — both put it in the IG bio above the
  fold. The Palm Beach equivalents are the equivalent target.
- **Directories own the SERPs**, not brands. Yelp city lists, NoStove, Restaurantji, Wanderlog
  dominate "meal prep delivery {city}". NoStove alone tracks 18 services for West Palm Beach.
  Añejo is in none of them. This is the cheapest distribution available.
- **Yelp** — "TOP 10 BEST Meal Prep Delivery in West Palm Beach" exists and ranks; Añejo has no
  presence. Competitors sit at 55–205 Yelp reviews; most PBC players are under 20. **Review
  velocity is a winnable fight here** — unlike follower count.
- **Google reviews** — the ask automation is live and the link is set; the constraint is order
  volume. Ask each of the first 50 customers personally, not only automatically.

Published macros (§1) are a prerequisite for most editorial coverage — reviewers can't write about
nutrition they can't see.

---

## 8. The channel that actually moves a 37-follower brand

**Gym and trainer distribution is structurally underdeveloped in this market.** Only one PBC
competitor (CateredFit) even claims gym partnerships, and publishes no terms. The formalized
programs found — in-gym fridges, co-branded member pages, commission per subscription — belong to
out-of-market brands. MealPro's affiliate program pays 3–5%.

Añejo already has the trainer portal, the affiliate application, and the commission engine **built
and idle**. One gym with 400 members is worth more than a year of posting at 37 followers. The
package to take to gym owners:

1. A co-branded member landing page with member pricing.
2. Commission on member orders, including renewals.
3. The trainer portal as the hook — a trainer generates a member's macro plan in two minutes and
   hands it over. **No local competitor offers a trainer a tool.** They offer a discount code.
4. In-gym fridge placement where the volume justifies it.

That is a differentiated, published partner program in a market where nobody has one.

---

## 9. Priority order

**Now (days — mostly publishing what already exists):**
1. Publish per-bowl macros everywhere + nutrition schema; lift Aña's grams ban to the published spec.
2. Homepage hero: problem + proof above the brand line; add the truthful spec sheet with the price.
3. Add the "why we cost more" proof block (fresh daily, allergens, 8 PM cutoff, customization).
4. Claim Yelp, NoStove and the local directories. Free, and they own the search results.

**Next (weeks):**
5. **Enter the Palm Beach County Community's Choice Awards** while the cycle is open — free, and
   daily voting favours a local list. Calendar Boca Raton Observer nominations for ~June 2027.
6. Write and publish the founder story.
7. Name the plans as programs; add a purpose line per bowl.
8. GLP-1 landing page, factual framing only — the least crowded category in the whole taxonomy.
9. A trial offer that lowers first-purchase friction without discounting the brand.
10. Missing city pages: Jupiter, Palm Beach Gardens, Royal Palm Beach, Greenacres.
11. Push Google review velocity personally through the first 50 customers.

**Then (the growth engine):**
12. Gym/trainer distribution as the primary channel — package, price and pitch it.
13. Turn on the affiliate and loyalty programs. The category leader has neither.
14. Pursue a certification (USDA Organic, Non-GMO, Certified Gluten-Free, Whole30) — the one
    national-winner credential that is size-independent.
15. Monthly limited menu drop for retention and content.
16. Spanish-language market — `/es` exists, nobody in PBC competes there.
17. Revisit the no-video decision. Methodology's grid is majority video and founder-led; every
    local leader uses Reels. This is the one place the current plan and the evidence disagree.

---

## Caveats

Local review counts come from third-party aggregators and self-reported claims, not the Google
Business API — Ideal Nutrition's figures conflict across sources (331 vs 1,160 reviews) and Jet
Fuel's "1,000+ 5-star" is self-reported and uncorroborated. Follower counts were fetched directly
only for @jetfuelmeals (50.4K) and @athleticsfitmiami (28.5K); others come from search snippets.
Ad spend and event activation for local competitors are **unknown, not confirmed absent**. The
absence of Cuban positioning in PBC is an absence-of-evidence finding across a targeted search —
consistent, but not proof. On awards: the Palm Beach County Community's Choice and Boca Raton
Observer programs were verified directly; New Times Broward-Palm Beach's current nomination window
was **not**, and Boca Raton Magazine, Palm Beach Illustrated, Chamber and FRLA award programs are
**unverified leads, not confirmed programs**. Local TV booking contacts need verifying before any
outreach is built on them.
