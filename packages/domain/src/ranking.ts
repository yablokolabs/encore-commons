import type {
  Candidate,
  FitEvidence,
  Profile,
  ScoredCandidate,
  Unknown,
} from "./schemas";
import { MAX_CANDIDATE_POOL } from "./schemas";

/**
 * Group ranking.
 *
 * The published Qloo contract, verified live against
 * https://hackathon.api.qloo.com, returns `query.affinity` per returned entity:
 * a comparable 0..1 affinity for the *same* signal set. `filter.results.entities`
 * lets us ask for affinity against an explicit shared candidate set, so every
 * participant can be scored on the same venues. That is a verified comparable
 * score, so it is used directly instead of the rank-position fallback described
 * in PROJECT_BUILD.md.
 *
 * Scoring is worst-participant-first, then mean, then coverage, then diversity.
 * Affinity is a provider affinity signal. It is NOT a probability of enjoyment,
 * satisfaction or agreement, and it is NOT calibrated to any individual.
 */

/**
 * A candidate may only be ranked when every participant has comparable
 * evidence for it. A venue where one person's preference is unknown cannot be
 * justified as a group choice, so it is set aside with a reason instead of
 * being scored on partial data. Reaching full coverage is normal, not lucky:
 * `filter.results.entities` returns affinity for the whole shared candidate set.
 */
export const REQUIRED_COVERAGE = 1;

export interface RankedOutcome {
  scores: ScoredCandidate[];
  /** Ids with enough evidence to be a group pick, best first. */
  ranked: ScoredCandidate[];
  /** Kept visible for honesty: vetoed, insulated by unknowns, or thin evidence. */
  excluded: ScoredCandidate[];
  warnings: string[];
}

const round = (value: number, dp = 6): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

/** Mean of the observed affinities; null when nothing was observed. */
export function meanObserved(evidences: FitEvidence[]): number | null {
  const observed = evidences
    .map((e) => e.affinity)
    .filter((a): a is number => a !== null);
  if (observed.length === 0) return null;
  return observed.reduce((sum, a) => sum + a, 0) / observed.length;
}

/** Worst observed affinity. Options cannot hide a participant who dislikes them. */
export function worstObserved(evidences: FitEvidence[]): number | null {
  const observed = evidences
    .map((e) => e.affinity)
    .filter((a): a is number => a !== null);
  if (observed.length === 0) return null;
  return Math.min(...observed);
}

export function coverage(evidences: FitEvidence[], participantCount: number): number {
  if (participantCount === 0) return 0;
  const observed = evidences.filter((e) => e.affinity !== null).length;
  return observed / participantCount;
}

/**
 * Diversity key: a coarse venue family so the shortlist does not come back as
 * three near-identical bars. Derived from provider tags when present.
 */
export function diversityKey(candidate: Candidate): string | null {
  const tag = candidate.tags.find((t) => t.trim().length > 0);
  return tag ? tag.trim().toLowerCase() : null;
}

export interface RankInput {
  candidates: Candidate[];
  profiles: Profile[];
  evidences: Map<string, FitEvidence[]>;
  /**
   * candidateId -> the participant ids who vetoed it. Carrying the attribution
   * (not just the id) is what lets the interface say *who* ruled a venue out.
   */
  vetoes: Map<string, string[]>;
  /** Diversity keys already represented by a confirmed earlier pick. */
  diversityAlreadyPresent?: Set<string>;
}

