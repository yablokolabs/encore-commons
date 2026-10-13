"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Plan, ScoredCandidate, TraceStep } from "@domain";
import { formatStraightLine } from "@domain";
import { ScoreMeter } from "@/components/ScoreMeter";
import { clearClientSession, readClientSession, writeClientSession } from "@/lib/client/session";

const provenanceCopy: Record<string, { label: string; className: string; note: string }> = {
  cscs_grounded: {
    label: "CSCS Apertus 1.5 70B",
    className: "badge live",
    note: "Model-worded summary of the provider facts below. The wording is an interpretation; the numbers and facts are not.",
  },
  deterministic_template: {
    label: "Deterministic template",
    className: "badge warn",
    note: "Assembled directly from the provider facts because the language model step was unavailable. No model wording is presented as its own.",
  },
  qloo_explainability: {
    label: "Qloo explainability",
    className: "badge live",
    note: "Returned by the provider itself.",
  },
};

export default function ShortlistPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [vetoParticipant, setVetoParticipant] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replanBudget, setReplanBudget] = useState<number | null>(null);

  useEffect(() => {
    const session = readClientSession();
    if (session) {
      setPlan(session.plan);
      setTrace(session.trace);
      setSessionId(session.sessionId);
      setVetoParticipant(session.plan.profiles[0]?.participantId ?? "");
    }
  }, []);

  const candidateById = useMemo(() => {
    const map = new Map<string, ScoredCandidate>();
    for (const score of plan?.scores ?? []) map.set(score.candidateId, score);
    return map;
  }, [plan]);

  const selected = plan?.selectedCandidateId ? candidateById.get(plan.selectedCandidateId) : undefined;
  const alternatives = (plan?.alternativeCandidateIds ?? [])
    .map((id) => candidateById.get(id))
    .filter((score): score is ScoredCandidate => score !== undefined);
  const vetoed = (plan?.scores ?? []).filter((score) => score.excludedByVeto.length > 0);
  const selectedRaw = plan?.candidates.find((c) => c.entityId === plan.selectedCandidateId);
  const alternativesRaw = (plan?.alternativeCandidateIds ?? [])
    .map((id) => plan?.candidates.find((c) => c.entityId === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  const provenance = plan ? (provenanceCopy[plan.explanation.provenance] ?? provenanceCopy["deterministic_template"]!) : null;
  const labelById = new Map((plan?.profiles ?? []).map((p) => [p.participantId, p.label]));

  async function veto(candidateId: string): Promise<void> {
    if (!sessionId || !plan || !vetoParticipant) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/veto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          participantId: vetoParticipant,
          candidateId,
          expectedRevision: plan.revision,
        }),
      });
      const json = (await response.json()) as {
        plan?: Plan;
        trace?: TraceStep[];
        replanBudgetRemaining?: number;
        message?: string;
        error?: string;
      };
      if (!response.ok || !json.plan) {
        setError(json.message ?? "The veto could not be applied.");
        return;
      }
      setPlan(json.plan);
      setTrace(json.trace ?? []);
      writeClientSession({ sessionId, plan: json.plan, trace: json.trace ?? [] });
      setReplanBudget(json.replanBudgetRemaining ?? null);
      setNotice(
        json.plan.selectedCandidateId
          ? `Veto recorded. Revision ${json.plan.revision} proposes a new option.`
          : `Veto recorded. Revision ${json.plan.revision} has no option left with comparable evidence.`,
      );
    } catch {
      setError("The veto request failed before it reached the server.");
    } finally {
      setBusy(false);
    }
  }

  function startOver(): void {
    clearClientSession();
    setPlan(null);
    setTrace([]);
    setSessionId(null);
  }

  if (!plan) {
    return (
      <div className="stack">
        <h1>No plan in this tab yet</h1>
        <p className="lede">
          Build a group and a show location first. Plans live only in this browser tab and the
          server's short-lived session memory, so they disappear when the tab closes.
        </p>
        <p>
          <Link href="/">Plan a night →</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <section className="stack">
        <h1>Shortlist near {plan.showLocation}</h1>
        <div className="row">
          <span className={plan.providerStatus.qloo === "live" ? "badge live" : plan.providerStatus.qloo === "replay" ? "badge replay" : "badge danger"}>
            {plan.providerStatus.qloo === "live"
              ? "Qloo live"
              : plan.providerStatus.qloo === "replay"
                ? "Qloo replay (recorded, not live)"
                : plan.providerStatus.qloo === "partial"
                  ? "Qloo partial"
                  : "Qloo unavailable"}
          </span>
          <span className="badge">Revision {plan.revision}</span>
          <span className="badge">{plan.candidates.length} candidate places compared</span>
          <span className="badge">{plan.scores.filter((s) => s.worstAffinity !== null).length} ranked</span>
          <span className="badge">
            {Math.min(plan.replansUsed, 2)} of 2 replans used
            {replanBudget === null ? "" : ` · ${replanBudget} left`}
          </span>
          <button type="button" className="secondary" onClick={startOver}>
            Start a new group
          </button>
        </div>
        {plan.providerStatus.qloo === "replay" ? (
          <p className="notice warn">
            This plan is based on <strong>recorded Qloo responses replayed offline</strong>. It
            exercises the real pipeline but it is not a live provider call, and the interface says so
            everywhere the result appears.
          </p>
        ) : null}
        {notice ? (
          <p className="notice ok" role="status" aria-live="polite">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="notice danger" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {selected && selectedRaw ? (
        <section className="card stack" aria-labelledby="proposal">
          <h2 id="proposal">The proposed venue</h2>
          <div className="grid-2">
            <div className="stack">
              {selectedRaw.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="venue-thumb" src={selectedRaw.imageUrl} alt="" loading="lazy" />
              ) : null}
              <h3 style={{ margin: 0 }}>{selected.name}</h3>
              <div className="row">
                <span className="badge">Worst-person affinity {selected.worstAffinity?.toFixed(3)}</span>
                <span className="badge">Mean {selected.meanAffinity?.toFixed(3)}</span>
                <span className="badge">{Math.round(selected.coverage * 100)}% coverage</span>
                {selected.straightLineDistanceM !== null ? (
                  <span className="badge">{formatStraightLine(selected.straightLineDistanceM)}</span>
                ) : null}
              </div>
              {selectedRaw.providerDescription ? (
                <p className="hint">{selectedRaw.providerDescription}</p>
              ) : null}
              {selected.tags.length > 0 ? (
                <p className="hint">Provider tags: {selected.tags.slice(0, 6).join(", ")}</p>
              ) : null}
            </div>
            <div className="stack">
              <h3>Fit, person by person</h3>
              <ul className="score-list">
                {plan.profiles.map((profile) => (
                  <ScoreMeter
                    key={profile.participantId}
                    label={profile.label}
                    evidence={selected.evidences.find((e) => e.participantId === profile.participantId)}
                  />
                ))}
              </ul>
              <p className="hint">
                Affinity runs from 0 to 1 on a relative scale for each person's confirmed favourites.
                It is not a percentage of enjoyment, and a hatched bar means unknown — never zero.
              </p>
            </div>
          </div>

          <div>
            <h3>Why this one</h3>
            {provenance ? (
              <p className="row" style={{ marginBottom: "0.4rem" }}>
                <span className={provenance.className}>{provenance.label}</span>
                <span className="hint" style={{ margin: 0 }}>
                  {provenance.note}
                </span>
              </p>
            ) : null}
            <p>{plan.explanation.text}</p>
            {plan.explanation.fallbackReason ? (
              <p className="hint">Fallback reason: {plan.explanation.fallbackReason}</p>
            ) : null}
          </div>

          <div className="grid-2">
            <div>
              <h3>Reported by the provider</h3>
              {selected.facts.length > 0 ? (
                <ul className="list-tight">
                  {selected.facts.map((fact, index) => (
                    <li key={`${fact.field}-${index}`}>
                      <strong>{fact.field}</strong>: {fact.value}{" "}
                      <span className="badge warn">unverified</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">The provider returned no venue facts for this place.</p>
              )}
              <p className="hint">
                These are third-party metadata, observed at the recorded timestamp. They are not
                confirmation of the venue's hours, price, access or allergy handling today.
              </p>
              {selected.sourceUrl ? (
                <p>
                  <a href={selected.sourceUrl} rel="noreferrer noopener" target="_blank">
                    Provider source for this venue
                  </a>
                </p>
              ) : null}
            </div>
            <div>
              <h3>Still to confirm with the venue</h3>
              <ul className="list-tight">
                {selected.unknowns.map((unknown) => (
                  <li key={unknown.field}>
                    <strong>{unknown.field}</strong> — {unknown.reason} {unknown.needsVerification}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : (
        <section className="card stack">
          <h2>No venue with comparable evidence for everyone</h2>
          <p>
            Encore Commons will not propose a venue it cannot score for every participant. Add a
            second well-known favourite for each person and run the plan again.
          </p>
          <p>
            <Link href="/">Back to the group setup →</Link>
          </p>
        </section>
      )}

      <section className="stack" aria-labelledby="alternatives">
        <h2 id="alternatives">Alternatives on the same evidence</h2>
        <p className="hint">
          Ranked by the worst person's affinity first, then the group mean, then coverage and venue
          variety. Veto any of these and the plan is rebuilt from the same discovery.
        </p>
        <div className="grid-3">
          {alternatives.map((score, index) => {
            const raw = alternativesRaw[index];
            return (
              <article key={score.candidateId} className="venue-card">
                {raw?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="venue-thumb" src={raw.imageUrl} alt="" loading="lazy" />
                ) : null}
                <span className="venue-rank">Alternative {index + 1}</span>
                <h3 style={{ margin: 0 }}>{score.name}</h3>
                <div className="row">
                  <span className="badge">Worst {score.worstAffinity?.toFixed(3)}</span>
                  <span className="badge">Mean {score.meanAffinity?.toFixed(3)}</span>
                  {score.straightLineDistanceM !== null ? (
                    <span className="badge">{formatStraightLine(score.straightLineDistanceM)}</span>
                  ) : null}
                </div>
                <ul className="score-list">
                  {plan.profiles.map((profile) => (
                    <ScoreMeter
                      key={profile.participantId}
                      label={profile.label}
                      evidence={score.evidences.find((e) => e.participantId === profile.participantId)}
                    />
                  ))}
                </ul>
                <details>
                  <summary>Unknowns to verify</summary>
                  <ul className="list-tight">
                    {score.unknowns.map((unknown) => (
                      <li key={unknown.field}>
                        <strong>{unknown.field}</strong> — {unknown.needsVerification}
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="row">
                  <label htmlFor={`veto-by-${score.candidateId}`} className="sr-only">
                    Which participant is vetoing {score.name}
                  </label>
                  <select
                    id={`veto-by-${score.candidateId}`}
                    value={vetoParticipant}
                    onChange={(event) => setVetoParticipant(event.target.value)}
                    style={{ maxWidth: "190px" }}
                  >
                    {plan.profiles.map((profile) => (
                      <option key={profile.participantId} value={profile.participantId}>
                        {profile.label} vetoes
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => void veto(score.candidateId)}
                  >
                    Veto and replan
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {vetoed.length > 0 ? (
        <section className="card stack" aria-labelledby="vetoed">
          <h2 id="vetoed">Removed by a veto, not scored down</h2>
          <p className="hint">
            A veto is a hard exclusion. These places are kept visible with the reason and the
            evidence they had, because hiding them would hide the group's decision.
          </p>
          <ul className="list-tight">
            {vetoed.map((score) => (
              <li key={score.candidateId}>
                <strong>{score.name}</strong> — excluded for{" "}
                {score.excludedByVeto.map((id) => labelById.get(id) ?? id).join(", ")}. It had a
                worst-person affinity of {score.worstAffinity?.toFixed(3) ?? "unknown"}.
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="limits">
        <h2 id="limits">Limitations of this plan</h2>
        <ul className="list-tight">
          {plan.limitations.map((limitation, index) => (
            <li key={index}>{limitation}</li>
          ))}
        </ul>
        {plan.needsClarification.length > 0 ? (
          <>
            <h3>Needs a human answer</h3>
            <ul className="list-tight">
              {plan.needsClarification.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
        <p>
          <Link href="/trace">Inspect what the agent actually did →</Link>
        </p>
      </section>

      <p className="hint">
        {trace.length} recorded agent steps for this revision. Every provider call, its status, its
        result count and its latency are listed on the trace page.
      </p>
    </div>
  );
}
