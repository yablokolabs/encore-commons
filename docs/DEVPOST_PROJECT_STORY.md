## Inspiration

Groups do not fail to find a venue because they lack options. They fail because
the loudest preference wins. One person picks a place they love, everyone else
tolerates it, and the night is quietly worse for someone.

The interesting question for an agent with real cultural grounding is not "what
is a good place" — a search engine can answer that. It is **"what is the place
that nobody has to tolerate?"** That is a group-fairness problem, and it needs
numbers, not vibes.

This need is a research hypothesis. No user study was run, and the app does not
claim measured impact.

## What it does

A group of two to four people each name a few things they genuinely love — an
artist, a film, a book, a podcast. Someone enters where the show is. Encore
Commons then:

1. **Resolves** each favourite to a real Qloo entity, and asks a human to confirm
   the match rather than guessing which "Radiohead" was meant.
2. **Discovers** candidate venues near the show location, seeded by the group's
   cultural signals.
3. **Scores every candidate for every person** on the *same* evidence, using
   Qloo's per-entity affinity, so the comparison is genuinely comparable.
4. **Ranks worst-participant-first**, so a venue one person loves and another
   dislikes cannot win on average.
5. **Explains** the result from provider facts, and states exactly what is still
   unknown: hours, price, step-free access, allergy handling, availability.
6. **Replans** when someone vetoes — treating the veto as a hard exclusion rather
   than a score reduction, in about two seconds, with no extra API calls.

Every tool call the agent makes is visible on a trace page with its status,
latency, result count and a one-way fingerprint of its input.

## How we built it

**Next.js App Router + React 19 + TypeScript**, with Zod validating every trust
boundary and Vitest covering the logic. Deploy target is Sites (Vinext on
Cloudflare Workers).

The important architectural decision is that **the recommendation does not depend
on a language model**. Qloo returns a numeric affinity per venue per profile. All
ranking, scoring and fairness maths is deterministic TypeScript in
`packages/domain/src/ranking.ts` — no model call, no black box, no token cost.
CSCS **Apertus 1.5 70B** is used only to word a grounded explanation from facts
that are already fixed, and its wording is rejected outright if it states a
percentage, claims a guarantee, invents a rating the provider never returned,
cites a venue outside the current snapshot, or describes straight-line distance
as travel time. Rejected wording falls back to a deterministic template that is
labelled as such.

The agent itself is a bounded state machine, not an autonomous loop: a fixed
sequence of five allowlisted tools, a 40-call ceiling, at most two replans, and a
provider-response check after every step.

## Challenges we ran into

**The API contract was not what the examples suggested.** The organiser warned
that `/search` and `/v2/insights` use *different* entity-type vocabularies, and
they do — `/search` takes `urn:entity:videogame` while insights takes
`urn:entity:video_game`. The origin also does not imply a `/v2` prefix for every
route: `/search` is unversioned, `/v2/insights` is not. That was solved by storing
the origin with no path at all and composing each route explicitly, with a test
asserting the path is exactly `/v2/insights` and never `/v2/v2/insights`.

**The API rate limit arrives disguised as success.** A tripped rate limit answers
**HTTP 200** with `{"error_msg":"Rate limit exceeded"}`. A status-code-only retry
policy would treat that as a successful empty result and quietly show the group
nothing. It now has its own detection and backoff, and all provider traffic is
serialised through one queue.

**"Unknown" kept trying to become "zero".** Our first ranking treated a venue with
one participant's affinity missing as merely lower-scored. That would let an
unknown participant be outvoted. A test caught it; ranking now requires comparable
evidence for **every** participant, and partial candidates are set aside with the
reason attached instead of being scored.

**A veto with no name attached.** The veto set was carried through the pipeline
without the participant who cast it, so the interface could exclude a venue but
not say *who* excluded it. Another test caught that, and the veto now carries its
attribution end to end.

## Accomplishments that we're proud of

- **24 of 24 candidates scored for all 3 participants — 100% coverage** — using
  Qloo's `filter.results.entities` to score one shared candidate set, which turned
  the planned rank-position fallback into something better than the fallback.
- **A real veto/replan in 2.45 seconds with zero additional API calls**, because a
  veto re-ranks cached discovery instead of re-querying the provider.
- **70 automated tests and 16 live smoke checks**, all passing, including a full
  pipeline run over genuinely recorded Qloo responses.
- **An ablation that admits where we lose.** Qloo-grounded ranking had the best
  worst-person affinity (0.793 vs 0.772 for popularity-only and 0.756 for an
  unguided model), but popularity-only won on our agreement metric (1.000 vs
  0.667) by landing on a broadly liked landmark. We report that instead of
  hiding it.
- **No fabricated operational data.** Provider hours, prices and ratings are
  labelled `verified: false` everywhere; distance is always labelled
  straight-line; and when Qloo is unreachable the app returns an explicit error
  rather than substituting a generic list.

## What we learned

Cultural affinity and operational fitness are different things, and conflating
them is how recommendation products become untrustworthy. Qloo can tell you
whether a venue fits what someone loves. It cannot tell you whether the kitchen
handles a nut allergy, whether the door has a step, or whether anyone will enjoy
the night. Those are different questions with different owners.

We also learned that taste-seeded venue discovery has a genre bias worth naming:
seeding place discovery from music and film signals near Berlin surfaced mostly
museums, memorials and galleries rather than nightlife. The chosen venue was one
of the few bars that appeared. That is a real limitation, not a footnote.

And we learned that a *comparison* is only honest if the baseline gets to win
sometimes. Popularity beat us on one metric, so that is in the report.

## What's next for Encore Commons

1. **Publish it.** The hosted deployment is the one outstanding requirement. The
   configuration, runtime secrets list and public-demo checklist are written;
   execution needs hosting authorisation.
2. **A venue-kind filter.** Let a group narrow the *kind* of place (bar, café,
   restaurant, culture) while taste still does the ranking. This directly
   addresses the genre bias we measured.
3. **A consenting group trial.** Five real groups, asked whether the
   minority participant's choice felt represented. That is the only way to
   measure the thing the product claims, and it has not been done yet.
4. **Reconnect to a live show location** — still supplied by the user, never
   inferred from a concert database, and never used to claim venue verification.
