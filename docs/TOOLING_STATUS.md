# Tooling verification status

October 13, 2026. Findings from the build session, verified on this host. Nothing
here is claimed on the basis of a config label alone.

## Verified and used

| Tool | Status | Evidence |
| --- | --- | --- |
| Hindsight (`encore-commons`) | **Verified** | MCP transport resolved to `http://127.0.0.1:8888/mcp` from `~/.agents/mcp.json`; bank created and recall/retain executed against it. |
| context-mode | **Verified** | CLI at `~/.local/node-v22.2x/bin/context-mode`. `context-mode doctor` passed; used to index and search this repository (`context-mode index`, `context-mode search`). |
| Qloo API | **Verified live** | 16/16 smoke checks plus the public deployment run; see `docs/API_CONTRACT.md`. |
| CSCS Apertus 1.5 70B | **Verified live** | `/models` and `/chat/completions`; model pinned at 70B. |
| diagram-design | **Verified** | Skill read from `github.com/cathrynlavery/diagram-design` (SKILL.md v2.6 + `references/type-architecture.md`). Brand profile applied from `docs/BRANDING.md`. Produced `docs/architecture.html`, `.svg` and a 2360×1280 `.png`. |
| gh CLI | **Verified** | v2.45.0, authenticated as `yablokolabs` with `repo` scope. |
| rsvg-convert | **Verified** | SVG→PNG rasteriser; produced the committed architecture PNG. |
| Vinext / Sites runtime | **Verified** | `vinext@1.1.0` dev dependency. `vinext check` → 91% compatible, 0 issues. `vinext build` → exit 0, all 7 routes. `vinext dev` → served every route and completed a real 24-candidate plan with live providers. |
| cloudflared (public ingress) | **Verified** | This host runs named Cloudflare tunnels for `yablokolabs.com` with an authenticated account. A new tunnel was created for the app, its DNS record pointed at the explicit tunnel UUID, and the public URL was verified signed out from the open internet: 31/31 checks in `scripts/verify-public.ts`. |
| Videowright | **Verified** | Installed as a dev dependency in `videos/` (isolated from the Sites app). `vite.config.mts`-style `videowright.config.ts` with `projectStructure: 'v1'`. Vendor patch applied (`scripts/patch-videowright.sh`) because the published tarball omits three modules the entry code imports. `videowright dev` served all 7 scenes; `videowright render` exported the MP4. |
| ElevenLabs narration | **Verified** | Voice selected from real account metadata and auditioned, not guessed: both candidate auditions returned HTTP 200, settings recorded in `audio_meta.json`. One take recorded for the film at 1,571 billed characters. |
| Playwright / Chromium | **Verified** | `@playwright/test@1.64.0` with the local browser cache. Used for three real jobs: capturing the app's interface, measuring every scene against the frame in `scripts/check-frames.mjs`, and the renderer's own frame capture. |

## Read but not executed here

| Tool | Status | Why |
| --- | --- | --- |
| Sites Workspace publish (`@vinext/cloudflare deploy`) | **Not used** | The official Sites path deploys to Cloudflare Workers and requires `vinext init --platform=cloudflare` plus a Cloudflare account credential this environment does not hold. The public deployment was instead made on the account's existing named-tunnel convention, which was verified to route publicly before use. Recorded in `docs/DEPLOYMENT.md` rather than presented as a Sites deployment. |
| nori senior-swe | **Pending** | Source identified (`github.com/tilework-tech/nori-skillsets`). Switching rewrites agent configuration, which would overwrite this repository's `AGENTS.md` and MCP settings, so it was **not** run. Its principles (understand existing code first, smallest adequate solution, keep tests meaningful) were applied by reading rather than installing. Freebuff native support remains unverified. |
| Headroom | **Pending** | Source identified (`github.com/headroomlabs-ai/headroom`); no local MCP integration is configured on this host, and its Python proxy must not ship inside the Worker runtime. |
| Ponytail | **Applied by reading** | Prompt read from `skills/ponytail/SKILL.md`. Its guidance shaped the build (plain CSS instead of a UI framework; no database; the smallest adequate session store) but it was not installed as a skill. |
| ADHD ideation (`uditakhourii/adhd`) | **Pending** | Source identified; no host-supported isolated-frame subagent flow was confirmed, so no separate model calls were simulated or claimed. |
| i-have-adhd (output style) | **Applied** | Short, action-first numbered updates with location → cause → fix reporting. |

## Hosting and narration: what was actually available

Two limits were measured rather than assumed, and both are recorded where the
artifact is:

- **Hosting.** `cloudflared` quick tunnels do not route from this environment —
  verified with a trivial static server, which 404'd at the Cloudflare edge over
  both QUIC and HTTP/2. Named tunnels on the account's own zone do route, so the
  app is published that way. It is a real public HTTPS URL, not a Sites Worker
  deployment, and `docs/DEPLOYMENT.md` says exactly which one it is.
- **Voice.** The brief asked for a youthful adult British female voice. This
  ElevenLabs account is on the free tier and its 21 reachable voices are all
  `premade`; the only British female premades are Alice and Lily, both
  `middle_aged`. The British female *young* voices are library voices, and the
  free tier refuses them through the API with **HTTP 402 `paid_plan_required`** —
  confirmed by request, not inferred from documentation. Voice design and cloning
  are paid-plan features. No spend was authorised, so both permitted British
  female voices were auditioned and the closer one was used. The refusal and both
  auditions are in
  `videos/videos/encore_demo/audio/originals/voiceovers/alice-uk-v1/audio_meta.json`.

## Note on `i-have-adhd` vs `adhd`

These are two different skills and were not merged: `i-have-adhd` governs response
style, `UditAkhourii/adhd` governs bounded ideation. Only the former was applied.

## Missing-tool policy applied

Per `AGENTS.md`, missing tools stay pending and are surfaced. No substitute
package was installed from a guessed repository, and no skill was reported as
having run when it did not.
