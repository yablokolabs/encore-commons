import type { SearchHit } from "@domain";
import type { QlooInsightsEntity } from "@domain";
import { QlooError } from "./errors";
import searchFixture from "@/fixtures/replay/search.json";
import insightsFixture from "@/fixtures/replay/insights.json";
import type { PlaceQueryArgs } from "./client";

/**
 * Replay mode.
 *
 * This exists so unit tests and offline development can exercise the whole
 * pipeline without spending provider quota. It is NEVER a substitute for the
 * live app: replay is only reachable when no QLOO_API_KEY is present AND
 * ENCORE_REPLAY_FIXTURES=1 is explicitly set, and every surface that shows a
 * result in replay mode must label it.
 *
 * The fixtures are sanitised copies of genuine responses recorded from
 * https://hackathon.api.qloo.com, produced by scripts/record-fixtures.mjs.
 */

interface SearchFixture {
  recordedAt: string;
  origin: string;
  queries: Record<string, SearchHit[]>;
}

interface InsightsFixture {
  recordedAt: string;
  origin: string;
  profiles: Record<
    string,
    {
      city: string;
      profileEntityIds: string[];
      discoveryEntityIds: string[];
      affinityByEntityId: Record<string, number>;
    }
  >;
  places: Record<string, QlooInsightsEntity>;
}

const search = searchFixture as unknown as SearchFixture;
const insights = insightsFixture as unknown as InsightsFixture;

export const REPLAY_PROVENANCE = {
  source: "recorded Qloo response replayed offline",
  recordedAt: insights.recordedAt,
  origin: insights.origin,
} as const;

export function loadReplaySearch(query: string, types: string[]): SearchHit[] {
  const key = query.trim().toLowerCase();
  const hits = search.queries[key];
  if (!hits) {
    throw new QlooError(
      "bad_request",
      `Replay fixture has no recorded search for "${query}". Record it with scripts/record-fixtures.mjs.`,
    );
  }
  return hits.filter((hit) => types.some((type) => hit.types.includes(type)));
}

export function loadReplayInsights(args: PlaceQueryArgs): QlooInsightsEntity[] {
  const profileKey = [...args.profileEntityIds].sort().join("|");
  const profile = Object.entries(insights.profiles).find(
    ([, value]) => [...value.profileEntityIds].sort().join("|") === profileKey,
  )?.[1];

  if (args.resultsEntities && args.resultsEntities.length > 0) {
    return args.resultsEntities
      .map((entityId) => {
        const place = insights.places[entityId];
        if (!place) return null;
        const affinity = profile?.affinityByEntityId[entityId];
        return affinity === undefined ? { ...place, affinity: null } : { ...place, affinity };
      })
      .filter((entity): entity is QlooInsightsEntity => entity !== null);
  }

  if (!profile) {
    throw new QlooError(
      "bad_request",
      "Replay fixture has no recorded profile for these signals. Record it with scripts/record-fixtures.mjs.",
    );
  }
  return profile.discoveryEntityIds
    .map((entityId) => insights.places[entityId])
    .filter((place): place is QlooInsightsEntity => place !== undefined)
    .slice(0, args.take ?? 20);
}
