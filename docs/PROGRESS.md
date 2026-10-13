# Encore Commons progress

Current state as of October 13, 2026 (Asia/Kolkata): **the application is built,
tested against live providers and verified through its own HTTP interface.
It is not deployed.** Qloo and CSCS access are verified live. The public hosted
URL is the one remaining blocker for submission eligibility.

## Milestones

- [x] **M0 access and scaffold** — Qloo contract verified live, CSCS 70B verified live, repo scaffolded
- [x] **M1 real discovery and participant scoring** — real search, location-scoped discovery, shared-candidate-set affinity scoring
- [x] **M2 UI and veto/replan** — three accessible routes, veto with hard exclusion, labelled replan
- [x] **M3 tests and ablation** — 70 tests, 16 live smoke checks, 3-strategy ablation with recorded results
- [ ] **M4 authorized public deployment and submission package** — configuration and checklist ready; **not published**

## Append checkpoint

Timestamp/timezone; milestone; branch/commit; files; exact commands/exit/results; Qloo live/replay status; limits/usage; unknowns; failure location → cause → fix; no-footer inspection; Hindsight update or explicit unavailable status; one next action.

---

## Checkpoint 1 — M0 access and contract (2026-10-13 11:23 IST)

- **Branch/commit:** `main`, initial commit pending. Repository initialised with `git init`.
- **Commands and results:** inspected the real host tool catalog and MCP config. `~/.agents/mcp.json` resolved Hindsight to `http://127.0.0.1:8888/mcp`. `context-mode doctor` → storage PASS, server test PASS. `gh auth status` → `yablokolabs`, `repo` scope. Env file inspected for **names only**: `QLOO_API_KEY`, `CSCS_INFERENCE_API_KEY`, `ELEVENLABS_API_KEY` all present.
- **Qloo status:** **live**. `GET /search` resolved Radiohead; `GET /v2/insights` returned real Berlin places with `query.affinity`. Origin `https://hackathon.api.qloo.com`.
- **CSCS status:** **live**. `swiss-ai/Apertus-v1.5-70B` listed and answering.
- **Unknowns resolved:** `/search` and `/v2/insights` use **different** type vocabularies; `take` caps at 50; `filter.results.entities` returns affinity and makes a shared candidate set comparable.
- **Failure → cause → fix:** `400 on /search` → I passed seven taste types including an insights-only value → split the two type vocabularies. `{"error_msg":"Rate limit exceeded"}` in a **200** body → the hackathon key rate-limits that way → added body-level detection plus a serialized call queue.
- **No-footer inspection:** not yet applicable (no UI).
- **Hindsight:** bank `encore-commons` created; `recall` initially returned *"Bank 'encore-commons' not found"*, so the bank was created and its mission set. Port 8888 reachable (HTTP 200 on `/mcp`).
- **Next action:** scaffold the app and record genuine fixtures.

## Checkpoint 2 — M1 discovery and scoring (2026-10-13 11:30 IST)

- **Files:** `packages/domain/src/*` (schemas, geo, ranking, evidence, safety), `lib/config.ts`, `lib/qloo/{client,errors,replay}.ts`, `scripts/record-fixtures.ts`.
- **Commands and results:** `npx tsc --noEmit` → exit 0. `npx tsx scripts/record-fixtures.ts` → 7 favourites resolved, 3 profiles × 25 discovered places, **24/24 candidates scored with affinity for every participant** (100% coverage).
- **Decision made from evidence:** the rank-position fallback in `PROJECT_BUILD.md` was **not needed**; `filter.results.entities` provides a real comparable affinity over a shared candidate set. Documented in `docs/DECISIONS.md` D3.
- **Genuine divergence in recorded data:** Ada's top place, Bo's top place and Cy's top place are three *different* venues (a memorial, a bar, a gallery) — real per-person divergence, not synthetic.
- **Failure → cause → fix:** first recording run failed with `Qloo /search responded 400` → the `types` list contained an insights-only value → fixed, then rate limits appeared → added `QLOO_MIN_GAP_MS` spacing and quota classification.
- **Hindsight:** safe summary retained (no secrets, no taste profiles).
- **Next action:** build the agent, routes and UI.

