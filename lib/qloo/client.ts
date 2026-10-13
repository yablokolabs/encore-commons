import { z } from "zod";
import type { ProviderFact, SearchHit } from "@domain";
import type { QlooInsightsEntity } from "@domain";
import { getProviderConfig } from "@/lib/config";
import { QlooError, classifyStatus } from "./errors";
import { loadReplaySearch, loadReplayInsights } from "./replay";

/**
 * Qloo adapter.
 *
 * Every route and parameter here was verified live against the organiser
 * supplied origin https://hackathon.api.qloo.com on 2026-10-13 (see
 * docs/API_CONTRACT.md). Nothing is guessed from examples:
 *
 *  - Auth is the `X-Api-Key` header. Not a bearer token, not a query param.
 *  - `/search` resolves a name to entity ids. `types` + `take` are honoured.
 *  - `/v2/insights` is a GET. Parameters are flat query params, not a JSON body
 *    (POST returns 400). `take` is capped at 50 by the provider.
 *  - `filter.type` selects the result entity type.
 *  - `signal.interests.entities` takes raw entity ids (the `urn:entity:*:`
 *    prefix is rejected as an invalid id).
 *  - `filter.location.query=<city>` restricts place results to that city.
 *  - `filter.location=POINT(lon lat)` + `filter.location.radius=<metres>`
 *    restricts results around supplied coordinates.
 *  - `filter.results.entities=<id,id>` returns only the requested entities and
 *    still populates `query.affinity`, which is what makes a shared candidate
 *    set comparable across participants.
 *  - `filter.exclude.entities=<id>` removes an entity from the result set.
 *
 * The origin is stored without a version path so route composition is explicit
 * and `/v2` cannot be duplicated.
 */

export const QLOO_ROUTES = {
  search: "/search",
  insights: "/v2/insights",
  tags: "/v2/tags",
} as const;

/** Provider cap verified live: take must be an integer between 1 and 50. */
export const QLOO_MAX_TAKE = 50;

export const PLACE_TYPE = "urn:entity:place";

export type QlooToolStatus = "live" | "replay" | "failed";

export function qlooToolStatus(): QlooToolStatus {
  const { qloo } = getProviderConfig();
  if (qloo.apiKey !== null) return "live";
  if (qloo.replayRequested) return "replay";
  return "failed";
}

const searchResultSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        entity_id: z.string(),
        types: z.array(z.string()).default([]),
        popularity: z.number().nullable().optional(),
        disambiguation: z.string().nullable().optional(),
        properties: z
          .object({
            short_description: z.string().nullable().optional(),
            disambiguation: z.string().nullable().optional(),
          })
          .partial()
          .optional(),
      }),
    )
    .default([]),
});

const insightsEntitySchema = z.object({
  name: z.string(),
  entity_id: z.string(),
  subtype: z.string().nullable().optional(),
  popularity: z.number().nullable().optional(),
  location: z
    .object({ lat: z.number().nullable().optional(), lon: z.number().nullable().optional() })
    .nullable()
    .optional(),
  tags: z
    .array(z.object({ name: z.string() }).partial().passthrough())
    .nullable()
    .optional(),
  query: z.object({ affinity: z.number().nullable().optional() }).partial().nullable().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
});

const insightsResponseSchema = z.object({
  success: z.boolean().optional(),
  results: z.object({ entities: z.array(insightsEntitySchema).default([]) }).optional(),
  errors: z.array(z.object({ message: z.string().optional() }).passthrough()).optional(),
});

