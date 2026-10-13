"use client";

import { useEffect, useState } from "react";

interface HealthResponse {
  providers: {
    qloo: { origin: string; keyPresent: boolean; mode: "live" | "replay" | "failed"; note: string };
    cscs: { baseUrl: string; model: string; keyPresent: boolean; note: string };
  };
}

/**
 * Shows whether this deployment is talking to Qloo live, replaying recorded
 * responses offline, or has no Qloo credential. A judge should never have to
 * guess which one they are looking at.
 */
export function ProviderStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("health"))))
      .then((json: HealthResponse) => {
        if (!cancelled) setHealth(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="notice warn" role="status">
        Provider status could not be read. Discovery and explanations may be unavailable.
      </p>
    );
  }
  if (!health) {
    return (
      <p className="hint" role="status" aria-live="polite">
        Checking provider status…
      </p>
    );
  }

  const { qloo, cscs } = health.providers;
  const qlooClass = qloo.mode === "live" ? "badge live" : qloo.mode === "replay" ? "badge replay" : "badge danger";

  return (
    <div className="row" role="status" aria-live="polite">
      <span className={qlooClass}>
        Qloo: {qloo.mode === "live" ? "live calls" : qloo.mode === "replay" ? "replay (recorded)" : "not configured"}
      </span>
      <span className={cscs.keyPresent ? "badge live" : "badge warn"}>
        {cscs.model}: {cscs.keyPresent ? "live" : "deterministic template"}
      </span>
      <span className="hint" style={{ margin: 0 }}>
        {qloo.mode === "replay" ? qloo.note : `Origin: ${qloo.origin}`}
      </span>
    </div>
  );
}