export function scoreCandidates(input: RankInput): RankedOutcome {
  const { candidates, profiles, evidences, vetoes } = input;
  const warnings: string[] = [];
  const participantCount = profiles.length;

  const scores: ScoredCandidate[] = candidates.map((candidate) => {
    const candidateEvidences = evidences.get(candidate.entityId) ?? [];
    const worst = worstObserved(candidateEvidences);
    const mean = meanObserved(candidateEvidences);
    const cov = coverage(candidateEvidences, participantCount);

    return {
      candidateId: candidate.entityId,
      name: candidate.name,
      worstAffinity: worst === null ? null : round(worst),
      meanAffinity: mean === null ? null : round(mean),
      coverage: round(cov),
      utility: 0,
      diversityKey: diversityKey(candidate),
      provisional: cov < 1 || candidate.facts.every((f) => !f.verified),
      excludedByVeto: [],
      evidences: candidateEvidences,
      unknowns: candidateUnknowns(candidate),
      facts: candidate.facts,
      tags: candidate.tags,
      imageUrl: candidate.imageUrl,
      straightLineDistanceM: candidate.straightLineDistanceM,
      sourceUrl: candidate.sourceUrl ?? null,
    };
  });

  // Hard exclusions are applied before ranking: a veto is not a low score.
  const eligible: ScoredCandidate[] = [];
  const excluded: ScoredCandidate[] = [];
  for (const score of scores) {
    if (vetoes.has(score.candidateId)) {
      // Attribute the veto to the participant(s) who actually stated it, falling
      // back to their declared profile vetoes if the session did not record one.
      const attributed = vetoes.get(score.candidateId) ?? [];
      const declared = profiles
        .filter((p) => p.vetoEntityIds.includes(score.candidateId))
        .map((p) => p.participantId);
      score.excludedByVeto = [...new Set([...attributed, ...declared])];
      excluded.push(score);
      continue;
    }
    if (score.worstAffinity === null) {
      warnings.push(
        `No comparable affinity evidence for "${score.name}"; it is kept visible but not ranked.`,
      );
      excluded.push(score);
      continue;
    }
    if (score.coverage < REQUIRED_COVERAGE - 1e-9) {
      // Unknown is not dislike, and it is also not evidence. Keep it visible
      // with the reason rather than ranking a venue somebody is unknown on.
      warnings.push(
        `"${score.name}" has comparable evidence for only ${Math.round(
          score.coverage * 100,
        )}% of the group, so it is set aside: an unknown preference cannot justify a shared choice.`,
      );
      excluded.push(score);
      continue;
    }
    score.utility = round(
      score.worstAffinity * 0.6 + (score.meanAffinity ?? 0) * 0.35 + score.coverage * 0.05,
    );
    eligible.push(score);
  }

  const alreadyPresent = input.diversityAlreadyPresent ?? new Set<string>();
  const ranked = [...eligible].sort((a, b) => {
    const byWorst = (b.worstAffinity ?? 0) - (a.worstAffinity ?? 0);
    if (Math.abs(byWorst) > 1e-9) return byWorst;
    const byMean = (b.meanAffinity ?? 0) - (a.meanAffinity ?? 0);
    if (Math.abs(byMean) > 1e-9) return byMean;
    const byCoverage = b.coverage - a.coverage;
    if (Math.abs(byCoverage) > 1e-9) return byCoverage;
    // Diversity tie-break, evaluated last, only on exact ties above.
    const aSeen = a.diversityKey && alreadyPresent.has(a.diversityKey) ? 1 : 0;
    const bSeen = b.diversityKey && alreadyPresent.has(b.diversityKey) ? 1 : 0;
    if (aSeen !== bSeen) return aSeen - bSeen;
    const byDistance = distanceSortKey(a) - distanceSortKey(b);
    if (Math.abs(byDistance) > 1e-9) return byDistance;
    return a.name.localeCompare(b.name);
  });

  if (ranked.length === 0 && scores.length > 0) {
    warnings.push(
      "No candidate had comparable affinity evidence for every participant; the group needs another round of preferences.",
    );
  }

  return { scores, ranked, excluded, warnings };
}

function distanceSortKey(score: ScoredCandidate): number {
  return score.straightLineDistanceM ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Builds the honest unknown list. Provider metadata is never treated as a
 * verified operational fact.
 */
export function candidateUnknowns(candidate: Candidate): Unknown[] {
  const unknowns: Unknown[] = [];
  const has = (field: string): boolean =>
    candidate.facts.some((f) => f.field === field && f.value.trim().length > 0);

  if (!has("hours")) {
    unknowns.push({
      field: "openingHours",
      reason: "No opening hours were returned for this venue.",
      needsVerification: "Check the venue's own published hours before the night.",
    });
  } else {
    unknowns.push({
      field: "openingHours",
      reason: "Hours were returned as third-party metadata and may be out of date.",
      needsVerification: "Confirm hours directly with the venue for the date of the show.",
    });
  }
  if (!has("priceLevel") && !has("priceRange")) {
    unknowns.push({
      field: "price",
      reason: "No price information was returned.",
      needsVerification: "Confirm typical spend with the venue or a recent visitor.",
    });
  }
  if (!has("accessibility")) {
    unknowns.push({
      field: "stepFreeAccess",
      reason: "Step-free access is not published in the returned metadata.",
      needsVerification:
        "Contact the venue about step-free access, seating and accessible facilities.",
    });
  }
  if (!has("dietary")) {
    unknowns.push({
      field: "dietaryAndAllergies",
      reason: "Allergy handling and dietary options are not verifiable from taste data.",
      needsVerification:
        "Ask the venue directly about allergy safety before anyone relies on it.",
    });
  }
  unknowns.push({
    field: "availability",
    reason: "Table, entry and booking availability are not known.",
    needsVerification: "Check availability and any booking requirement with the venue.",
  });
  return unknowns;
}

/** Convenience so callers cannot accidentally exceed the provider call budget. */
export function capCandidatePool<T>(items: T[]): T[] {
  return items.slice(0, MAX_CANDIDATE_POOL);
}
