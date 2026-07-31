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

**The more precise version of how that model works**, from Forbes Health's own About page: their
business team *"reviews our content after it's written and identifies potential advertising
opportunities. That team then secures compensation from some of the brands identified in our
content."* Editorial names brands first, then sales signs them. The practical consequence is that a
brand which cannot be signed to an affiliate deal is **monetarily invisible** — not rejected on
quality, just never economically worth a slot. Forbes Vetted's CMS even carries a per-product field
literally named `paidRank` with an on/off switch and a position slot (switched off on the article
inspected, but the machinery is a built product feature).

Worth knowing that these are not independent opinions either: Healthline belongs to RVO Health,
CNET to Ziff Davis, EatingWell and Verywell to People Inc. (whose parent IAC itself renamed to
People Incorporated in June 2026), and Forbes Advisor/Health are run by Forbes Marketplace, in which
Forbes Media held a **minority stake — 39.53% as of the last public filing in 2022**, though Forbes
consolidates it as a variable interest entity. Forbes is private now, so treat that as
last-documented rather than current. Four commerce
businesses running one playbook on different domains.

**Two honest exceptions.** Healthline states its rankings are set *"without regard to any financial
or advertising relationship."* And **Wirecutter is the real outlier** — it says plainly that *"no
pick on Wirecutter has ever been sponsored"* and, decisively, that *"in some cases, Wirecutter makes
no money at all on a pick, simply because the only high-quality retailer that sells the item doesn't
run an affiliate program."* There, having no affiliate program does not disqualify you.

**If national coverage ever becomes a goal**, the prerequisite is a live affiliate program on a
network these publishers already transact on. As of May 2026 Rakuten is migrating onto impact.com as
its exclusive platform, and impact.com also owns Trackonomics — so **impact.com is the default rail**
to build on. Añejo already has a commission engine; it is not on a network. (For scale: Skimlinks'
Preferred Partner Program, at $200/month, openly sells *"preferential ranking"* to publishers — the
cheapest published pay-for-visibility product in the stack.)

None of this changes the conclusion, because the genuinely editorial lists — CNET, Good
Housekeeping's Institute, EatingWell, Wirecutter — **all gate on national shipping**. They write for a national audience; a
Palm-Beach-only brand is unrecommendable to 99% of their readers no matter how good the food is.
That is not a PR problem to solve, it's a structural mismatch. Note also that no outlet publishes
its scoring *weights*, and several roundup "winners" are one company — HelloFresh SE owns
HelloFresh, Green Chef, EveryPlate and Factor.

So: **do not spend a dollar or an hour chasing national roundups.** Take from them only the
credentials they reward, which are obtainable at any size (below).

### What is actually winnable

**Open right now (weeks, not months):**

- **Boca Raton Observer Readers' Choice — VOTING IS LIVE, closes Aug 30, 2026.** 100+ categories,
  reader-voted, winners printed in the October Food + Drink issue. No entry cost published. This is
  the nearest deadline on the list — mobilise the customer and email list this month.
  `info@bocaratonobserver.com` · 561-982-8960. (Confirm a caterer / meal-delivery category exists;
  the ballot loads dynamically and could not be enumerated.)
- **Culinary Clash: Palm Beach Edition** — chefs apply through a public form; preliminaries
  **Sept 7, 14 and 21, 2026**, grand finale Oct 26. Cash prizes shared with a local charity, plus
  media coverage. No entry fee stated. `culinary-studio.com/culinary-clash`

**Calendar these:**

- **Palm Beach County Community's Choice Awards** (USA Today Ventures with The Palm Beach Post) —
  **170+ categories including "Caterer/Catering Company"**, free, two rounds, and supporters can
  vote **once per day**. It rewards exactly what a local brand has and a national one doesn't.
  The 2026 cycle already ran (nominations Oct 13–31 2025, voting Dec 17–31 2025, winners announced
  Mar 12 2026), so **the next nomination window opens around mid-October 2026.** `yourchoiceawards.com/palmbeach/`
- **NACE ONE Awards — $125/entry, and industry awards are explicitly open to non-members.**
  "Catered Event of the Year" covers **off-premise** events, and budget subcategories level the
  field for small operators. Requires client sign-off. Entries opened late January in 2026, so
  expect **late Jan 2027** — start collecting event photography and client permissions now.
- **CATIE Awards** (International Caterers Association) — the best-targeted national award for this
  business, because it is **judged on a PDF and photography with no samples to ship**. Entry fee
  includes ICA membership for up to 10 employees. Expect a fall 2026 window for 2027.
- **SBA State Small Business Person of the Year** — free, federal, state-level. The 2026 deadline
  was Dec 22 2025, so expect the next around **December 2026**.

**Credentials you can simply buy or earn — better value than most awards:**

