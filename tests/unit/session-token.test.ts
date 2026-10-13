import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QlooInsightsEntity } from "@domain";
import { isVetoSession, vetoSessionFromRecord, type VetoSession } from "@/lib/session/state";
import { issueSessionToken, readSessionToken } from "@/lib/session/token";
import type { SessionRecord } from "@/lib/storage/session";

/**
 * The session token replaced a dependency the deployed Worker could not honour.
 *
 * On Workers a veto can be served by a different isolate than the one that built
 * the plan, so the session has to travel with the client. These tests pin the
 * two properties that make that safe: a genuine token round-trips, and anything
 * the client could tamper with is refused.
 */

const SECRET = "test-secret-not-a-real-key";

const session: VetoSession = {
  sessionId: "s-1",
  showLocation: "Berlin",
  profiles: [
    { participantId: "p-ada", label: "Ada", confirmedEntityIds: ["e-1"], consentTimestamp: 0 },
    { participantId: "p-bo", label: "Bo", confirmedEntityIds: ["e-2"], consentTimestamp: 0 },
  ],
  locationRadiusM: 6000,
  revision: 0,
  replansUsed: 0,
  vetoes: [],
  candidates: [
    { entityId: "e-1", name: "Venue One" },
    { entityId: "e-2", name: "Venue Two" },
  ],
  cache: {
    profiles: [
      {
        participantId: "p-ada",
        label: "Ada",
        confirmedEntityIds: ["e-1"],
        confirmedEntityNames: ["Ada"],
        consentTimestamp: 0,
      },
    ],
    candidateEntities: {},
    discoveredByParticipant: { "p-ada": ["e-1"] },
    affinityByParticipant: { "p-ada": { "e-1": 0.7 } },
    providerStatus: "replay",
  },
  createdAt: 1,
};

const original = { ...process.env };

beforeEach(() => {
  process.env.ENCORE_SESSION_SECRET = SECRET;
});

afterEach(() => {
  process.env = { ...original };
});

describe("session token round trip", () => {
  it("returns the same session it was issued for", async () => {
    const token = await issueSessionToken(session, 1_000);
    expect(token).toBeTypeOf("string");
    const read = await readSessionToken(token ?? undefined, 2_000);
    expect(read).not.toBeNull();
    expect(read?.sessionId).toBe("s-1");
    expect(read?.showLocation).toBe("Berlin");
    expect(read?.candidates).toEqual(session.candidates);
    // The provider cache must survive, or a replan would re-query Qloo and the
    // documented zero-extra-calls property would quietly stop being true.
    expect(read?.cache.affinityByParticipant).toEqual(session.cache.affinityByParticipant);
  });

  it("issues nothing when no signing key is configured", async () => {
    delete process.env.ENCORE_SESSION_SECRET;
    expect(await issueSessionToken(session, 1_000)).toBeNull();
    // And a token cannot be read without the key either.
    const token = await issueSessionToken(session, 1_000);
    expect(token).toBeNull();
    expect(await readSessionToken("anything.signature", 2_000)).toBeNull();
  });
});

describe("a tampered token is refused", () => {
  it("rejects a modified payload", async () => {
    const token = (await issueSessionToken(session, 1_000)) as string;
    const [body, signature] = token.split(".") as [string, string];
    // Flip a character in the middle of the body: same shape, different bytes.
    const mid = Math.floor(body.length / 2);
    const flipped = (body[mid] === "A" ? "B" : "A") as string;
    const tampered = `${body.slice(0, mid)}${flipped}${body.slice(mid + 1)}.${signature}`;
    expect(await readSessionToken(tampered, 2_000)).toBeNull();
  });

  it("rejects a modified signature", async () => {
    const token = (await issueSessionToken(session, 1_000)) as string;
    const [body, signature] = token.split(".") as [string, string];
    const mid = Math.floor(signature.length / 2);
    const flipped = (signature[mid] === "A" ? "B" : "A") as string;
    expect(
      await readSessionToken(`${body}.${signature.slice(0, mid)}${flipped}${signature.slice(mid + 1)}`, 2_000),
    ).toBeNull();
  });

  it("rejects a token signed with a different key", async () => {
    const token = (await issueSessionToken(session, 1_000)) as string;
    process.env.ENCORE_SESSION_SECRET = "a-different-secret";
    expect(await readSessionToken(token, 2_000)).toBeNull();
  });

  it("rejects malformed and oversized input without throwing", async () => {
    for (const bad of ["", ".", "no-dot", "body.", ".sig", `${"A".repeat(200_000)}.sig`]) {
      expect(await readSessionToken(bad, 2_000)).toBeNull();
    }
  });
});

