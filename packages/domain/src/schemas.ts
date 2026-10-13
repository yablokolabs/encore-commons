import { z } from "zod";

/**
 * Shared domain contract for Encore Commons.
 *
 * Everything that crosses a trust boundary (browser -> server route -> Qloo/CSCS)
 * is validated with these schemas. Provider payloads are *not* modelled here as
 * "our truth": they are normalised into `Candidate` and `ProviderFact` values so
 * that the UI can always say where a fact came from and whether it is verified.
 */

export const MAX_PARTICIPANTS = 4;
export const MIN_PARTICIPANTS = 2;
export const MIN_FAVORITES = 2;
export const MAX_FAVORITES = 5;
export const MAX_TEXT_LENGTH = 80;
/** Candidate pool cap keeps the scoring step inside a bounded Qloo call budget. */
export const MAX_CANDIDATE_POOL = 24;
export const MAX_REPLANS = 2;
export const DEFAULT_LOCATION_RADIUS_M = 3000;

export const QLOO_ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:brand",
  "urn:entity:place",
  "urn:entity:person",
  "urn:entity:video_game",
  "urn:entity:destination",
] as const;
export type QlooEntityType = (typeof QLOO_ENTITY_TYPES)[number];

/**
 * Taste-bearing entity types a participant may name as a favourite.
 *
 * These are the `/search` values, verified live against the hackathon origin.
 * The developer guide warns that the supported `/search` types are NOT the same
 * vocabulary as `filter.type` in `/v2/insights`; `/search` uses
 * `urn:entity:videogame` where insights uses `urn:entity:video_game`.
 */
export const TASTE_ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:person",
  "urn:entity:videogame",
] as const;

export const tasteEntityTypeSchema = z.enum(TASTE_ENTITY_TYPES);

const trimmedText = (max = MAX_TEXT_LENGTH) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1).max(max));

/** A pseudonymous participant label. Never an email, name or other identifier. */
export const participantLabelSchema = trimmedText(40);

export const participantInputSchema = z.object({
  participantId: z.string().min(1).max(64),
  label: participantLabelSchema,
  /** Free-text favourites as typed by the participant. Resolved later via Qloo search. */
  favorites: z.array(trimmedText()).min(MIN_FAVORITES).max(MAX_FAVORITES),
  /** Explicit exclusions the participant states up front (not inferred). */
  excludeHints: z.array(trimmedText()).max(MAX_FAVORITES).default([]),
  /**
   * Entity ids the participant already confirmed in the resolve step. When
   * present these are used verbatim instead of re-running entity search.
   */
  confirmedEntityIds: z.array(z.string().min(1)).max(12).default([]),
  /** Unix ms. Explicit consent to send taste signals to Qloo for planning. */
  consentTimestamp: z.number().int().nonnegative(),
});

export const planningRequestSchema = z.object({
  sessionId: z.string().min(1).max(64),
  /** User-entered show location. Never inferred from a concert database. */
  showLocation: z.object({
    query: trimmedText(120),
    /** Optional coordinates the user supplied or confirmed, used for distance only. */
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
  }),
  participants: z
    .array(participantInputSchema)
    .min(MIN_PARTICIPANTS)
    .max(MAX_PARTICIPANTS),
});

/** A candidate that a participant/search confirmed as the right entity. */
export const resolvedEntitySchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  types: z.array(z.string()),
  /** Qloo popularity, when returned. Provider-reported, not a quality judgement. */
  popularity: z.number().nullable().default(null),
  /** The free-text query that produced this match. */
  sourceQuery: z.string(),
  /** True only when a human confirmed the match in the UI. */
  confirmedByUser: z.boolean(),
});

/** Per-participant profile actually sent to Qloo (confirmed entities only). */
export const profileSchema = z.object({
  participantId: z.string().min(1),
  label: z.string().min(1),
  confirmedEntityIds: z.array(z.string().min(1)),
  /** Hard exclusions from the participant's own explicit veto, by entity id. */
  vetoEntityIds: z.array(z.string().min(1)).default([]),
  consentTimestamp: z.number().int().nonnegative(),
});

