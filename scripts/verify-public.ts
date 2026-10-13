/**
 * Public deployment verification.
 *
 * Walks the same journey a judge takes in a fresh anonymous browser against an
 * externally reachable URL, and asserts the things the submission depends on:
 * the three routes render, the providers are genuinely live (not replay), a full
 * plan completes, a veto replans and is attributed, a stale veto is rejected, a
 * malformed request is refused, no route carries a footer, and no credential
 * value appears in any response body.
 *
 * No cookie jar is used and no login exists, so this runs signed out by
 * construction. Every message printed is sanitised: ids, counts, affinities and
 * statuses only. Credential values are read from the environment solely to scan
 * responses for them, and are never printed.
 *
 * Usage:
 *   PUBLIC_BASE_URL=https://your-public-url npx tsx scripts/verify-public.ts
 *   npx tsx scripts/verify-public.ts https://your-public-url
 */

const baseUrl = (process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

if (!baseUrl) {
  console.error("Provide the public base URL: npx tsx scripts/verify-public.ts <url>");
  process.exit(2);
}

/** Footer and attribution markers that must never appear on a rendered route. */
const FOOTER_MARKERS = [
  "<footer",
  "powered by",
  "all rights reserved",
  "generated with",
  "co-authored-by",
];

/**
 * The demo group the app's "Use the demo group (Berlin)" button loads, so this
 * exercises the same request the interface builds.
 */
const DEMO_GROUP = {
  showLocation: "Berlin",
  participants: [
    { participantId: "p-ada", label: "Ada", favorites: ["Radiohead", "In the Mood for Love"] },
    { participantId: "p-bo", label: "Bo", favorites: ["Nina Simone", "Seven Samurai"] },
    { participantId: "p-cy", label: "Cy", favorites: ["Daft Punk", "Blade Runner"] },
  ],
};

let failures = 0;
const capturedBodies: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { redirect: "follow", ...init });
}

async function body(response: Response): Promise<string> {
  const text = await response.text();
  capturedBodies.push(text);
  return text;
}

function json<T>(text: string): T {
  return JSON.parse(text) as T;
}

