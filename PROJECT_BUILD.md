# Encore Commons implementation plan

## Product and judging fit
Audience: friends going to a show who struggle to find a nearby gathering spot everyone enjoys. Buyer hypothesis: eventually venues or event organizers; initial product is consumer group planning. No customer validation or revenue is claimed.

Qloo makes cross-domain tastes useful: an artist and film profile can influence venue discovery beyond cuisine/location. Differentiation is group fairness and visible replanning, rather than another single-user recommendation list. This is a proposed distinction, not a claim of global novelty.

Technological Implementation: real entity resolution, per-participant Insights, comparable candidate scoring and traced replanning. Design: one complete group decision flow. Potential Impact: measure agreement and decision effort with consenting users. Quality of Idea: demonstrate a minority participant's veto changing the plan. Do not infer individual judges' scoring preferences from their biographies. The attachment provides no numerical weights.

## MVP scope
Two to four pseudonymous participants, each supplies two to five explicit cultural favorites and confirms search matches. User enters city and venue location; location is not inferred from a concert database. One gathering venue, one shortlist, one veto/replan loop. No autonomous bookings, routes, payments, calendar writes or Ticketmaster/Live Nation integration.

Use the official Sites Vinext/React TypeScript starter with server route handlers, Zod runtime schemas and Vitest/Playwright. Use Sites D1 for durable records only if required; temporary single-browser group state can stay local. Do not scaffold a standalone Fastify server or filesystem SQLite database for hosted runtime. Verify current official package documentation and supported runtime versions before choosing locked versions. Server-side Qloo adapter; no client key. Separate domain scoring from UI. No heavy framework needed for a bounded tool-using state machine.

```text
app/{onboarding,group,shortlist,trace}
app/api/{search,plan,veto,health}
lib/{agent,qloo,cscs,storage}
packages/domain/src/{schemas,ranking,constraints}
fixtures/{contract,scenarios}
tests/{unit,integration,e2e}
docs/{PROGRESS,API_CONTRACT,EVALUATION,DEPLOYMENT,DECISIONS}.md
scripts/{evaluate,smoke}
```

## Qloo contract verification
Official overview confirms Insights and supporting entity lookup APIs. Read current official OpenAPI and hackathon guide to establish the exact host, headers, parameters, entity types, ranking semantics, limits and metadata rights for the issued key. A general production example need not apply to the hackathon host.

Record docs URL, date, sanitized real request, response schema and status in docs/API_CONTRACT.md. Verify named entity search, place recommendations from cultural seeds, location restriction, scoring an identical candidate set for separate profiles, and explainability if available. Do not hardcode speculative API signatures or assume an unofficial SDK is official. Test unsupported parameters and missing metadata explicitly.

If comparable scores over a common candidate set are unsupported, use documented per-profile rank positions and treat absent candidates as unknown, not disliked. The fallback should require sufficient observed overlap; otherwise return insufficient evidence and ask for preferences. Never manufacture per-person fit scores by splitting a combined-profile score.

## Domain contracts and algorithm
Profile: participantId, confirmed entityIds, explicit vetoIds, optional preferences, consent timestamp. Candidate: Qloo entityId, returned name/category/location, source metadata and observed timestamp. Trace: step, sanitized input hash, provider status, response entityIds, latency, warnings. Plan: selected ID, alternatives, per-person rank/evidence, unknown facts and revision.

State machine: collect → resolve → confirm → query each profile → union candidates → evaluate common candidates → apply hard exclusions → rank → explain → review → replan. Each tool call is bounded and validated. Stop after two replan attempts per request; never loop indefinitely.

Normalize observed per-person rank as r=(n-rank)/(n-1) for n>1; these are relative within-query ranks, not probabilities or calibrated happiness. Report query size and unknown coverage. Candidate utility combines worst-person normalized rank first, mean rank second and diversity tie breaker last. Rejected/unknown candidates must remain visible with reasons. Rank conversion across different result sets is approximate; evaluate sensitivity and disclose this limitation. If official comparable score semantics are verified, use those consistently instead and document the choice.

Location and hard constraints use only verified returned fields or explicit user evidence. Budget, opening hours, step-free access and dietary requirements are unknown when unavailable. Never mark them satisfied based on missing metadata. A venue with critical unknowns remains a provisional suggestion requiring verification. Haversine straight-line distance may be computed from coordinates; label it accurately, never call it walking time.

Explain with provider facts and explicit user preferences. If Qloo explainability is available preserve its meaning; a model-generated story is an inference and must be labeled. CSCS Apertus 1.5 70B summarizes and asks clarification, never invent entities, replace ranking evidence, bypass exclusions or call arbitrary tools.

## API and UX
Implement entity search, profile confirmation, plan creation, veto/replan and plan retrieval. Validate inputs, cap text/participants and enforce request deadlines. Revision checks prevent stale veto writes. Cache only where provider terms permit; partition private profile results. Retry transient failures with bounded backoff; quota/auth failures are explicit. Idempotency key plus input hash prevents duplicate work.