export const candidateLocationSchema = z.object({
  lat: z.number().nullable().default(null),
  lon: z.number().nullable().default(null),
  city: z.string().nullable().default(null),
  countryCode: z.string().nullable().default(null),
  neighborhood: z.string().nullable().default(null),
});

/**
 * A provider-reported venue fact. `verified` is always false for provider
 * metadata: Qloo does not confirm opening hours, safety, allergy handling,
 * accessibility or price at the time of the visit.
 */
export const providerFactSchema = z.object({
  field: z.string().min(1),
  value: z.string(),
  source: z.enum(["qloo", "user", "derived"]),
  verified: z.boolean(),
  observedAt: z.number().int().nonnegative(),
});

export const candidateSchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  subtype: z.string().nullable().default(null),
  location: candidateLocationSchema,
  /** Straight-line distance in metres from user-supplied coordinates, or null. */
  straightLineDistanceM: z.number().nonnegative().nullable().default(null),
  /**
   * Provider popularity for this candidate. Provider-reported and unrelated to
   * taste fit; used only by the ablation baseline so it can be compared fairly.
   */
  providerPopularity: z.number().nullable().default(null),
  /** Venue category tags as returned by the provider. */
  tags: z.array(z.string()),
  /** Provider-reported facts, each with provenance and observedAt. */
  facts: z.array(providerFactSchema),
  /** Provider image URL when returned and licence-cleared for display. */
  imageUrl: z.string().nullable().default(null),
  /** Free-text description as returned by the provider. */
  providerDescription: z.string().nullable().default(null),
  observedAt: z.number().int().nonnegative(),
  /** Which participant queries surfaced this candidate. */
  discoveredVia: z.array(z.string()),
  /** Provider page or canonical URL for source linking, when returned. */
  sourceUrl: z.string().nullable().default(null),
});

export const fitEvidenceTypeSchema = z.enum([
  "provider_affinity",
  "unknown",
  "insufficient_profile",
]);

/** Why a participant/candidate pair has the evidence it has. */
export const fitEvidenceSchema = z.object({
  participantId: z.string().min(1),
  evidenceType: fitEvidenceTypeSchema,
  /** Qloo `query.affinity` for this profile/candidate pair, 0..1, or null. */
  affinity: z.number().min(0).max(1).nullable(),
  /** Rank position inside that participant's own discovery query, 1-based. */
  rankInQuery: z.number().int().positive().nullable(),
  /** Size of that participant's discovery result set. */
  querySize: z.number().int().nonnegative(),
  /** Never a probability or a calibrated happiness score. */
  note: z.string(),
});

export const unknownSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  /** What a human must check before treating this venue as suitable. */
  needsVerification: z.string().min(1),
});

export const scoredCandidateSchema = z.object({
  candidateId: z.string().min(1),
  name: z.string().min(1),
  /** Worst-participant affinity first, then mean, then coverage. */
  worstAffinity: z.number().min(0).max(1).nullable(),
  meanAffinity: z.number().min(0).max(1).nullable(),
  /** Observed evidence pairs / participants. */
  coverage: z.number().min(0).max(1),
  /** Ranking utility actually used for the sort. */
  utility: z.number(),
  diversityKey: z.string().nullable().default(null),
  /** True when a critical fact is unknown or coverage is thin. */
  provisional: z.boolean(),
  /** Excluded by an explicit participant veto (kept visible, not scored). */
  excludedByVeto: z.array(z.string()),
  evidences: z.array(fitEvidenceSchema),
  unknowns: z.array(unknownSchema),
  facts: z.array(providerFactSchema),
  tags: z.array(z.string()),
  imageUrl: z.string().nullable().default(null),
  straightLineDistanceM: z.number().nonnegative().nullable().default(null),
  /** Provider entity URL for source linking when available. */
  sourceUrl: z.string().nullable().default(null),
});