## Checkpoint 3 — M2 agent and UI (2026-10-13 11:36 IST)

- **Files:** `lib/agent/{state,trace,types}.ts`, `lib/cscs/{client,explain}.ts`, `lib/storage/session.ts`, `lib/http/guard.ts`, `app/api/{health,search,plan,veto}/route.ts`, `app/page.tsx`, `app/shortlist/page.tsx`, `app/trace/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/*`.
- **Commands and results:** `npx tsc --noEmit` → exit 0. `npx next build` → exit 0, 5 routes.
- **Tests written:** 70 across 8 files. **Five real bugs were found by the tests and fixed, not worked around:**
  1. Veto attribution was silently empty — the veto set was carried without the participant, so `excludedByVeto` never populated. Fixed by carrying `{participantId, candidateId}` through the whole path.
  2. A candidate with only *partial* evidence could be ranked, which would let an unknown participant be outvoted. Fixed: full coverage is now required to rank; partial candidates are set aside with a reason.
  3. Provider tags included empty strings, producing meaningless diversity keys. Fixed by filtering blank tag names.
  4. Ranking carried a redundant `MIN_TOP_PICK_COVERAGE` warning that could never fire once full coverage was required. Removed rather than left as dead code.
  5. `next build` failed with *"module has no exports"* on `@domain` → the barrel used `.js` specifiers that Turbopack does not map to `.ts` under a path alias → switched to extensionless specifiers.
- **Hindsight:** retained.
- **Next action:** verify live and document.

## Checkpoint 4 — M3 verification and ablation (2026-10-13 11:45 IST)

- **Commands and results:**
  - `npx tsx scripts/smoke.ts` → **16/16 live checks passed** in 15.1 s.
  - `npx tsx scripts/evaluate.ts --live-qloo` → 3-strategy ablation written to `fixtures/evaluation.json`.
  - Production server: `npx next start` then real HTTP calls.
- **Live results:** `POST /api/plan` → 164 KB in 22.7 s, **24 candidates, 24 ranked, coverage 1.00**, top pick `Absinthdepot Berlin`, per-person affinity Ada 0.836 / Bo 0.793 / Cy 0.837, **all provider facts `verified: false`**, five named unknowns, explanation `cscs_grounded` with `modelGenerated: true`, 15 trace steps all `ok`. `POST /api/veto` → **2.45 s**, revision 1, pick changed to `Reichstagskuppel`, veto attributed to `p-bo`, and **zero additional Qloo calls**. Stale veto → **409**. One-participant request → **400**.
- **Ablation (honest, including where the baseline wins):** Qloo-grounded worst-person affinity **0.793**, popularity-only **0.772**, unguided-Apertus best venue **0.756**. But popularity-only wins on agreement rate (**1.000 vs 0.667**) by landing on a broadly liked landmark, and this is reported rather than hidden. The unguided model named five *real* venues (Berghain, Astra Kulturhaus, Kino Babylon, Lido, Prince Charles); all five resolved in Qloo, yet three had **no comparable affinity at all** for this group.
- **No-footer inspection:** served HTML for `/`, `/shortlist`, `/trace` scanned for `powered by`, `copyright`, `all rights reserved`, `<footer`, `generated with` → **no match on any route**.
- **Secret inspection:** serialised plan + trace scanned for both credential values → **clean**.
- **Blocker:** hosting. See `docs/DEPLOYMENT.md`.
- **Next action:** publish the repository, then deploy when authorised.

## Checkpoint 5 — repository published (2026-10-13 11:49 IST)

