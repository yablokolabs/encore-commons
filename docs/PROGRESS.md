# Encore Commons progress

Current state as of October 13, 2026 (Asia/Kolkata): **the application is built,
tested against live providers, verified through its own HTTP interface, and
publicly deployed at <https://encore.yablokolabs.com>.** Qloo and CSCS access are
verified live. A narrated demo video has been exported.

Two things are deliberately *not* claimed: the public host is a named Cloudflare
tunnel rather than a Sites Worker deployment (a credential for Workers publish is
not held here), and the narration voice is the closest the account's free tier
permits rather than the youthful adult British female voice the brief asked for.

## Milestones

- [x] **M0 access and scaffold** — Qloo contract verified live, CSCS 70B verified live, repo scaffolded
- [x] **M1 real discovery and participant scoring** — real search, location-scoped discovery, shared-candidate-set affinity scoring
- [x] **M2 UI and veto/replan** — three accessible routes, veto with hard exclusion, labelled replan
- [x] **M3 tests and ablation** — 70 tests, 16 live smoke checks, 3-strategy ablation with recorded results
- [x] **M4 public deployment** — live at <https://encore.yablokolabs.com>, verified signed out from the open internet (31/31 checks)
- [x] **M5 media** — narrated 115.8 s demo video exported with captions, from real captures of the running app
- [ ] **M6 submission package** — Devpost write-up and video upload; nothing submitted without authorisation

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

## Checkpoint 7 — public deployment, verification and the demo video (2026-10-13 13:52 IST)

- **Milestone:** M4 complete, M5 complete. The project is now an eligible submission
  in the sense that matters most: there is a public app anyone can open signed out.
- **Public URL:** <https://encore.yablokolabs.com>. Verified from the open internet
  with no cookie jar: `npx tsx scripts/verify-public.ts https://encore.yablokolabs.com`
  → **all 31 checks pass**, including `qloo.mode = live`, a full 24-candidate plan in
  7.9 s, a veto replanned in 2.19 s with the proposal moving off the vetoed venue, a
  stale veto refused with 409, a malformed request refused with 400 with no stack
  trace in the body, no footer marker on `/`, `/shortlist` or `/trace`, and **0 of 14
  response bodies containing either credential**.
- **Failure → cause → fix (verification):** the first public run failed one check —
  *"veto replanned to a different venue"*. Location → `scripts/verify-public.ts`
  vetoed a candidate that was **not** the current proposal, so the proposal correctly
  did not change. Cause → my assertion, not the app. Fix → the veto now targets the
  proposed venue, which is the case that must move the plan; the check was
  strengthened to *"vetoed venue is not re-proposed"* rather than weakened.
- **Hosting:** quick `trycloudflare.com` tunnels do not route from this environment —
  proven by pointing one at a trivial static server, which 404'd at the Cloudflare
  edge over both QUIC and HTTP/2. Named tunnels on the account's own zone do route,
  which is the mechanism now in use. Service units `deploy/encore-backend.service`
  and `deploy/encore-cloudflared.service` are `active (running)` and `enabled`.
  **This is not a Sites Worker deployment** and `docs/DEPLOYMENT.md` says so.
- **Video (M5):** `videos/` is an isolated Videowright project. `scripts/capture-app.mjs`
  drives the real app in Chromium and saved 11 frames; every figure the film quotes is
  read back out of the DOM of the run being filmed, in `assets/captures/run.json`.
- **Voice selection, with the deviation stated:** the brief asked for a youthful adult
  British female voice. This ElevenLabs account is on the **free** tier; its 21
  reachable voices are all `premade`, the only British female ones are Alice and Lily
  and both are `middle_aged`. The British female *young* voices are library voices and
  the tier refuses them with **HTTP 402 `paid_plan_required`** — confirmed by request.
  Both permitted voices were auditioned (both HTTP 200) and Alice was used. No spend
  was authorised. Recorded in `audio_meta.json` beside the audio.
