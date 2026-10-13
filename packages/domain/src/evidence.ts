import type { Candidate, FitEvidence, ProviderFact } from "./schemas";
import { haversineMetres } from "./geo";

/** Sanitised shape of one Qloo `/v2/insights` entity, after validation. */
export interface QlooInsightsEntity {
  entityId: string;
  name: string;
  subtype: string | null;
  affinity: number | null;
  popularity: number | null;
  lat: number | null;
  lon: number | null;
  city: string | null;
  countryCode: string | null;
  neighborhood: string | null;
  tags: string[];
  imageUrl: string | null;
  description: string | null;
  facts: ProviderFact[];
  observedAt: number;
}

export interface BuildEvidenceInput {
  participantId: string;
  entityIds: string[];
  /** entityId -> affinity for this participant's signal set. */
  affinityById: Map<string, number>;
  /** entityId -> 1-based rank inside this participant's own discovery query. */
  rankById: Map<string, number>;
  querySize: number;
}

/**
 * Builds one participant's evidence row per candidate.
 *
 * A candidate the participant's profile returned no affinity for is "unknown",
 * never "disliked". The note is carried through to the UI so the distinction
 * survives all the way to the screen.
 */
export function buildFitEvidences(input: BuildEvidenceInput): FitEvidence[] {
  return input.entityIds.map((entityId) => {
    const affinity = input.affinityById.get(entityId);
    const rank = input.rankById.get(entityId) ?? null;
    if (affinity === undefined || Number.isNaN(affinity)) {
      return {
        participantId: input.participantId,
        evidenceType: "unknown" as const,
        affinity: null,
        rankInQuery: rank,
        querySize: input.querySize,
        note:
          "No affinity was returned for this venue against this participant's confirmed profile, so their preference here is unknown rather than negative.",
      };
    }
    return {
      participantId: input.participantId,
      evidenceType: "provider_affinity" as const,
      affinity: Math.max(0, Math.min(1, affinity)),
      rankInQuery: rank,
      querySize: input.querySize,
      note:
        "Qloo affinity for the participant's confirmed entities. A relative affinity signal, not a probability of enjoyment.",
    };
  });
}

export interface NormaliseInput {
  entity: QlooInsightsEntity;
  originLat: number | null;
  originLon: number | null;
  discoveredVia: string[];
  now: number;
}

/**
 * Turns a verified provider entity into a domain `Candidate`, computing only
 * facts that are actually derived (straight-line distance) and labelling them.
 */
export function normaliseCandidate(input: NormaliseInput): Candidate {
  const { entity } = input;
  let distance: number | null = null;
  if (
    input.originLat !== null &&
    input.originLon !== null &&
    entity.lat !== null &&
    entity.lon !== null
  ) {
    distance = haversineMetres(
      { lat: input.originLat, lon: input.originLon },
      { lat: entity.lat, lon: entity.lon },
    );
  }
  return {
    entityId: entity.entityId,
    name: entity.name,
    subtype: entity.subtype,
    location: {
      lat: entity.lat,
      lon: entity.lon,
      city: entity.city,
      countryCode: entity.countryCode,
      neighborhood: entity.neighborhood,
    },
    straightLineDistanceM: distance,
    providerPopularity: entity.popularity,
    tags: entity.tags,
    facts: entity.facts,
    imageUrl: entity.imageUrl,
    providerDescription: entity.description,
    observedAt: entity.observedAt,
    discoveredVia: input.discoveredVia,
    sourceUrl: null,
  };
}

/** Deterministic, non-reversible fingerprint used for trace rows and idempotency. */
export function fingerprint(value: string): string {
  // FNV-1a (32-bit), hex. Stable across runs, cheap, and cannot be reversed to
  // recover the participant's private input.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
