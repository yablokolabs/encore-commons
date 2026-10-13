import { NextResponse } from "next/server";

/**
 * Shared request guards.
 *
 * The demo is public and signed-out for judges, so every write route gets a
 * cheap per-client rate limit and a bounded body size before any provider call
 * is made. Nothing here needs durable state: a cold isolate resets the window,
 * which is an acceptable trade for not adding a paid store.
 */

const MAX_BODY_BYTES = 32 * 1024;

const globalForGuard = globalThis as unknown as {
  __encoreBuckets?: Map<string, { count: number; resetAt: number }>;
};

const buckets = globalForGuard.__encoreBuckets ?? new Map<string, { count: number; resetAt: number }>();
globalForGuard.__encoreBuckets = buckets;

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

export async function readJsonBody(request: Request): Promise<
  { ok: true; value: unknown } | { ok: false; response: NextResponse }
> {
  const declared = request.headers.get("content-length");
  if (declared && Number.parseInt(declared, 10) > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "request_too_large", message: "Request body is larger than the 32 KB limit." },
        { status: 413 },
      ),
    };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "unreadable_body" }, { status: 400 }),
    };
  }
  if (text.length > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "request_too_large", message: "Request body is larger than the 32 KB limit." },
        { status: 413 },
      ),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "invalid_json", message: "Body must be valid JSON." },
        { status: 400 },
      ),
    };
  }
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: "rate_limited",
      message: `Too many requests. Try again in ${retryAfterSeconds} second(s).`,
      retryAfterSeconds,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
