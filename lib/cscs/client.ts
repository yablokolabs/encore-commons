import type { ZodType } from "zod";
import { getProviderConfig } from "@/lib/config";

/**
 * CSCS Apertus 1.5 70B adapter.
 *
 * Verified live on 2026-10-13: `GET /v1/models` lists `swiss-ai/Apertus-v1.5-70B`
 * and `POST /v1/chat/completions` answers. The model is kept at 70B; this code
 * never silently downgrades to the 8B variant or any other provider.
 *
 * The model's role is bounded by design: it interprets a request and words a
 * grounded explanation. It cannot invent candidate venues, alter ranking
 * evidence, override a hard exclusion, or call arbitrary tools.
 */

export type CscsStatus = "live" | "failed" | "skipped";

export interface CscsMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CscsCallResult<T> {
  ok: boolean;
  value: T | null;
  status: CscsStatus;
  model: string;
  latencyMs: number;
  error: string | null;
  /** Raw text, only for traces where it contains no private data. */
  rawText: string | null;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface CscsCallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function cscsChat(options: CscsCallOptions): Promise<{
  ok: boolean;
  text: string | null;
  status: CscsStatus;
  model: string;
  latencyMs: number;
  error: string | null;
}> {
  const config = getProviderConfig().cscs;
  const now = options.now ?? Date.now;
  const started = now();

  if (config.apiKey === null) {
    return {
      ok: false,
      text: null,
      status: "skipped",
      model: config.model,
      latencyMs: 0,
      error: "CSCS_INFERENCE_API_KEY is not configured; using the deterministic path.",
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ] satisfies CscsMessage[],
        max_tokens: options.maxTokens ?? 700,
        temperature: options.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        text: null,
        status: "failed",
        model: config.model,
        latencyMs: now() - started,
        error: `CSCS responded ${response.status}.`,
      };
    }
    const json = (await response.json()) as ChatCompletionResponse;
    const text = json.choices?.[0]?.message?.content ?? null;
    if (typeof text !== "string" || text.trim().length === 0) {
      return {
        ok: false,
        text: null,
        status: "failed",
        model: json.model ?? config.model,
        latencyMs: now() - started,
        error: "CSCS returned an empty completion.",
      };
    }
    return {
      ok: true,
      text,
      status: "live",
      model: json.model ?? config.model,
      latencyMs: now() - started,
      error: null,
    };
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      text: null,
      status: "failed",
      model: config.model,
      latencyMs: now() - started,
      error: aborted ? "CSCS request timed out." : "CSCS request failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls CSCS and validates the answer against a Zod schema.
 *
 * Anything that does not validate is a failure, not a partial success: the
 * caller then falls back to the deterministic path rather than trusting
 * half-validated model output.
 */
export async function cscsJson<T>(
  schema: ZodType<T>,
  options: CscsCallOptions,
): Promise<CscsCallResult<T>> {
  const result = await cscsChat({ ...options, temperature: options.temperature ?? 0 });
  if (!result.ok || result.text === null) {
    return {
      ok: false,
      value: null,
      status: result.status,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error,
      rawText: null,
    };
  }
  const parsed = extractJson(result.text);
  if (parsed === null) {
    return {
      ok: false,
      value: null,
      status: "failed",
      model: result.model,
      latencyMs: result.latencyMs,
      error: "CSCS answer contained no JSON object.",
      rawText: result.text.slice(0, 500),
    };
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      value: null,
      status: "failed",
      model: result.model,
      latencyMs: result.latencyMs,
      error: `CSCS JSON did not match the contract: ${validated.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")
        .slice(0, 240)}`,
      rawText: result.text.slice(0, 500),
    };
  }
  return {
    ok: true,
    value: validated.data,
    status: "live",
    model: result.model,
    latencyMs: result.latencyMs,
    error: null,
    rawText: result.text.slice(0, 500),
  };
}

/** Pulls the first balanced JSON object out of prose or a fenced block. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1]);
  candidates.push(text);

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i += 1) {
      const char = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const slice = candidate.slice(start, i + 1);
          try {
            return JSON.parse(slice) as unknown;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}
