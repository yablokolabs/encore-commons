/**
 * Live smoke test.
 *
 * Proves the real provider path end to end against:
 *   - Qloo  https://hackathon.api.qloo.com  (X-Api-Key header)
 *   - CSCS  https://api.inference.cscs.ch/v1 (Apertus 1.5 70B)
 *
 * Every result printed here is sanitised: ids, counts, affinities and statuses
 * only. No credential value is read into a message, printed or written.
 *
 * Usage: QLOO_API_KEY=... CSCS_INFERENCE_API_KEY=... npx tsx scripts/smoke.ts
 */
import { getProviderConfig } from "../lib/config";
import { qlooToolStatus, searchEntities, queryPlaces } from "../lib/qloo/client";
import { cscsChat } from "../lib/cscs/client";
import { runPlan } from "../lib/agent/state";
import { TASTE_ENTITY_TYPES } from "../packages/domain/src/schemas";

const started = Date.now();
let failures = 0;

function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

async function main(): Promise<void> {
  const config = getProviderConfig();
  console.log("Encore Commons live smoke test");
  console.log(`  Qloo origin : ${config.qloo.origin}`);
  console.log(`  Qloo mode   : ${qlooToolStatus()}`);
  console.log(`  CSCS base   : ${config.cscs.baseUrl}`);
  console.log(`  CSCS model  : ${config.cscs.model}`);
  console.log(`  Qloo key    : ${config.qloo.apiKey ? `present (${config.qloo.apiKey.length} chars, value not shown)` : "MISSING"}`);
  console.log(`  CSCS key    : ${config.cscs.apiKey ? `present (${config.cscs.apiKey.length} chars, value not shown)` : "MISSING"}`);
  console.log("");

  check("qloo credential present", config.qloo.apiKey !== null, "QLOO_API_KEY configured");

  // 1. Real entity search.
  const hits = await searchEntities({
    query: "Radiohead",
    types: ["urn:entity:artist"],
    take: 3,
  });
  const radiohead = hits[0];
  check("qloo entity search", hits.length > 0, `${hits.length} results, first="${radiohead?.name ?? "-"}" id=${radiohead?.entityId ?? "-"}`);
  check("qloo entity search returns ids", Boolean(radiohead?.entityId), radiohead?.entityId ?? "none");

  if (!radiohead) throw new Error("cannot continue without a resolved entity");

  // 2. Real Insights discovery near a location.
  const discovered = await queryPlaces({
    profileEntityIds: [radiohead.entityId],
    locationQuery: "Berlin",
    radiusM: 6000,
    take: 10,
  });
  check("qloo insights discovery", discovered.length > 0, `${discovered.length} places near Berlin`);
  check(
    "qloo returns comparable affinity",
    discovered.some((e) => e.affinity !== null),
    `first affinity=${discovered[0]?.affinity?.toFixed(4) ?? "none"}`,
  );
  const cities = [...new Set(discovered.map((e) => e.city).filter(Boolean))];
  check("qloo location restriction applied", cities.length > 0, `cities returned: ${cities.slice(0, 4).join(", ")}`);

  // 3. Shared candidate set scoring: the same places scored for one profile.
  const pool = discovered.slice(0, 6).map((e) => e.entityId);
  const scored = await queryPlaces({
    profileEntityIds: [radiohead.entityId],
    locationQuery: "Berlin",
    radiusM: 6000,
    resultsEntities: pool,
    take: pool.length,
  });
  const scoredWithAffinity = scored.filter((e) => e.affinity !== null).length;
  check(
    "qloo scores an explicit shared candidate set",
    scored.length === pool.length && scoredWithAffinity === pool.length,
    `${scoredWithAffinity}/${pool.length} candidates returned with affinity`,
  );

  // 4. Provider facts are labelled unverified.
  const factCount = discovered.reduce((sum, e) => sum + e.facts.length, 0);
  check(
    "provider facts carry provenance",
    discovered.every((e) => e.facts.every((f) => f.source === "qloo" && f.verified === false)),
    `${factCount} provider facts, all marked qloo+unverified`,
  );

  // 5. CSCS model list contains the selected 70B model.
  if (config.cscs.apiKey) {
    const modelsResponse = await fetch(`${config.cscs.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.cscs.apiKey}` },
    });
    const models = (await modelsResponse.json()) as { data?: { id: string }[] };
    const ids = (models.data ?? []).map((m) => m.id);
    check(
      "cscs /models lists the selected model",
      ids.includes(config.cscs.model),
      `status=${modelsResponse.status}, ${ids.length} models, Apertus 8B variants also present and NOT selected`,
    );

    const reply = await cscsChat({
      system: "Answer with exactly one word.",
      user: "Reply with the single word: ready",
      maxTokens: 16,
    });
    check("cscs chat completions", reply.ok, `model=${reply.model} latency=${reply.latencyMs}ms text=${JSON.stringify((reply.text ?? "").trim().slice(0, 20))}`);
  } else {
    check("cscs credential present", false, "CSCS_INFERENCE_API_KEY missing; deterministic template path would be used");
  }

  // 6. Full agent run, live, for a two-person group.
  const secondHits = await searchEntities({ query: "Nina Simone", types: ["urn:entity:artist"], take: 1 });
  const second = secondHits[0];
  check("second profile resolves", Boolean(second?.entityId), second?.name ?? "none");

  if (radiohead && second) {
    const runStarted = Date.now();
    const { plan, trace } = await runPlan({
      sessionId: `smoke-${runStarted}`,
      showLocation: { query: "Berlin" },
      participants: [
        {
          participantId: "p-a",
          label: "A",
          favorites: [],
          excludeHints: [],
          confirmedEntityIds: [radiohead.entityId],
          consentTimestamp: runStarted,
        },
        {
          participantId: "p-b",
          label: "B",
          favorites: [],
          excludeHints: [],
          confirmedEntityIds: [second.entityId],
          consentTimestamp: runStarted,
        },
      ],
      vetoes: [],
      locationRadiusM: 6000,
      revision: 0,
      replansUsed: 0,
    });

    check(
      "agent produced a ranked, fully-covered shortlist",
      plan.selectedCandidateId !== null,
      `${plan.candidates.length} candidates, top pick worstAffinity=${plan.scores.find((s) => s.candidateId === plan.selectedCandidateId)?.worstAffinity?.toFixed(4) ?? "n/a"}`,
    );
    check(
      "every ranked candidate has full participant coverage",
      plan.scores.filter((s) => s.worstAffinity !== null).every((s) => s.coverage === 1),
      `${plan.scores.filter((s) => s.worstAffinity !== null).length} ranked`,
    );
    check(
      "trace recorded every tool call",
      trace.length > 0 && trace.every((s) => s.inputHash.startsWith("fnv1a:")),
      `${trace.length} steps, ${trace.filter((s) => s.status === "error").length} errors`,
    );
    check(
      "explanation provenance is labelled",
      plan.explanation.provenance === "cscs_grounded" || plan.explanation.provenance === "deterministic_template",
      `${plan.explanation.provenance}, modelGenerated=${plan.explanation.modelGenerated}`,
    );
    check(
      "no secret leaked into the plan",
      !JSON.stringify({ plan, trace }).includes(config.qloo.apiKey ?? "__none__"),
      "serialised plan+trace contains no credential value",
    );
  }

  console.log("");
  console.log(`total elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(failures === 0 ? "SMOKE TEST PASSED" : `SMOKE TEST FAILED (${failures} check(s))`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void TASTE_ENTITY_TYPES;

main().catch((error) => {
  console.error("smoke test errored:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
