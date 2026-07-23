# Añejo HUB — Creative Studio (React pilot)

The flagship React surface for the Añejo HUB: a **streaming, brand-grounded recipe & content studio**.
This is the strangler-fig pilot — it proves the stack (React + Vite + TanStack Query + streaming +
EN/ES + brand design system) on the single highest-value surface before the rest of the HUB migrates.

## What's here
- **Streaming AI** — `useStudioStream` reads a `ReadableStream` from `/api/hub/kitchen/studio/stream`
  and renders Claude's reply token-by-token with live markdown (recipe cards, macro tables). In
  production it fails visibly if the backend/API is unavailable; it must not show demo content as if
  it were recipe-ready operational output.
- **Same auth, no new system** — calls the existing `/api/me` + `/api/hub/kitchen/studio/*` Functions
  with the session cookie (`credentials: 'include'`). Magic-link/PIN just works.
- **Brand-grounded** — the streaming endpoint reuses `buildStudioSystem` (brand brief + kitchen SOPs)
  and the vision pipeline (recent R2 photos → Claude image blocks), identical to `studio/message.js`.
- **Bilingual** — lightweight EN/ES context mirroring the rest of Añejo.
- **Design tokens** mirror `brand.css` so it's visually one product.

## Run it
```bash
cd hub-app
npm install
npm run dev          # http://localhost:5174
```
For LIVE AI + persistence, run the Functions alongside it (from the repo root) and the vite proxy
forwards /api → it:
```bash
wrangler pages dev public --port 8788     # serves functions/ + needs ANTHROPIC_API_KEY in .dev.vars
```

## Build
```bash
npm run build        # tsc --noEmit && vite build → dist/
```

## Ship
The Cloudflare Pages project serves static files from `public/`. After `npm run build`, copy `dist/`
into `public/studio/` so `/studio/` serves the current React bundle. Keep the Functions deployed with
it; `/api/hub/kitchen/studio/stream.js` is the live streaming backend.

## Roadmap (the "on steroids" plan)
Image generation for plating/menu cards · Durable-Object live multi-device sessions · Vectorize RAG
over the full recipe library · tool-use (inventory/cost/macros) · one-click publish to website/Square/
social. See the architecture breakdown.
