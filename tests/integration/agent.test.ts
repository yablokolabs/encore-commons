import { describe, expect, it } from "vitest";
import type { ParticipantInput, QlooInsightsEntity, SearchHit } from "@domain";
import { runPlan } from "@/lib/agent/state";
import type { AgentRunInput } from "@/lib/agent/types";
import { QlooError } from "@/lib/qloo/errors";

/** Which participant owns each favourite, so the fake provider can be honest. */
const OWNER: Record<string, string> = {
  Radiohead: "p-ada",
  Piranesi: "p-ada",
  "Nina Simone": "p-bo",
  "Seven Samurai": "p-bo",
  "Daft Punk": "p-cy",
  "Blade Runner": "p-cy",
};

const slug = (value: string): string => value.toLowerCase().replace(/\W+/g, "-");

function signalId(favorite: string): string {
  return `sig-${OWNER[favorite] ?? "unknown"}-${slug(favorite)}`;
}

function participantOfSignal(entityId: string): string {
  const parts = entityId.split("-");
  return `${parts[1] ?? "p"}-${parts[2] ?? "unknown"}`;
}

function hit(favorite: string): SearchHit {
  return {
    entityId: signalId(favorite),
    name: favorite,
    types: ["urn:entity:artist"],
    popularity: 0.9,
    shortDescription: null,
    disambiguation: null,
  };
}

function place(entityId: string, affinity: number | null): QlooInsightsEntity {
  return {
    entityId,
    name: `Venue ${entityId}`,
    subtype: "urn:entity:place",
    affinity,
    popularity: 0.9,
    lat: 52.51,
    lon: 13.4,
    city: "Berlin",
    countryCode: "DE",
    neighborhood: "Mitte",
    tags: ["Bar"],
    imageUrl: null,
    description: null,
    facts: [],
    observedAt: 1,
  };
}

const participants: ParticipantInput[] = [
  { participantId: "p-ada", label: "Ada", favorites: ["Radiohead", "Piranesi"], excludeHints: [], confirmedEntityIds: [], consentTimestamp: 0 },
  { participantId: "p-bo", label: "Bo", favorites: ["Nina Simone", "Seven Samurai"], excludeHints: [], confirmedEntityIds: [], consentTimestamp: 0 },
  { participantId: "p-cy", label: "Cy", favorites: ["Daft Punk", "Blade Runner"], excludeHints: [], confirmedEntityIds: [], consentTimestamp: 0 },
];

/**
 * Realistic divergence: Ada's and Bo's own favourites are terrible for the
 * other, while one venue is decent for everyone. Worst-participant ranking must
 * choose the balanced venue.
 */
const AFFINITY: Record<string, Record<string, number>> = {
  "p-ada": { "venue-balanced": 0.71, "venue-ada": 0.95, "venue-bo": 0.4 },
  "p-bo": { "venue-balanced": 0.7, "venue-ada": 0.42, "venue-bo": 0.96 },
  "p-cy": { "venue-balanced": 0.69, "venue-ada": 0.44, "venue-bo": 0.45 },
};

const POOL = ["venue-balanced", "venue-ada", "venue-bo"];

interface Deps {
  search: (args: { query: string }) => Promise<SearchHit[]>;
  query: (args: { profileEntityIds: string[]; resultsEntities?: string[] }) => Promise<QlooInsightsEntity[]>;
  searchCalls: string[];
  scoredCalls: number;
  discoveryCalls: number;
}

