# Añejo — Unified Web App

One Cloudflare Pages project = the marketing site **+** the AI macro calculator (public self-serve) **+** the trainer portal, all sharing one backend engine.

## Routes

| URL | What it is |
|-----|------------|
| `/` | Marketing site (anejocateringco.com). Includes a "Macro Calculator" nav link + a calculator section. |
| `/calculator` | **Public self-serve** calculator — a visitor enters their own stats → AI macro plan + bowl rotation. |
| `/portal` | **Trainer** landing (also the home for `portal.anejocateringco.com`). |
| `/intake.html` | Trainer enters a client → generates a plan. |
| `/plan.html` | Shared results page (renders the generated plan). |
| `/api/plans/generate` | Backend function. Mifflin–St Jeor + Claude. Used by both public and trainer flows. |

`portal.anejocateringco.com` serves the same project and auto-lands on `/portal`.

## What it needs to run

- **`ANTHROPIC_API_KEY`** — set in the Cloudflare Pages dashboard as an encrypted **Secret**. The AI plan generation will not work without it. (Small per-plan cost.)

## Deploy — Git-connected Cloudflare Pages (recommended)

1. Push this `webapp/` folder to a GitHub repo.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings: **Framework preset = None**, **Build command = (empty)**, **Build output directory = `public`**.
4. **Settings → Variables and Secrets** → add `ANTHROPIC_API_KEY` as a **Secret**.
5. Deploy. You'll get an `anejo-app.pages.dev` URL — test `/calculator` and `/portal`.
6. **Custom domains** → add `anejocateringco.com` and `portal.anejocateringco.com` to this Pages project.
   - These are currently attached to the old `anejo-website` Worker. Remove them there first (that hostname can only live on one project), then add them here. Delete the old `anejo-website` Worker once this is live.

After this, every `git push` auto-deploys with zero downtime.

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # paste your ANTHROPIC_API_KEY
npm run dev                      # http://localhost:8788
```

## Notes / roadmap (unchanged from V1 spec)
- Stateless demo: no saved rosters, no auth, no Stripe checkout yet (V1.1).
- Excluded conditions (T1D, pregnancy, post-surgery, GLP-1, eating-disorder history, kidney/liver/cardiac/cancer) are refused with a referral message — RD review tier is V1.2.
- All plans carry the "not medical advice" disclaimer.
