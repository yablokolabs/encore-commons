# Architecture diagrams and narrated video

## Architecture — required deliverable
Use https://github.com/cathrynlavery/diagram-design . Read its actual SKILL.md, relevant architecture references and export instructions before generation. Pin the checked repository revision in docs/TOOLING_STATUS.md. It produces self-contained HTML with inline SVG; retain HTML, export standalone SVG, then rasterize/export PNG using its documented workflow.

Use the existing Encore Commons brand: ivory paper, midnight-plum ink and coral accent; keep optional gold/violet secondary colors restrained. Apply a project brand profile before rendering instead of silently using default styling. Show browser, Sites server/controller, Qloo, CSCS Apertus 70B, deterministic group ranker and optional storage with accurate trust boundaries. Label unimplemented components as planned. Never place a secret value or private host token in a diagram. Inspect labels, arrows and clipping at desktop and narrow display sizes.

Deliver docs/architecture.html, docs/architecture.svg and docs/architecture.png. Embed the actual PNG in the repository README with `![Encore Commons architecture](docs/architecture.png)` under substantive Architecture content, and link the SVG. Add the embed only after the file exists and renders; no broken placeholder. Rebuild after architecture changes. No diagram footer or attribution bar; licensing/provenance goes in separate documentation.

## Demo video — requested supplementary deliverable
Use https://github.com/scosman/videowright and read its current installation instructions at https://github.com/scosman/videowright/blob/main/packages/lib/skill/install/INSTALL.md . Isolate it in videos/ rather than the Sites app root. Preserve app dependencies and existing hooks. Follow supported setup; verify ffmpeg and browser-render dependencies.

Create a 90–120 second product walkthrough using actual working-app captures and the architecture diagram. Label animated concepts and recorded/replayed results; never imply animation proves a live API call. Narration: a youthful ADULT female British English voice using ElevenLabs. Select an authorized available stock voice by actual account metadata and audition, not a guessed voice ID or an imitation of a real person. Record voice ID/model/settings, preview a short sample, then synthesize the final script using existing account quota. No subscription upgrades or new paid plan.

Draft videos/PLAN.md and narration script; show group tastes, real Qloo discovery, each person's fit, veto/replan, grounded explanation, actual public URL and limitations. Synchronize narration to scene timing using the supported workflow. Export MP4; verify audio clarity, timing, captions, readable text and final duration. Keep music optional and properly licensed. No footer overlay, credits strip, signatures or powered-by ending. A normal product scene may end the video.

Deliver docs/media/encore-commons-demo.mp4, caption file and source/script plus voice settings without credentials. The competition does not require video; it supplements the mandatory public working app. Do not delay app eligibility for video polish.

## Credentials
All CSCS, Qloo and ElevenLabs API keys are user-reported present in ~/.hermes/.env. Exact names for these three keys remain to be safely identified; inspect names only. Map the confirmed entries to the application's/documented tooling variables in memory. Never dump, shell-source, copy, package or edit the shared env file or leak its unrelated keys. Never fabricate a successful call from credential presence.

Only Qloo and CSCS need hosted Sites secrets. ElevenLabs is a local video-production secret, not browser code and not normally a deployed application secret. Exported MP4/audio must contain no credentials. Verify provider usage limits before full narration generation and avoid repeated billed regeneration. No actual narration or architecture rendering was performed in this documentation-kit update.