function makeDeps(options: { searchFails?: boolean; discoveryEmpty?: boolean } = {}): Deps {
  const searchCalls: string[] = [];
  const state = { scoredCalls: 0, discoveryCalls: 0 };
  const deps: Deps = {
    searchCalls,
    get scoredCalls() {
      return state.scoredCalls;
    },
    get discoveryCalls() {
      return state.discoveryCalls;
    },
    search: async (args) => {
      searchCalls.push(args.query);
      if (options.searchFails) throw new QlooError("unauthorized", "Qloo rejected the credential.");
      // Only known favourites resolve, so an unrecognised favourite behaves
      // like a real search miss instead of silently becoming a scored entity.
      return OWNER[args.query] ? [hit(args.query)] : [];
    },
    query: async (args) => {
      if (options.discoveryEmpty) return [];
      if (args.resultsEntities) {
        state.scoredCalls += 1;
        const participantId = participantOfSignal(args.profileEntityIds[0] ?? "");
        const table = AFFINITY[participantId] ?? {};
        return args.resultsEntities.map((id) => place(id, table[id] ?? null));
      }
      state.discoveryCalls += 1;
      return POOL.map((id) => place(id, null));
    },
  };
  return deps;
}

const baseInput: AgentRunInput = {
  sessionId: "session-1",
  showLocation: { query: "Berlin" },
  participants,
  vetoes: [],
  locationRadiusM: 3000,
  revision: 0,
  replansUsed: 0,
};

const run = async (deps: Deps, input = baseInput) =>
  runPlan(input, { search: deps.search as never, query: deps.query as never, now: () => 1 });

describe("agent happy path", () => {
  it("resolves, discovers, scores a shared candidate set, ranks worst-first and traces every call", async () => {
    const deps = makeDeps();
    const { plan, trace } = await run(deps);

    expect(plan.candidates).toHaveLength(3);
    // The balanced venue wins even though Ada's own favourite is far better for her.
    expect(plan.selectedCandidateId).toBe("venue-balanced");
    expect(plan.scores.find((s) => s.candidateId === "venue-ada")?.worstAffinity).toBeCloseTo(0.42, 6);
    expect(plan.scores.find((s) => s.candidateId === "venue-balanced")?.worstAffinity).toBeCloseTo(0.69, 6);
    expect(plan.scores.find((s) => s.candidateId === "venue-balanced")?.coverage).toBe(1);

    const tools = trace.map((step) => step.tool);
    expect(tools).toContain("search_entities");
    expect(tools).toContain("query_places");
    expect(tools).toContain("score_candidates");
    expect(tools).toContain("explain_plan");
    expect(trace.every((step) => step.inputHash.startsWith("fnv1a:"))).toBe(true);
    expect(trace.every((step) => !JSON.stringify(step).includes("X-Api-Key"))).toBe(true);
    // No CSCS credential in the test environment: wording must be templated.
    expect(plan.explanation.provenance).toBe("deterministic_template");
  });

  it("scores the same candidate pool for every participant", async () => {
    const deps = makeDeps();
    await run(deps);
    expect(deps.scoredCalls).toBe(3);
    expect(deps.discoveryCalls).toBe(3);
  });
});

