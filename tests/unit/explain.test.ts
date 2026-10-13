import { describe, expect, it } from "vitest";
import type { ScoredCandidate } from "@domain";
import { deterministicText, explainPlan, validateExplanationText } from "@/lib/cscs/explain";
import type { ScoredCandidate as Scored } from "@domain";

const score: ScoredCandidate = {
  candidateId: "e-1",
  name: "Absinthdepot Berlin",
  worstAffinity: 0.79,
  meanAffinity: 0.79,
  coverage: 1,
  utility: 0.79,
  diversityKey: "bar",
  provisional: true,
  excludedByVeto: [],
  evidences: [
    {
      participantId: "p-ada",
      evidenceType: "provider_affinity",
      affinity: 0.79,
      rankInQuery: 3,
      querySize: 25,
      note: "",
    },
    {
      participantId: "p-bo",
      evidenceType: "provider_affinity",
      affinity: 0.793,
      rankInQuery: 1,
      querySize: 25,
      note: "",
    },
    {
      participantId: "p-cy",
      evidenceType: "provider_affinity",
      affinity: 0.77,
      rankInQuery: 8,
      querySize: 25,
      note: "",
    },
  ],
  unknowns: [
    { field: "openingHours", reason: "third-party", needsVerification: "Confirm with the venue." },
    { field: "availability", reason: "unknown", needsVerification: "Ask about booking." },
  ],
  facts: [
    { field: "phone", value: "+4930000", source: "qloo", verified: false, observedAt: 1 },
  ],
  tags: ["Bar"],
  imageUrl: null,
  straightLineDistanceM: 2400,
  sourceUrl: null,
};

const profiles = [
  { participantId: "p-ada", label: "Ada", confirmedEntityIds: ["a"], vetoEntityIds: [], consentTimestamp: 0 },
  { participantId: "p-bo", label: "Bo", confirmedEntityIds: ["b"], vetoEntityIds: [], consentTimestamp: 0 },
  { participantId: "p-cy", label: "Cy", confirmedEntityIds: ["c"], vetoEntityIds: [], consentTimestamp: 0 },
];

const input = {
  showLocation: "Berlin",
  profiles,
  selected: score,
  alternatives: [] as ScoredCandidate[],
  warnings: [],
  vetoes: [],
  allowedCandidates: [score],
};

describe("explanation guardrails", () => {
  it("rejects a percentage claim", () => {
    expect(validateExplanationText("92% of the group will love it.", score, [score])).toMatch(/percentage/);
  });

  it("rejects a satisfaction or probability claim", () => {
    expect(
      validateExplanationText("Absinthdepot Berlin guarantees everyone will enjoy the night.", score, [score]),
    ).toMatch(/satisfaction or probability/);
    expect(
      validateExplanationText("Absinthdepot Berlin has a high probability of success.", score, [score]),
    ).toMatch(/satisfaction or probability/);
  });

  it("rejects straight-line distance being described as travel time", () => {
    expect(
      validateExplanationText("Absinthdepot Berlin is a short walking time away.", score, [score]),
    ).toMatch(/travel time/);
  });

  it("rejects an invented rating the provider never returned", () => {
    expect(
      validateExplanationText("Absinthdepot Berlin is rated 4.8 by visitors.", score, [score]),
    ).toMatch(/rating the provider did not return/);
  });

  it("rejects wording that does not name the selected venue", () => {
    expect(validateExplanationText("A nice place for the group to meet.", score, [score])).toMatch(
      /does not name the selected venue/,
    );
  });

  it("accepts grounded wording that cites the venue and stays within the facts", () => {
    const text =
      "Absinthdepot Berlin has the strongest worst-participant affinity of the shortlist. Qloo returned a phone number of +4930000; hours and availability still need confirming with the venue.";
    expect(validateExplanationText(text, score, [score])).toBeNull();
  });
});

describe("deterministic template", () => {
  it("states the worst-participant figure, the unknowns and no percentages", () => {
    const text = deterministicText(input);
    expect(text).toContain("Absinthdepot Berlin");
    expect(text).toContain("0.770");
    expect(text).toMatch(/straight-line/);
    expect(text).toMatch(/not a promise/);
    expect(text).not.toMatch(/\d+%/);
  });

  it("explains an empty shortlist instead of inventing a pick", () => {
    const text = deterministicText({ ...input, selected: null });
    expect(text).toMatch(/not proposing a pick/);
    expect(text).toMatch(/inventing evidence/);
  });
});

describe("provenance labelling", () => {
  it("falls back to the deterministic template and records the reason when the model path fails", async () => {
    const result = await explainPlan({
      ...input,
      cscsCaller: (async () => ({
        ok: false,
        value: null,
        status: "failed" as const,
        model: "swiss-ai/Apertus-v1.5-70B",
        latencyMs: 12,
        error: "CSCS request timed out.",
        rawText: null,
      })) as never,
    });
    expect(result.provenance).toBe("deterministic_template");
    expect(result.modelGenerated).toBe(false);
    expect(result.fallbackReason).toMatch(/timed out/);
    expect(result.text).toContain("Absinthdepot Berlin");
  });

  it("labels model wording as model-generated and filters unrecognised citations", async () => {
    const result = await explainPlan({
      ...input,
      cscsCaller: (async () => ({
        ok: true,
        value: {
          text: "Absinthdepot Berlin carries the strongest worst-participant affinity of this shortlist, and its hours still need confirming.",
          citedCandidateIds: ["e-1", "e-not-in-this-plan"],
        },
        status: "live" as const,
        model: "swiss-ai/Apertus-v1.5-70B",
        latencyMs: 900,
        error: null,
        rawText: null,
      })) as never,
    });
    expect(result.provenance).toBe("cscs_grounded");
    expect(result.modelGenerated).toBe(true);
    expect(result.citedCandidateIds).toEqual(["e-1"]);
    expect(result.fallbackReason).toBeNull();
  });

  it("rejects model wording that breaks the guardrails rather than shipping it", async () => {
    const result = await explainPlan({
      ...input,
      cscsCaller: (async () => ({
        ok: true,
        value: {
          text: "Absinthdepot Berlin is rated 4.9 and 95% of groups love it.",
          citedCandidateIds: ["e-1"],
        },
        status: "live" as const,
        model: "swiss-ai/Apertus-v1.5-70B",
        latencyMs: 900,
        error: null,
        rawText: null,
      })) as never,
    });
    expect(result.provenance).toBe("deterministic_template");
    expect(result.fallbackReason).toMatch(/rejected/);
  });
});
