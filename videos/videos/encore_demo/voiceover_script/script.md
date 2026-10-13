# Voiceover script — Encore Commons — Different tastes. One great night.

This is the narration as recorded, in the order the film plays it. Each section is
one paragraph of the provider input; the spans are the scene lengths derived from
the provider's own character alignment, so each scene ends exactly where the next
paragraph's first word begins. Assembled by `scripts/derive-advances.mjs`;
`--check` fails when this file, the segment `voiceover` fields and the recorded
take stop agreeing.

Narration pace: measured at 2.35 words per second over the recorded take
(alice-uk-v1, ElevenLabs `eleven_multilingual_v2`, voice Alice). The first take ran
124.4 s, over the 120 s cap, and was trimmed before this one was recorded.

| Segment | Words | Recorded span |
|---|---|---|
| encore-context | 49 | 20.27 s |
| encore-group | 40 | 16.50 s |
| encore-agents | 32 | 14.47 s |
| encore-proposal | 35 | 15.85 s |
| encore-veto | 43 | 17.70 s |
| encore-trace | 25 | 10.55 s |
| encore-limits | 48 | 20.48 s |
| **Total** | **272** | **115.82 s** |

## encore-context

Three people, one night out, and no shared taste. Ada loves Radiohead and In
the Mood for Love. Bo wants Nina Simone. Cy wants Daft Punk and Blade
Runner. Encore Commons grounds each person's taste in real cultural data,
then finds one venue they can all say yes to.

## encore-group

You type where the show is, and each person names a few things they love.
Those favourites resolve to real Qloo entities. Nothing is scored against a
guess: a person confirms each match, and only confirmed entities reach the
provider.

## encore-agents

The agent is a bounded state machine, not an open-ended loop: five
allowlisted tools, at most two replans. This run queried places three times
and scored twenty-four candidates for all three people.

## encore-proposal

That produced Absinthdepot Berlin. Its worst-person affinity is zero point
seven nine three, the lowest score any single participant gave it. The group
mean is zero point eight two two, and nobody was averaged away.

## encore-veto

Affinity is a ranking signal, not a promise, so a veto is a hard exclusion,
not a low score. Bo vetoes one venue; it stays visible with its reason, and
the plan rebuilds from discovery already paid for, with zero new Qloo calls.

## encore-trace

Every step is on the record. This query took eleven steps: eight succeeded,
three were skipped because the work was already cached, and none failed.

## encore-limits

It claims no more than it can show. Affinity is cultural fit, not a chance
anyone enjoys the night. Distance is a straight line, not travel time.
Hours, price and access are unverified metadata. Nothing is booked. The
working app is public, and its address is on screen.
