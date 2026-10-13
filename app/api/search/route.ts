import { NextResponse } from "next/server";
import { searchRequestSchema } from "@domain";
import { QlooError } from "@/lib/qloo/errors";
import { searchEntities, qlooToolStatus } from "@/lib/qloo/client";
import { clientKey, rateLimit, rateLimitedResponse, readJsonBody } from "@/lib/http/guard";

export const dynamic = "force-dynamic";

/**
 * Resolves a participant's favourite to Qloo entities so a human can confirm
 * the right match. Search only; no scoring happens here.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = rateLimit(`search:${clientKey(request)}`, 40, 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = searchRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Search needs a query and one or more taste entity types.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  if (qlooToolStatus() === "failed") {
    return NextResponse.json(
      {
        error: "qloo_unavailable",
        mode: "failed",
        message:
          "Qloo is not configured on this deployment, so entity search is unavailable. Nothing is substituted for it.",
        results: [],
      },
      { status: 503 },
    );
  }

  try {
    const results = await searchEntities(parsed.data);
    return NextResponse.json({
      mode: qlooToolStatus(),
      query: parsed.data.query,
      results,
      count: results.length,
    });
  } catch (error) {
    if (error instanceof QlooError) {
      return NextResponse.json(
        {
          error: error.kind,
          message: error.remediation,
          providerMessage: error.providerMessage,
          results: [],
        },
        { status: error.kind === "quota" ? 429 : 502 },
      );
    }
    return NextResponse.json({ error: "unexpected", message: "Search failed." }, { status: 500 });
  }
}
