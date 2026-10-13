import type {
  Candidate,
  FitEvidence,
  ParticipantInput,
  Plan,
  Profile,
  ScoredCandidate,
  SearchHit,
  TraceStep,
} from "@domain";
import {
  MAX_CANDIDATE_POOL,
  buildFitEvidences,
  capCandidatePool,
  normaliseCandidate,
  scoreCandidates,
  sanitiseUserText,
  TASTE_ENTITY_TYPES,
} from "@domain";
import type { QlooInsightsEntity } from "@domain";
import { QlooError } from "@/lib/qloo/errors";
import { qlooToolStatus, queryPlaces, searchEntities } from "@/lib/qloo/client";
import { explainPlan, type ExplainInput } from "@/lib/cscs/explain";
import { AGENT_LIMITS, type AgentRunInput, type AgentRunOutput, type PlanCache } from "./types";
import { TraceRecorder } from "./trace";

/**
 * The Encore Commons agent.
 *
 * Fixed, bounded sequence of allowlisted tool calls. Each step validates its
 * input and output; nothing is retried indefinitely; the whole run stops after
 * a hard tool-call ceiling. The state machine plans the tool calls, checks the
 * provider output, and replans (at most twice) rather than looping.
 *
 *   collect -> resolve -> confirm -> query -> union -> evaluate
 *           -> apply exclusions -> rank -> explain -> review
 */

export interface AgentDeps {
  search?: typeof searchEntities;
  query?: typeof queryPlaces;
  explain?: typeof explainPlan;
  now?: () => number;
}

interface ResolvedFavorite {
  query: string;
  hits: SearchHit[];
  chosen: SearchHit | null;
  ambiguous: boolean;
}

