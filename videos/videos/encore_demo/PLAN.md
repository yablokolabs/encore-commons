# Plan: Encore Commons — Different tastes. One great night.

## Purpose

- Audience: hackathon judges and a technical reviewer who has not opened the app.
- Takeaway: a group with genuinely different cultural tastes can be given one venue
  they can all accept, because every person is scored on the same confirmed evidence
  from Qloo, a veto is a hard exclusion rather than a low score, and the whole run is
  inspectable afterwards.
- Constraints / hard guidelines:
  - 90–120 seconds. The first take ran 124.4 s and was trimmed and re-recorded.
  - The interface shown is recorded, not re-drawn: every screenshot comes from
    `scripts/capture-app.mjs`, which drives the running app in a real browser.
  - Numbers on screen are the captured run's own, read back out of the DOM. Nothing
    is retyped from a different session, and no figure is estimated.
  - Affinity is never presented as a probability of enjoyment, and distance is never
    presented as travel time.
  - Provider facts appear as **unverified** wherever they appear.
  - The replay provider is labelled `REPLAY`, the live provider `LIVE`; they are never
    visually interchangeable.
  - **No closing attribution of any kind**: no closing card, no credits strip, no
    "Powered by", no vendor badge, no signature, no rights notice. The last scene ends
    on product content — the limits the project states about itself, and the address of
    the deployed app.
  - No secret, key, token or private taste profile appears anywhere in the film.

## Style

- Active style: `encore` (`styles/encore/`), built from the application's own palette
  in `app/globals.css` — ivory `#fbf7f0`, midnight-plum ink `#241634`, coral
  `#e85c4a`, with gold and violet restricted to marking two participants.
- Notes:
  - The style's "one accent per scene" rule is followed; the coral marks the single
    thing the narration is pointing at (the count that matters, the excluded venue,
    the address).
  - The product mark appears once, in scene 1, beside the name. It never returns.

## Audio intent

- Voiceover: yes
- Sound effects: no
- Background music: no
- Notes: single continuous narration in one take, read to the scene schedule in each
  scene's derived `advances`. Voice: ElevenLabs *Alice — Clear, Engaging Educator*
  (premade, British, female), model `eleven_multilingual_v2`. The brief asked for a
  youthful adult British female voice; no British female voice in this account carries
  a young age label, and the British female young voices are library voices the free
  tier refuses with HTTP 402 `paid_plan_required`. The refusal and both auditions are
  recorded in `audio/originals/voiceovers/alice-uk-v1/audio_meta.json`. No spend was
  authorised. VO-only track, no mix, no music.

## Segment outline

1. `encore-context` — the group and the disagreement: three people, no shared taste.
2. `encore-group` — the group board, and the rule that only human-confirmed entities
   are scored.
3. `encore-agents` — the allowlisted tool surface and one run's measured counts.
4. `encore-proposal` — the proposal, with every participant's own affinity.
5. `encore-veto` — a veto as a hard exclusion, and the zero-cost replan.
6. `encore-trace` — the receipt: every tool call, its status and its latency.
7. `encore-limits` — what the project does not claim, and where the working app lives.
   Final scene.

## Timing

Each scene's `advances` are segment-relative seconds, and the renderer uses the
**last** entry as that scene's whole duration: it walks the schedule frame by frame
and advances its clock by that value before the next scene mounts.

The numbers below are generated from the recorded narration by
`node scripts/derive-advances.mjs --write` and verified by `npm run check:timing`.
Each reveal sits at the start of the recorded sentence that motivates it — the
sentence assigned to each one is in `beat_map.json` — and the spans sum to the length
of the narration file, so no scene is clipped.

<!-- timing-table:start -->
| Segment | Rendered advances | Narration span |
|---|---|---|
| encore-context | [3.971, 20.271] | 0.00 – 20.27 s |
| encore-group | [4.725, 8.626, 16.498] | 20.27 – 36.77 s |
| encore-agents | [0.5, 8.301, 14.466] | 36.77 – 51.23 s |
| encore-proposal | [2.868, 10.066, 15.847] | 51.23 – 67.08 s |
| encore-veto | [7.466, 12.284, 17.705] | 67.08 – 84.79 s |
| encore-trace | [2.554, 10.554] | 84.79 – 95.34 s |
| encore-limits | [2.879, 16.741, 20.479] | 95.34 – 115.82 s |
| **Total** | | **115.820 s** |
<!-- timing-table:end -->

---

## Log

### 2026-10-13 — Initial scaffold

- Sketch: seven scenes, `encore` style derived from the app palette, voiceover yes,
  no music, no sound effects.
- Segments created: `encore-context`, `encore-group`, `encore-agents`,
  `encore-proposal`, `encore-veto`, `encore-trace`, `encore-limits`.

### 2026-10-13 — Real captures, and the figures the film quotes

- `scripts/capture-app.mjs` drives the running application in Chromium and saves
  1920×1080 frames at device scale 2. It types the show location, loads the demo
  group, presses *Resolve favourites with Qloo*, confirms each match in the select the
  app really renders, plans, vetoes as Bo, and reads `/trace` twice — once for the
  query and once for the replan.
- The scenes quote only what those captures recorded, in `assets/captures/run.json`:
  proposal *Absinthdepot Berlin*, Ada 0.836 / Bo 0.793 / Cy 0.837, worst-person 0.793,
  mean 0.822, 100% coverage; the veto excluded *Reichstagskuppel* for Bo with a
  worst-person affinity of 0.782; the query trace was 11 steps with 8 succeeded, 3
  skipped and 0 failed; the replan's trace shows `query_places` skipped, i.e. **0**
  new Qloo discovery calls.
- The capture run's proposal did not change after the veto, and nothing claims it did.
  The scene's claim is the one the evidence supports: a veto is a hard exclusion, the
  venue stays visible with its reason, and the plan is rebuilt from discovery already
  paid for.

### 2026-10-13 — Narration, and the trim to fit

- Take 1 (`alice-uk-v1`, first recording) ran 124.4 s against a 120 s cap. Prose that
  the screen already carries was cut, not claims: the closing clause of scene 3 (the
  100% coverage figure is drawn in the scene's stat row), one clause in scene 2, and
  two word-level tightenings in scenes 5 and 7.
- Take 2 is the delivered one at 115.9 s, 1,571 billed characters. Advance times were
  re-derived from its alignment, which is what re-times every scene in one command.