function post(payload: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

interface PlanScore {
  candidateId: string;
  name: string;
  worstAffinity: number | null;
  coverage: number;
  excludedByVeto: string[];
  facts: { key: string; verified: boolean }[];
  unknowns: { field: string }[];
  evidences: { participantId: string; affinity: number | null; note: string }[];
}

interface Plan {
  sessionId: string;
  revision: number;
  selectedCandidateId: string | null;
  candidates: { entityId: string }[];
  scores: PlanScore[];
  explanation: { text: string; provenance: string; modelGenerated: boolean };
  providerStatus: { qloo: string; cscs: string };
  limitations: string[];
  profiles: { participantId: string }[];
}

async function main(): Promise<void> {
  console.log("Encore Commons public deployment verification");
  console.log(`  Target: ${baseUrl}`);
  console.log(`  Signed out: no session cookie is sent on any request`);
  console.log("");

  // 1. The three routes a visitor lands on.
  for (const path of ["/", "/shortlist", "/trace"]) {
    const response = await raw(path);
    const text = await body(response);
    check(`GET ${path}`, response.status === 200, `HTTP ${response.status}, ${text.length} bytes`);

    const found = FOOTER_MARKERS.filter((marker) => text.toLowerCase().includes(marker));
    check(`GET ${path} has no footer`, found.length === 0, found.length === 0 ? "no footer marker" : `found: ${found.join(", ")}`);
  }

  // 2. Provider mode. A replay deployment is not a live Qloo deployment.
  const healthResponse = await raw("/api/health");
  const health = json<{ providers: { qloo: { mode: string; keyPresent: boolean; origin: string }; cscs: { model: string; keyPresent: boolean } } }>(
    await body(healthResponse),
  );
  check("GET /api/health", healthResponse.status === 200, `HTTP ${healthResponse.status}`);
  check("qloo mode is live", health.providers.qloo.mode === "live", `mode=${health.providers.qloo.mode}, origin=${health.providers.qloo.origin}`);
  check("cscs model is Apertus 1.5 70B", health.providers.cscs.model === "swiss-ai/Apertus-v1.5-70B", `model=${health.providers.cscs.model}`);

  // 3. The real two-step journey: resolve each favourite, then confirm it.
  const participants = [];
  for (const participant of DEMO_GROUP.participants) {
    const confirmedEntityIds: string[] = [];
    for (const favorite of participant.favorites) {
      const response = await raw("/api/search", post({ query: favorite, take: 3 }));
      const text = await body(response);
      const payload = json<{ results: { entityId: string; name: string }[]; mode: string }>(text);
      const first = payload.results[0];
      check(`search "${favorite}"`, response.status === 200 && Boolean(first), `${payload.results.length} hits, top="${first?.name ?? "-"}" id=${first?.entityId ?? "-"}`);
      if (first) confirmedEntityIds.push(first.entityId);
    }
    participants.push({
      participantId: participant.participantId,
      label: participant.label,
      favorites: participant.favorites,
      excludeHints: [],
      confirmedEntityIds,
      consentTimestamp: Date.now(),
    });
  }

  // 4. A full plan on the shared candidate set.
  const planStarted = Date.now();
  const planResponse = await raw(
    "/api/plan",
    post({ sessionId: "new", showLocation: { query: DEMO_GROUP.showLocation }, participants }),
  );
  const planPayload = json<{ sessionId: string; plan: Plan; trace: { step: string; status: string }[] }>(await body(planResponse));
  const plan = planPayload.plan;
  const planMs = Date.now() - planStarted;

  check("POST /api/plan", planResponse.status === 200 && Boolean(plan), `HTTP ${planResponse.status} in ${planMs} ms`);
  check("plan used live providers", plan?.providerStatus.qloo === "live" && plan?.providerStatus.cscs === "live", `qloo=${plan?.providerStatus.qloo}, cscs=${plan?.providerStatus.cscs}`);

  const ranked = plan.scores.filter((score) => score.coverage >= 1);
  const fullCoverage = plan.scores.every((score) => score.coverage >= 1);
  check("candidates discovered", plan.candidates.length > 0, `${plan.candidates.length} candidates`);
  check("every participant was scored", fullCoverage, `${ranked.length} of ${plan.scores.length} candidates at full coverage`);

  const top = plan.scores.find((score) => score.candidateId === plan.selectedCandidateId);
  check(
    "a venue was proposed",
    plan.selectedCandidateId !== null && Boolean(top),
    top ? `"${top.name}" worst-person affinity ${top.worstAffinity?.toFixed(6) ?? "-"} across ${plan.profiles.length} participants` : "no pick",
  );
  check(
    "provider facts are labelled unverified",
    (top?.facts ?? []).every((fact) => fact.verified === false),
    `${top?.facts.length ?? 0} provider facts, all verified:false`,
  );
  check("unknowns are disclosed", (top?.unknowns.length ?? 0) > 0, `${top?.unknowns.length ?? 0} named unknowns`);
  check(
    "explanation is grounded wording",
    plan.explanation.provenance === "cscs_grounded" && plan.explanation.modelGenerated,
    `provenance=${plan.explanation.provenance}, modelGenerated=${plan.explanation.modelGenerated}, ${plan.explanation.text.length} chars`,
  );

  // 5. A veto is a hard exclusion, and it must replan without re-querying Qloo.
  //    The veto targets the venue that was just proposed, which is the case that
  //    must move the plan: rejecting some other venue legitimately need not change
  //    the winner, so that weaker shape would assert nothing.
  const vetoTarget = plan.scores.find((score) => score.candidateId === plan.selectedCandidateId);
  if (!vetoTarget) {
    check("veto replan", false, "no proposed venue available to veto");
  } else {
    const vetoStarted = Date.now();
    const vetoResponse = await raw(
      "/api/veto",
      post({
        sessionId: planPayload.sessionId,
        participantId: DEMO_GROUP.participants[1]!.participantId,
        candidateId: vetoTarget.candidateId,
        expectedRevision: plan.revision,
        reason: "Not our kind of place",
      }),
    );
    const vetoPayload = json<{ plan: Plan; replanBudgetRemaining: number }>(await body(vetoResponse));
    const vetoMs = Date.now() - vetoStarted;
    const vetoed = vetoPayload.plan?.scores.find((score) => score.candidateId === vetoTarget.candidateId);
    const nextPick = vetoPayload.plan?.scores.find((score) => score.candidateId === vetoPayload.plan?.selectedCandidateId);
    check("POST /api/veto", vetoResponse.status === 200, `HTTP ${vetoResponse.status} in ${vetoMs} ms`);
    check("veto is attributed, not anonymous", (vetoed?.excludedByVeto ?? []).includes(DEMO_GROUP.participants[1]!.participantId), `excludedByVeto=[${(vetoed?.excludedByVeto ?? []).join(", ")}]`);
    check(
      "vetoed venue is not re-proposed",
      vetoPayload.plan?.selectedCandidateId !== plan.selectedCandidateId,
      `revision ${plan.revision} → ${vetoPayload.plan?.revision}, proposal moved "${vetoTarget.name}" → "${nextPick?.name ?? "-"}"`,
    );
    check("veto stayed inside the replan budget", vetoPayload.replanBudgetRemaining >= 0, `${vetoPayload.replanBudgetRemaining} replans remaining`);

    // 6. A veto aimed at a plan that already moved on must be refused.
    const staleResponse = await raw(
      "/api/veto",
      post({
        sessionId: planPayload.sessionId,
        participantId: DEMO_GROUP.participants[0]!.participantId,
        candidateId: vetoTarget.candidateId,
        expectedRevision: plan.revision,
      }),
    );
    await body(staleResponse);
    check("stale veto is refused", staleResponse.status === 409, `HTTP ${staleResponse.status} (expected 409)`);
  }

  // 7. A malformed anonymous request must be refused, not crash.
  const badResponse = await raw("/api/plan", post({ sessionId: "new", showLocation: { query: "Berlin" }, participants: "not-an-array" }));
  const badText = await body(badResponse);
  check("malformed request refused", badResponse.status === 400, `HTTP ${badResponse.status} (expected 400)`);
  check("malformed request leaks no stack trace", !/at \w+ \(.*:\d+:\d+\)/.test(badText), "no stack frame in the body");

  // 8. No credential value may appear in anything returned to a browser.
  const secrets = [process.env.QLOO_API_KEY, process.env.CSCS_INFERENCE_API_KEY].filter(
    (value): value is string => typeof value === "string" && value.length > 8,
  );
  const joined = capturedBodies.join("\n");
  const leaked = secrets.filter((secret) => joined.includes(secret));
  check(
    "no credential in any response",
    leaked.length === 0,
    secrets.length === 0 ? `scanned ${capturedBodies.length} bodies, but no key in this process env to scan for` : `scanned ${capturedBodies.length} bodies for ${secrets.length} key(s), 0 found`,
  );

  console.log("");
  console.log(failures === 0 ? `All checks passed against ${baseUrl}` : `${failures} check(s) failed against ${baseUrl}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("verification could not complete:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
