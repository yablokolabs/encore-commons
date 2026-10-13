# Decisions

Each entry records what was chosen, what it was chosen over, and the evidence
that settled it. Unresolved items are listed as open rather than quietly closed.

## D1 — The recommendation logic does not depend on a language model

**Question.** Does the core recommendation need a language model at all?

**Decision.** No, and that separation is the point. Qloo returns a numerical affinity for every venue against a given signal set. All ranking, scoring and group-fairness maths runs server-side in plain TypeScript with zero model calls. Apertus 1.5 70B is used *only* to word a grounded explanation from facts that are already fixed, and to interpret a request into bounded tool parameters on the way in.

**Why it matters for the hackathon.** A judge can verify the recommendation logic by reading `packages/domain/src/ranking.ts` — deterministic, testable, no black box. If the LLM host is down, the plan still works; it just returns a structured JSON summary instead of prose. If the Qloo host is down, the app returns an explicit error rather than falling back to generic LLM guesses. This separation is the product's central architectural claim: **Qloo provides the intelligence, the LLM only provides the interface.**

**Evidence.** `lib/agent/state.ts` — `explainPlan()` is called at the very end, after ranking is complete. It receives the already-computed top pick and can only describe it, not change it. `packages/domain/src/ranking.ts` has no external calls of any kind.

---

## D2 — The agent is a bounded state machine, not an autonomous loop

**Decision.** The agent runs a fixed sequence of allowlisted tool calls, capped at 40 calls and 2 replans per request.

**Chosen over.** An open-ended ReAct loop where an LLM decides which tool to call next.

**Why.** A ReAct loop over a cultural-taste API is a quota burn and an infinite-loop risk, and it makes the trace unreadable to a judge. The fixed sequence is inspectable end to end, and every step validates its provider response before continuing.

**Evidence.** `AGENT_LIMITS` in `lib/agent/types.ts`; the ceiling is asserted by `tests/integration/agent.test.ts` ("never exceeds the tool-call ceiling").

---

## D3 — Per-participant fit uses `query.affinity` over a shared candidate set

**Question.** Do we need to fall back to rank positions?

**Decision.** Use the provider affinity directly.

`PROJECT_BUILD.md` pre-authorized a fallback: if comparable scores over a common candidate set were unsupported, use per-profile rank positions and treat absent candidates as unknown. Live testing found something better. `filter.results.entities` returns exactly the requested entities **and still populates `query.affinity`** for each. So every participant can be scored on the identical candidate set with a real comparable number.

**Measured outcome.** Live recording of the demo group scored **24/24 candidates for all 3 participants**, i.e. 100% coverage. The rank-position fallback was not needed and is not used. Rank position is still recorded as secondary context in the trace.

**Documented in.** `docs/API_CONTRACT.md` (`filter.results.entities`) and `packages/domain/src/ranking.ts`.

---

## D4 — Ranking is worst-participant-first, and full coverage is required to rank

**Decision.** Candidates sort by `0.6 × worstAffinity + 0.35 × meanAffinity + 0.05 × coverage`, with diversity and distance as later tie-breakers. A candidate is **only ranked when every participant has comparable evidence for it**.

**Chosen over.** Highest average affinity, which lets one delighted person outvote one badly-served person.

**Why full coverage is required.** An unknown preference is not a dislike, and it is also not evidence. Ranking a venue that one participant is unknown on would be presenting a group choice that the data cannot support. Those candidates are kept visible with the reason instead of being dropped or scored as zero.

**Consequence.** A group where one person has no resolvable favourite gets no proposed venue and an explicit clarification, rather than a guess. That is the specified behaviour in `PROJECT_BUILD.md` ("otherwise return insufficient evidence and ask for preferences").

**Evidence.** `tests/unit/ranking.test.ts` covers the balanced-beats-divisive case, the unknown-is-not-zero case, the full-coverage requirement and the veto-as-hard-exclusion case.

---

## D5 — A veto is a hard exclusion, and a replan reuses paid-for discovery

**Decision.** A veto removes a candidate from ranking before scoring rather than lowering its score. The replan re-runs ranking against the session's cached candidate pool and affinity matrix.