describe("clarification instead of invention", () => {
  it("names the favourite that did not resolve instead of quietly dropping it", async () => {
    const deps = makeDeps();
    const failing = async (args: { query: string }) =>
      args.query === "Piranesi" ? [] : deps.search(args);
    const { plan } = await run({ ...deps, search: failing as never });
    expect(plan.needsClarification.join(" ")).toMatch(/"Piranesi" did not match any Qloo entity/);
    // Ada's other favourite still resolved, so she is still scored.
    expect(plan.candidates.length).toBeGreaterThan(0);
    expect(plan.selectedCandidateId).not.toBeNull();
  });

  it("flags an ambiguous match instead of silently choosing one", async () => {
    const deps = makeDeps();
    // No candidate name equals the typed text exactly, so the agent must ask.
    const ambiguous = async (args: { query: string }) =>
      args.query === "Radiohead"
        ? [
            { entityId: "a1", name: "Radiohead (Live in Berlin)", types: ["urn:entity:artist"], popularity: 1, shortDescription: null, disambiguation: null },
            { entityId: "a2", name: "Radiohead Tribute", types: ["urn:entity:artist"], popularity: 0.1, shortDescription: null, disambiguation: null },
          ]
        : deps.search(args);
    const { plan } = await run({ ...deps, search: ambiguous as never });
    expect(plan.needsClarification.join(" ")).toMatch(/matched several Qloo entities/i);
  });

  it("produces no candidates and names the failure when discovery returns nothing", async () => {
    const deps = makeDeps({ discoveryEmpty: true });
    const { plan } = await run(deps);
    expect(plan.candidates).toHaveLength(0);
    expect(plan.selectedCandidateId).toBeNull();
    expect(plan.needsClarification.join(" ")).toMatch(/no places near/i);
  });

  it("fails loudly on a credential problem instead of substituting data", async () => {
    const deps = makeDeps({ searchFails: true });
    const { plan } = await run(deps);
    expect(plan.candidates).toHaveLength(0);
    expect(plan.needsClarification.join(" ")).toMatch(/unauthorized/);
    expect(plan.providerStatus.qloo).not.toBe("live");
  });

  it("refuses to propose a venue when a participant cannot be scored at all", async () => {
    const deps = makeDeps();
    const thin: ParticipantInput[] = [
      participants[0]!,
      participants[1]!,
      { participantId: "p-cy", label: "Cy", favorites: ["Nonsense Query", "More Nonsense"], excludeHints: [], confirmedEntityIds: [], consentTimestamp: 0 },
    ];
    const { plan } = await run(deps, { ...baseInput, participants: thin });
    const cyRows = plan.scores.flatMap((s) => s.evidences).filter((e) => e.participantId === "p-cy");
    expect(cyRows.length).toBeGreaterThan(0);
    expect(cyRows.every((row) => row.evidenceType === "unknown")).toBe(true);
    expect(plan.limitations.join(" ")).toMatch(/unknown, not neutral/);
    // Cy has no preference evidence, so no shared choice is justified.
    expect(plan.selectedCandidateId).toBeNull();
    expect(plan.needsClarification.join(" ")).toMatch(/cannot be scored/i);
    // Every venue is retained with the coverage it had instead of being dropped.
    expect(plan.scores.every((s) => s.coverage < 1)).toBe(true);
  });
});

describe("veto and replan", () => {
  it("rebuilds the shortlist from cached discovery when a candidate is vetoed", async () => {
    const deps = makeDeps();
    const first = await run(deps);
    expect(first.plan.selectedCandidateId).toBe("venue-balanced");

    const replanned = await run(
      deps,
      {
        ...baseInput,
        revision: 1,
        replansUsed: 1,
        vetoes: [{ participantId: "p-cy", candidateId: "venue-balanced" }],
        reuse: first.cache,
      },
    );

    // A veto is a hard exclusion, so it must not remain the pick.
    expect(replanned.plan.selectedCandidateId).not.toBe("venue-balanced");
    const vetoedScore = replanned.plan.scores.find((s) => s.candidateId === "venue-balanced");
    // The veto is attributed to the participant who actually cast it.
    expect(vetoedScore?.excludedByVeto).toEqual(["p-cy"]);
    // Its evidence is still shown; it was removed, not scored down.
    expect(vetoedScore?.worstAffinity).not.toBeNull();
    // The replan reused paid-for provider work instead of re-querying Qloo.
    expect(deps.scoredCalls).toBe(3);
    expect(deps.discoveryCalls).toBe(3);
    expect(replanned.trace.some((step) => step.status === "skipped")).toBe(true);
  });
});

describe("bounds", () => {
  it("never exceeds the tool-call ceiling", async () => {
    const deps = makeDeps();
    const { trace } = await run(deps);
    expect(trace.length).toBeLessThanOrEqual(40);
  });

  it("records at most two replans even if asked for more", async () => {
    const deps = makeDeps();
    const { plan } = await run(deps, { ...baseInput, replansUsed: 99 });
    expect(plan.replansUsed).toBeLessThanOrEqual(2);
  });
});