export async function runPlan(
  input: AgentRunInput,
  deps: AgentDeps = {},
): Promise<AgentRunOutput> {
  const now = deps.now ?? Date.now;
  const search = deps.search ?? searchEntities;
  const query = deps.query ?? queryPlaces;
  const explain = deps.explain ?? explainPlan;
  const trace = new TraceRecorder(now);
  const providerStatus = qlooToolStatus();

  const clarifications: string[] = [];
  let toolCalls = 0;
  const spend = (): void => {
    toolCalls += 1;
    if (toolCalls > AGENT_LIMITS.maxToolCallsPerRun) {
      throw new Error(
        `Agent tool-call ceiling (${AGENT_LIMITS.maxToolCallsPerRun}) reached; stopping instead of looping.`,
      );
    }
  };

  // ---------------------------------------------------------------- collect
  // Participant text is data. Bound and neutralise it before anything else.
  const sanitisedParticipants: ParticipantInput[] = input.participants.map((participant) => ({
    ...participant,
    label: sanitiseUserText(participant.label, 40).value || "Participant",
    favorites: participant.favorites.map((f) => sanitiseUserText(f, 80).value).filter(Boolean),
  }));

  const profiles: Profile[] = [];
  const candidateEntities: Record<string, QlooInsightsEntity> = {};
  const discoveredByParticipant: Record<string, string[]> = {};
  const affinityByParticipant: Record<string, Record<string, number>> = {};
  const rankByParticipant: Record<string, Record<string, number>> = {};
  const discoverySizeByParticipant: Record<string, number> = {};
  const confirmedNames: Record<string, string[]> = {};

  // ------------------------------------------------------------ reuse path
  if (input.reuse) {
    trace.recordSkip(
      "resolve",
      "search_entities",
      "reusing entity resolution already paid for in this session",
    );
    trace.recordSkip(
      "query",
      "query_places",
      "reusing discovery already paid for in this session",
    );
    for (const summary of input.reuse.profiles) {
      profiles.push({
        participantId: summary.participantId,
        label: summary.label,
        confirmedEntityIds: summary.confirmedEntityIds,
        vetoEntityIds: [],
        consentTimestamp: summary.consentTimestamp,
      });
      confirmedNames[summary.participantId] = summary.confirmedEntityNames;
    }
    Object.assign(candidateEntities, input.reuse.candidateEntities);
    Object.assign(discoveredByParticipant, input.reuse.discoveredByParticipant);
    Object.assign(affinityByParticipant, input.reuse.affinityByParticipant);
    for (const [participantId, ids] of Object.entries(discoveredByParticipant)) {
      discoverySizeByParticipant[participantId] = ids.length;
      rankByParticipant[participantId] = Object.fromEntries(ids.map((id, i) => [id, i + 1]));
    }
  } else {
    // -------------------------------------------------------------- resolve
    for (const participant of sanitisedParticipants) {
      const resolved: ResolvedFavorite[] = [];
      if (participant.confirmedEntityIds.length > 0) {
        const ids = participant.confirmedEntityIds.slice(0, 12);
        profiles.push({
          participantId: participant.participantId,
          label: participant.label,
          confirmedEntityIds: ids,
          vetoEntityIds: [],
          consentTimestamp: participant.consentTimestamp,
        });
        confirmedNames[participant.participantId] = ids.map(() => participant.label);
        trace.recordSkip(
          "confirm",
          "search_entities",
          `participant ${participant.participantId} supplied ${ids.length} already-confirmed entity ids`,
        );
        continue;
      }

      for (const favourite of participant.favorites.slice(0, 5)) {
        spend();
        let hits: SearchHit[] = [];
        try {
          hits = await trace.record(
            "resolve",
            "search_entities",
            `q:${favourite.toLowerCase()}`,
            () => search({ query: favourite, types: [...TASTE_ENTITY_TYPES], take: 6 }),
            (result) => ({
              entityIds: result.map((hit) => hit.entityId),
              resultCount: result.length,
            }),
          );
        } catch (error) {
          resolved.push({ query: favourite, hits: [], chosen: null, ambiguous: false });
          clarifications.push(
            `Could not resolve "${favourite}" with Qloo${error instanceof QlooError ? ` (${error.kind})` : ""}. Check the wording or try a more well-known title.`,
          );
          continue;
        }
        if (hits.length === 0) {
          clarifications.push(
            `"${favourite}" did not match any Qloo entity. Check the wording, or try the full official title.`,
          );
        }
        const top = hits[0] ?? null;
        const normalisedQuery = favourite.trim().toLowerCase();
        const exactMatches = hits.filter(
          (hit) => hit.name.trim().toLowerCase() === normalisedQuery,
        );
        const ambiguous = exactMatches.length === 0 && hits.length > 1;
        resolved.push({
          query: favourite,
          hits,
          chosen: exactMatches[0] ?? top,
          ambiguous,
        });
        if (ambiguous) {
          clarifications.push(
            `"${favourite}" matched several Qloo entities (${hits
              .slice(0, 3)
              .map((h) => h.name)
              .join(", ")}). Confirm which one is right.`,
          );
        }
      }

      const chosen = resolved
        .map((r) => r.chosen)
        .filter((hit): hit is SearchHit => hit !== null);
      // De-duplicate while preserving order.
      const ids: string[] = [];
      const names: string[] = [];
      for (const hit of chosen) {
        if (!ids.includes(hit.entityId)) {
          ids.push(hit.entityId);
          names.push(hit.name);
        }
      }
      if (ids.length === 0) {
        clarifications.push(
          `${participant.label} has no confirmed Qloo entity, so they cannot be scored. Add a favourite that Qloo resolves.`,
        );
      }
      profiles.push({
        participantId: participant.participantId,
        label: participant.label,
        confirmedEntityIds: ids,
        vetoEntityIds: [],
        consentTimestamp: participant.consentTimestamp,
      });
      confirmedNames[participant.participantId] = names;
    }

    // ---------------------------------------------------------------- query
    const scorable = profiles.filter((p) => p.confirmedEntityIds.length > 0);
    for (const profile of scorable) {
      spend();
      try {
        const discovered = await trace.record(
          "query",
          "query_places",
          `profile:${profile.participantId}|loc:${input.showLocation.query.toLowerCase()}|take:${AGENT_LIMITS.discoveryTake}`,
          () =>
            query({
              profileEntityIds: profile.confirmedEntityIds,
              locationQuery: input.showLocation.query,
              lat: input.showLocation.lat,
              lon: input.showLocation.lon,
              radiusM: input.locationRadiusM,
              take: AGENT_LIMITS.discoveryTake,
            }),
          (result) => ({ entityIds: result.map((e) => e.entityId), resultCount: result.length }),
        );
        discoveredByParticipant[profile.participantId] = discovered.map((e) => e.entityId);
        discoverySizeByParticipant[profile.participantId] = discovered.length;
        rankByParticipant[profile.participantId] = Object.fromEntries(
          discovered.map((entity, index) => [entity.entityId, index + 1]),
        );
        for (const entity of discovered) {
          if (!candidateEntities[entity.entityId]) candidateEntities[entity.entityId] = entity;
        }
        if (discovered.length === 0) {
          clarifications.push(
            `Qloo returned no places near "${input.showLocation.query}" for ${profile.label}. Try a nearby area or a larger place name.`,
          );
        }
      } catch (error) {
        trace.recordSkip(
          "query",
          "query_places",
          `discovery failed for ${profile.participantId}`,
        );
        clarifications.push(
          `Place discovery failed for ${profile.label}${error instanceof QlooError ? ` (${error.kind})` : ""}.`,
        );
      }
    }

    // ---------------------------------------------------------------- union
    const pool: string[] = [];
    for (const profile of scorable) {
      for (const entityId of discoveredByParticipant[profile.participantId] ?? []) {
        if (!pool.includes(entityId) && pool.length < MAX_CANDIDATE_POOL) pool.push(entityId);
      }
    }

    // ------------------------------------------------------------- evaluate
    if (pool.length > 0) {
      for (const profile of scorable) {
        spend();
        try {
          const scored = await trace.record(
            "evaluate",
            "score_candidates",
            `profile:${profile.participantId}|pool:${pool.length}|loc:${input.showLocation.query.toLowerCase()}`,
            () =>
              query({
                profileEntityIds: profile.confirmedEntityIds,
                locationQuery: input.showLocation.query,
                lat: input.showLocation.lat,
                lon: input.showLocation.lon,
                radiusM: input.locationRadiusM,
                resultsEntities: pool,
                take: Math.min(pool.length, 50),
              }),
            (result) => ({ entityIds: result.map((e) => e.entityId), resultCount: result.length }),
          );
          const affinity: Record<string, number> = {};
          for (const entity of scored) {
            if (entity.affinity !== null) affinity[entity.entityId] = entity.affinity;
            if (!candidateEntities[entity.entityId]) candidateEntities[entity.entityId] = entity;
          }
          affinityByParticipant[profile.participantId] = affinity;
        } catch (error) {
          trace.recordSkip(
            "evaluate",
            "score_candidates",
            `scoring failed for ${profile.participantId}`,
          );
          clarifications.push(
            `Comparable scoring failed for ${profile.label}${error instanceof QlooError ? ` (${error.kind})` : ""}; their preference stays unknown rather than guessed.`,
          );
        }
      }
    } else {
      trace.recordSkip("union", "query_places", "no candidate places were discovered");
    }
  }

  const poolIds = Object.keys(candidateEntities).filter((entityId) =>
    Object.values(discoveredByParticipant).some((ids) => ids.includes(entityId)),
  );
  const effectivePool = capCandidatePool(
    poolIds.length > 0 ? poolIds : Object.keys(candidateEntities),
  );

  // ------------------------------------------------------- evaluate evidence
  const affinityMaps = new Map(
    profiles.map((profile) => [
      profile.participantId,
      new Map(Object.entries(affinityByParticipant[profile.participantId] ?? {})),
    ]),
  );
  const rankMaps = new Map(
    profiles.map((profile) => [
      profile.participantId,
      new Map(Object.entries(rankByParticipant[profile.participantId] ?? {})),
    ]),
  );

  const evidences = new Map<string, FitEvidence[]>();
  for (const entityId of effectivePool) {
    const rows: FitEvidence[] = [];
    for (const profile of profiles) {
      rows.push(
        ...buildFitEvidences({
          participantId: profile.participantId,
          entityIds: [entityId],
          affinityById: affinityMaps.get(profile.participantId) ?? new Map(),
          rankById: rankMaps.get(profile.participantId) ?? new Map(),
          querySize: discoverySizeByParticipant[profile.participantId] ?? 0,
        }),
      );
    }
    evidences.set(entityId, rows);
  }

  const candidates: Candidate[] = effectivePool
    .map((entityId) => {
      const entity = candidateEntities[entityId];
      if (!entity) return null;
      return normaliseCandidate({
        entity,
        originLat: input.showLocation.lat ?? null,
        originLon: input.showLocation.lon ?? null,
        discoveredVia: profiles
          .filter((p) => (discoveredByParticipant[p.participantId] ?? []).includes(entityId))
          .map((p) => p.participantId),
        now: now(),
      });
    })
    .filter((candidate): candidate is Candidate => candidate !== null);

  // ---------------------------------------------- apply exclusions and rank
  const vetoMap = new Map<string, string[]>();
  for (const veto of input.vetoes) {
    const existing = vetoMap.get(veto.candidateId) ?? [];
    if (!existing.includes(veto.participantId)) existing.push(veto.participantId);
    vetoMap.set(veto.candidateId, existing);
  }
  const vetoed = new Set(vetoMap.keys());
  spend();
  const ranking = await trace.record(
    "rank",
    "apply_veto",
    `pool:${candidates.length}|vetoes:${vetoed.size}`,
    async () => scoreCandidates({ candidates, profiles, evidences, vetoes: vetoMap }),
    (result) => ({
      entityIds: result.ranked.slice(0, 5).map((s) => s.candidateId),
      resultCount: result.ranked.length,
      warnings: result.warnings,
    }),
  );
  if (vetoed.size > 0) {
    trace.recordSkip(
      "exclude",
      "apply_veto",
      `${vetoed.size} candidate(s) removed as hard exclusions before ranking`,
    );
  }

  const selected: ScoredCandidate | null = ranking.ranked[0] ?? null;
  const alternatives = ranking.ranked.slice(1, 4);

  // ------------------------------------------------------------- explain
  const explainInput: ExplainInput = {
    showLocation: input.showLocation.query,
    profiles,
    selected,
    alternatives,
    warnings: ranking.warnings,
    vetoes: input.vetoes.map((veto) => {
      const candidate = candidates.find((c) => c.entityId === veto.candidateId);
      const participantLabel =
        profiles.find((p) => p.participantId === veto.participantId)?.label ?? "A participant";
      return {
        participantId: veto.participantId,
        participantLabel,
        candidateName: candidate?.name ?? veto.candidateId,
      };
    }),
    allowedCandidates: [...ranking.ranked, ...ranking.excluded],
  };

  spend();
  const explanation = await trace.record(
    "explain",
    "explain_plan",
    `selected:${selected?.candidateId ?? "none"}|alternatives:${alternatives.length}`,
    () => explain(explainInput),
    (result) => ({
      entityIds: result.citedCandidateIds,
      resultCount: result.text.length,
      warnings: result.fallbackReason ? [result.fallbackReason] : [],
    }),
  );

  // -------------------------------------------------------------- review
  const limitations = buildLimitations({
    providerStatus,
    profiles,
    clarifications,
    ranking: ranking.warnings,
    explanationFallback: explanation.fallbackReason,
  });

  if (selected === null && candidates.length > 0 && clarifications.length === 0) {
    clarifications.push(
      "No candidate had comparable affinity evidence for every participant. Add a second well-known favourite for each person and run the plan again.",
    );
  }

  const plan: Plan = {
    planId: `plan-${input.sessionId}-r${input.revision}`,
    sessionId: input.sessionId,
    revision: input.revision,
    showLocation: input.showLocation.query,
    locationRadiusM: input.locationRadiusM,
    profiles: profiles.map((profile) => ({
      ...profile,
      vetoEntityIds: [
        ...new Set(
          input.vetoes
            .filter((veto) => veto.participantId === profile.participantId)
            .map((veto) => veto.candidateId),
        ),
      ],
    })),
    candidates,
    scores: ranking.scores,
    selectedCandidateId: selected?.candidateId ?? null,
    alternativeCandidateIds: alternatives.map((c) => c.candidateId),
    explanation,
    limitations,
    replansUsed: Math.min(input.replansUsed, AGENT_LIMITS.maxReplans),
    needsClarification: clarifications.slice(0, AGENT_LIMITS.maxClarifications),
    providerStatus: {
      qloo:
        providerStatus === "live" && clarifications.some((c) => c.includes("failed"))
          ? "partial"
          : providerStatus,
      cscs: explanation.provenance === "cscs_grounded" ? "live" : explanation.fallbackReason ? "failed" : "skipped",
    },
    producedAt: now(),
  };

  const cache: PlanCache = {
    profiles: profiles.map((profile) => ({
      participantId: profile.participantId,
      label: profile.label,
      confirmedEntityIds: profile.confirmedEntityIds,
      confirmedEntityNames: confirmedNames[profile.participantId] ?? [],
      consentTimestamp: profile.consentTimestamp,
    })),
    candidateEntities,
    discoveredByParticipant,
    affinityByParticipant,
    providerStatus,
  };

  return { plan, trace: trace.snapshot(), cache };
}

