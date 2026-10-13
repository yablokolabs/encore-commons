# Evaluation

Two kinds of evidence, kept separate on purpose:

1. **Test suite** — 70 automated tests, 8 files, all passing. Deterministic.
2. **Ablation** — algorithm comparison on frozen inputs. **Not** a user study.

## Test suite

```
npx tsc --noEmit     → exit 0
npx vitest run       → 8 files, 70 tests, all passed
npx next build       → exit 0, 5 routes compiled
npx tsx scripts/smoke.ts  → 16/16 live checks passed against real providers
```

| File | Tests | Covers |
| --- | --- | --- |
| `tests/unit/ranking.test.ts` | 12 | Worst-participant ordering, unknown-is-not-zero, full-coverage requirement, veto as hard exclusion with attribution, diversity and name tie-breaks, provider-metadata unknowns |
| `tests/unit/qloo-client.test.ts` | 13 | Origin/route composition with no duplicated `/v2`, `X-Api-Key` header only, `take` cap at 50, WKT point+radius, `filter.results.entities`, rate-limit-in-a-200-body, 401 non-retryable, malformed-response detection, missing-credential refusal, fact provenance |
| `tests/unit/explain.test.ts` | 11 | Six rejection rules for model wording, deterministic template content, provenance labelling, citation filtering |
| `tests/unit/schemas.test.ts` | 10 | Participant and favourite bounds, whitespace normalisation, revision guard, injection text preserved as data |
| `tests/unit/safety.test.ts` | 6 | Instruction-pattern neutralisation, control-character stripping, truncation reporting, secret redaction |
| `tests/unit/geo.test.ts` | 3 | Haversine against known distances, and that the label never says "walking" or "travel time" |
| `tests/integration/agent.test.ts` | 10 | Full state machine, clarification instead of invention, credential failure, unscorable participant, veto replan with zero extra calls, tool ceiling, replan cap |
| `tests/integration/replay.test.ts` | 5 | The whole pipeline over **genuinely recorded** Qloo responses, replay labelling, refusal to serve unrecorded queries |

### Live smoke test (real calls, 2026-10-13)

Sixteen checks, all passing, in 15.1 s:

- Qloo credential present; origin `https://hackathon.api.qloo.com`
- `GET /search` resolved `Radiohead` → `70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C`
- `GET /v2/insights` returned 10 places near Berlin with affinity (`first=0.8986`)
- Location restriction applied (returned Berlin Treptow, Tiergarten, Mitte, Hansaviertel)
- Explicit shared candidate set scored: **6/6 candidates returned with affinity**
- 54 provider facts, **all** marked `source: qloo, verified: false`
- CSCS `/models` lists `swiss-ai/Apertus-v1.5-70B`; the 8B variants are present and **not** selected
- CSCS `/chat/completions` answered in 574 ms
- Full agent run: **24 candidates, 24 ranked with full participant coverage**, top pick worst-affinity 0.8447
- Explanation provenance `cscs_grounded`, `modelGenerated: true` — real Apertus wording passed validation
- Serialised plan + trace contains no credential value

## Ablation

Same group (Ada, Bo, Cy), same show location (Berlin), same constraints, and the
**same candidate opportunities for all three strategies**. Affinity values are
recorded Qloo data; the Qloo-grounded run and the CSCS baseline were also
executed live. Raw output: `fixtures/evaluation.json`.

| Metric | `qloo_grounded` | `popularity_only` | `cscs_only_no_qloo` |
| --- | --- | --- | --- |
| Task completed | yes | yes | yes (1 CSCS call) |
| Candidates compared | 24 | 24 | 5 named |
| Ranked | 24 | 24 | 2 of 5 scoreable |
| Top pick | Absinthdepot Berlin | East Side Gallery | Berghain (best by worst-person) |
| **Worst-person affinity** | **0.792977** | 0.771924 | 0.756098 |
| Mean affinity | 0.822006 | 0.831708 | 0.784861 |
| Participant coverage | 1.00 | 1.00 | 1.00 (for the 2 scoreable) |
| Agreement rate | 0.667 | **1.000** | — |
| Qloo calls | 14 | same discovery | 20 (5 search + 15 scoring) |
| CSCS calls | 0 | 0 | 1 |
| Latency | 14.9 s | — | 18.6 s |