export const explanationProvenanceSchema = z.enum([
  "qloo_explainability",
  "cscs_grounded",
  "deterministic_template",
]);

export const explanationSchema = z.object({
  text: z.string(),
  provenance: explanationProvenanceSchema,
  /** True when a language model wrote the wording rather than the provider. */
  modelGenerated: z.boolean(),
  /** Provider facts the wording is restricted to. */
  citedCandidateIds: z.array(z.string()),
  /** Populated when the language model path failed and we fell back. */
  fallbackReason: z.string().nullable().default(null),
});

export const planSchema = z.object({
  planId: z.string().min(1),
  sessionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  showLocation: z.string().min(1),
  locationRadiusM: z.number().positive(),
  profiles: z.array(profileSchema),
  candidates: z.array(candidateSchema),
  scores: z.array(scoredCandidateSchema),
  selectedCandidateId: z.string().nullable(),
  alternativeCandidateIds: z.array(z.string()),
  explanation: explanationSchema,
  /** Overall data-quality disclosure for the whole plan. */
  limitations: z.array(z.string()),
  replansUsed: z.number().int().nonnegative().max(MAX_REPLANS),
  needsClarification: z.array(z.string()),
  providerStatus: z.object({
    /** `replay` is offline recorded data and is always labelled as such. */
    qloo: z.enum(["live", "replay", "failed", "partial"]),
    cscs: z.enum(["live", "failed", "skipped"]),
  }),
  producedAt: z.number().int().nonnegative(),
});

export const traceStepStatusSchema = z.enum(["ok", "empty", "error", "skipped"]);

export const traceStepSchema = z.object({
  index: z.number().int().nonnegative(),
  step: z.string().min(1),
  tool: z.string().min(1),
  status: traceStepStatusSchema,
  latencyMs: z.number().nonnegative(),
  /** Sanitised, non-reversible input fingerprint. Never the raw private input. */
  inputHash: z.string(),
  entityIds: z.array(z.string()),
  resultCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

export const vetoRequestSchema = z.object({
  sessionId: z.string().min(1),
  participantId: z.string().min(1),
  candidateId: z.string().min(1),
  /** Guards against stale vetoes landing on a plan that has already moved on. */
  expectedRevision: z.number().int().nonnegative(),
  reason: trimmedText(160).optional(),
  /**
   * The signed session state, issued by `/api/plan`.
   *
   * Present when the deployment cannot rely on process memory surviving between
   * two requests — Cloudflare Workers serve them from different isolates — so the
   * veto carries the state it needs rather than assuming it is still resident.
   * Optional: a single-process server resolves the session from memory instead.
   */
  sessionToken: z.string().min(1).max(131072).optional(),
});

export const searchRequestSchema = z.object({
  query: trimmedText(),
  types: z.array(tasteEntityTypeSchema).min(1).default([...TASTE_ENTITY_TYPES]),
  take: z.number().int().min(1).max(20).default(6),
});

export const searchHitSchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  types: z.array(z.string()),
  popularity: z.number().nullable().default(null),
  shortDescription: z.string().nullable().default(null),
  disambiguation: z.string().nullable().default(null),
});

export type ParticipantInput = z.infer<typeof participantInputSchema>;
export type PlanningRequest = z.infer<typeof planningRequestSchema>;
export type ResolvedEntity = z.infer<typeof resolvedEntitySchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type ProviderFact = z.infer<typeof providerFactSchema>;
export type FitEvidence = z.infer<typeof fitEvidenceSchema>;
export type Unknown = z.infer<typeof unknownSchema>;
export type ScoredCandidate = z.infer<typeof scoredCandidateSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
export type TraceStep = z.infer<typeof traceStepSchema>;
export type VetoRequest = z.infer<typeof vetoRequestSchema>;
export type SearchHit = z.infer<typeof searchHitSchema>;
