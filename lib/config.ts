/**
 * Server-only provider configuration.
 *
 * This module must only be imported from server code (route handlers, scripts,
 * tests). Values are read at call time and never returned to a client bundle.
 * Nothing here is ever logged.
 */

export interface ProviderConfig {
  qloo: {
    origin: string;
    apiKey: string | null;
    /** Explicitly requested offline replay. Never silently substituted for live. */
    replayRequested: boolean;
    timeoutMs: number;
    maxAttempts: number;
  };
  cscs: {
    baseUrl: string;
    apiKey: string | null;
    model: string;
    timeoutMs: number;
  };
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function intEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The organiser-supplied hackathon origin. Kept as an origin (no path, no
 * version segment) so route composition stays explicit and a duplicated
 * `/v2` cannot creep in.
 */
export const QLOO_HACKATHON_ORIGIN = "https://hackathon.api.qloo.com";

export function getProviderConfig(): ProviderConfig {
  return {
    qloo: {
      origin: (readEnv("QLOO_API_ORIGIN") ?? QLOO_HACKATHON_ORIGIN).replace(/\/+$/, ""),
      apiKey: readEnv("QLOO_API_KEY"),
      replayRequested: readEnv("ENCORE_REPLAY_FIXTURES") === "1",
      timeoutMs: intEnv("QLOO_TIMEOUT_MS", 12_000),
      maxAttempts: intEnv("QLOO_MAX_ATTEMPTS", 3),
    },
    cscs: {
      baseUrl: (readEnv("CSCS_BASE_URL") ?? "https://api.inference.cscs.ch/v1").replace(/\/+$/, ""),
      apiKey: readEnv("CSCS_INFERENCE_API_KEY"),
      model: readEnv("CSCS_MODEL") ?? "swiss-ai/Apertus-v1.5-70B",
      timeoutMs: intEnv("CSCS_TIMEOUT_MS", 30_000),
    },
  };
}

/** Names only, for setup diagnostics and the health route. Never values. */
export function describeCredentialStatus(): {
  qlooKeyPresent: boolean;
  cscsKeyPresent: boolean;
  qlooOrigin: string;
  cscsBaseUrl: string;
  cscsModel: string;
} {
  const config = getProviderConfig();
  return {
    qlooKeyPresent: config.qloo.apiKey !== null,
    cscsKeyPresent: config.cscs.apiKey !== null,
    qlooOrigin: config.qloo.origin,
    cscsBaseUrl: config.cscs.baseUrl,
    cscsModel: config.cscs.model,
  };
}
