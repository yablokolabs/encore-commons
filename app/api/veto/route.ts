import { NextResponse } from "next/server";
import { vetoRequestSchema, MAX_REPLANS } from "@domain";
import { runPlan } from "@/lib/agent/state";
import { getSession, saveSession } from "@/lib/storage/session";
import {
  recordFromVetoReplan,
  vetoSessionFromRecord,
  type VetoSession,
} from "@/lib/session/state";
import { issueSessionToken, readSessionToken } from "@/lib/session/token";
import {
  clientKey,
  rateLimit,
  rateLimitedResponse,
  readJsonBody,
  MAX_VETO_BODY_BYTES,
} from "@/lib/http/guard";

export const dynamic = "force-dynamic";

/**
 * Applies a participant veto and replans.
 *
 * A veto is a hard exclusion, not a low score, so the candidate is removed from
 * the ranking and stays visible with the reason. The replan reuses this
 * session's discovery instead of re-querying Qloo, which keeps the loop cheap,
 * and it is bounded to two replans per request so it can never run away.
 *
 * `expectedRevision` guards against a stale veto landing on a plan that already
 * moved on.
 *
 * Where the session comes from. Process memory is the fast path and the only
 * path a single-process server needs. It is not sufficient on Cloudflare
 * Workers, where this request may be answered by a different isolate than the
 * one that created the plan — measured, not assumed: three of three veto calls
 * against the deployed Worker found no session. So when memory misses, the
 * session is recovered from the signed token the client carried back, and the
 * response issues a fresh token reflecting the new revision.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(`veto:${clientKey(request)}`, 20, 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  const body = await readJsonBody(request, MAX_VETO_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = vetoRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "A veto needs sessionId, participantId, candidateId and expectedRevision.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  // Memory first: on a warm isolate this is the whole story and nothing below
  // changes. Then the token, which is what makes this work across isolates.
  const stored = getSession(parsed.data.sessionId);
  let session: VetoSession | null = stored ? vetoSessionFromRecord(stored) : null;
  let carried = false;
  if (session === null) {
    const fromToken = await readSessionToken(parsed.data.sessionToken);
    // A token must not be usable for a different session than the one addressed.
    if (fromToken !== null && fromToken.sessionId === parsed.data.sessionId) {
      session = fromToken;
      carried = true;
    }
  }

  if (session === null) {
    return NextResponse.json(
      {
        error: "session_not_found",
        message:
          "This session is no longer available. Sessions are short-lived and are not durably stored, so the group needs to run the plan again.",
      },
      { status: 404 },
    );
  }

  if (parsed.data.expectedRevision !== session.revision) {
    return NextResponse.json(
      {
        error: "stale_revision",
        message: `This plan has already moved to revision ${session.revision}. Reload before voting again.`,
        currentRevision: session.revision,
      },
      { status: 409 },
    );
  }

  const known = session.candidates.some((c) => c.entityId === parsed.data.candidateId);
  if (!known) {
    return NextResponse.json(
      {
        error: "unknown_candidate",
        message: "That candidate is not part of this plan, so the veto was not applied.",
      },
      { status: 400 },
    );
  }

  const participant = session.profiles.find(
    (profile) => profile.participantId === parsed.data.participantId,
  );
  if (!participant) {
    return NextResponse.json(
      {
        error: "unknown_participant",
        message: "That participant is not part of this session.",
      },
      { status: 400 },
    );
  }

  const replansUsed = Math.min(session.replansUsed + 1, MAX_REPLANS);
  const vetoes = [
    ...session.vetoes.map((v) => ({ participantId: v.participantId, candidateId: v.candidateId })),
    { participantId: parsed.data.participantId, candidateId: parsed.data.candidateId },
  ];
  const candidateName =
    session.candidates.find((c) => c.entityId === parsed.data.candidateId)?.name ??
    parsed.data.candidateId;

  const { plan, trace, cache: nextCache } = await runPlan({
    sessionId: parsed.data.sessionId,
    showLocation: { query: session.showLocation },
    participants: session.profiles.map((profile) => ({
      participantId: profile.participantId,
      label: profile.label,
      favorites: [],
      excludeHints: [],
      confirmedEntityIds: profile.confirmedEntityIds,
      consentTimestamp: profile.consentTimestamp,
    })),
    vetoes,
    locationRadiusM: session.locationRadiusM,
    revision: session.revision + 1,
    replansUsed,
    reuse: session.cache,
  });

  const updatedAt = Date.now();
  const record = recordFromVetoReplan({
    session,
    plan,
    trace,
    cache: nextCache,
    vetoes: [
      ...session.vetoes,
      {
        participantId: parsed.data.participantId,
        candidateId: parsed.data.candidateId,
        candidateName,
        reason: parsed.data.reason ?? null,
        at: updatedAt,
        revisionApplied: plan.revision,
      },
    ],
    createdAt: session.createdAt,
    updatedAt,
  });
  saveSession(record);

  // Re-issue so a chained veto carries the new revision, whether or not this
  // isolate is the one that serves it.
  const sessionToken = await issueSessionToken(vetoSessionFromRecord(record), updatedAt);

  return NextResponse.json({
    sessionId: parsed.data.sessionId,
    plan,
    trace,
    sessionToken,
    /** True when the state came from the token rather than this isolate's memory. */
    sessionCarried: carried,
    vetoes: [
      ...session.vetoes,
      {
        participantId: parsed.data.participantId,
        candidateId: parsed.data.candidateId,
        candidateName,
      },
    ],
    replanBudgetRemaining: Math.max(0, MAX_REPLANS - replansUsed),
  });
}