export interface QlooRequestContext {
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Deterministic backoff in tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface RawRequestInput {
  /** Route path including its version segment, e.g. QLOO_ROUTES.insights. */
  route: string;
  params: Record<string, string | number | undefined>;
  context?: QlooRequestContext;
}

/**
 * Performs one bounded Qloo GET with a deadline and bounded retry.
 * The credential is never included in any error message or log line.
 */
async function qlooGet(input: RawRequestInput): Promise<unknown> {
  const { qloo } = getProviderConfig();
  const context = input.context ?? {};
  const fetchImpl = context.fetchImpl ?? fetch;
  const sleep = context.sleep ?? defaultSleep;

  if (qloo.apiKey === null) {
    throw new QlooError("missing_credential", "QLOO_API_KEY is not configured.");
  }
  const apiKey: string = qloo.apiKey;

  const url = new URL(`${qloo.origin}${input.route}`);
  for (const [key, value] of Object.entries(input.params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return withQlooQueue(async () => {
  let lastError: QlooError | null = null;
  for (let attempt = 1; attempt <= qloo.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), qloo.timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        const providerMessage = await safeProviderMessage(response);
        const error = new QlooError(
          classifyStatus(response.status),
          `Qloo ${input.route} responded ${response.status}.`,
          { status: response.status, providerMessage },
        );
        if (error.retryable && attempt < qloo.maxAttempts) {
          lastError = error;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw error;
      }
      const json = (await response.json()) as unknown;
      if (looksRateLimited(json)) throw new ProviderRateLimitError();
      return json;
    } catch (error) {
      if (error instanceof QlooError) {
        if (error.retryable && attempt < qloo.maxAttempts) {
          lastError = error;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw error;
      }
      // The hackathon key is rate limited. The provider answers a tripped rate
      // limit with a 200 body carrying `error_msg` rather than a 429, so it has
      // to be detected explicitly and treated as a retryable quota error.
      if (error instanceof ProviderRateLimitError) {
        const limited = new QlooError("quota", "Qloo rate limit reached for this key.");
        if (attempt < qloo.maxAttempts) {
          lastError = limited;
          await sleep(rateLimitBackoffMs(attempt));
          continue;
        }
        throw limited;
      }
      const kind = controller.signal.aborted ? "timeout" : "network";
      const wrapped = new QlooError(kind, `Qloo ${input.route} request failed (${kind}).`);
      if (attempt < qloo.maxAttempts) {
        lastError = wrapped;
        await sleep(backoffMs(attempt));
        continue;
      }
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new QlooError("network", "Qloo request failed.");
  }, sleep);
}

/** The hackathon key reports a tripped rate limit in a 200 body. */
function looksRateLimited(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const message = (json as { error_msg?: unknown }).error_msg;
  return typeof message === "string" && /rate limit/i.test(message);
}

function backoffMs(attempt: number): number {
  return Math.min(4000, 250 * 2 ** (attempt - 1));
}

/** Rate limits need a longer, more patient backoff than a transient 5xx. */
function rateLimitBackoffMs(attempt: number): number {
  return Math.min(20_000, 1500 * 2 ** (attempt - 1));
}

export class ProviderRateLimitError extends Error {
  constructor() {
    super("Provider reported a rate limit.");
    this.name = "ProviderRateLimitError";
  }
}

/**
 * Serialises Qloo calls with a minimum gap.
 *
 * The issued hackathon key is rate limited (observed live on 2026-10-13), so all
 * provider traffic funnels through one queue that keeps a floor between calls.
 */
let qlooQueue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function minGapMs(): number {
  const raw = process.env.QLOO_MIN_GAP_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
}

function withQlooQueue<T>(task: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  const run = qlooQueue.then(async () => {
    const gap = Date.now() - lastCallAt;
    const wait = minGapMs() - gap;
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastCallAt = Date.now();
    }
  });
  // Keep the chain alive even when a task rejects.
  qlooQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run as Promise<T>;
}

async function safeProviderMessage(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, 400);
  } catch {
    return null;
  }
}

/** Resolves a free-text favourite to candidate entities. */
export async function searchEntities(
  args: { query: string; types: string[]; take?: number },
  context: QlooRequestContext = {},
): Promise<SearchHit[]> {
  const status = qlooToolStatus();
  if (status === "replay") return loadReplaySearch(args.query, args.types);

  const json = await qlooGet({
    route: QLOO_ROUTES.search,
    params: {
      query: args.query,
      types: args.types.join(","),
      take: Math.min(args.take ?? 6, 20),
    },
    context,
  });
  const parsed = searchResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new QlooError("malformed_response", "Qloo /search response did not match the contract.", {
      providerMessage: parsed.error.issues.map((i) => i.path.join(".")).join(", ").slice(0, 200),
    });
  }
  return parsed.data.results.map((result) => ({
    entityId: result.entity_id,
    name: result.name,
    types: result.types,
    popularity: result.popularity ?? null,
    shortDescription: result.properties?.short_description ?? null,
    disambiguation: result.disambiguation ?? result.properties?.disambiguation ?? null,
  }));
}