**Why.** Scoring a veto down makes the veto negotiable and hides the group's actual decision. Reusing the cache makes a veto cost **zero additional Qloo calls** and return in milliseconds instead of ~15 seconds.

**Guarding.** `expectedRevision` must match the current plan revision, so a stale veto cannot land on a plan that already moved on. `tests/integration/agent.test.ts` asserts that a replan performs no additional scored calls and that the veto is attributed to the participant who cast it.

---

## D6 — Language-model wording is validated, or replaced

**Decision.** Apertus produces explanation wording as JSON (`text`, `citedCandidateIds`). The answer is rejected and replaced with the deterministic template if it:

- states a percentage, a guarantee or a probability of enjoyment,
- describes straight-line distance as travel time,
- states a rating the provider never returned,
- cites a candidate id that is not in the current snapshot,
- fails to name the selected venue,
- or does not validate against its schema.

**Why.** A plausible-sounding invented claim is worse than no claim. The deterministic template always works, and it is labelled `deterministic_template` with a `fallbackReason`, so provider facts are never passed off as model prose.

**Evidence.** `lib/cscs/explain.ts`, `validateExplanationText`, and `tests/unit/explain.test.ts` (6 rejection cases + 2 provenance cases).

---

## D7 — Replay is a distinct, labelled mode

**Decision.** `ENCORE_REPLAY_FIXTURES=1` serves genuinely recorded Qloo responses only when no `QLOO_API_KEY` is present. Replay surfaces as `providerStatus.qloo = "replay"`, a violet badge, and a leading limitation sentence on the plan.

**Why.** Tests and judges must be able to see the difference between a live call and a recording. Replay can never be reached silently while a key exists, and it is never presented as live.

**Evidence.** `lib/qloo/replay.ts`, `tests/integration/replay.test.ts` ("replay mode is explicitly labelled", "refuses to serve a query that was never recorded").

---

## D8 — Rate limiting is detected from a 200 body, not a status code

**Decision.** All provider traffic is funnelled through one serialized queue with a minimum gap (default 250 ms), and a `200` body containing `error_msg: "Rate limit exceeded"` is classified as a retryable quota error with its own longer backoff.

**Why.** The issued hackathon key answers a tripped rate limit with HTTP 200. A status-code-only retry policy would treat it as success and silently return an empty candidate list — the worst possible failure mode for this product.

**Evidence.** Observed live; `tests/unit/qloo-client.test.ts` asserts the classification and the remediation text.

---

## D9 — Next.js App Router, kept Vinext-compatible

**Decision.** Build on the Next.js App Router with TypeScript, Zod and Vitest, and keep the source compatible with Vinext (Next.js on Vite), which is the Sites runtime.

**Chosen over.** Scaffolding a standalone Fastify server, which the build plan rules out for the hosted runtime, and over a bare Vite SPA, which cannot hold provider credentials.

**Status.** `npm run build` passes and all five routes render or serve. Vinext is a drop-in replacement for the `next` CLI, so no source changes are needed for that path. See `docs/DEPLOYMENT.md` for what is still unverified.

---

## D10 — In-memory session store, deliberately

**Decision.** Plans, traces and vetoes live in a module-level `Map` with a 3-hour TTL and a 500-session cap. No database.

**Why.** The deployment target is Cloudflare Workers, which has no persistent process memory and no filesystem. A durable store would add a paid dependency for a product whose sessions last one evening. The trade-off is explicit and surfaced to the user: a cold isolate loses the session, and the app tells the user to run the plan again rather than pretending otherwise.

**Evidence.** `lib/storage/session.ts`; `GET /api/plan` returns `session_not_found` with that explanation.

---

## Open items

- **Hosted deployment is not done.** `docs/DEPLOYMENT.md` lists the exact remaining steps and the runtime secrets required. A local-only project is not an eligible submission.
- **No user study.** The ablation compares algorithms on frozen inputs. It is not measured user satisfaction, and no claim of superiority is made beyond the recorded numbers.
- **Narration video not produced.** Voice selection and script authoring require the ElevenLabs account metadata and quota to be verified first.
- **Vinext compatibility is prepared but unexecuted.** `npx vinext check` has not been run against this codebase on this host.
