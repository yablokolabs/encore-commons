import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QlooRequestContext } from "@/lib/qloo/client";
import { QLOO_MAX_TAKE, PLACE_TYPE, searchEntities, queryPlaces } from "@/lib/qloo/client";
import { QlooError } from "@/lib/qloo/errors";

const originalEnv = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Captured {
  url: URL;
  headers: Record<string, string>;
}

function recorder(body: unknown, status = 200): { calls: Captured[]; fetchImpl: typeof fetch } {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      headers: normalizeHeaders(init?.headers),
    });
    return jsonResponse(body, status);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

const context = (fetchImpl: typeof fetch): QlooRequestContext => ({
  fetchImpl,
  sleep: async () => undefined,
  now: () => 1,
});

beforeEach(() => {
  process.env.QLOO_API_KEY = "test-key-not-a-real-credential";
  process.env.QLOO_API_ORIGIN = "https://hackathon.api.qloo.com";
  process.env.QLOO_MIN_GAP_MS = "0";
  process.env.QLOO_MAX_ATTEMPTS = "1";
  delete process.env.ENCORE_REPLAY_FIXTURES;
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("URL and header composition", () => {
  it("composes the origin with /search exactly once and sends the key as X-Api-Key", async () => {
    const { calls, fetchImpl } = recorder({ results: [] });
    await searchEntities({ query: "Radiohead", types: ["urn:entity:artist"], take: 3 }, context(fetchImpl));
    const call = calls[0]!;
    expect(call.url.origin).toBe("https://hackathon.api.qloo.com");
    expect(call.url.pathname).toBe("/search");
    expect(call.url.searchParams.get("query")).toBe("Radiohead");
    expect(call.headers["X-Api-Key"]).toBe("test-key-not-a-real-credential");
    // The credential must never ride along in the query string or as a bearer token.
    expect(call.url.searchParams.get("api_key")).toBeNull();
    expect(call.headers["Authorization"]).toBeUndefined();
  });

  it("never duplicates the /v2 prefix on the insights route and uses flat GET params", async () => {
    const { calls, fetchImpl } = recorder({ success: true, results: { entities: [] } });
    await queryPlaces({ profileEntityIds: ["ENTITY-1"], locationQuery: "Berlin" }, context(fetchImpl));
    const call = calls[0]!;
    expect(call.url.pathname).toBe("/v2/insights");
    expect(call.url.pathname).not.toContain("/v2/v2");
    expect(call.url.searchParams.get("filter.type")).toBe(PLACE_TYPE);
    expect(call.url.searchParams.get("signal.interests.entities")).toBe("ENTITY-1");
    expect(call.url.searchParams.get("filter.location.query")).toBe("Berlin");
  });

  it("caps take at the provider maximum of 50", async () => {
    const { calls, fetchImpl } = recorder({ success: true, results: { entities: [] } });
    await queryPlaces({ profileEntityIds: ["E"], take: 500 }, context(fetchImpl));
    expect(Number(calls[0]!.url.searchParams.get("take"))).toBe(QLOO_MAX_TAKE);
  });

  it("prefers an exact WKT point and radius when coordinates are supplied", async () => {
    const { calls, fetchImpl } = recorder({ success: true, results: { entities: [] } });
    await queryPlaces(
      { profileEntityIds: ["E"], lat: 52.52, lon: 13.405, radiusM: 3000 },
      context(fetchImpl),
    );
    const call = calls[0]!;
    expect(call.url.searchParams.get("filter.location")).toBe("POINT(13.405 52.52)");
    expect(call.url.searchParams.get("filter.location.radius")).toBe("3000");
    expect(call.url.searchParams.get("filter.location.query")).toBeNull();
  });

  it("passes an explicit shared candidate set through filter.results.entities", async () => {
    const { calls, fetchImpl } = recorder({ success: true, results: { entities: [] } });
    await queryPlaces(
      { profileEntityIds: ["E"], resultsEntities: ["A", "B"], excludeEntityIds: ["C"] },
      context(fetchImpl),
    );
    const call = calls[0]!;
    expect(call.url.searchParams.get("filter.results.entities")).toBe("A,B");
    expect(call.url.searchParams.get("filter.exclude.entities")).toBe("C");
  });
});

describe("failure classification", () => {
  it("treats a 200 body carrying a rate-limit message as a retryable quota error", async () => {
    const { fetchImpl } = recorder({ error_msg: "Rate limit exceeded" });
    const error = await searchEntities({ query: "x", types: ["urn:entity:artist"] }, context(fetchImpl)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(QlooError);
    expect((error as QlooError).kind).toBe("quota");
    expect((error as QlooError).remediation).toMatch(/quota/);
  });

  it("classifies 401 as unauthorized and does not retry it", async () => {
    const { calls, fetchImpl } = recorder({ errors: [{ message: "no key" }] }, 401);
    const error = await searchEntities({ query: "x", types: ["urn:entity:artist"] }, context(fetchImpl)).catch(
      (e: unknown) => e,
    );
    expect((error as QlooError).kind).toBe("unauthorized");
    expect((error as QlooError).retryable).toBe(false);
    expect(calls).toHaveLength(1);
    expect((error as QlooError).remediation).toMatch(/hackathon\.api\.qloo\.com/);
  });

  it("raises a malformed_response error when the payload drifts from the contract", async () => {
    const { fetchImpl } = recorder({ results: "not-an-array" });
    const error = await searchEntities({ query: "x", types: ["urn:entity:artist"] }, context(fetchImpl)).catch(
      (e: unknown) => e,
    );
    expect((error as QlooError).kind).toBe("malformed_response");
  });

  it("surfaces a provider error message for a rejected parameter instead of returning empty data", async () => {
    const { fetchImpl } = recorder(
      { errors: [{ message: "take must be an integer value between 1 and 50" }] },
      200,
    );
    const error = await queryPlaces({ profileEntityIds: ["E"] }, context(fetchImpl)).catch(
      (e: unknown) => e,
    );
    expect((error as QlooError).kind).toBe("bad_request");
    expect((error as QlooError).providerMessage).toMatch(/take must be an integer/);
  });

  it("refuses to make a call at all when no credential is configured", async () => {
    delete process.env.QLOO_API_KEY;
    const { calls, fetchImpl } = recorder({ results: [] });
    const error = await searchEntities({ query: "x", types: ["urn:entity:artist"] }, context(fetchImpl)).catch(
      (e: unknown) => e,
    );
    expect((error as QlooError).kind).toBe("missing_credential");
    expect(calls).toHaveLength(0);
    expect((error as QlooError).message).not.toContain("test-key");
  });

  it("requires at least one confirmed signal entity", async () => {
    const { fetchImpl } = recorder({ success: true, results: { entities: [] } });
    const error = await queryPlaces({ profileEntityIds: [] }, context(fetchImpl)).catch(
      (e: unknown) => e,
    );
    expect((error as QlooError).kind).toBe("bad_request");
  });
});

describe("response normalisation", () => {
  it("extracts affinity, location and labelled provider facts", async () => {
    const { fetchImpl } = recorder({
      success: true,
      results: {
        entities: [
          {
            name: "The Wall Museum",
            entity_id: "32EC682B-DD31-44CA-8E07-430AD643F0E4",
            subtype: "urn:entity:place",
            popularity: 0.99,
            location: { lat: 52.5, lon: 13.44 },
            tags: [{ name: "Museum" }, { name: "" }],
            query: { affinity: 0.8986405609541313 },
            properties: {
              phone: "+4930945129",
              geocode: { city: "Berlin", country_code: "DE", neighborhood: "Mitte" },
              hours: { monday: [{ opens: "T10:00:00", closes: "T19:00:00", closed: false }] },
              amenities_description: "Step-free access is available.",
              image: { url: "https://images.qloo.com/i/example.jpg" },
            },
          },
        ],
      },
    });
    const entities = await queryPlaces({ profileEntityIds: ["E"] }, context(fetchImpl));
    const entity = entities[0]!;
    expect(entity.affinity).toBeCloseTo(0.8986405609541313, 9);
    expect(entity.city).toBe("Berlin");
    expect(entity.tags).toEqual(["Museum"]);
    expect(entity.imageUrl).toMatch(/^https:\/\/images\.qloo\.com/);
    // Every provider fact is unverified metadata, whatever it says.
    expect(entity.facts.every((f) => f.verified === false)).toBe(true);
    expect(entity.facts.every((f) => f.source === "qloo")).toBe(true);
    const accessibility = entity.facts.find((f) => f.field === "accessibility");
    expect(accessibility?.verified).toBe(false);
  });

  it("returns unknown affinity rather than zero when the provider omits it", async () => {
    const { fetchImpl } = recorder({
      success: true,
      results: { entities: [{ name: "Somewhere", entity_id: "ID-1", properties: {} }] },
    });
    const entities = await queryPlaces({ profileEntityIds: ["E"] }, context(fetchImpl));
    expect(entities[0]?.affinity).toBeNull();
  });
});
