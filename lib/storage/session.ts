import type { Plan, TraceStep } from "@domain";
import type { PlanCache } from "@/lib/agent/types";

/**
 * Session store.
 *
 * Deliberately in-memory and deliberately small. Constraints that shaped it:
 *
 *  - The deployment target is Cloudflare Workers, where a process has no
 *    durable memory and no filesystem. Module-level state survives only inside
 *    a warm isolate, so this store is best-effort by design.
 *  - A short TTL keeps a group's taste data from lingering.
 *  - Privacy: only pseudonymous labels, confirmed entity ids and provider
 *    results are held. No names, emails or accounts. A delete action removes
 *    the session outright.
 *  - No durable database is used, so a cold isolate simply starts a new
 *    session rather than silently reading a stale one.
 */

export interface SessionRecord {
  sessionId: string;
  plan: Plan;
  trace: TraceStep[];
  cache: PlanCache;
  vetoes: {
    participantId: string;
    candidateId: string;
    candidateName: string;
    reason: string | null;
    at: number;
    revisionApplied: number;
  }[];
  createdAt: number;
  updatedAt: number;
}

const TTL_MS = 1000 * 60 * 60 * 3; // three hours
const MAX_SESSIONS = 500;

const globalForSessions = globalThis as unknown as {
  __encoreSessions?: Map<string, SessionRecord>;
};

const sessions: Map<string, SessionRecord> =
  globalForSessions.__encoreSessions ?? new Map<string, SessionRecord>();
globalForSessions.__encoreSessions = sessions;

function evict(): void {
  const now = Date.now();
  for (const [key, record] of sessions) {
    if (now - record.updatedAt > TTL_MS) sessions.delete(key);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (!oldest) break;
    sessions.delete(oldest[0]);
  }
}

export function saveSession(record: SessionRecord): void {
  sessions.set(record.sessionId, record);
  evict();
}

export function getSession(sessionId: string): SessionRecord | null {
  evict();
  return sessions.get(sessionId) ?? null;
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function sessionCount(): number {
  evict();
  return sessions.size;
}

/** True when the process has lost its in-memory sessions (new isolate). */
export function isKnownSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}