export interface PlaceQueryArgs {
  /** Confirmed taste entities for one profile, or the union for a group pool. */
  profileEntityIds: string[];
  /** Natural-language place restriction, e.g. the user's show location. */
  locationQuery?: string;
  lat?: number;
  lon?: number;
  radiusM?: number;
  take?: number;
  /** Restrict results to exactly this candidate set (used for shared scoring). */
  resultsEntities?: string[];
  excludeEntityIds?: string[];
}

/**
 * Runs one `/v2/insights` place query.
 *
 * Returns the same normalised shape whether it was used for discovery (no
 * `resultsEntities`) or for scoring an explicit shared candidate set.
 */
export async function queryPlaces(
  args: PlaceQueryArgs,
  context: QlooRequestContext = {},
): Promise<QlooInsightsEntity[]> {
  const now = context.now ?? Date.now;
  const status = qlooToolStatus();
  if (status === "replay") return loadReplayInsights(args);

  if (args.profileEntityIds.length === 0) {
    throw new QlooError(
      "bad_request",
      "Insights requires at least one confirmed entity as a signal.",
    );
  }

  const params: Record<string, string | number | undefined> = {
    "filter.type": PLACE_TYPE,
    "signal.interests.entities": args.profileEntityIds.join(","),
    take: Math.min(args.take ?? 20, QLOO_MAX_TAKE),
  };

  // Prefer an exact point + radius when coordinates are known, otherwise the
  // documented natural-language city restriction that was verified live.
  if (typeof args.lat === "number" && typeof args.lon === "number") {
    params["filter.location"] = `POINT(${args.lon} ${args.lat})`;
    if (typeof args.radiusM === "number" && args.radiusM > 0) {
      params["filter.location.radius"] = Math.round(args.radiusM);
    }
  } else if (args.locationQuery) {
    params["filter.location.query"] = args.locationQuery;
  }

  if (args.resultsEntities && args.resultsEntities.length > 0) {
    params["filter.results.entities"] = args.resultsEntities.join(",");
  }
  if (args.excludeEntityIds && args.excludeEntityIds.length > 0) {
    params["filter.exclude.entities"] = args.excludeEntityIds.join(",");
  }

  const json = await qlooGet({ route: QLOO_ROUTES.insights, params, context });
  const parsed = insightsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new QlooError(
      "malformed_response",
      "Qloo /v2/insights response did not match the contract.",
      { providerMessage: parsed.error.issues.map((i) => i.path.join(".")).join(", ").slice(0, 200) },
    );
  }
  if (parsed.data.errors && parsed.data.errors.length > 0 && !parsed.data.results) {
    const message = parsed.data.errors[0]?.message ?? "unspecified provider error";
    throw new QlooError("bad_request", `Qloo rejected the insights request: ${message}`, {
      providerMessage: message,
    });
  }

  const observedAt = now();
  return (parsed.data.results?.entities ?? []).map((entity) => {
    const properties = (entity.properties ?? {}) as Record<string, unknown>;
    const geocode = (properties["geocode"] ?? {}) as Record<string, unknown>;
    return {
      entityId: entity.entity_id,
      name: entity.name,
      subtype: entity.subtype ?? null,
      affinity: entity.query?.affinity ?? null,
      popularity: entity.popularity ?? null,
      lat: entity.location?.lat ?? null,
      lon: entity.location?.lon ?? null,
      city: asString(geocode["city"]) ?? asString(properties["locality"]),
      countryCode: asString(geocode["country_code"]),
      neighborhood: asString(geocode["neighborhood"]) ?? asString(properties["neighborhood"]),
      tags: (entity.tags ?? [])
        .map((tag) => (typeof tag["name"] === "string" ? tag["name"].trim() : null))
        .filter((tag): tag is string => tag !== null && tag.length > 0),
      imageUrl: extractImageUrl(properties),
      description:
        asString(properties["short_description"]) ??
        asString(properties["overall_description"]) ??
        asString(properties["description"]),
      facts: extractFacts(properties, observedAt, entity.name),
      observedAt,
    } satisfies QlooInsightsEntity;
  });
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function extractImageUrl(properties: Record<string, unknown>): string | null {
  const image = properties["image"];
  if (image && typeof image === "object" && "url" in image) {
    const url = (image as { url?: unknown }).url;
    if (typeof url === "string" && url.startsWith("https://")) return url;
  }
  const images = properties["images"];
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0] as { url?: unknown } | undefined;
    if (first && typeof first.url === "string" && first.url.startsWith("https://")) return first.url;
  }
  return null;
}

