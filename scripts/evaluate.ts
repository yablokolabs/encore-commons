/**
 * Qloo ablation.
 *
 * Same group, same show location, same constraints and the same candidate
 * opportunities. Three strategies are compared:
 *
 *  A. qloo_grounded      the shipped pipeline: per-participant affinity over a
 *                        shared candidate set, ranked worst-participant-first.
 *  B. popularity_only    the same candidate pool ordered by provider popularity
 *                        with no taste grounding at all.
 *  C. cscs_only          Apertus 1.5 70B asked to pick venues for the group with
 *                        no Qloo access. Its answer is then checked against Qloo
 *                        entity search to see how much of it is groundable.
 *
 * Honesty rules for this script:
 *  - Every baseline pick is scored on the SAME recorded affinity matrix, so the
 *    comparison is apples to apples.
 *  - The CSCS-only answer is recorded verbatim and never edited. If Qloo cannot
 *    resolve a venue it named, that is reported as unresolved, not corrected.
 *  - No superiority claim is made beyond the measured numbers, and rank utility
 *    is not measured user satisfaction.
 *
 * Usage:
 *   npx tsx scripts/evaluate.ts                 # Qloo from recorded fixtures
 *   npx tsx scripts/evaluate.ts --live-qloo     # Qloo live instead
 *   npx tsx scripts/evaluate.ts --no-cscs       # skip baseline C entirely
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runPlan } from "../lib/agent/state";
import { queryPlaces, searchEntities } from "../lib/qloo/client";
import { cscsJson } from "../lib/cscs/client";
import { getProviderConfig } from "../lib/config";
import { z } from "zod";
import type { ParticipantInput, Plan } from "../packages/domain/src/schemas";
import { TASTE_ENTITY_TYPES } from "../packages/domain/src/schemas";

interface DemoGroup {
  name: string;
  showLocation: { query: string; label: string };
  locationRadiusM: number;
  participants: { participantId: string; label: string; favorites: string[] }[];
}

const root = resolve(import.meta.dirname ?? __dirname, "..");
const args = new Set(process.argv.slice(2));

const metricsOf = (plan: Plan, label: string, calls: { qloo: number; cscs: number }, latencyMs: number) => {
  const pick = plan.scores.find((s) => s.candidateId === plan.selectedCandidateId) ?? null;
  const ranked = plan.scores.filter((s) => s.worstAffinity !== null);
  const agreement = pick ? agreementRate(plan, pick.candidateId) : null;
  return {
    strategy: label,
    taskCompleted: plan.selectedCandidateId !== null,
    candidatesCompared: plan.candidates.length,
    rankedCandidates: ranked.length,
    topPick: pick ? plan.candidates.find((c) => c.entityId === pick.candidateId)?.name ?? pick.name : null,
    worstPersonAffinity: pick?.worstAffinity ?? null,
    meanAffinity: pick?.meanAffinity ?? null,
    participantCoverage: pick?.coverage ?? null,
    agreementRate: agreement,
    qlooCalls: calls.qloo,
    cscsCalls: calls.cscs,
    latencyMs,
  };
};

/**
 * Share of participants for whom the chosen venue is at least as good as their
 * own median across the compared pool. A transparent, reproducible proxy for
 * "nobody was left behind" — it is not user satisfaction.
 */
function agreementRate(plan: Plan, candidateId: string): number {
  let satisfied = 0;
  for (const profile of plan.profiles) {
    const own = plan.scores
      .map((s) => s.evidences.find((e) => e.participantId === profile.participantId)?.affinity ?? null)
      .filter((a): a is number => a !== null)
      .sort((a, b) => a - b);
    if (own.length === 0) continue;
    const median = own[Math.floor(own.length / 2)] ?? 0;
    const chosen =
      plan.scores
        .find((s) => s.candidateId === candidateId)
        ?.evidences.find((e) => e.participantId === profile.participantId)?.affinity ?? null;
    if (chosen !== null && chosen >= median) satisfied += 1;
  }
  return plan.profiles.length === 0 ? 0 : satisfied / plan.profiles.length;
}

