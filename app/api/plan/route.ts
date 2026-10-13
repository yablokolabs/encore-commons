import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { planningRequestSchema, DEFAULT_LOCATION_RADIUS_M } from "@domain";
import { QlooError } from "@/lib/qloo/errors";
import { runPlan } from "@/lib/agent/state";
import { saveSession, getSession } from "@/lib/storage/session";
import { clientKey, rateLimit, rateLimitedResponse, readJsonBody } from "@/lib/http/guard";

export const dynamic = "force-dynamic";

/**
 * Creates a group plan: resolve favourites, discover places near the show
 * location with Qloo, score the shared candidate set for every participant,
 * apply hard exclusions, rank and explain.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(`plan:${clientKey(request)}`, 6, 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = planningRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message:
          "A plan needs 2-4 pseudonymous participants, each with 2-5 favourites, plus the show location.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const sessionId = parsed.data.sessionId === "new" ? randomUUID() : parsed.data.sessionId;
  const now = Date.now();

  // Reuse an existing session's provider work when the group is identical and a
  // fresh sessionId was not requested.
  const existing = parsed.data.sessionId === "new" ? null : getSession(sessionId);

  try {
    const { plan, trace, cache } = await runPlan({
      sessionId,
      showLocation: parsed.data.showLocation,
      participants: parsed.data.participants,
      vetoes:
        existing?.vetoes.map((v) => ({
          participantId: v.participantId,
          candidateId: v.candidateId,
        })) ?? [],
      locationRadiusM: DEFAULT_LOCATION_RADIUS_M * 2,
      revision: existing ? existing.plan.revision : 0,
      replansUsed: existing ? Math.min(existing.plan.replansUsed, 2) : 0,
      reuse: undefined,
    });

    saveSession({
      sessionId,
      plan,
      trace,
      cache,
      vetoes: existing?.vetoes ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return NextResponse.json({
      sessionId,
      plan,
      trace,
      candidateCount: plan.candidates.length,
      rankedCount: plan.scores.filter((s) => s.worstAffinity !== null).length,
    });
  } catch (error) {
    if (error instanceof QlooError) {
      return NextResponse.json(
        {
          error: error.kind,
          message: error.remediation,
          providerMessage: error.providerMessage,
          /** No plan is returned rather than a plan built from invented data. */
          plan: null,
        },
        { status: error.kind === "quota" ? 429 : 502 },
      );
    }
    return NextResponse.json(
      {
        error: "plan_failed",
        message:
          error instanceof Error ? error.message.slice(0, 240) : "Plan generation failed.",
        plan: null,
      },
      { status: 500 },
    );
  }
}

/** Retrieves a stored plan by session id. */
export async function GET(request: Request): Promise<NextResponse> {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { error: "missing_session", message: "Pass ?sessionId=…" },
      { status: 400 },
    );
  }
  const record = getSession(sessionId);
  if (!record) {
    return NextResponse.json(
      {
        error: "session_not_found",
        message:
          "This session is not in memory. Sessions are short-lived and not durably stored, so the group needs to run the plan again.",
      },
      { status: 404 },
    );
  }
  return NextResponse.json({
    sessionId,
    plan: record.plan,
    trace: record.trace,
    vetoes: record.vetoes,
  });
}

/** Deletes a session and everything held for it. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session" }, { status: 400 });
  }
  const { deleteSession } = await import("@/lib/storage/session");
  return NextResponse.json({ deleted: deleteSession(sessionId) });
}
