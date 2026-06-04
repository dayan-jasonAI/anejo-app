# Añejo — Claude Code handoff

Context for continuing the Añejo website + trainer-SaaS build in Claude Code. (This project was started in Cowork; everything is in files so you have full continuity.)

## What this is
- **Marketing site + AI macro calculator + trainer portal**, one Cloudflare Pages project.
- Live at **anejocateringco.com** (also www + portal subdomain). Pages project: **anejo-app**, git-connected to GitHub **dayan-jasonAI/anejo-app**. Every push to `main` auto-deploys.
- **Goal:** site fully complete + monetization-ready by **2026-06-15**. Full plan in `../WEBSITE_LAUNCH_WORKFLOW.md`. Account/credential setup in `PROVISIONING.md`.

## Stack
- Cloudflare **Pages + Functions** (`functions/`), **D1** (binding `DB`), **KV** (binding `SESSIONS`), **Resend** (email), **Square** (commerce + subscriptions), **Anthropic API** (the AI calculator).
- Frontend: vanilla HTML/CSS/JS in `public/`. Bilingual **EN/ES** via `public/assets/js/i18n.js` (walks text nodes against a dictionary; persists choice).
- `pages_build_output_dir = public`. Secrets/vars are set in the Pages dashboard (see `wrangler.toml` comments) — never commit them.

## Already live (deployed)
Marketing site, 7-bowl menu + sauces, AI calculator (`/calculator`), trainer portal demo (`/portal`, `/intake.html`, `/plan.html`), shared engine `functions/api/plans/generate.js` (Mifflin–St Jeor + Claude), EN/ES toggle.

## Built locally, NOT yet deployed (this is the uncommitted work)
- **Sauce reconciliation**: `public/index.html` (8 unified bowl sauces, legacy "dressings" section removed, Añejo Bites sauce line) + ES strings in `public/assets/js/i18n.js`.
- **Trainer SaaS backend**: `functions/_lib/{util,session,email,guard}.js`, `functions/api/auth/{request-link,verify,logout}.js`, `functions/api/me.js`, `functions/api/clients.js`, `functions/api/leads.js`.
- **DB schema**: `migrations/0001_init.sql` (9 tables; parses clean in sqlite).
- **`wrangler.toml`**: D1 + KV binding placeholders (`SET_AFTER_*`).
- **Lead capture**: tasting form in `index.html` now POSTs to `/api/leads` with a mailto fallback.

All of the above passes `node --check`; none of it has been pushed yet.

## First things to do in Claude Code
1. **Get a working git clone** (this folder may not be one yet):
   - Easiest: `gh repo clone dayan-jasonAI/anejo-app anejo-app-repo`, then copy the locally-built files above into it — OR `git init` here, add the remote, and reconcile. **Be careful not to overwrite the newer local files** (the uncommitted work) with older remote versions.
2. ✅ **Provision D1 + KV — DONE 2026-06-04.** Created on Dayan's Cloudflare account via CLI (API-token auth):
   - D1 `anejo` → `database_id = d5ca11c7-7b44-4560-919d-b6210753d182` (region ENAM)
   - KV `SESSIONS` → `id = afbedd5c3613449b931b27ee0353a4b0`
   - Both IDs are now in `wrangler.toml`; migration `0001_init.sql` applied to remote (9 tables verified).
   - Re-run for a fresh env: `wrangler d1 create anejo` / `wrangler kv namespace create SESSIONS` / `wrangler d1 execute anejo --remote --file=migrations/0001_init.sql`.
3. **Deploy**: commit + push to `main` (auto-deploys), or `npx wrangler pages deploy public`.
4. Then continue the workflow: trainer dashboard UI (#19), subscription checkout + 10% rev-share (#20), storefront (#21), content/SEO/legal (#22–24), QA (#25).

## Pending external setup (owner: Dayan) — see PROVISIONING.md
Resend account + DNS; Square verification + catalog + secrets; FL DOR sales tax; **DBPR license = the go-live flip** (`SQUARE_ENV=production`). Build everything in **sandbox/test mode**; flip to live only once licensed.

## Guardrails
Never commit secrets/API keys. Never put the kitchen street address on the site until the commissary lease + license land (use "Palm Beach County"). Don't take real payments before DBPR license.
