# Tooling verification status

October 13, 2026. Findings from the build session, verified on this host. Nothing
here is claimed on the basis of a config label alone.

## Verified and used

| Tool | Status | Evidence |
| --- | --- | --- |
| Hindsight (`encore-commons`) | **Verified** | MCP transport resolved to `http://127.0.0.1:8888/mcp` from `~/.agents/mcp.json`; bank created and recall/retain executed against it. |
| context-mode | **Verified** | CLI present at `~/.local/node-v22.2x/bin/context-mode`. `context-mode doctor` passed: storage paths PASS, server test PASS, runtimes detected (bun 1.3.14, python 3.12, go 1.27). Used via `context-mode index` / `context-mode search` over the repository. |
| Qloo API | **Verified live** | 16/16 smoke checks; see `docs/API_CONTRACT.md`. |
| CSCS Apertus 1.5 70B | **Verified live** | `/models` and `/chat/completions`; model pinned at 70B. |
| diagram-design | **Verified** | Skill read from `github.com/cathrynlavery/diagram-design` (SKILL.md v2.6 + `references/type-architecture.md`). Brand profile applied from `docs/BRANDING.md` instead of shipped defaults. Produced `docs/architecture.html`, `.svg` and a 2360×1280 `.png`. |
| gh CLI | **Verified** | v2.45.0, authenticated as `yablokolabs` with `repo` scope. |
| rsvg-convert | **Verified** | v2.6-class SVG→PNG rasteriser; produced the committed PNG. |

## Read but not executed here

| Tool | Status | Why |
| --- | --- | --- |
| Vinext / Sites | **Pending** | `vinext@1.1.0` resolved on npm and its CLI help was inspected (`dev`, `build`, `check`, `deploy`). The CLI is not installed on this host and no Sites packaging helper is present, so it was **not** executed against this codebase. Scripts are wired up; execution is blocked. |
| Videowright | **Pending** | Repository and install guide not reached before the media step was deferred. No video was produced. |
| ElevenLabs narration | **Pending** | Key name confirmed present in `~/.hermes/.env`; no account metadata was read and no voice was auditioned or synthesised, so no quota was spent. |
| nori senior-swe | **Pending** | Source identified (`github.com/tilework-tech/nori-skillsets`, documented `nori-skillsets download senior-swe` / `switch senior-swe`). Switching rewrites agent configuration, which would overwrite this repository's `AGENTS.md` and MCP settings, so it was **not** run. Its principles (understand existing code first, smallest adequate solution, keep tests meaningful) were applied by reading rather than installing. Freebuff native support is unverified. |
| Headroom | **Pending** | Source identified (`github.com/headroomlabs-ai/headroom`); local MCP integration not configured on this host, and the Python proxy must not ship inside the Worker runtime. |
| Ponytail | **Applied by reading** | Prompt read from `skills/ponytail/SKILL.md`. Its guidance shaped the build (plain CSS instead of a UI framework; no database; smallest adequate session store) but it was not installed as a skill. |
| ADHD ideation (`uditakhourii/adhd`) | **Pending** | Source identified; no host-supported isolated-frame subagent flow was confirmed, so no separate model calls were simulated or claimed. |
| i-have-adhd (output style) | **Applied** | Short, action-first numbered updates with location → cause → fix reporting. |

## Note on `i-have-adhd` vs `adhd`

These are two different skills and were not merged: `i-have-adhd` governs response
style, `UditAkhourii/adhd` governs bounded ideation. Only the former was applied.

## Missing-tool policy applied

Per `AGENTS.md`, missing tools stay pending and are surfaced. No substitute
package was installed from a guessed repository, and no skill was reported as
having run when it did not.
