# Release validation — September 16, 2026

Candidate: `codex/kitchen-ready-notifications`, merge HEAD `88967be` plus the reviewed local onboarding, public-phone/reference and SEO repairs. Run before final commit; this is local candidate evidence, not production acceptance.

- Root suite: 2,495 passed; zero failed/cancelled/skipped; 15.019 seconds.
- Studio suite: 23 passed across four files.
- Root lint: zero errors, four existing warnings (`catering_deposit.js`, vendored webcrypto helper, catering quote test).
- Studio lint and TypeScript no-emit check: exit 0.
- Local SEO: 196 indexable pages, 140 catering pages, 196 sitemap URLs, 510 JSON-LD blocks, zero missing canonicals.
- Whitespace diff check: exit 0.
- Predeploy guard: exit 0; freshly fetched origin/main included, eight branch commits ahead at that check.

Full logs remain temporary files; hashes below bind this summary to their observed contents. Preserve logs separately if full durable output is needed. The subsequent 60-day traffic-button edit changes UI only and was whitespace-checked; these earlier suites do not claim to have run after that edit.

| Log | SHA-256 |
|---|---|
| `/tmp/anejo-release-20260916-candidate-diff-check.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/anejo-release-20260916-candidate-predeploy-guard.log` | `6b5ae889e62b671bd1f2ac4b5272677766b6bda0c2dc6776277d4063bb0e2928` |
| `/tmp/anejo-release-20260916-candidate-root-lint.log` | `5423523d02166384e22ce0f5a1ebee87c582ff574b40ecf572fb4c5fb412c051` |
| `/tmp/anejo-release-20260916-candidate-root-tests.log` | `a84a906e7a7bbecdcd1271994f1e81271fd01eddfe8d79cb6557a402f819bf27` |
| `/tmp/anejo-release-20260916-candidate-seo.log` | `eef055649e0c5ed225e4b6d60ab3ff00010dbd447333d0a4fad59a70066a5618` |
| `/tmp/anejo-release-20260916-candidate-studio-lint.log` | `120ab3fb8589adfceb4b0fb75db515601a3f4650625cbbd250337df95a226dc3` |
| `/tmp/anejo-release-20260916-candidate-studio-tests.log` | `30cfc1a4720cfbe71c218c5d0ed4a9170b3dc9cd7d55515c537586f6e41f3a87` |
| `/tmp/anejo-release-20260916-candidate-studio-typecheck.log` | `c71f153d3b3b262e6da9f2f30471c421ffd9ea6706c2caa42252c278dc4b456f` |

## Interpretation

Root tests combine functional backend/SQLite checks and source assertions. Studio tests mock fetch and some React state. Results do not establish actual sign-in/role acceptance, production D1 behavior, provider generation, actual Square capture, email delivery, Google indexing, or GA4 event receipt. Guard ancestry is point-in-time and must be rechecked if trunk changes. No production deployment is claimed by this record.
