# Built With

Every entry below was verified by actually running it in this repository. Maximum
25 honest tags. Nothing is listed because it was mentioned, planned or merely
transport-compatible.

## Application tags

| Tag | Evidence it is genuinely used |
| --- | --- |
| qloo | Live `GET /search`, `GET /v2/insights`, `GET /v2/tags` against `https://hackathon.api.qloo.com`. 24 candidates scored with real `query.affinity` for 3 participants. |
| apertus | Live `GET /v1/models` and `POST /v1/chat/completions` on `swiss-ai/Apertus-v1.5-70B`. Real model wording shipped as `cscs_grounded`. |
| cscs-inference | The host for the above: `https://api.inference.cscs.ch/v1`. |
| typescript | Entire codebase. `tsc --noEmit` exits 0. |
| react | All three routes are React components (React 19). |
| nextjs | Next.js 16 App Router; `next build` exits 0 with 5 routes. |
| zod | Every trust boundary is Zod-validated, including model output and provider payloads. |
| vitest | 70 tests across 8 files, all passing. |
| nodejs | Node 22 local runtime and local scripts. |
| css | Hand-written design system in `app/globals.css`. |
| vinext | **Verified.** `vinext check` → 91% compatible, 0 issues. `vinext build` → exit 0, all 7 routes. `vinext dev` served every route and completed a real 24-candidate plan. |
| vite | **Verified.** v8.3.4 is the Vite server Vinext drives. |

## Honest exclusions

- **No database.** The session store is in-memory by design (`docs/DECISIONS.md` D10). Nothing durable is stored.
- **No vector store or RAG.** Ranking is deterministic arithmetic over provider affinity, not embedding search.
- **No booking, ticketing, payment or map provider.** Distance is haversine between coordinates; there is no routing or travel-time service.
- **No Sites deployment.** Planned and documented in `docs/DEPLOYMENT.md`; not published, so it is not claimed as used.
- **No image-generation service in the app.** The branding PNGs were generated once and are committed as assets.
- **No ElevenLabs in the app.** It is a local video-production secret only, and no narration has been produced yet.
