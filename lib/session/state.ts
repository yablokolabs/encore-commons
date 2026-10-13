import type { Plan, TraceStep } from "@domain";
import type { PlanCache } from "@/lib/agent/types";
import type { SessionRecord } from "@/lib/storage/session";

/**
 * Session state that travels with the client.
 *
 * Why this exists. The session store is process memory, which is correct on a
 * single long-lived Node server and wrong on Cloudflare Workers, where a request
 * may be served by any isolate. There, the plan request fills the store and the
 * veto request — arriving at a different isolate with an empty map — cannot find
 * it, so the veto fails. That was measured, not assumed: three of three veto
 * calls against the deployed Worker returned `session_not_found`.
 *
 * The fix is not a shared store. It is to make the veto request carry the state
 * it needs, signed so the client cannot forge or inflate it. Memory stays as a
 * fast path, so behaviour on a warm isolate is unchanged.
 *
 * What travels is the minimum a veto needs to replan, plus the provider cache:
 *
 *  - Without the cache a replan would re-query Qloo, which costs a provider call
 *    and about eleven seconds, and would quietly falsify the project's stated
 *    property that a veto replan costs zero additional Qloo calls.
 *  - With it the token is around 20 KB compressed, which fits the request cap.
 *
 * The full plan is deliberately not carried: candidates are reduced to id and
 * name, because a veto only checks that the candidate is known and reads its
 * name. Trace and scores are dropped entirely; the replan regenerates them.
 */

/** One participant, reduced to what a replan needs to reconstruct the run. */
export interface VetoProfile {
  participantId: string;
  label: string;
  confirmedEntityIds: string[];
  consentTimestamp: number;
}

/** A veto already cast in this session. */
export interface VetoRecord {
  participantId: string;
  candidateId: string;
  candidateName: string;
  reason: string | null;
  at: number;
  revisionApplied: number;
}

/** A candidate reduced to identity, which is all a veto reads. */
export interface VetoCandidate {
  entityId: string;
  name: string;
}

/** Everything a veto needs, and nothing else. */
export interface VetoSession {
  sessionId: string;
  /** The user-entered show location, as the plan records it. */
  showLocation: string;
  profiles: VetoProfile[];
  locationRadiusM: number;
  revision: number;
  replansUsed: number;
  vetoes: VetoRecord[];
  candidates: VetoCandidate[];
  cache: PlanCache;
  createdAt: number;
}

/** Reduce a stored session to the state a veto needs. */
export function vetoSessionFromRecord(record: SessionRecord): VetoSession {
  return {
    sessionId: record.sessionId,
    showLocation: record.plan.showLocation,
    profiles: record.plan.profiles.map((profile) => ({
      participantId: profile.participantId,
      label: profile.label,
      confirmedEntityIds: profile.confirmedEntityIds,
      consentTimestamp: profile.consentTimestamp,
    })),
    locationRadiusM: record.plan.locationRadiusM,
    revision: record.plan.revision,
    replansUsed: record.plan.replansUsed,
    vetoes: record.vetoes,
    candidates: record.plan.candidates.map((candidate) => ({
      entityId: candidate.entityId,
      name: candidate.name,
    })),
    cache: record.cache,
    createdAt: record.createdAt,
  };
}

/**
 * Rebuild a full session record after a veto replan.
 *
 * The replan produces a real plan and trace, so those are stored in full; only
 * the reduced candidate list from the token is replaced by the new plan's own.
 */
export function recordFromVetoReplan(args: {
  session: VetoSession;
  plan: Plan;
  trace: TraceStep[];
  cache: PlanCache;
  vetoes: VetoRecord[];
  updatedAt: number;
  createdAt: number;
}): SessionRecord {
  return {
    sessionId: args.session.sessionId,
    plan: args.plan,
    trace: args.trace,
    cache: args.cache,
    vetoes: args.vetoes,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
  };
}

/**
 * The state a veto request must carry, checked before anything else runs.
 *
 * This is a structural guard on untrusted input: the fields are read by the
 * route, so an absent or malformed one has to be rejected here rather than
 * surfacing as a runtime error mid-replan.
 */
export function isVetoSession(value: unknown): value is VetoSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<VetoSession>;
  return (
    typeof s.sessionId === "string" &&
    typeof s.revision === "number" &&
    typeof s.locationRadiusM === "number" &&
    typeof s.createdAt === "number" &&
    Array.isArray(s.profiles) &&
    Array.isArray(s.vetoes) &&
    Array.isArray(s.candidates) &&
    typeof s.showLocation === "string" &&
    s.showLocation.length > 0 &&
    typeof s.cache === "object" &&
    s.cache !== null
  );
}