async function main(): Promise<void> {
  const demo = JSON.parse(
    await readFile(resolve(root, "fixtures/demo-group.json"), "utf8"),
  ) as DemoGroup;
  const config = getProviderConfig();
  const liveQloo = args.has("--live-qloo") || (args.has("--live") && config.qloo.apiKey !== null);
  if (!liveQloo) process.env.ENCORE_REPLAY_FIXTURES = "1";

  const qlooMode = liveQloo ? "live" : "replay (recorded responses)";

  // Resolve the demo group once so both baselines share the same profiles.
  const resolved: ParticipantInput[] = [];
  for (const participant of demo.participants) {
    const ids: string[] = [];
    for (const favorite of participant.favorites) {
      try {
        const hits = await searchEntities({ query: favorite, types: [...TASTE_ENTITY_TYPES], take: 5 });
        if (hits[0]) ids.push(hits[0].entityId);
      } catch {
        /* unresolved favourites simply reduce this participant's signals */
      }
    }
    resolved.push({
      participantId: participant.participantId,
      label: participant.label,
      favorites: participant.favorites,
      excludeHints: [],
      confirmedEntityIds: ids,
      consentTimestamp: Date.now(),
    });
  }

  const qlooStart = Date.now();
  const { plan } = await runPlan({
    sessionId: "evaluation",
    showLocation: { query: demo.showLocation.query },
    participants: resolved,
    vetoes: [],
    locationRadiusM: demo.locationRadiusM,
    revision: 0,
    replansUsed: 0,
  });
  const qlooLatency = Date.now() - qlooStart;
  const qlooCalls = 1 + demo.participants.reduce((sum, p) => sum + p.favorites.length, 0) + demo.participants.length * 2;

  // ---- Baseline B: popularity only, no taste grounding -------------------
  const popularityRanked = [...plan.candidates].sort((a, b) => {
    // Deliberately ignores everyone's taste: provider popularity, then name.
    const byPopularity = (b.providerPopularity ?? -1) - (a.providerPopularity ?? -1);
    if (Math.abs(byPopularity) > 1e-12) return byPopularity;
    return a.name.localeCompare(b.name);
  });
  const popularityPick = popularityRanked[0];
  const popularityMetrics = {
    strategy: "popularity_only",
    taskCompleted: popularityPick !== undefined,
    candidatesCompared: plan.candidates.length,
    rankedCandidates: popularityRanked.length,
    topPick: popularityPick?.name ?? null,
    worstPersonAffinity:
      plan.scores.find((s) => s.candidateId === popularityPick?.entityId)?.worstAffinity ?? null,
    meanAffinity:
      plan.scores.find((s) => s.candidateId === popularityPick?.entityId)?.meanAffinity ?? null,
    participantCoverage:
      plan.scores.find((s) => s.candidateId === popularityPick?.entityId)?.coverage ?? null,
    agreementRate: popularityPick ? agreementRate(plan, popularityPick.entityId) : null,
    qlooCalls,
    cscsCalls: 0,
    latencyMs: qlooLatency,
  };

  // ---- Baseline C: CSCS Apertus 1.5 70B with no Qloo access --------------
  let cscsOnly: Record<string, unknown> | null = null;
  if (!args.has("--no-cscs") && config.cscs.apiKey !== null) {
    const schema = z.object({
      venues: z
        .array(z.object({ name: z.string(), why: z.string() }))
        .min(1)
        .max(5),
    });
    const cscsStart = Date.now();
    const result = await cscsJson(schema, {
      system: [
        "You are helping a group of friends choose one venue near their show.",
        "Name up to 5 specific real venues. Reply with JSON only.",
        "Return: {\"venues\":[{\"name\": string, \"why\": string}]}",
      ].join("\n"),
      user: JSON.stringify({
        showLocation: demo.showLocation.query,
        group: resolved.map((p) => ({ label: p.label, favourites: p.favorites })),
        need: "one venue for everyone after the show",
      }),
      maxTokens: 700,
    });

    const named = result.ok && result.value ? result.value.venues : [];
    const resolution: { name: string; resolved: boolean; entityId: string | null }[] = [];
    for (const venue of named) {
      let entityId: string | null = null;
      try {
        const hits = await searchEntities({ query: venue.name, types: ["urn:entity:place"], take: 3 });
        entityId = hits[0]?.entityId ?? null;
      } catch {
        entityId = null;
      }
      resolution.push({ name: venue.name, resolved: entityId !== null, entityId });
    }
    const resolvedCount = resolution.filter((r) => r.resolved).length;
    // For any venue Qloo can resolve, score it against the recorded matrix so
    // baseline C is compared on the same evidence as the others.
    // Score exactly the venues the unguided model named, for every participant,
    // so baseline C is judged on the same affinity evidence as the others.
    const groundable = resolution
      .filter((r) => r.entityId !== null)
      .map((r) => r.entityId as string);
    const affinitiesByVenue = new Map<string, (number | null)[]>();
    for (const entityId of groundable) affinitiesByVenue.set(entityId, []);
    if (groundable.length > 0) {
      for (const participant of resolved) {
        try {
          const scored = await queryPlaces({
            profileEntityIds: participant.confirmedEntityIds,
            locationQuery: demo.showLocation.query,
            radiusM: demo.locationRadiusM,
            resultsEntities: groundable,
            take: Math.min(groundable.length, 50),
          });
          for (const entity of scored) {
            affinitiesByVenue.get(entity.entityId)?.push(entity.affinity);
          }
        } catch {
          /* a failed scoring call leaves those rows unknown, never zeroed */
        }
      }
    }

    const venueScores = groundable.map((entityId) => {
      const values = (affinitiesByVenue.get(entityId) ?? []).filter(
        (a): a is number => a !== null && a !== undefined,
      );
      const name = resolution.find((r) => r.entityId === entityId)?.name ?? entityId;
      return {
        name,
        entityId,
        observedParticipants: values.length,
        coverage: resolved.length === 0 ? 0 : values.length / resolved.length,
        worstAffinity: values.length > 0 ? Math.min(...values) : null,
        meanAffinity:
          values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null,
      };
    });
    const rankable = venueScores.filter((v) => v.worstAffinity !== null);
    const bestOfCscs = rankable.sort((a, b) => (b.worstAffinity ?? 0) - (a.worstAffinity ?? 0))[0] ?? null;

    cscsOnly = {
      strategy: "cscs_only_no_qloo",
      taskCompleted: named.length > 0,
      modelAnswer: named,
      modelRawStatus: result.status,
      modelError: result.error,
      venuesNamed: named.length,
      venuesGroundableInQloo: resolvedCount,
      groundingRate: named.length === 0 ? 0 : resolvedCount / named.length,
      resolution,
      venueScores,
      bestByWorstPersonAffinity: bestOfCscs,
      worstPersonAffinityOfBestGroundable: bestOfCscs?.worstAffinity ?? null,
      qlooCallsForGroundingAndScoring: named.length + resolved.length * groundable.length,
      cscsCalls: 1,
      latencyMs: Date.now() - cscsStart,
      note:
        resolvedCount === named.length && named.length > 0
          ? "Every venue the unguided model named was groundable in Qloo, so it was scored on the same affinity evidence. Naming real venues is not the same as choosing them for this group's taste."
          : "Venues the unguided model named that Qloo could not resolve cannot be compared, ranked or sourced. Its answer is recorded verbatim and never corrected.",
    };
  }

  const qlooMetrics = metricsOf(plan, "qloo_grounded", { qloo: qlooCalls, cscs: plan.providerStatus.cscs === "live" ? 1 : 0 }, qlooLatency);
  const qlooPick = plan.scores.find((s) => s.candidateId === plan.selectedCandidateId);
  const overlapsPopularity =
    popularityMetrics.topPick !== null && qlooMetrics.topPick !== null &&
    popularityMetrics.topPick === qlooMetrics.topPick;

  const report = {
    generatedAt: new Date().toISOString(),
    qlooMode,
    cscsModel: config.cscs.model,
    group: {
      name: demo.name,
      showLocation: demo.showLocation.query,
      participants: resolved.map((p) => ({
        label: p.label,
        favourites: p.favorites,
        confirmedEntities: p.confirmedEntityIds.length,
      })),
    },
    frozenCaseCount: 1,
    strategies: [qlooMetrics, popularityMetrics, cscsOnly].filter(Boolean),
    comparisons: {
      topPickOverlapPopularityVsQloo: overlapsPopularity,
      qlooTopPickWorstMinusPopularityWorst:
        qlooPick && popularityMetrics.worstPersonAffinity !== null && qlooPick.worstAffinity !== null
          ? Number((qlooPick.worstAffinity - popularityMetrics.worstPersonAffinity).toFixed(6))
          : null,
    },
    limitations: [
      "This is an algorithm comparison on frozen inputs, not a user study. Rank utility is not measured user satisfaction.",
      "Affinity is a provider cultural-fit signal, not a probability of enjoyment.",
      "One group is evaluated here. Results are illustrative of the mechanism, not a general claim of superiority.",
      "When run without --live-qloo, Qloo responses come from fixtures recorded on " +
        (await recordedAt()) +
        " and should be read as replay, not live.",
    ],
  };

  const target = resolve(root, "fixtures/evaluation.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Qloo mode: ${qlooMode}`);
  console.log("");
  for (const strategy of report.strategies) {
    const row = strategy as Record<string, unknown>;
    console.log(`--- ${row["strategy"]}`);
    for (const [key, value] of Object.entries(row)) {
      if (key === "strategy" || key === "modelAnswer" || key === "resolution") continue;
      console.log(`    ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
    }
  }
  if (cscsOnly) {
    console.log("");
    console.log("CSCS-only venues, recorded verbatim:");
    for (const venue of (cscsOnly["modelAnswer"] as { name: string; why: string }[])) {
      console.log(`    - ${venue.name}`);
    }
  }
  console.log("");
  console.log(`top-pick overlap (popularity vs Qloo): ${overlapsPopularity}`);
  console.log("written fixtures/evaluation.json");
}

async function recordedAt(): Promise<string> {
  try {
    const raw = JSON.parse(
      await readFile(resolve(root, "fixtures/replay/insights.json"), "utf8"),
    ) as { recordedAt?: string };
    return raw.recordedAt ?? "unknown date";
  } catch {
    return "unknown date";
  }
}

main().catch((error) => {
  console.error("evaluation failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
