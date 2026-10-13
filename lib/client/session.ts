"use client";

import type { Plan, TraceStep } from "@domain";

/**
 * Browser-side session state.
 *
 * Only the plan the browser just received is cached, in sessionStorage, so a
 * page navigation does not re-run a provider call. Nothing durable is written,
 * and closing the tab clears it. The server remains the source of truth for
 * vetoes and revisions.
 */

const KEY = "encore-commons.session.v1";

export interface ClientSession {
  sessionId: string;
  plan: Plan;
  trace: TraceStep[];
  /**
   * Signed session state issued by `/api/plan`, sent back with a veto.
   *
   * It exists because the server cannot assume the veto lands on the same
   * isolate that built the plan. Absent when the deployment has no signing key,
   * in which case the server resolves the session from its own memory.
   */
  token?: string | undefined;
}

export function readClientSession(): ClientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientSession;
    if (!parsed || typeof parsed.sessionId !== "string" || !parsed.plan) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeClientSession(session: ClientSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* sessionStorage can be full or blocked; the server copy still exists. */
  }
}

export function clearClientSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}
