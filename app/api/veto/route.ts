import { NextResponse } from "next/server";
import { vetoRequestSchema, MAX_REPLANS } from "@domain";
import { runPlan } from "@/lib/agent/state";
import { getSession, saveSession } from "@/lib/storage/session";
import { clientKey, rateLimit, rateLimitedResponse, readJsonBody } from "@/lib/http/guard";

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
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(`veto:${clientKey(request)}`, 20, 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  const body = await readJsonBody(request);
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

  const record = getSession(parsed.data.sessionId);
  if (!record) {
    return NextResponse.json(
      {
        error: "session_not_found",
        message:
          "This session is no longer in memory (sessions are intentionally short-lived). Run the plan again.",
      },
      { status: 404 },
    );
  }

  if (parsed.data.expectedRevision !== record.plan.revision) {
    return NextResponse.json(
      {
        error: "stale_revision",
        message: `This plan has already moved to revision ${record.plan.revision}. Reload before voting again.`,
        currentRevision: record.plan.revision,
      },
      { status: 409 },
    );
  }

  const known = record.plan.candidates.some((c) => c.entityId === parsed.data.candidateId);
  if (!known) {
    return NextResponse.json(
      {
        error: "unknown_candidate",
        message: "That candidate is not part of this plan, so the veto was not applied.",
      },
      { status: 400 },
    );
  }

  const participant = record.plan.profiles.find(
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

  const replansUsed = Math.min(record.plan.replansUsed + 1, MAX_REPLANS);
  const vetoes = [
    ...record.vetoes.map((v) => ({ participantId: v.participantId, candidateId: v.candidateId })),
    { participantId: parsed.data.participantId, candidateId: parsed.data.candidateId },
  ];
  const candidateName =
    record.plan.candidates.find((c) => c.entityId === parsed.data.candidateId)?.name ??
    parsed.data.candidateId;

  const { plan, trace, cache: nextCache } = await runPlan({
    sessionId: parsed.data.sessionId,
    showLocation: { query: record.plan.showLocation },
    participants: record.plan.profiles.map((profile) => ({
      participantId: profile.participantId,
      label: profile.label,
      favorites: [],
      excludeHints: [],
      confirmedEntityIds: profile.confirmedEntityIds,
      consentTimestamp: profile.consentTimestamp,
    })),
    vetoes,
    locationRadiusM: record.plan.locationRadiusM,
    revision: record.plan.revision + 1,
    replansUsed,
    reuse: record.cache,
  });

  saveSession({
    ...record,
    plan,
    trace,
    cache: nextCache,
    vetoes: [
      ...record.vetoes,
      {
        participantId: parsed.data.participantId,
        candidateId: parsed.data.candidateId,
        candidateName,
        reason: parsed.data.reason ?? null,
        at: Date.now(),
        revisionApplied: plan.revision,
      },
    ],
    updatedAt: Date.now(),
  });

  return NextResponse.json({
    sessionId: parsed.data.sessionId,
    plan,
    trace,
    vetoes: [...record.vetoes, { participantId: parsed.data.participantId, candidateId: parsed.data.candidateId, candidateName }],
    replanBudgetRemaining: Math.max(0, MAX_REPLANS - replansUsed),
  });
}
