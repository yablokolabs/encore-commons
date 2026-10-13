"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Plan, TraceStep } from "@domain";
import { readClientSession } from "@/lib/client/session";

/**
 * Agent trace.
 *
 * Every allowlisted tool call is listed with its status, latency, result count
 * and a non-reversible fingerprint of its input. Credentials never appear here:
 * the adapters do not put them into errors, and the fingerprint cannot be
 * reversed back into a participant's personal taste.
 */
export default function TracePage() {
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    const session = readClientSession();
    if (session) {
      setTrace(session.trace);
      setPlan(session.plan);
    }
  }, []);

  const totalLatency = trace.reduce((sum, step) => sum + step.latencyMs, 0);
  const errors = trace.filter((step) => step.status === "error");

  return (
    <div className="stack-lg">
      <section className="stack">
        <h1>Agent trace</h1>
        <p className="lede">
          Encore Commons is a bounded state machine, not an open-ended loop: it plans a fixed
          sequence of allowlisted tool calls, checks every provider response, and replans at most
          twice. This page is the receipt.
        </p>
        <div className="row">
          <span className="badge">{trace.length} steps</span>
          <span className="badge">{(totalLatency / 1000).toFixed(2)}s total provider time</span>
          <span className={errors.length > 0 ? "badge danger" : "badge live"}>
            {errors.length} error{errors.length === 1 ? "" : "s"}
          </span>
          {plan ? <span className="badge">Revision {plan.revision}</span> : null}
          <span className="badge">Tool ceiling 40</span>
          <span className="badge">Max replans 2</span>
        </div>
      </section>

      <section className="stack">
        <h2>Allowlisted tools</h2>
        <p className="hint">
          Nothing outside this list can be called: <span className="mono">search_entities</span>,{" "}
          <span className="mono">query_places</span>,{" "}
          <span className="mono">score_candidates</span>, <span className="mono">apply_veto</span>,{" "}
          <span className="mono">explain_plan</span>.
        </p>
      </section>

      {trace.length === 0 ? (
        <p className="notice warn">
          No trace in this tab. <Link href="/">Plan a night</Link> first — the trace is produced by a
          real run.
        </p>
      ) : (
        <section className="card">
          <table>
            <caption>
              One row per tool call. The input fingerprint is a one-way hash, so the trace can be
              inspected without republishing anyone's taste.
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Step</th>
                <th scope="col">Tool</th>
                <th scope="col">Status</th>
                <th scope="col">Results</th>
                <th scope="col">Latency</th>
                <th scope="col">Input fingerprint</th>
                <th scope="col">Entity ids / notes</th>
              </tr>
            </thead>
            <tbody>
              {trace.map((step) => (
                <tr key={step.index}>
                  <td className="mono">{step.index}</td>
                  <td>{step.step}</td>
                  <td className="mono">{step.tool}</td>
                  <td>
                    <span
                      className={
                        step.status === "ok"
                          ? "badge live"
                          : step.status === "error"
                            ? "badge danger"
                            : step.status === "empty"
                              ? "badge warn"
                              : "badge"
                      }
                    >
                      {step.status}
                    </span>
                  </td>
                  <td className="mono">{step.resultCount}</td>
                  <td className="mono">{step.latencyMs} ms</td>
                  <td className="mono">{step.inputHash}</td>
                  <td>
                    {step.entityIds.length > 0 ? (
                      <span className="mono">{step.entityIds.join(", ")}</span>
                    ) : null}
                    {step.warnings.length > 0 ? (
                      <ul className="list-tight">
                        {step.warnings.map((warning, index) => (
                          <li key={index} className="hint">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card stack">
        <h2>What the agent is not allowed to do</h2>
        <ul className="list-tight">
          <li>Invent a venue, an affinity, an opening time, a price or an accessibility claim.</li>
          <li>Turn a missing affinity into a low score: unknown stays unknown.</li>
          <li>Rank a candidate a participant has vetoed, or recover it silently.</li>
          <li>Call anything outside the allowlist, or loop more than twice.</li>
          <li>Book, reserve or pay for anything.</li>
        </ul>
        <p className="hint">
          Language-model wording comes from CSCS Apertus 1.5 70B and is labelled as an
          interpretation. When it is unavailable, the deterministic template is used and labelled
          instead, so provider facts are never passed off as model prose.
        </p>
      </section>
    </div>
  );
}
