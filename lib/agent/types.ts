import type { Plan, TraceStep, ParticipantInput } from "@domain";
import type { QlooInsightsEntity } from "@domain";

/**
 * The agent is a bounded, deterministic state machine, not an open-ended
 * loop. It plans a fixed sequence of allowlisted tool calls, validates every
 * provider output, and replans a strictly limited number of times.
 *
 * Allowlisted tools. Nothing else may be called:
 *   search_entities   - resolve a favourite to Qloo entity ids
 *   query_places      - discover places near the show location
 *   score_candidates  - affinity for an explicit shared candidate set
 *   apply_veto        - remove a candidate as a hard exclusion
 *   explain_plan      - word a grounded explanation
 */
export const AGENT_TOOLS = [
  "search_entities",
  "query_places",
  "score_candidates",
  "apply_veto",
  "explain_plan",
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

/** Hard ceilings so one request can never run away. */
export const AGENT_LIMITS = {
  maxToolCallsPerRun: 40,
  maxReplans: 2,
  discoveryTake: 25,
  maxClarifications: 6,
} as const;

export interface AgentRunInput {
  sessionId: string;
  showLocation: { query: string; lat?: number | undefined; lon?: number | undefined };
  participants: ParticipantInput[];
  /**
   * Vetoes already cast in this session, with the participant who cast them.
   * A veto is a hard exclusion applied before ranking, not a low score.
   */
  vetoes: { participantId: string; candidateId: string }[];
  locationRadiusM: number;
  revision: number;
  replansUsed: number;
  /**
   * Already-paid-for discovery from this session. When present the agent skips
   * search and discovery and re-ranks the same candidate pool, which keeps a
   * veto cheap in quota and latency terms.
   */
  reuse?: PlanCache | undefined;
}

/** Cached provider work for a session, so a veto never re-queries Qloo. */
export interface PlanCache {
  profiles: ProfileSummary[];
  candidateEntities: Record<string, QlooInsightsEntity>;
  discoveredByParticipant: Record<string, string[]>;
  affinityByParticipant: Record<string, Record<string, number>>;
  providerStatus: "live" | "replay" | "failed";
}

export interface ProfileSummary {
  participantId: string;
  label: string;
  confirmedEntityIds: string[];
  confirmedEntityNames: string[];
  consentTimestamp: number;
}

export interface AgentRunOutput {
  plan: Plan;
  trace: TraceStep[];
  /** Reusable provider work, cached so a veto can replan cheaply. */
  cache: PlanCache;
}