UX: choose demo group or build own; add tastes; confirm ambiguous matches; view three venue cards; open per-person reasons and unknowns; veto; watch trace and revised shortlist. Use clear status, keyboard access and responsive layouts. Avoid invented testimonial, partnership or savings claims. No footer on any route or output. Put privacy/limitations near relevant controls and in body settings.

## Evaluation and proof
Freeze 12 test groups with divergent tastes, shared tastes, disjoint results, unresolved entities, vetoed candidates, missing location, API failure and sparse metadata. Unit-test ranking ties, unknown coverage, veto exclusion, invalid entity IDs, schema drift, prompt injection and secret redaction. E2E: real Qloo search → confirmed entities → candidates → veto → changed recommendation. Public smoke test from a fresh anonymous browser, phone layout and failed-provider path.

Ablation: same group, constraints and candidate opportunities, compare location/category-only baseline with Qloo-grounded workflow. Run a genuine CSCS Apertus 70B-only baseline when access is verified, using the same group inputs and constraints; never fabricate its outputs. Record overlap, per-person preference ratings, worst-person rating, agreement rate, task completion, latency and calls per session. With no human study report algorithm/fixture results only; rank utility is not measured user satisfaction. Freeze cases before tuning; keep raw outputs and failures. Show examples where Qloo is unhelpful as well as successful. No guaranteed superiority claims.

## Milestones and schedule
Estimated 40–55 focused hours. M0 (3–4h): API access/contract and repo scaffold. M1 (10–12h): real search, discovery and scoring with fallback semantics. M2 (10–12h): coherent UI and bounded replan flow. M3 (8–12h): meaningful tests, ablation and failure handling. M4 (9–15h): public hosting preparation, authorized deployment, fresh-user checks and submission.

Internal milestones: core by October 21; evaluation by October 25; public deployment by October 28; submission checked by October 30. Attachment deadline October 31 at 03:45 UTC / 09:15 IST. Current official event changes and terms still require verification. Cut event integrations, accounts and optional model experiments before cutting genuine Qloo use or public demo.

## Deployment and privacy
Public demo required: secure server proxy, TLS, deployment secrets, abuse/rate controls, clear quota-failure path, no private login required for judges. Select hosting with user authorization and confirm server runtime support. Never publish credentials. No new paid service or spend without approval. Include only necessary profile entities in Qloo requests, not names/emails. Short retention, deletion action, pseudonymous participant labels and explicit consent. Check provider retention and caching terms before persistence. Demo fixtures must not be passed off as live results.

## Commercial pathway and submission
Propose five consenting group-planning trials; ask participants whether the minority person's choice feels represented. Measure outcomes before claiming impact. Later organizer/venue referral model requires disclosure, no sponsored ranking in prototype. A small user test is not market validation.

Submission package: actual externally accessible app URL, public source with source/assets/run instructions, genuine Qloo-powered description and visible open-source LICENSE. Choose a license after dependency/asset review and make repository detection work. Attachment says video not required. $25,000 listed cash prizes: $15,000/$6,000/$4,000. Separate announced $25,000 investment offer is not another cash prize or guaranteed funding; terms are absent.

Checkpoint every 30 minutes and milestone: timestamp/timezone, branch/commit, files, tests/exit codes, API contract/version, access status, measured usage, blockers and one next action. Hindsight encore-commons required for setup; file state remains authoritative. Verify port 8888 integration. Update story and tags with actual work only.

## Selected hosting and model
Build for Sites with the supported Vinext starter. Use Qloo for cultural data and CSCS Apertus 1.5 70B for language reasoning. Follow docs/SITES_CSCS_SETUP.md; this is the deployment contract. Use bundled branding assets. No website has yet been deployed.

## Required media and session integrations
Read docs/MEDIA_WORKFLOWS.md and docs/SESSION_TOOLING.md. Use diagram-design for architecture HTML/SVG → PNG and render the real PNG in README. Use Videowright in videos/ with ElevenLabs youthful adult British English female narration, producing MP4 and captions. All CSCS/Qloo/ElevenLabs keys are user-reported in ~/.hermes/.env; map safely without dumping/copying. Use Hindsight bank encore-commons via configured port-8888 service, context-mode, ADHD skill, nori senior-swe, headroom and ponytail after reading/discovering actual interfaces. Missing tools stay pending and are surfaced; do not pretend activation. No footers anywhere.

## Confirmed Qloo hackathon server
Organizer-supplied server URL: https://hackathon.api.qloo.com . Use this origin for the issued hackathon key, not the generic production server. User reports the API key in ~/.hermes/.env; identify its actual variable name safely. Read https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide for authentication and endpoint paths. The supplied origin does not establish a /v2 base path for every operation: verify documented routes before composing URLs. Keep origin and route composition explicit to avoid duplicated version paths. Do not send this key to unverified hosts. Verify real entity search and Insights calls with sanitized results; key presence does not prove access. Hosted Sites needs a runtime secret because it cannot read the local env file.
