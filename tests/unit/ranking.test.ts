import { describe, expect, it } from "vitest";
import {
  candidateUnknowns,
  coverage,
  diversityKey,
  meanObserved,
  scoreCandidates,
  worstObserved,
  type Candidate,
  type FitEvidence,
  type Profile,
} from "@domain";

const profile = (participantId: string, vetoes: string[] = []): Profile => ({
  participantId,
  label: participantId,
  confirmedEntityIds: ["e-1"],
  vetoEntityIds: vetoes,
  consentTimestamp: 0,
});

const candidate = (entityId: string, tags: string[] = []): Candidate => ({
  entityId,
  name: `Venue ${entityId}`,
  subtype: "urn:entity:place",
  location: { lat: null, lon: null, city: null, countryCode: null, neighborhood: null },
  straightLineDistanceM: null,
  providerPopularity: 0.9,
  tags,
  facts: [],
  imageUrl: null,
  providerDescription: null,
  observedAt: 1,
  discoveredVia: [],
  sourceUrl: null,
});

const evidence = (participantId: string, affinity: number | null): FitEvidence => ({
  participantId,
  evidenceType: affinity === null ? "unknown" : "provider_affinity",
  affinity,
  rankInQuery: null,
  querySize: 10,
  note: "",
});

function run(
  candidates: Candidate[],
  profiles: Profile[],
  byCandidate: Record<string, FitEvidence[]>,
  vetoed: string[] = [],
) {
  return scoreCandidates({
    candidates,
    profiles,
    evidences: new Map(Object.entries(byCandidate)),
    // Attribute each veto to the first profile, matching the declaring profile
    // in these fixtures.
    vetoes: new Map(vetoed.map((id) => [id, [profiles[0]?.participantId ?? "p1"]])),
  });
}

describe("worst-participant-first ranking", () => {
  it("prefers the option nobody dislikes over the option with a high average", () => {
    const profiles = [profile("p1"), profile("p2"), profile("p3")];
    const balanced = candidate("e-balanced");
    const divisive = candidate("e-divisive");
    const outcome = run(
      [divisive, balanced],
      profiles,
      {
        // Great average, but one participant is poorly served.
        "e-divisive": [
          evidence("p1", 0.9),
          evidence("p2", 0.9),
          evidence("p3", 0.2),
        ],
        "e-balanced": [
          evidence("p1", 0.7),
          evidence("p2", 0.68),
          evidence("p3", 0.66),
        ],
      },
    );
    expect(outcome.ranked[0]?.candidateId).toBe("e-balanced");
    expect(outcome.ranked[0]?.worstAffinity).toBe(0.66);
    expect(outcome.ranked[1]?.candidateId).toBe("e-divisive");
    expect(outcome.ranked[1]?.worstAffinity).toBe(0.2);
  });

  it("uses the group mean only after the worst participant is accounted for", () => {
    const profiles = [profile("p1"), profile("p2")];
    const outcome = run([candidate("a"), candidate("b")], profiles, {
      a: [evidence("p1", 0.5), evidence("p2", 0.5)],
      b: [evidence("p1", 0.5), evidence("p2", 0.51)],
    });
    expect(outcome.ranked[0]?.candidateId).toBe("b");
  });
});