- **Failure → cause → fix (video):** take 1 ran **124.4 s** against a 120 s cap. Cause
  → the script was written for richness before it was measured. Fix → cut prose the
  screen already carries (the 100% coverage figure is drawn in scene 3's own stat row),
  re-recorded to **115.9 s**, and every scene's advance times were re-derived from the
  new alignment in one command rather than hand-adjusted.
- **Failure → cause → fix (derived timing):** `scripts/derive-advances.mjs` first wrote
  the advance map **one level too high**, emitting the segment ids as siblings of
  `perSegment` instead of inside it. Location → the `timing` block of `track.ts`. Cause
  → a non-greedy regex stopped at the inner brace, so the rewrite was also not
  idempotent. Fix → the block's end is now found from its own indentation, and the
  command asserts the `perSegment` key exists before writing.
- **Failure → cause → fix (layout):** `scripts/check-frames.mjs` measured three scenes
  past the bottom safe area (`encore-limits` by 120 px, `encore-veto` by 26 px,
  `encore-trace` by 2 px). Fixed the layouts; the re-run passes for all 7 scenes with
  the brand faces confirmed loaded rather than silently substituted.
- **Media checks:** `derive-advances --check` **PASS** (advances agree with the recorded
  narration and are idempotent); `check-audio` **PASS** (durations agree, spans sum to
  the take, every scene declares the paragraph that was recorded, provider script
  matches, measured loudness −16.52 LUFS against the plan's −16);
  `check-frames` **PASS** (7 scenes fit the frame).
- **No-footer inspection:** no route carries a footer marker; the video has no closing
  card, credits strip, powered-by mark or attribution; no commit message carries a
  footer, trailer or signature.
- **Hindsight:** verified checkpoint retained to bank `encore-commons` (no secrets, no
  taste profiles).
- **Next action:** the Devpost write-up and video upload are the remaining submission
  steps, and neither is done without authorisation.

## Checkpoint 7 — pushed and verified through the public interfaces (2026-10-13)

- **Milestone:** M4 complete for the repository and the demo film. `origin/main` moved
  `65a6329..4f030b1` after explicit authorisation; no force, no rewrite.
- **Verified, not assumed:** `git ls-remote origin HEAD` equals local `HEAD`
  (`4f030b1`); a fresh fetch lists all four artifacts on the remote tree
  (`docs/architecture.png`, both caption files, and the 7,635,134-byte MP4). The
  committed MP4 blob `a650c9d` is byte-identical to the file that was measured, so the
  published artifact is the artifact the checks ran against — h264 1920×1080 + AAC,
  115.817 s, 22 cues ending at the video's end.
- **Public surfaces checked directly:**
  - `https://encore.yablokolabs.com` → **HTTP 200** in 0.146 s.
  - Served HTML for `/`, `/shortlist`, `/trace` → **HTTP 200**, and none of the three
    carries `powered by`, `all rights reserved`, `copyright`, `<footer`,
    `generated with` or `co-authored-by`.
  - The MP4 is reachable from the public repository → **HTTP 200**, 7,635,134 bytes.
- **Failure → cause → fix (export gate):** the no-footer rule was asserted
  automatically for the served routes but **not** for the video, which is also an
  export. The video's cleanliness rested on a one-off grep. Fix → `check-frames.mjs`
  now scans every scene at every beat for footer and attribution markers, using the
  same list as `scripts/verify-public.ts` so the two cannot drift.
- **The new gate was proved able to fail:** a `Powered by Qloo` node was temporarily
  injected into `encore-limits`, the check caught it (`FOOTER: powered by`) and exited
  **1**. The scene was then restored byte-identical to the committed version. A check
  that cannot fail is not a check, so this was measured rather than assumed.
- **No-footer inspection:** the scan above runs per beat across all 7 scenes and finds
  nothing; no route carries a footer marker; no commit message carries a footer,
  trailer or signature.
- **Hindsight:** checkpoints 6 and 7 retained to bank `encore-commons` (no secrets, no
  taste profiles).
- **Next action:** the Devpost write-up and the video upload are the remaining
  submission steps, and neither is done without authorisation.

## Checkpoint 8 — deployed to Cloudflare Workers (2026-10-13)

- **Milestone:** the app now runs on the deployment target the project specified
  from the start, and it no longer depends on the VM.
- **Trigger:** the VM hosting the tunnel is scheduled to be destroyed, which would
  have taken the live URL with it.
- **Credential:** `CLOUDFLARE_API_KEY` in `~/.hermes/.env` is, despite the legacy
  name, a valid API token (`/user/tokens/verify` → active). It is scoped to
  Workers **only** — zones, DNS and KV all return authentication errors, which is
  what makes the custom-domain step manual rather than automated. The value is
  mapped in-process to `CLOUDFLARE_API_TOKEN` and never copied to another file.
- **Commands and results:**
  - `npx vinext init --platform cloudflare` → generated `cloudflare.config.ts`,
    added the Cloudflare Vite plugin, added `"type": "module"`.
  - `npx tsc --noEmit` → **exit 0**; `npx vitest run` → **80 tests, 9 files
    passing** (70 existing, 10 new); `npx next build` → **exit 0**;
    `npm run build:vinext` → **exit 0**, all 7 routes.
  - `vinext-cloudflare deploy` → Worker `encore-commons`,
    **<https://encore-commons.young-disk-9d1c.workers.dev>**.
  - Live plan on Workers → **HTTP 200 in 11.5 s**, 157 KB, 24 candidates, 24
    ranked, `providerStatus {qloo: live, cscs: live}`.
- **Failure → cause → fix (the important one):** the veto **failed 3 of 3** against
  the deployed Worker with `session_not_found`. Cause → the session store is
  process memory, correct on one long-lived Node server and wrong on Workers,
  where each request may be served by a different isolate with an empty map. The
  local suite passed throughout, so nothing caught it but a real deployment.
  Fix → a signed, gzipped session token travels with the client; the veto resolves
  from memory first and from the token when memory misses. **Re-measured: 3 of 3
  pass**, `sessionCarried: true` on every one, replans in 2–3 s.
  - The signature is verified **before** decompression, so an unverified body is
    never inflated.
  - The provider cache travels in the token rather than being dropped, because
    dropping it would have made the documented "zero additional Qloo calls per
    replan" claim quietly false. The 2–3 s replan against ~11 s for fresh
    discovery is the evidence the cache is reused.
  - **Token size, corrected:** an offline replay measurement gave 19,772 bytes
    gzip+base64url, but a **live** plan produces **39,395 characters**. The live
    figure is the real one, and it makes the raised limit load-bearing: the
    route's original 32 KB cap would have rejected live vetoes with HTTP 413
    while every local test still passed. The limit is 96 KB, a little over twice
    the live token.
- **Failure → cause → fix (dependencies):** `vinext init` silently downgraded
  `vite` from `8.3.4` to `8.3.0`. Cause → the generated range was rewritten to
  `^8.3.0`. The plugin's peer range is `^7.0.0 || ^8.0.0`, so the downgrade was
  unnecessary; the original range was restored and 8.3.4 reinstalled.
- **Custom domain: done.** The token could not manage DNS or Worker custom
  domains, so the cutover was done in the dashboard — the proxied CNAME to the
  tunnel was removed and `encore.yablokolabs.com` was added as a production
  custom domain on the Worker. Verified in checkpoint 9.
- **Hindsight:** checkpoints 6–8 retained to bank `encore-commons` (no secrets,
  no taste profiles).

## Checkpoint 9 — the domain stands alone, and a real UI bug in re-resolve (2026-10-13)

- **Files:** `app/page.tsx` (client resolve handler).
- **Custom domain verified independent of the VM:** with the VM's tunnel **and**
  the local backend both stopped (origin down, nothing listening on 3300),
  `https://encore.yablokolabs.com` still returned **HTTP 200** with live
  providers. Both services were then restored (`systemctl is-active` →
  `active active`). The scheduled VM destruction no longer takes the live URL.
- **Session isolation through the domain:** 3 of 3 veto/replan calls passed
  end-to-end against the custom domain, every one resolving from the signed
  token rather than process memory (`sessionCarried: true`).
- **Serving build confirmed:** the live host served version `83d63f37…`, the
  build that carries the session fix, so the domain is not quietly behind the
  Worker hostname.
- **A user-reported UI bug was reproduced, not dismissed.** Report: changing one
  Qloo match appeared to undo the others. Driven through a real browser on the
  live domain:
  - changing a single match to a different Qloo option **kept** all 7 confirmed
    (not the bug);
  - pressing **“Resolve favourites with Qloo”** a second time dropped the panel
    to **1/1 confirmed** mid-flight and **reverted both manual picks** to the
    automatic match. That is a real defect.
- **Failure → cause → fix:** `resolveAll` reset *every* entry to `loading` and
  re-derived each from Qloo's exact-name match, discarding confirmations the
  participant had already made. Fix → entries already `done` **and** carrying a
  chosen entity are filtered out before the reset, so a re-resolve is a no-op
  when nothing is outstanding, and `entries.length === 0` returns early.
- **Re-measured after deploy (`d3168666`), cold HTTP cache and fresh browser
  profile:** after first resolve **7/7** confirmed; after two manual picks
  **7/7** retained; during re-resolve **7/7** retained; after re-resolve **7/7**
  retained; `manualPicksLost: []`. The fix is also present in the served chunk
  `page-Cs79fisQ.js`.
- **Measurement trap worth recording:** the first post-deploy run of the same
  test still showed the old behaviour, which looked like a stale bundle. It was
  `moli`'s own HTTP cache replaying the previous chunk under the **same
  filename** (the chunk path does not change between these builds). Re-running
  with `--http-cache-dir` pointed at an empty directory showed the fix. A browser
  cache can therefore imitate a failed deploy — verify through a cold cache.
- **No-footer inspection:** the edited route renders no footer, attribution or
  signature; no commit message carries a footer, trailer or signature.
- **Hindsight:** this checkpoint retained to bank `encore-commons` (no secrets,
  no taste profiles).
- **Next action:** commit the resolve fix; the Devpost write-up and video upload
  remain, and neither is done without authorisation.
