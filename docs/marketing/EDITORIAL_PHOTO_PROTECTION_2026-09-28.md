# Editorial photo protection — September 28

Local correction, not deployed. The named Reposado editorial profiles fit the whole photo into the export canvas and extend only missing edges. Protected source regions previously scaled against the entire output canvas, which mislocated food annotations whenever source/export aspects differed.

`projectProtectedAreas` now projects normalized source annotations using fitted photo width/height and x/y offsets. Text and emblem areas remain canvas coordinates. Collision rejection therefore compares like coordinates. No automatic subject detection is claimed; current UI does not supply source annotations. Archived approved renders remain untouched. Marketing asset URL is versioned for the changed script.

Geometry regressions exercise a portrait photo with side extensions and a wide photo with top/bottom extensions, actual-food collisions, clear added edges, invalid geometry and invalid annotations. An additional source-wiring assertion checks the composition path; this is not real-browser pixel acceptance.

Next substantial rendering work: extract a shared versioned composition plan for browser and WASM, starting with reposado-wide and reposado-cajita. Share profile regions, contain geometry, ink decisions, measured text runs and emblem tint. Compare actual browser/WASM pixels with Spanish headings and bright/dark source backgrounds. Prototype footer render remains distinct and must not be presented as parity. Production resource limits, image normalization, durable jobs and owner acceptance remain open.

Validation:3,337 root tests passed before cache-version change;32related tests passed after HTML/cache assertion update. Lint0errors/11existingwarnings and Functions build passed. Source hashes/log excerpts: evidence-2026-09-28/editorial-photo-protection.json. No deployment or customer action.