`agreementRate` = share of participants for whom the pick is at least as good as
their own median across the compared pool. It is a transparent, reproducible
proxy for "nobody was left behind". It is not user satisfaction.

### What the numbers actually say

**The Qloo-grounded plan wins on worst-person affinity, which is the metric this
product exists to optimise:** 0.793 vs 0.772 (popularity) and 0.756 (unguided
model). The protagonist is a real bar near the show.

**The popularity baseline wins on agreement, and this is reported rather than
hidden.** Ranking the same pool by provider popularity alone lands on East Side
Gallery — a broadly liked landmark — which clears every participant's median
(agreement 1.000 vs 0.667), while the taste-grounded pick asks one participant to
accept a slightly lower-than-median venue. That is a genuine, honest result: a
single widely liked sightseeing landmark can beat taste-personalised ranking on a
"nobody below their median" measure. The counter-argument is in the numbers too:
the taste-grounded pick has the better worst-case affinity and is the venue type
the product is for.

**The unguided model names real venues and still loses.** Apertus 1.5 70B, with
no Qloo access, named five genuine Berlin venues, recorded verbatim:

> Berghain · Astra Kulturhaus · Kino Babylon · Lido · Prince Charles

All five resolved in Qloo (grounding rate 1.000), so this was not a hallucination
test. But when the same affinity evidence was applied to them, the best of the
five (Berghain, 0.756) ranked **below** the taste-grounded pick (0.793), and
**three of the five returned no comparable affinity at all** for this group in
this location. Naming a real venue is not the same as choosing it for this
group's taste, and without Qloo there is no way to tell the difference.

### Examples where Qloo was unhelpful

- **The candidate pool skews to landmarks.** Seeding place discovery from music
  and film taste signals near Berlin surfaced mostly museums, memorials and
  galleries rather than nightlife. The group's chosen venue was one of the few
  bars that appeared. This is a real weakness of taste-seeded place discovery in
  this region, and a venue-kind filter is the obvious next improvement.
- **Three of the five model-named venues had no comparable affinity.** An entity
  can exist in Qloo and still have nothing to say about it for a given signal set
  and location. The app reports those as unknown and refuses to rank them.
- **Affinity spreads are narrow.** Per-profile Berlin ranges were roughly
  0.76–0.89. The absolute numbers are not meaningful on their own; only the
  ordering within a query is, which is why every surface labels affinity as a
  relative signal.
- **Popularity beat agreement** in this single case, as described above.

## Explicit non-claims

- **No user study was run.** No participant was asked whether the result felt
  fair. Rank utility is not measured user satisfaction, and nothing here shows
  that a group would be happier with the recommendation.
- **One group, one location, one session.** This is illustrative of the
  mechanism, not a general claim that Qloo grounding always outperforms
  popularity or an unguided model.
- **Affinity is not enjoyment.** A high affinity is a statement about cultural
  fit between confirmed favourites and a venue.
- **Distance is straight-line.** Not a route, not a travel time.
- **Hours, price, access, allergy handling and availability are unverified.**
  They are third-party metadata or unknown, and every one of them is labelled as
  needing confirmation with the venue.

## Reproducing

```bash
npm run typecheck            # tsc --noEmit
npm test                     # 70 tests, mostly against recorded fixtures
QLOO_API_KEY=... npx tsx scripts/smoke.ts      # 16 live checks
QLOO_API_KEY=... CSCS_INFERENCE_API_KEY=... npx tsx scripts/evaluate.ts --live-qloo
```

Without credentials the suite runs entirely against the recorded fixtures in
`fixtures/replay/`, which are genuine sanitised Qloo responses captured on
2026-10-13, and replay mode is labelled distinctly in every surface.
