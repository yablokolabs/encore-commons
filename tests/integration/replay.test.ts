import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchEntities, qlooToolStatus } from "@/lib/qloo/client";
import { runPlan } from "@/lib/agent/state";
import { MAX_CANDIDATE_POOL, TASTE_ENTITY_TYPES, type ParticipantInput } from "@domain";
import { recordFixturesArePresent } from "../helpers/fixtures";

/**
 * End-to-end pipeline test over GENUINELY RECORDED Qloo responses.
 *
 * The fixtures in fixtures/replay were produced by scripts/record-fixtures.ts
 * against https://hackathon.api.qloo.com for the demo group. This test proves
 * the whole chain (resolve -> discover -> score a shared set -> rank -> explain
 * -> trace) works on real provider data without spending quota, and it asserts
 * that replay mode is labelled rather than passed off as live.
 */

const originalEnv = { ...process.env };

beforeAll(() => {
  delete process.env.QLOO_API_KEY;
  process.env.ENCORE_REPLAY_FIXTURES = "1";
  process.env.QLOO_MIN_GAP_MS = "0";
});

afterAll(() => {
  process.env = { ...originalEnv };
});

const DEMO: ParticipantInput[] = [
  { participantId: "p-ada", label: "Ada", favorites: ["Radiohead", "In the Mood for Love", "Piranesi"], excludeHints: [], confirmedEntityIds: [], consentTimestamp: 0 },
  { participantId: "p-bo", label: "Bo", favorites: ["Nina Simone", "Seven Samurai"], excludeHints: [], confirmedEntityIds: [], consentTimestamp: 0 },
  { participantId: "p-cy", label: "Cy", favorites: ["Daft Punk", "Blade Runner"], excludeHints: [], confirmedEntityIds: [], consentTimestamp: 0 },
];

describe("recorded fixtures", () => {
  it("are present and were recorded from the hackathon origin", () => {
    const meta = recordFixturesArePresent();
    expect(meta.placeCount).toBeGreaterThan(10);
    expect(meta.origin).toBe("https://hackathon.api.qloo.com");
  });
});

describe("replay mode is explicitly labelled", () => {
  it("reports replay rather than live when no key is present", () => {
    expect(qlooToolStatus()).toBe("replay");
  });

  it("refuses to serve a query that was never recorded instead of inventing one", async () => {
    const results = await searchEntities({
      query: "A Favourite That Was Never Recorded",
      types: [...TASTE_ENTITY_TYPES],
      take: 3,
    }).catch((error: unknown) => error);
    expect(results).toBeInstanceOf(Error);
    expect((results as Error).message).toMatch(/no recorded search/i);
  });
});

describe("full pipeline over recorded Qloo data", () => {
  it("produces a real shortlist with comparable per-participant affinity", async () => {
    // Resolve the demo group exactly as the app does.
    const resolved: ParticipantInput[] = [];
    for (const participant of DEMO) {
      const ids: string[] = [];
      for (const favorite of participant.favorites) {
        const hits = await searchEntities({
          query: favorite,
          types: [...TASTE_ENTITY_TYPES],
          take: 5,
        });
        const top = hits[0];
        if (top) ids.push(top.entityId);
      }
      resolved.push({ ...participant, confirmedEntityIds: ids });
    }

    expect(resolved.every((p) => p.confirmedEntityIds.length >= 2)).toBe(true);

    const { plan, trace } = await runPlan(
      {
        sessionId: "replay-session",
        showLocation: { query: "Berlin" },
        participants: resolved,
        vetoes: [],
        locationRadiusM: 6000,
        revision: 0,
        replansUsed: 0,
      },
      { now: () => 1 },
    );

    expect(plan.providerStatus.qloo).toBe("replay");
    expect(plan.limitations.slice(0, 1).join(" ")).toMatch(/recorded Qloo responses replayed offline/i);
    expect(plan.candidates.length).toBeGreaterThan(10);
    expect(plan.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATE_POOL);
    expect(plan.selectedCandidateId).not.toBeNull();

    const selected = plan.scores.find((s) => s.candidateId === plan.selectedCandidateId);
    // Every participant is scored on the same candidate set with real affinity.
    expect(selected?.coverage).toBe(1);
    expect(selected?.evidences.every((e) => e.affinity !== null)).toBe(true);
    // Ranking really is worst-participant-first on the recorded numbers.
    for (const other of plan.scores) {
      if (other.candidateId === plan.selectedCandidateId) continue;
      if (other.worstAffinity === null) continue;
      expect(selected?.worstAffinity ?? 0).toBeGreaterThanOrEqual(other.worstAffinity - 1e-9);
    }
    // Discovered venues carry provider facts and named unknowns.
    const selectedCandidate = plan.candidates.find((c) => c.entityId === plan.selectedCandidateId);
    expect(selectedCandidate?.location.city).toBeTruthy();
    expect(selected?.unknowns.map((u) => u.field)).toContain("availability");
    expect(trace.filter((step) => step.status === "ok").length).toBeGreaterThan(5);
  });

  it("replans after a veto using the same recorded candidate pool", async () => {
    const resolved: ParticipantInput[] = [];
    for (const participant of DEMO) {
      const ids: string[] = [];
      for (const favorite of participant.favorites) {
        const hits = await searchEntities({ query: favorite, types: [...TASTE_ENTITY_TYPES], take: 5 });
        if (hits[0]) ids.push(hits[0].entityId);
      }
      resolved.push({ ...participant, confirmedEntityIds: ids });
    }
    const first = await runPlan(
      {
        sessionId: "replay-session-2",
        showLocation: { query: "Berlin" },
        participants: resolved,
        vetoes: [],
        locationRadiusM: 6000,
        revision: 0,
        replansUsed: 0,
      },
      { now: () => 1 },
    );
    const originalPick = first.plan.selectedCandidateId;
    expect(originalPick).not.toBeNull();

    const second = await runPlan(
      {
        sessionId: "replay-session-2",
        showLocation: { query: "Berlin" },
        participants: resolved.map((p) => ({ ...p, favorites: [] })),
        vetoes: [{ participantId: "p-bo", candidateId: originalPick! }],
        locationRadiusM: 6000,
        revision: 1,
        replansUsed: 1,
        reuse: first.cache,
      },
      { now: () => 1 },
    );

    expect(second.plan.revision).toBe(1);
    expect(second.plan.selectedCandidateId).not.toBe(originalPick);
    const vetoed = second.plan.scores.find((s) => s.candidateId === originalPick);
    expect(vetoed?.excludedByVeto).toEqual(["p-bo"]);
    expect(vetoed?.worstAffinity).not.toBeNull();
  });
});
