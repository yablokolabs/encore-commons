/**
 * Records genuine Qloo responses for the demo group into fixtures/replay/*.json
 * and sanitised contract samples into fixtures/contract/*.json.
 *
 * The key is read from the environment only (QLOO_API_KEY). It is never written
 * to a fixture, a log line or a sample file.
 *
 * Usage:
 *   QLOO_API_KEY=... npx tsx scripts/record-fixtures.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { searchEntities, queryPlaces, extractFacts } from "../lib/qloo/client";
import { getProviderConfig } from "../lib/config";
import type { QlooInsightsEntity } from "../packages/domain/src/evidence";
import { MAX_CANDIDATE_POOL, TASTE_ENTITY_TYPES } from "../packages/domain/src/schemas";

interface DemoGroup {
  name: string;
  showLocation: { query: string; label: string };
  locationRadiusM: number;
  participants: { participantId: string; label: string; favorites: string[] }[];
}

// Resolved from the module URL: `__dirname` is undefined in ESM, and Vinext only
// defines it in server code pointing at built output rather than the source tree.
const root = fileURLToPath(new URL("..", import.meta.url));
const now = () => Date.now();

async function main(): Promise<void> {
  const config = getProviderConfig();
  if (config.qloo.apiKey === null) {
    throw new Error("QLOO_API_KEY is not set; refusing to fabricate fixtures.");
  }
  const demo = JSON.parse(
    await readFile(resolve(root, "fixtures/demo-group.json"), "utf8"),
  ) as DemoGroup;

  // 1. Confirm each favourite resolves to a real entity.
  const confirmedByParticipant: Record<string, string[]> = {};
  const searchQueries: Record<string, unknown[]> = {};
  for (const participant of demo.participants) {
    const ids: string[] = [];
    for (const favourite of participant.favorites) {
      const hits = await searchEntities({
        query: favourite,
        types: [...TASTE_ENTITY_TYPES],
        take: 5,
      });
      searchQueries[favourite.toLowerCase()] = hits;
      const best = hits[0];
      if (best) ids.push(best.entityId);
      console.log(
        `search "${favourite}" -> ${hits.length} hit(s), best=${best ? best.name : "NONE"}`,
      );
    }
    confirmedByParticipant[participant.participantId] = ids;
  }

  // 2. Per-profile discovery near the show location.
  const discoveryByParticipant: Record<string, QlooInsightsEntity[]> = {};
  for (const participant of demo.participants) {
    const profileIds = confirmedByParticipant[participant.participantId] ?? [];
    discoveryByParticipant[participant.participantId] = await queryPlaces({
      profileEntityIds: profileIds,
      locationQuery: demo.showLocation.query,
      radiusM: demo.locationRadiusM,
      take: 25,
    });
    console.log(
      `discovery ${participant.label} -> ${discoveryByParticipant[participant.participantId]?.length ?? 0} places`,
    );
  }

  // 3. Shared candidate pool across every participant.
  const pool: string[] = [];
  for (const participant of demo.participants) {
    for (const entity of discoveryByParticipant[participant.participantId] ?? []) {
      if (!pool.includes(entity.entityId) && pool.length < MAX_CANDIDATE_POOL) {
        pool.push(entity.entityId);
      }
    }
  }

  const places: Record<string, unknown> = {};
  for (const participant of demo.participants) {
    for (const entity of discoveryByParticipant[participant.participantId] ?? []) {
      if (pool.includes(entity.entityId)) places[entity.entityId] = entity;
    }
  }

  // 4. Score the shared pool for every participant so replay mirrors a real plan.
  const profiles: Record<string, unknown> = {};
  for (const participant of demo.participants) {
    const profileIds = confirmedByParticipant[participant.participantId] ?? [];
    const scored = await queryPlaces({
      profileEntityIds: profileIds,
      locationQuery: demo.showLocation.query,
      radiusM: demo.locationRadiusM,
      resultsEntities: pool,
      take: Math.min(pool.length, 50),
    });
    const affinityByEntityId: Record<string, number> = {};
    for (const entity of scored) {
      if (entity.affinity !== null) affinityByEntityId[entity.entityId] = entity.affinity;
      if (!places[entity.entityId]) places[entity.entityId] = entity;
    }
    profiles[[...profileIds].sort().join("|")] = {
      city: demo.showLocation.query,
      profileEntityIds: profileIds,
      discoveryEntityIds: (discoveryByParticipant[participant.participantId] ?? []).map(
        (e) => e.entityId,
      ),
      affinityByEntityId,
    };
    console.log(
      `scored ${participant.label} -> ${Object.keys(affinityByEntityId).length}/${pool.length} candidates with affinity`,
    );
  }

  const recordedAt = new Date(now()).toISOString();
  await writeJson("fixtures/replay/search.json", {
    recordedAt,
    origin: config.qloo.origin,
    queries: searchQueries,
  });
  await writeJson("fixtures/replay/insights.json", {
    recordedAt,
    origin: config.qloo.origin,
    profiles,
    places,
  });

  // 5. Sanitised contract samples for docs/API_CONTRACT.md evidence.
  await writeJson("fixtures/contract/search-radiohead.json", {
    recordedAt,
    method: "GET",
    route: "/search",
    params: { query: "Radiohead", types: "urn:entity:artist", take: 2 },
    note: "Sanitised live response. X-Api-Key header omitted.",
    response: searchQueries["radiohead"]?.slice(0, 2) ?? [],
  });
  await writeJson("fixtures/contract/insights-place.json", {
    recordedAt,
    method: "GET",
    route: "/v2/insights",
    params: {
      "filter.type": "urn:entity:place",
      "signal.interests.entities": "<confirmed entity id>",
      "filter.location.query": demo.showLocation.query,
      take: 3,
    },
    note: "Sanitised live response. X-Api-Key header omitted.",
    response: (discoveryByParticipant["p-ada"] ?? []).slice(0, 3).map((entity) => ({
      name: entity.name,
      entityId: entity.entityId,
      affinity: entity.affinity,
      city: entity.city,
      factFields: entity.facts.map((f) => f.field),
    })),
  });

  console.log(`\nrecorded ${pool.length} candidate places across ${demo.participants.length} profiles`);
  void extractFacts;
}

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  const absolute = resolve(root, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`wrote ${relativePath}`);
}

main().catch((error) => {
  console.error("recording failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
