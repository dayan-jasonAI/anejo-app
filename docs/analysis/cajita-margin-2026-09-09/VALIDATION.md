# Cost-analysis handoff — September 9, 2026

Request: Dayan asked to calculate production margins using researched material and labor costs.
Scope: read-only research and internal analysis. No price approval inferred; no deployment,
payments, production data or website code changed. Owner: Codex.

## Assessment: Share with caveats

Arithmetic is reproducible and independently reconciled. Actual production margin is
Unverified: recipe quantities/yields, staff time, full packaging and fixed overhead are missing.
Online retailer prices are benchmark observations, not store-local quotes or invoices.
Sources and price conflicts are recorded in artifact.json. Owner portions control over
older production-guide recipes. No minimum order, daily cap or new operational rule inferred.

## Created and tested

- model.py: ingredient/BOM, packaging, time, fee and scenario arithmetic. Assertions pass.
- analysis.ipynb: executed top-to-bottom with nbclient; nbformat validation passes.
- cost-query.sql: independently recalculates six component costs from raw rates/assumptions.
- scenario-query.sql: independently recalculates six price/cost scenarios using those costs.
- All six SQL scenarios and all cost components match report data within 1e-8 dollars/rate.
- artifact.json and report.html: canonical report renderer validation, packaging and browser
  QA passed, at 1440px and 390px widths; source-dialog interaction passed.
- git diff --check passed. No application code changed; application suite not rerun.

Notebook runtime: temporary isolated free Python environment at
`/tmp/anejo-cost-notebook-20260909`; nbformat, nbclient and ipykernel installed there only.
No paid service or subscription added. For future notebook reruns, execute with nbclient
in this directory so the companion model.py resolves.

## Presentation contract

Product-stakeholder audience; portable HTML in Codex runtime, no public hosting.
Required structure: title, Executive Summary, findings, next steps, further questions,
caveats all present. A six-component cost bar chart shows dollar magnitudes with zero
baseline and direct category labels; scenario table preserves exact prices and rates.
No trend or confidence interval shown: scenarios are selected assumptions, not statistical data.
Model context and provenance remain in the notebook, scripts and artifact sources.

Renderer initially rejected Python chart provenance as SQL-only. Fixed by performing a
genuine independent SQLite calculation from raw inputs, not by relabeling Python as SQL.
The final chart/table sources point to those executed SQL files; narrative retains Python provenance.

## Remaining work

Needs Dayan confirmation: measured total staff-hours, made-versus-purchased components,
actual recipe yields and container pack quantity. No additional approval needed for this
internal calculation; any public price revision still requires approval. Research, tested
scenarios and the report were completed without waiting for pricing approval.
Next recommended action: record a timed 25-box batch and replace assumptions before
activating automatic custom-Cajita checkout. Rollback: remove these internal artifacts;
there is no live state to reverse.
