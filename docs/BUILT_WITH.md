# Built With

Every entry below was verified by actually running it in this repository. Nothing
is listed because it was mentioned, planned or merely transport-compatible.

## Application tags

| Tag | Evidence it is genuinely used |
| --- | --- |
| qloo | Live `GET /search`, `GET /v2/insights`, `GET /v2/tags` against `https://hackathon.api.qloo.com`. 24 candidates scored with real `query.affinity` for 3 participants, on the public deployment as well as locally. |
| apertus | Live `GET /v1/models` and `POST /v1/chat/completions` on `swiss-ai/Apertus-v1.5-70B`. Real model wording shipped as `cscs_grounded`. |
| cscs-inference | The host for the above: `https://api.inference.cscs.ch/v1`. |
| typescript | Entire codebase. `tsc --noEmit` exits 0 for the app and for the video project. |
| react | All three routes are React components (React 19). |
| nextjs | Next.js 16 App Router; `next build` exits 0 with 5 routes. |
| zod | Every trust boundary is Zod-validated, including model output and provider payloads. |
| vitest | 70 tests across 8 files, all passing. |
| nodejs | Node 22 local runtime and local scripts. |
| css | Hand-written design system in `app/globals.css`, and the video style in `videos/styles/encore/`. |
| vinext | **Verified.** `vinext check` → 91% compatible, 0 issues. `vinext build` → exit 0, all 7 routes. `vinext dev` served every route and completed a real 24-candidate plan. |
| vite | **Verified.** v8.3.4 is the Vite server Vinext drives, and the one Videowright drives for the video project. |
| cloudflare | **Verified.** The deployed app is served through a named Cloudflare tunnel on this account's own zone; the public URL was verified signed out from the open internet. |
| playwright | **Verified.** Chromium drove three real jobs: capturing the app's interface (`videos/scripts/capture-app.mjs`), measuring every video scene against the frame (`videos/scripts/check-frames.mjs`), and the renderer's frame capture. |
| videowright | **Verified.** `videos/` is an isolated Videowright project. `videowright build`/`dev` served all 7 scenes, and `videowright render` exported the 115.8 s MP4. |
| elevenlabs | **Verified.** The narration in the demo video was generated with the API, voice selected from real account metadata and auditioned. Billed characters recorded in `audio_meta.json`. |
| ffmpeg | **Verified.** Loudness-normalised the narration track, and muxed the audio into the exported MP4. |

## Honest exclusions

- **No database.** The session store is in-memory by design (`docs/DECISIONS.md` D10). Nothing durable is stored.
- **No vector store or RAG.** Ranking is deterministic arithmetic over provider affinity, not embedding search.
- **No booking, ticketing, payment or map provider.** Distance is haversine between coordinates; there is no routing or travel-time service.
- **Not a Sites Worker deployment.** The target was Sites/Vinext and that runtime is verified locally, but publishing to Cloudflare Workers needs an account credential this environment does not hold. The app is public through a named Cloudflare tunnel on the account's own zone instead, and `docs/DEPLOYMENT.md` says so plainly rather than calling it a Sites deploy.
- **No image-generation service in the app.** The branding PNGs were generated once and are committed as assets.
- **No ElevenLabs in the app.** It is a local video-production secret only; it is not browser code and is not a deployment secret.
- **No music or sound effects in the video.** The narration is a single VO-only track.
- **No paid voice or plan upgrade.** The narration uses a premade voice on the existing free tier; the library voices the brief would have preferred are refused by that tier with HTTP 402 and no spend was authorised.
