import { NextResponse } from "next/server";
import { describeCredentialStatus } from "@/lib/config";
import { qlooToolStatus } from "@/lib/qloo/client";
import { sessionCount } from "@/lib/storage/session";

export const dynamic = "force-dynamic";

/**
 * Health and setup status.
 *
 * Reports only *presence* of credentials and the public origin/model names.
 * A credential value is never read into the response, logged or echoed.
 */
export async function GET(): Promise<NextResponse> {
  const status = describeCredentialStatus();
  const qloo = qlooToolStatus();
  return NextResponse.json(
    {
      service: "encore-commons",
      ok: true,
      providers: {
        qloo: {
          origin: status.qlooOrigin,
          keyPresent: status.qlooKeyPresent,
          /** `replay` means offline recorded data, and is labelled as such. */
          mode: qloo,
          note:
            qloo === "replay"
              ? "Serving recorded Qloo responses offline. Not a live provider call."
              : qloo === "live"
                ? "Live Qloo calls are enabled for this deployment."
                : "No Qloo credential is configured; discovery is disabled rather than faked.",
        },
        cscs: {
          baseUrl: status.cscsBaseUrl,
          model: status.cscsModel,
          keyPresent: status.cscsKeyPresent,
          note: status.cscsKeyPresent
            ? "Apertus 1.5 70B is used for request interpretation and grounded wording."
            : "No CSCS credential; explanations fall back to the deterministic template.",
        },
      },
      sessions: sessionCount(),
      noFooterPolicy: "no footer, attribution strip or copyright bar is rendered on any route",
    },
    { status: 200 },
  );
}
