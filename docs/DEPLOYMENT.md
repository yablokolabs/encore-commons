# Deployment

**Status: not deployed. This is the outstanding blocker for submission.**

The hackathon requires a live, externally hosted app that anyone can try signed
out. Until a public URL exists, this repository is a working application and a
complete deployment configuration — not an eligible submission.

## Verified locally (real, run today)

```
npx tsc --noEmit                      → exit 0
npx vitest run                        → 8 files, 70 tests passed
npx next build                        → exit 0
npx next start --port 3111            → serves in ~1s
```

Production server exercised over real HTTP with live credentials:

| Call | Result |
| --- | --- |
| `GET /`, `/shortlist`, `/trace` | HTTP 200; scanned for `powered by`, `copyright`, `all rights reserved`, `<footer`, `generated with` — **no match on any route** |
| `GET /api/health` | `qloo.mode = live`, origin `https://hackathon.api.qloo.com`, model `swiss-ai/Apertus-v1.5-70B`, both keys present (values never returned) |
| `POST /api/plan` | HTTP 200, 164 KB, 22.7 s. 3 participants resolved by live search → 24 candidates → **24 ranked with coverage 1.00** |
| top pick | `Absinthdepot Berlin`, worst-person affinity 0.792977, mean 0.822006 |
| per-person affinity | Ada 0.836, Bo 0.793, Cy 0.837 — all `provider_affinity` |
| provider facts | `hours, phone, website, businessRating, cuisine, goodFor, address`, **all `verified: false`** |
| unknowns | `openingHours, price, stepFreeAccess, dietaryAndAllergies, availability` |
| explanation | provenance `cscs_grounded`, `modelGenerated: true` |
| trace | 15 steps, all `ok` |
| secret scan | serialised plan + trace contains neither credential |
| `POST /api/veto` | HTTP 200 in **2.45 s**, revision 1, pick changed to `Reichstagskuppel`, veto attributed to `p-bo`, budget 1 of 2 left |
| stale veto replay | HTTP **409 `stale_revision`** |
| 1-participant request | HTTP **400 `invalid_request`** |

## Target and why

The build contract selects **Sites with the Vinext starter**. The hosted runtime
is Cloudflare Workers:

- HTTP/HTTPS outbound only. No raw TCP.
- No persistent process memory, no filesystem, no long-running workers.
- Runtime **secrets**, because the hosted app cannot read `~/.hermes/.env`.

This codebase is written for exactly those constraints: route handlers hold all
credentials, the session store is in-memory with an explicit cold-isolate
behaviour, every plan replan no-ops on `fetch`-free cached data, and there is no
database, no background worker and no local file dependency at request time. The
only filesystem use is at build time (fixtures) and in local scripts.

Vinext is a drop-in replacement for the `next` CLI, so no source changes are
required for the Sites path. `npm run vinext:check` and `npm run vinext:dev` are
wired up. **They have not been executed on this host**, because neither the
Vinext CLI nor a Sites packaging helper is installed here, and the contract
forbids guessing packaging commands.

## Required runtime secrets (names only)

Set these in the hosting provider's runtime secret store. Never commit values,
never put them in `.openai/hosting.json`, screenshots or the client bundle.

| Name | Required | Purpose |
| --- | --- | --- |
| `QLOO_API_KEY` | yes | Hackathon key, sent only as `X-Api-Key` to the Qloo origin |
| `QLOO_API_ORIGIN` | recommended | `https://hackathon.api.qloo.com` |
| `CSCS_INFERENCE_API_KEY` | yes | Apertus wording |
| `CSCS_BASE_URL` | recommended | `https://api.inference.cscs.ch/v1` |
| `CSCS_MODEL` | recommended | `swiss-ai/Apertus-v1.5-70B` — do not downgrade to 8B |
| `QLOO_MIN_GAP_MS` | recommended | `250`. The issued key is rate limited. |
| `ENCORE_REPLAY_FIXTURES` | **must be unset or `0`** | `1` would serve recorded data instead of live Qloo |

`ELEVENLABS_API_KEY` is a local video-production secret. It must **not** be set
on the hosted app.

## Publish steps, once authorized

1. Confirm the Sites starter/packaging helper is available on this host, and run
   `npx vinext check` against this codebase; fix anything it reports.
2. Build: `npm ci && npm run build`.
3. Create the site with the runtime secrets above.
4. Deploy, then verify signed-out and in a fresh browser:
   - the three routes render on desktop and phone widths,
   - `/api/health` reports `qloo.mode = "live"` (**not** `replay`),
   - a full plan completes with a non-null `selectedCandidateId` and coverage 1.00,
   - a veto returns a changed pick,
   - no footer, attribution strip or copyright bar appears on any route,
   - an anonymous request with a malformed body gets 400, not a stack trace.
5. Record the public URL in the README and in the submission.

## Public-demo checklist

- [x] Server-side only credentials; no key can reach the client bundle
- [x] Named credential variables documented; no values anywhere in the repo
- [x] Per-client rate limits on every write route; 32 KB body cap
- [x] Bounded agent: 40 tool calls, 2 replans, per-request deadlines
- [x] Explicit quota / auth / network failure paths with user-facing remediation
- [x] Replay mode cannot be reached while a live key exists, and is labelled
- [x] No footer on any route (verified by scanning the served HTML)
- [x] `LICENSE` present and visible; no secrets in `fixtures/`, docs or exports
- [x] Signed-out use: no login, no account, no persisted identity
- [ ] **Public URL deployed** ← blocking
- [ ] Fresh anonymous browser checked against the deployed URL
- [ ] Mobile layout checked on a real device
- [ ] Provider-failure path checked on the deployed instance

## Deliberate non-actions

- **Nothing was pushed to any hosting provider.** No deployment was performed,
  because it requires an account the user has not authorised and credentials
  this environment does not hold.
- **No alternative host was silently substituted** for the contractually
  specified Sites target.
- **No new paid service was created**, and no spend was incurred.
- **The provider keys were never copied, printed, packaged or exported.** They
  were read from the user's env file by name and mapped straight into the
  process environment for local verification.