describe("an expired token is refused", () => {
  it("rejects once past its lifetime", async () => {
    const token = (await issueSessionToken(session, 1_000)) as string;
    // The TTL is three hours; just past it the token must be dead.
    const justAfter = 1_000 + 1000 * 60 * 60 * 3 + 1;
    expect(await readSessionToken(token, justAfter)).toBeNull();
    expect(await readSessionToken(token, 1_000 + 1000 * 60 * 60 * 3 - 1)).not.toBeNull();
  });
});

describe("the structural guard", () => {
  it("accepts a session and refuses a shape the route would crash on", () => {
    expect(isVetoSession(session)).toBe(true);
    expect(isVetoSession(null)).toBe(false);
    expect(isVetoSession("string")).toBe(false);
    expect(isVetoSession({ ...session, sessionId: 7 })).toBe(false);
    expect(isVetoSession({ ...session, profiles: "no" })).toBe(false);
    expect(isVetoSession({ ...session, showLocation: "" })).toBe(false);
    expect(isVetoSession({ ...session, cache: null })).toBe(false);
  });

  it("reduces a stored record without losing what a veto reads", () => {
    const record = {
      sessionId: "s-9",
      plan: {
        showLocation: "Berlin",
        locationRadiusM: 6000,
        revision: 2,
        replansUsed: 1,
        profiles: [{ participantId: "p-ada", label: "Ada", confirmedEntityIds: ["e-1"], consentTimestamp: 0 }],
        candidates: [{ entityId: "e-1", name: "Venue One" }],
      },
      vetoes: [],
      cache: session.cache,
      createdAt: 5,
      updatedAt: 6,
    } as unknown as SessionRecord;
    const reduced = vetoSessionFromRecord(record);
    expect(reduced.sessionId).toBe("s-9");
    expect(reduced.revision).toBe(2);
    expect(reduced.replansUsed).toBe(1);
    expect(reduced.candidates).toEqual([{ entityId: "e-1", name: "Venue One" }]);
    expect(reduced.profiles[0]?.confirmedEntityIds).toEqual(["e-1"]);
    expect(reduced.createdAt).toBe(5);
  });
});

describe("size", () => {
  it("keeps a realistic session under the veto body limit when compressed", async () => {
    // A found session is about 20 KB compressed; the route's cap is 96 KB. This
    // guards the assumption the design rests on: the token fits in a request.
    const big: VetoSession = {
      ...session,
      candidates: Array.from({ length: 100 }, (_, i) => ({ entityId: `e-${i}`, name: `Venue ${i}` })),
      cache: {
        ...session.cache,
        candidateEntities: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [
            `e-${i}`,
            {
              entityId: `e-${i}`,
              name: `Venue ${i}`,
              subtype: "urn:entity:place",
              affinity: 0.7,
              popularity: 0.8,
              lat: 52.5,
              lon: 13.4,
              city: "Berlin",
              countryCode: "DE",
              neighborhood: "Mitte",
              tags: ["Bar", "Live music"],
              imageUrl: null,
              description: null,
              facts: [],
              observedAt: 1,
            } satisfies QlooInsightsEntity,
          ]),
        ),
        affinityByParticipant: {
          "p-ada": Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`e-${i}`, 0.5 + i / 1000])),
        },
      },
    };
    const token = (await issueSessionToken(big, 1_000)) as string;
    expect(token.length).toBeLessThan(96 * 1024);
  });
});