- **Commit:** `1487a80` "Build Encore Commons: a Qloo-grounded agent for group venue planning" — 81 files, 15,636 insertions. Then a follow-up commit making the licence canonical MIT.
- **Published:** <https://github.com/yablokolabs/encore-commons> — visibility **PUBLIC**, `licenseInfo` detected as **MIT**, default branch `main`.
- **Secret inspection before pushing:** scanned the whole tree for the live values of `QLOO_API_KEY`, `CSCS_INFERENCE_API_KEY` and `ELEVENLABS_API_KEY` with a fixed-string search → **0 occurrences**. No `.env`, `.env.local` or `.env.production` present in the repository.
- **No-footer inspection:** scanned all source and docs for `powered by`, `all rights reserved`, `<footer`, `generated with codebuff`, `co-authored-by` → the only match is the sentence in `docs/DEPLOYMENT.md` that documents the scan itself. The commit message has no footer, trailer or signature of any kind.
- **Failure → cause → fix:** `gh repo view` reported `licenseInfo: null` after the first push → the appended third-party-terms section after the MIT text stopped GitHub's licence detection, and the submission requires a licence visible in the About section → `LICENSE` was restored to unmodified MIT text and the provider terms moved to `docs/LICENSE_THIRD_PARTY.md`; `licenseInfo` now reports `mit`.
- **Hindsight:** verified checkpoint retained to bank `encore-commons` (no secrets, no taste profiles). `context-mode` indexed 69 files / 212 sections and search returned relevant hits.
- **Blocker:** public hosted deployment still outstanding. Hosting requires authorisation for an account this environment does not hold.
- **Next action:** obtain hosting authorisation, run the Sites/Vinext path with the runtime secrets in `docs/DEPLOYMENT.md`, then walk the public-demo checklist signed out.

## Handoff

- **Commit:** pending at handoff time (working tree dirty with new files).
- **Real tests:** 70 unit/integration tests passing; 16 live smoke checks passing.
- **Unresolved required tools:** Vinext/Sites execution, Videowright, ElevenLabs narration, Nori senior-swe, Headroom, ADHD ideation. See `docs/TOOLING_STATUS.md`.
- **Media status:** architecture diagram produced (HTML/SVG/PNG, embedded in the README). Narration video **not** produced.
- **One next action:** deploy to Sites with the runtime secrets in `docs/DEPLOYMENT.md`, then re-run the public-demo checklist.

## Checkpoint 6 — Sites runtime verified (2026-10-13 11:53 IST)

- **Milestone:** M4 in progress. The deployment *target* is now verified; only the publish step remains.
- **Files added:** `vite.config.mts` (Vinext/Vite ESM config). `scripts/evaluate.ts` and `scripts/record-fixtures.ts` no longer use `__dirname`.
- **Commands and results:**
  - `npx vinext check` → **91% compatible (9 supported, 2 partial, 0 issues)**, up from 83% with one issue.
  - `npx vinext build` → **exit 0**; all 7 routes compiled to `dist/` (`/`, `/shortlist`, `/trace`, `/api/health`, `/api/plan`, `/api/search`, `/api/veto`).
  - `npx vinext dev --port 3222` → serving in 461 ms; every route HTTP 200.
  - `POST /api/plan` **on the Vinext runtime** → 155 KB in 14.3 s, `providerStatus {qloo: live, cscs: live}`, **24 candidates, 24 ranked**, top pick `Absinthdepot Berlin`, explanation `cscs_grounded`, secret check clean.
- **Failure → cause → fix:** `vinext check` flagged `__dirname` / `__filename` as unsupported in `scripts/evaluate.ts` and `scripts/record-fixtures.ts` → CommonJS globals are undefined in ESM, and Vinext only defines them in server code pointing at build output → both scripts now resolve the project root with `fileURLToPath(new URL("..", import.meta.url))`.
- **Decision:** `vinext init` was **not** used. It rewrites project files and may add `"type": "module"`, which would change module semantics for the whole repository. The documented manual steps were followed instead so the diff stays reviewable, and the config was named `.mts` to stay ESM without that flag.
- **Remaining partials, both accepted and documented:** `images` (plain `<img>` from Qloo's host, so no optimizer needed) and `reactStrictMode` (App Router is already strict by default).
- **No-footer inspection:** unchanged and re-verified on the served routes.
- **Blocker:** the hosted publish itself. Needs a Sites workspace and runtime secrets.
- **Next action:** publish with the runtime secrets, then walk the signed-out checklist.