describe("unknown is not dislike", () => {
  it("excludes a candidate with no evidence at all instead of scoring it zero", () => {
    const profiles = [profile("p1"), profile("p2")];
    const outcome = run([candidate("known"), candidate("unknown")], profiles, {
      known: [evidence("p1", 0.4), evidence("p2", 0.4)],
      unknown: [evidence("p1", null), evidence("p2", null)],
    });
    expect(outcome.ranked.map((s) => s.candidateId)).toEqual(["known"]);
    expect(outcome.excluded.map((s) => s.candidateId)).toEqual(["unknown"]);
    expect(outcome.excluded[0]?.worstAffinity).toBeNull();
    expect(outcome.warnings.join(" ")).toMatch(/kept visible/);
  });

  it("sets aside a candidate where one participant's preference is unknown", () => {
    const profiles = [profile("p1"), profile("p2")];
    const outcome = run([candidate("known"), candidate("partial")], profiles, {
      known: [evidence("p1", 0.4), evidence("p2", 0.4)],
      partial: [evidence("p1", 0.95), evidence("p2", null)],
    });
    // A venue one person is unknown on cannot be justified as a group choice,
    // even when the observed affinity is the highest of the set.
    expect(outcome.ranked.map((s) => s.candidateId)).toEqual(["known"]);
    const partial = outcome.excluded.find((s) => s.candidateId === "partial");
    expect(partial?.coverage).toBeCloseTo(0.5, 6);
    expect(outcome.warnings.join(" ")).toMatch(/cannot justify a shared choice/);
  });

  it("computes worst and mean over observed evidence only", () => {
    const rows = [evidence("p1", 0.4), evidence("p2", null), evidence("p3", 0.8)];
    expect(worstObserved(rows)).toBe(0.4);
    expect(meanObserved(rows)).toBeCloseTo(0.6, 6);
    expect(coverage(rows, 3)).toBeCloseTo(2 / 3, 6);
  });

  it("proposes nothing when no candidate reaches full coverage", () => {
    const profiles = [profile("p1"), profile("p2"), profile("p3"), profile("p4")];
    const outcome = run([candidate("partial")], profiles, {
      partial: [evidence("p1", 0.9), evidence("p2", null), evidence("p3", null), evidence("p4", null)],
    });
    expect(outcome.ranked).toHaveLength(0);
    expect(outcome.excluded).toHaveLength(1);
    expect(outcome.warnings.join(" ")).toMatch(/another round of preferences/);
  });
});

describe("vetoes are hard exclusions", () => {
  it("removes a vetoed candidate and attributes the veto, never ranking it", () => {
    const profiles = [profile("p1", ["e-good"]), profile("p2")];
    const outcome = run([candidate("e-good"), candidate("e-other")], profiles, {
      "e-good": [evidence("p1", 0.99), evidence("p2", 0.99)],
      "e-other": [evidence("p1", 0.3), evidence("p2", 0.3)],
    }, ["e-good"]);
    expect(outcome.ranked.map((s) => s.candidateId)).toEqual(["e-other"]);
    const vetoed = outcome.excluded.find((s) => s.candidateId === "e-good");
    expect(vetoed?.excludedByVeto).toEqual(["p1"]);
    expect(vetoed?.name).toBe("Venue e-good");
    expect(vetoed?.facts).toBeDefined();
  });

  it("returns no ranked pick when every candidate is vetoed", () => {
    const profiles = [profile("p1"), profile("p2")];
    const outcome = run([candidate("only")], profiles, {
      only: [evidence("p1", 0.9), evidence("p2", 0.9)],
    }, ["only"]);
    expect(outcome.ranked).toHaveLength(0);
    expect(outcome.warnings.join(" ")).toMatch(/another round of preferences/);
  });
});

describe("tie-breaking", () => {
  it("breaks an exact tie on venue diversity, then on name", () => {
    const profiles = [profile("p1"), profile("p2")];
    const outcome = scoreCandidates({
      candidates: [candidate("e-bar", ["Bar"]), candidate("e-museum", ["Museum"])],
      profiles,
      evidences: new Map([
        ["e-bar", [evidence("p1", 0.5), evidence("p2", 0.5)]],
        ["e-museum", [evidence("p1", 0.5), evidence("p2", 0.5)]],
      ]),
      vetoes: new Map(),
      diversityAlreadyPresent: new Set(["bar"]),
    });
    expect(outcome.ranked[0]?.candidateId).toBe("e-museum");
  });

  it("derives a diversity key from provider tags", () => {
    expect(diversityKey(candidate("x", ["  Jazz Bar "]))).toBe("jazz bar");
    expect(diversityKey(candidate("x", []))).toBeNull();
  });
});

describe("unknowns", () => {
  it("always marks availability as unverified and never treats missing metadata as satisfied", () => {
    const unknowns = candidateUnknowns(candidate("x"));
    const fields = unknowns.map((u) => u.field);
    expect(fields).toContain("availability");
    expect(fields).toContain("stepFreeAccess");
    expect(fields).toContain("dietaryAndAllergies");
    expect(unknowns.every((u) => u.needsVerification.length > 0)).toBe(true);
  });

  it("still asks for confirmation when provider hours are present", () => {
    const withHours: Candidate = {
      ...candidate("x"),
      facts: [
        { field: "hours", value: "monday: 18:00-23:00", source: "qloo", verified: false, observedAt: 1 },
      ],
    };
    const hours = candidateUnknowns(withHours).find((u) => u.field === "openingHours");
    expect(hours?.reason).toMatch(/may be out of date/);
  });
});
