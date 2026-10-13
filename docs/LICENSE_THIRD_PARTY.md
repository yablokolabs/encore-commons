# Third-party data and service terms

The [MIT licence](../LICENSE) covers the source code and the branding assets in
this repository, which were generated for this project. It does **not** cover
third-party data or services used by the application.

## Qloo

- Entity names, addresses, geocodes, images, opening hours, prices and affinity
  values are supplied by the Qloo API under the Qloo hackathon terms.
- They are **not redistributed** in this repository as a dataset.
- `fixtures/replay/*.json` and `fixtures/contract/*.json` contain a sanitised
  subset of genuine responses, used only so the test suite can run without live
  credentials. The Qloo hackathon guide permits private server-side caching but
  asks that response data not be published in a public repository. If those
  fixtures need to be removed from a public repository to comply with the terms,
  delete them and run `npm test` against live credentials instead — the suite is
  written to work either way, and replay mode is optional.
- Venue images are loaded from Qloo's image host at runtime and are not
  redistributed here.
- Live calls require a `QLOO_API_KEY` issued to the operator. No affiliate,
  partnership or endorsement by Qloo is implied.

## CSCS Apertus

- Language-model inference is provided by the CSCS inference API
  (`swiss-ai/Apertus-v1.5-70B`, an Apertus model). Its outputs are generated text
  and carry no warranty.
- Live calls require a `CSCS_INFERENCE_API_KEY`. No allocation, partnership or
  endorsement by CSCS or the Apertus project is implied.

## Fonts used by the application and video

The interface and the video use Instrument Serif, Geist and JetBrains Mono, all
under the **SIL Open Font License 1.1**, installed from `@fontsource` packages. The
video's faces are loaded locally by `videos/styles/encore/fonts.css`; no font is
fetched at runtime in either the app or the exported video.

## Data deliberately not collected or stored

- No names, email addresses, accounts or persistent identifiers.
- No demographic or health traits are collected, inferred or stored.
- Taste signals are pseudonymous participant labels and confirmed entity ids,
  held in memory for at most three hours and deletable from the interface.

## Media

The architecture diagram in `docs/` was produced for this project using the
diagram-design skill from `github.com/cathrynlavery/diagram-design` (MIT), applied
with this project's own brand tokens. No third-party diagram asset is redistributed.

### Demo video

The walkthrough in `docs/media/` is assembled from this project's own material:
screenshots captured from the running application, the project's own architecture
diagram, and its own brand assets. The only third-party components are the voice
and the fonts.

- **Narration.** Generated with the ElevenLabs API on the operator's own account,
  using the premade voice *Alice — Clear, Engaging Educator*. Voice and billed
  character count are recorded in `videos/videos/encore_demo/audio/originals/voiceovers/alice-uk-v1/audio_meta.json`.
  No voice cloning, voice design or imitation of a real person was used, and no
  third-party audio was redistributed. The exported audio and MP4 contain no
  credential.
- **Fonts.** The video uses Instrument Serif (© The Instrument Serif Project
  Authors), Geist (© The Geist Project Authors) and JetBrains Mono (© The JetBrains
  Mono Project Authors), all licensed under the **SIL Open Font License 1.1**. They
  are installed from the `@fontsource` packages at build time; the licence text
  ships with each package under `videos/node_modules/@fontsource*` and is neither
  modified nor removed. They are **not** redistributed as font files in this
  repository — only as outlines rendered into the video frames.
- **Videowright** (`github.com/scosman/videowright`) is used to compose and export
  the video and is installed as a dev dependency of the isolated `videos/` project.
- **Capture.** Playwright with the locally installed Chromium was used to capture
  the running application's interface.

No music, no sound effects and no stock footage are used. Nothing in the video is
attributed in the video itself: the project does not place closing cards, credits
strips or attribution bars in its output, and provenance is recorded here instead.