/**
 * Extracts provider-reported facts. Every fact is stored with `verified: false`
 * and `source: "qloo"`: third-party metadata is not confirmation of hours,
 * price, safety, allergy handling or accessibility at the time of the visit.
 */
export function extractFacts(
  properties: Record<string, unknown>,
  observedAt: number,
  venueName: string,
): ProviderFact[] {
  const facts: ProviderFact[] = [];
  const push = (field: string, value: string | null): void => {
    if (value === null || value.trim().length === 0) return;
    facts.push({ field, value: value.trim(), source: "qloo", verified: false, observedAt });
  };

  push("hours", summariseHours(properties["hours"]));
  push("phone", asString(properties["phone"]));
  push("website", asString(properties["website"]));
  push("priceLevel", asString(properties["price_level"]));
  push("priceRange", summarisePriceRange(properties["price_range"]));
  push("businessRating", asString(properties["business_rating"]));
  push("cuisine", asString(properties["cuisine_description"]));
  push(
    "goodFor",
    Array.isArray(properties["good_for"]) ? (properties["good_for"] as unknown[]).join(", ") : null,
  );
  push("liveMusic", asString(properties["live_music"]));
  push("closedFlag", asString(properties["is_closed"]));
  push("specialtyDishes", asString(properties["specialty_dishes"]));
  push("locality", asString(properties["localities"]) ?? asString(properties["locality"]));
  push("address", asString(properties["address"]));

  const descriptionCorpus = [
    asString(properties["amenities_description"]),
    asString(properties["physical_setting_description"]),
    asString(properties["service_description"]),
    asString(properties["overall_description"]),
    asString(properties["short_description"]),
  ]
    .filter((value): value is string => value !== null)
    .join(" ");

  if (/wheelchair|step[- ]free|accessible|accessibility/i.test(descriptionCorpus)) {
    push(
      "accessibility",
      `Provider description mentions accessibility for ${venueName}: ${firstSentence(descriptionCorpus)}`,
    );
  }
  if (/vegetarian|vegan|gluten[- ]free|allerg|dietary/i.test(descriptionCorpus)) {
    push(
      "dietary",
      `Provider description mentions dietary information for ${venueName}: ${firstSentence(descriptionCorpus)}`,
    );
  }
  return facts;
}

function firstSentence(text: string): string {
  const match = text.match(/[^.!?]+[.!?]/);
  return (match?.[0] ?? text).trim().slice(0, 220);
}

function summariseHours(hours: unknown): string | null {
  if (!hours || typeof hours !== "object") return null;
  const entries = Object.entries(hours as Record<string, unknown>);
  if (entries.length === 0) return null;
  const parts: string[] = [];
  for (const [day, value] of entries.slice(0, 7)) {
    if (Array.isArray(value) && value.length > 0) {
      const window = value[0] as { opens?: unknown; closes?: unknown; closed?: unknown };
      if (window.closed === true) {
        parts.push(`${day}: closed`);
      } else if (typeof window.opens === "string" && typeof window.closes === "string") {
        parts.push(`${day}: ${stripT(window.opens)}-${stripT(window.closes)}`);
      }
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

function stripT(value: string): string {
  return value.replace(/^T/, "");
}

function summarisePriceRange(range: unknown): string | null {
  if (!range || typeof range !== "object") return null;
  const record = range as Record<string, unknown>;
  const from = asString(record["from"]);
  const to = asString(record["to"]);
  if (from && to) return `${from}-${to}`;
  return from ?? to;
}
