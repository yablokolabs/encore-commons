# Provider script — take alice-uk-v1

> Sent to elevenlabs, model `eleven_multilingual_v2`, voice "Alice - Clear, Engaging Educator".
> One paragraph per scene, blank-line separated, in reading order; prosody comes from
> punctuation only and no model tags are used. This file is the input record for the
> take, so it is the same wording as each scene's `voiceover` field. Rewritten by
> `node scripts/derive-advances.mjs --write`.

Three people, one night out, and no shared taste. Ada loves Radiohead and In the Mood for Love. Bo wants Nina Simone. Cy wants Daft Punk and Blade Runner. Encore Commons grounds each person's taste in real cultural data, then finds one venue they can all say yes to.

You type where the show is, and each person names a few things they love. Those favourites resolve to real Qloo entities. Nothing is scored against a guess: a person confirms each match, and only confirmed entities reach the provider.

The agent is a bounded state machine, not an open-ended loop: five allowlisted tools, at most two replans. This run queried places three times and scored twenty-four candidates for all three people.

That produced Absinthdepot Berlin. Its worst-person affinity is zero point seven nine three, the lowest score any single participant gave it. The group mean is zero point eight two two, and nobody was averaged away.

Affinity is a ranking signal, not a promise, so a veto is a hard exclusion, not a low score. Bo vetoes one venue; it stays visible with its reason, and the plan rebuilds from discovery already paid for, with zero new Qloo calls.

Every step is on the record. This query took eleven steps: eight succeeded, three were skipped because the work was already cached, and none failed.

It claims no more than it can show. Affinity is cultural fit, not a chance anyone enjoys the night. Distance is a straight line, not travel time. Hours, price and access are unverified metadata. Nothing is booked. The working app is public, and its address is on screen.