- **FRLA Seal of Commitment — $250/year, and FRLA membership is NOT required.** Requires manager
  and employee food-safety certification plus FRLA's sanitation course. Comes with decals, a
  website listing, magazine inclusion and a press release. **Best cost-to-credential ratio on this
  entire list.** Palm Beach chapter director: Jodi Cross, 561-410-0035.
- **Whole30 Approved** is the only certification with an explicit **meal-delivery** track. Caveat
  worth resolving before spending: their *packaged product* rules require national availability,
  while their *menu* rules do not — ask them directly whether a single-metro operator qualifies.

**Rule these out, so no time is wasted:**

- **Good Food Awards** (now run by the Specialty Food Association) and the **sofi Awards** both
  require a **retail-ready product**; sofi additionally requires six months of prior retail sales,
  paid membership, and 25 shipped samples. Neither is reachable without spinning off a shelf SKU.
- **Good Housekeeping's award programs** — same blocker, and now with a price on it. Entry is
  **$795 per product** for the 2027 programs, the twelve categories are all packaged goods
  (Snack, Kitchen, Toy, Bedding, Travel…), and **winning does not include the emblem** — the logo
  is a *separate paid licence* negotiated afterwards, with no published rate. A fresh delivered
  meal has no category to enter. The **GH Seal** is a different programme again
  (`GHSeal@hearst.com`, no published fee; the old "must advertise in a Hearst title" requirement
  appears only in 2009 reporting, not in current terms). *Men's Health* runs no submission
  process at all — editors pick, and `accolades@hearst.com` licenses the logo afterwards.
  All of this reinforces the same rule: **these programmes are built for products on a shelf.**
- **Michelin** now covers Palm Beach County — Emelina took a star in the 2026 Florida selection —
  but with no dining room there is realistically no path.
- **New Times Broward-Palm Beach "Best Of"** has been consolidated away: its Best Of URL now
  redirects to Miami New Times. Treat as unavailable. *(This corrects the earlier note above.)*
- **Yelp's Top 100** is purely algorithmic off review volume and rating — not enterable, and a
  business filed under Caterers may sit outside the eligible pool entirely.
- **`bestofpalmbeachcounty.com` is NOT the Palm Beach Post's program.** It is an unaffiliated
  Royal Palm Beach nonprofit with no transparent voting mechanism. Likewise, Boca Raton Magazine's
  "Best of Dining Destinations" is **paid branded content**, not an award — their real
  "Best of Boca" is editors' choice with no nomination process.

### Press outreach — the free stack, and the names that were verified

**Correction worth knowing: Connectively is dead.** Cison rebranded HARO to Connectively, shut it
down in Dec 2024, then sold the HARO brand to Featured.com, which relaunched it free in April 2025.
Do not sign up for Connectively. The **$0 stack** is: **Source of Sources** (HARO's original
founder, heavily moderated), **SourceBottle** (skews lifestyle/health/food — strongest fit here),
**HARO** (free, high volume, spammy), and **Qwoted Basic** (2 pitches/month).

Verified named contacts:

- **Christiana Lilly, Editor-in-Chief, Boca Raton Magazine — `christiana@bocamag.com`** — handles
  print queries *and* dining guide inquiries. The single most actionable food contact found.
  Tyler Childress (`tyler@bocamag.com`) is the fastest web turnaround.
- **CBS12 / WPEC — `newstips@cbs12.com`** — cleanest direct email of the four TV stations.
- **Megan Hayes, WFLX Fox 29 — `megan@wflx.com`** — best verified named TV contact.
- **WPTV "Let's Hear It" form** — and note **WPTV produces WFLX's newscasts** from the same
  newsroom, so one relationship reaches two stations.
- The **Palm Beach Post dining beat is in transition** — Liz Balmaseda retired and the Food &
  Dining Reporter role is posted open. Confirm by phone before pitching.
- Local food influencers with real reach: **@eatpalmbeach** (~31K), **@foodpalmbeach** (21.6K).

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
5. **Boca Raton Observer Readers' Choice — voting closes Aug 30, 2026.** Nearest deadline on the
   board; mobilise the list. Then apply to Culinary Clash (prelims Sept 7) and calendar the
   Community's Choice nominations for ~mid-October 2026.
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
consistent, but not proof. On awards: Community's Choice, Boca Raton Observer, Boca Raton Magazine,
FRLA, Culinary Clash and the chamber programs were each loaded and verified directly. Still
**unverified**: South Florida Business Journal programs (bizjournals.com is blocked here — Fast 50
and 40 Under 40 deadlines, fees and URLs are all unconfirmed); FRLA's Stars of the Industry page
still shows a 2019 deadline; Whole30, GFCO, CATIE 2027 and Inc. 2027 fees are unpublished;
Michelin's delivery-only exclusion is plausible but unconfirmed; and WPBF 25's pitch path could not
be verified at all. Phone before acting on any of those.
