---
title: Encore
slug: encore
picker_description: 'Warm ivory paper, midnight-plum ink, one coral accent. A night out, considered.'
font_sources:
  - https://fonts.google.com/specimen/Instrument+Serif
  - https://fonts.google.com/specimen/Geist
  - https://fonts.google.com/specimen/JetBrains+Mono
mood: [warm, considered, sociable, calm, high-contrast]
good_for:
  - consumer product introductions
  - group decision stories
  - data-with-a-human-voice explainers
  - anything that should read as welcoming rather than corporate
bad_for:
  - dark-mode native dashboards
  - hype reels and fast-cut social shorts
tags: [editorial, serif, minimal, warm, light-mode]
references: [Encore Commons brand kit, Stripe Press, The Browser Company]
---

# Encore — STYLE.md

Agent-facing guide for the Encore brand. Read before composing scenes.

---

## Identity

Encore is the application's own register: warm ivory paper, midnight-plum ink,
one coral accent. It is digital product design in a paper setting — the palette
comes straight from `app/globals.css` so the film and the product are the same
object, and the serif display carries a sociable, human tone the product claims
with *Different tastes. One great night.*

**Mood:** warm, considered, sociable, calm, high-contrast.

## Colour application

- **Ivory `--color-bg` everywhere.** Pure white is forbidden: on this palette it
  reads as a different, colder product.
- **Plum `--color-fg` for primary type**, `--color-soft` for large body copy and
  `--color-muted` for labels, captions and secondary type.
- **Coral `--color-accent` is the editor's mark.** It appears at most once per
  scene, on the single thing the narration is pointing at: the winning venue, the
  vetoed card, the number being read out.
- **Gold and violet are secondary and semantic.** They identify Bo and Cy — the
  two participants who are not the anchor — and are used as participant dots.
  They never carry a headline and never appear without their participant.
- **`--color-wash` (coral wash) is the one card fill**, for the card a scene is
  arguing about. Nothing else gets a fill.

## Type rules

- **Display = Instrument Serif**, 96–220px; use the italic for emphasis.
- **Body = Geist**, 400 for body copy, 500 for grotesk headlines.
- **Mono = JetBrains Mono**, uppercase, tracked +0.08em, for labels only
  (`Qloo · LIVE`, `PLAN REV 1`, section eyebrows). Never body copy.
- **Body text is never smaller than 36px at 1080p**, and headings are never
  smaller than 64px. This is a video, not a page.
- Emphasis order: serif italic > coral colour > weight. Never underline for
  emphasis except the draw-on mark.

## Motion

- **Entries settle downward**: fade in while drifting up 16px over
  `--duration-normal` (480ms) on `--ease-out`.
- **Stagger at `--stagger` (80ms)** for lists; 120ms for a list that should breathe.
- **The coral mark draws** left-to-right or top-to-bottom over `--duration-normal`.
- **Exits cut.** A hard cut is faster and reads as deliberate; scenes dip through
  ivory only when a scene changes place.
- **Forbidden:** bounce, spring, overshoot, elastic, glow, drop shadow, gradient,
  texture, emoji. Flat ink on flat paper.
- **Camera:** none. The page does not move.

## Pacing

Encore is **calm, not slow.** Scenes hold 12–22s because they are carrying
narration; a scene with one number can hold 20s and feel right. Never cut faster
than the sentence that explains the cut.

## Sizing and layout

- Left-anchor headlines on the `--safe-x` (128px) margin. Centred layout only for
  the opening and closing statements.
- Primary content containers span 80–90% of the canvas width. No `max-width`
  web-page centring.
- Hairline rules frame the safe area; a scene is a page, not a slide.

## Honesty rules for this project (binding)

These are project rules, not style preferences, and every scene obeys them:

- A recorded screenshot must be labelled as the recorded interface, and a live
  number quoted on screen must be a number the app actually produced.
- Affinity is a Qloo ranking signal, not a probability of enjoyment, and no scene
  may present it as one.
- Straight-line distance is never labelled as travel time.
- Provider facts are shown as **unverified** wherever they appear.
- The replay provider is labelled `REPLAY`; the live provider is labelled `LIVE`.
  The two are never visually interchangeable.
- No scene ends on a credits strip, a powered-by mark, a signature or a right
  notice. The film ends on a normal product sentence.