export function buildLimitations(args: {
  providerStatus: "live" | "replay" | "failed";
  profiles: Profile[];
  clarifications: string[];
  ranking: string[];
  explanationFallback: string | null;
}): string[] {
  const limitations: string[] = [
    "Qloo affinity measures cultural fit between a participant's confirmed favourites and a venue. It is not a probability that anyone will enjoy the night, and it is not calibrated to any individual.",
    "Distance shown is straight-line distance between coordinates. It is not a walking route or a travel time.",
    "Opening hours, price, step-free access, allergy handling and availability are third-party metadata or unknown. Confirm every one of them with the venue before you rely on it.",
    "Encore Commons does not book, reserve, pay for or guarantee anything at a venue.",
  ];
  if (args.providerStatus === "replay") {
    limitations.unshift(
      "This plan used recorded Qloo responses replayed offline, not a live Qloo call. It demonstrates the pipeline and is labelled as replay everywhere it appears.",
    );
  }
  if (args.providerStatus === "failed") {
    limitations.unshift(
      "Qloo was not reachable, so no venue discovery, affinity or ranking was produced. Nothing was substituted in its place.",
    );
  }
  if (args.explanationFallback !== null) {
    limitations.push(
      `Wording was assembled by the deterministic template because the language model step did not produce a usable answer (${args.explanationFallback}).`,
    );
  }
  if (args.profiles.some((p) => p.confirmedEntityIds.length === 0)) {
    limitations.push(
      "At least one participant has no confirmed entity, so they are not scored. Their preference is unknown, not neutral.",
    );
  }
  for (const warning of args.ranking) limitations.push(warning);
  return [...new Set(limitations)];
}

/** Re-exported for tests that need the trace contract without the machine. */
export type { TraceStep };
