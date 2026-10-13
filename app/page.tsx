"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@domain";
import { ProviderStatus } from "@/components/ProviderStatus";
import { writeClientSession } from "@/lib/client/session";

interface DraftParticipant {
  participantId: string;
  label: string;
  favorites: string[];
}

interface SelectionState {
  status: "idle" | "loading" | "done" | "error";
  hits: SearchHit[];
  chosenEntityId: string | null;
  error: string | null;
}

const DEMO_GROUP = {
  showLocation: "Berlin",
  participants: [
    { participantId: "p-ada", label: "Ada", favorites: ["Radiohead", "In the Mood for Love", "Piranesi"] },
    { participantId: "p-bo", label: "Bo", favorites: ["Nina Simone", "Seven Samurai"] },
    { participantId: "p-cy", label: "Cy", favorites: ["Daft Punk", "Blade Runner"] },
  ],
};

let participantSeq = 0;
const nextId = (): string => {
  participantSeq += 1;
  return `p-${Date.now().toString(36)}-${participantSeq}`;
};

export default function HomePage() {
  const router = useRouter();
  const [showLocation, setShowLocation] = useState("");
  const [participants, setParticipants] = useState<DraftParticipant[]>([
    { participantId: "p-1", label: "Person 1", favorites: ["", ""] },
    { participantId: "p-2", label: "Person 2", favorites: ["", ""] },
  ]);
  const [selections, setSelections] = useState<Record<string, SelectionState>>({});
  const [phase, setPhase] = useState<"edit" | "planning">("edit");
  const [planError, setPlanError] = useState<string | null>(null);

  const selectionKey = (participantId: string, favorite: string): string =>
    `${participantId}::${favorite.trim().toLowerCase()}`;

  const filledFavorites = useMemo(
    () =>
      participants.flatMap((participant) =>
        participant.favorites
          .map((favorite) => favorite.trim())
          .filter((favorite) => favorite.length > 0)
          .map((favorite) => ({ participantId: participant.participantId, favorite })),
      ),
    [participants],
  );

  const resolvedCount = filledFavorites.filter((entry) => {
    const state = selections[selectionKey(entry.participantId, entry.favorite)];
    return state?.status === "done" && state.chosenEntityId !== null;
  }).length;

  const unresolvedAmbiguity = filledFavorites.some((entry) => {
    const state = selections[selectionKey(entry.participantId, entry.favorite)];
    if (!state || state.status !== "done") return false;
    return state.chosenEntityId === null;
  });

  const updateParticipant = useCallback(
    (participantId: string, patch: Partial<DraftParticipant>) => {
      setParticipants((current) =>
        current.map((participant) =>
          participant.participantId === participantId ? { ...participant, ...patch } : participant,
        ),
      );
    },
    [],
  );

  function loadDemo(): void {
    setShowLocation(DEMO_GROUP.showLocation);
    setParticipants(
      DEMO_GROUP.participants.map((participant) => ({
        participantId: participant.participantId,
        label: participant.label,
        favorites: [...participant.favorites],
      })),
    );
    setSelections({});
    setPlanError(null);
  }

  async function resolveAll(): Promise<void> {
    setPlanError(null);
    const entries = filledFavorites;
    setSelections((current) => {
      const next = { ...current };
      for (const entry of entries) {
        const key = selectionKey(entry.participantId, entry.favorite);
        next[key] = { status: "loading", hits: [], chosenEntityId: null, error: null };
      }
      return next;
    });

    // Sequential on purpose: the issued Qloo key is rate limited, and the
    // search route is cheap but should not be fired in a burst.
    for (const entry of entries) {
      const key = selectionKey(entry.participantId, entry.favorite);
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: entry.favorite, take: 6 }),
        });
        const json = (await response.json()) as { results?: SearchHit[]; message?: string };
        const hits = json.results ?? [];
        const normalised = entry.favorite.trim().toLowerCase();
        const exact = hits.find((hit) => hit.name.trim().toLowerCase() === normalised);
        setSelections((current) => ({
          ...current,
          [key]: {
            status: "done",
            hits,
            chosenEntityId: exact?.entityId ?? (hits.length === 1 ? hits[0]!.entityId : null),
            error: hits.length === 0 ? (json.message ?? "Qloo returned no match.") : null,
          },
        }));
      } catch {
        setSelections((current) => ({
          ...current,
          [key]: {
            status: "error",
            hits: [],
            chosenEntityId: null,
            error: "Search request failed.",
          },
        }));
      }
    }
  }

  async function createPlan(): Promise<void> {
    setPlanError(null);
    const withEntities = participants.map((participant) => {
      const confirmedEntityIds: string[] = [];
      for (const favorite of participant.favorites) {
        const trimmed = favorite.trim();
        if (!trimmed) continue;
        const state = selections[selectionKey(participant.participantId, trimmed)];
        if (state?.chosenEntityId) confirmedEntityIds.push(state.chosenEntityId);
      }
      return {
        participantId: participant.participantId,
        label: participant.label.trim() || "Participant",
        favorites: participant.favorites.map((f) => f.trim()).filter(Boolean),
        excludeHints: [],
        confirmedEntityIds: [...new Set(confirmedEntityIds)],
        consentTimestamp: Date.now(),
      };
    });

    const thin = withEntities.filter((p) => p.confirmedEntityIds.length < 1);
    if (thin.length > 0) {
      setPlanError(
        `Confirm at least one Qloo match for ${thin.map((p) => p.label).join(", ")} before planning.`,
      );
      return;
    }

    setPhase("planning");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "new",
          showLocation: { query: showLocation.trim() },
          participants: withEntities,
        }),
      });
      const json = (await response.json()) as {
        sessionId?: string;
        plan?: unknown;
        trace?: unknown;
        sessionToken?: string | null;
        message?: string;
      };
      if (!response.ok || !json.sessionId || !json.plan) {
        setPlanError(json.message ?? "The plan could not be created.");
        setPhase("edit");
        return;
      }
      writeClientSession({
        sessionId: json.sessionId,
        plan: json.plan as never,
        trace: (json.trace ?? []) as never,
        // Carried so a veto can be served by any isolate, not just the one that
        // built this plan. Null when the deployment has no signing key.
        token: json.sessionToken ?? undefined,
      });
      router.push("/shortlist");
    } catch {
      setPlanError("The plan request failed before it reached the server.");
      setPhase("edit");
    }
  }

  const canAddParticipant = participants.length < 4;
  const canRemoveParticipant = participants.length > 2;

  return (
    <div className="stack-lg">
      <section className="stack">
        <h1>Find one venue a whole group can say yes to</h1>
        <p className="lede">
          Everyone names a few things they genuinely love — an artist, a film, a book. Encore
          Commons resolves those to real Qloo entities, discovers places near your show, scores
          every place for every person on the same evidence, and explains where the group actually
          lands. If someone vetoes the pick, it replans.
        </p>
        <ProviderStatus />
      </section>

      <section className="card stack" aria-labelledby="step-1">
        <h2 id="step-1">
          <span className="step-marker" aria-hidden="true">
            1
          </span>
          Set the night
        </h2>

        <div>
          <label htmlFor="location">Where is the show?</label>
          <input
            id="location"
            type="text"
            value={showLocation}
            onChange={(event) => setShowLocation(event.target.value)}
            placeholder="e.g. Berlin, or a neighbourhood you are heading to"
            autoComplete="off"
            aria-describedby="location-hint"
          />
          <p className="hint" id="location-hint">
            You enter this yourself. It is never inferred from a concert database, and it is used to
            restrict venue search and to work out straight-line distance only.
          </p>
        </div>

        <div className="row">
          <button type="button" className="secondary" onClick={loadDemo}>
            Use the demo group (Berlin)
          </button>
          <span className="hint" style={{ margin: 0 }}>
            Three people with deliberately different tastes, so you can see the group effect
            immediately.
          </span>
        </div>
      </section>

      <section className="card stack" aria-labelledby="step-2">
        <h2 id="step-2">
          <span className="step-marker" aria-hidden="true">
            2
          </span>
          Who is coming, and what do they love?
        </h2>
        <p className="hint">
          Two to four people, two to five favourites each. Use a pseudonym — there is no account and
          nothing identifying is stored. Only the confirmed entities are sent to Qloo.
        </p>

        <div className="stack">
          {participants.map((participant, index) => (
            <fieldset
              key={participant.participantId}
              className="stack"
              style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "0.9rem" }}
            >
              <legend style={{ fontWeight: 700, padding: "0 0.4rem" }}>
                Person {index + 1}
              </legend>
              <div>
                <label htmlFor={`label-${participant.participantId}`}>Pseudonym</label>
                <input
                  id={`label-${participant.participantId}`}
                  type="text"
                  value={participant.label}
                  maxLength={40}
                  onChange={(event) =>
                    updateParticipant(participant.participantId, { label: event.target.value })
                  }
                />
              </div>

              {participant.favorites.map((favorite, favoriteIndex) => {
                const key = selectionKey(participant.participantId, favorite);
                const state = selections[key];
                return (
                  <div key={`${participant.participantId}-fav-${favoriteIndex}`} className="stack">
                    <div>
                      <label htmlFor={`fav-${participant.participantId}-${favoriteIndex}`}>
                        Favourite {favoriteIndex + 1}
                      </label>
                      <div className="row">
                        <input
                          id={`fav-${participant.participantId}-${favoriteIndex}`}
                          type="text"
                          value={favorite}
                          style={{ flex: "1 1 220px" }}
                          placeholder="An artist, film, TV show, book, podcast or game"
                          onChange={(event) => {
                            const next = [...participant.favorites];
                            next[favoriteIndex] = event.target.value;
                            updateParticipant(participant.participantId, { favorites: next });
                          }}
                        />
                        {participant.favorites.length > 2 ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              updateParticipant(participant.participantId, {
                                favorites: participant.favorites.filter(
                                  (_, i) => i !== favoriteIndex,
                                ),
                              })
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {state ? <MatchPicker state={state} participantId={participant.participantId} favorite={favorite} onChoose={(entityId) => setSelections((current) => ({ ...current, [key]: { ...state, chosenEntityId: entityId } }))} /> : null}
                  </div>
                );
              })}

              <div className="row">
                {participant.favorites.length < 5 ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      updateParticipant(participant.participantId, {
                        favorites: [...participant.favorites, ""],
                      })
                    }
                  >
                    Add a favourite
                  </button>
                ) : null}
                {canRemoveParticipant ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      setParticipants((current) =>
                        current.filter((p) => p.participantId !== participant.participantId),
                      )
                    }
                  >
                    Remove this person
                  </button>
                ) : null}
              </div>
            </fieldset>
          ))}
        </div>

        {canAddParticipant ? (
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setParticipants((current) => [
                  ...current,
                  {
                    participantId: nextId(),
                    label: `Person ${current.length + 1}`,
                    favorites: ["", ""],
                  },
                ])
              }
            >
              Add another person
            </button>
          </div>
        ) : (
          <p className="hint">The demo supports up to four people.</p>
        )}
      </section>

      <section className="card stack" aria-labelledby="step-3">
        <h2 id="step-3">
          <span className="step-marker" aria-hidden="true">
            3
          </span>
          Confirm the matches, then find the venue
        </h2>
        <p className="hint">
          Encore Commons only scores entities a human has confirmed. Confirm what Qloo resolved, then
          plan. Nothing is scored against a guess.
        </p>

        <div className="row">
          <button
            type="button"
            className="secondary"
            onClick={() => void resolveAll()}
            disabled={filledFavorites.length === 0 || !showLocation.trim()}
          >
            Resolve favourites with Qloo
          </button>
          <button
            type="button"
            onClick={() => void createPlan()}
            disabled={phase === "planning" || !showLocation.trim() || unresolvedAmbiguity}
          >
            {phase === "planning" ? "Planning…" : "Find a venue everyone can agree on"}
          </button>
          <span className="hint" style={{ margin: 0 }} aria-live="polite">
            {resolvedCount} of {filledFavorites.length} favourites confirmed
          </span>
        </div>

        {!showLocation.trim() ? (
          <p className="notice warn">Enter the show location before resolving or planning.</p>
        ) : null}
        {unresolvedAmbiguity ? (
          <p className="notice warn">
            One or more favourites matched several Qloo entities. Choose the right one so a guess is
            never scored.
          </p>
        ) : null}
        {planError ? (
          <p className="notice danger" role="alert">
            {planError}
          </p>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="limits">
        <h2 id="limits">What this does not claim</h2>
        <ul className="list-tight">
          <li>
            Qloo affinity is a cultural-fit signal between confirmed favourites and a venue. It is
            not proof that anyone will enjoy the night.
          </li>
          <li>Distance is straight-line, not a walking route or travel time.</li>
          <li>
            Opening hours, price, accessibility, allergy handling and availability are third-party
            metadata or unknown. Confirm them with the venue.
          </li>
          <li>Nothing is booked, reserved or paid for.</li>
        </ul>
      </section>
    </div>
  );
}

function MatchPicker({
  state,
  participantId,
  favorite,
  onChoose,
}: {
  state: SelectionState;
  participantId: string;
  favorite: string;
  onChoose: (entityId: string) => void;
}) {
  const id = `match-${participantId}-${favorite.replace(/\W+/g, "-").toLowerCase() || "x"}`;
  if (state.status === "loading") {
    return (
      <p className="hint" role="status">
        Resolving “{favorite}” with Qloo…
      </p>
    );
  }
  if (state.status === "error" || state.hits.length === 0) {
    return (
      <p className="notice warn">
        {state.error ?? `Qloo found no match for “${favorite}”.`} Try the full official title or
        another favourite.
      </p>
    );
  }
  return (
    <div>
      <label htmlFor={id}>
        Qloo match for “{favorite}” {state.chosenEntityId ? "— confirmed" : "— needs confirmation"}
      </label>
      <select
        id={id}
        value={state.chosenEntityId ?? ""}
        onChange={(event) => onChoose(event.target.value)}
      >
        <option value="">Choose the right match…</option>
        {state.hits.map((hit) => (
          <option key={hit.entityId} value={hit.entityId}>
            {hit.name}
            {hit.disambiguation ? ` — ${hit.disambiguation}` : ""}
            {hit.types[0] ? ` (${hit.types[0].replace("urn:entity:", "")})` : ""}
          </option>
        ))}
      </select>
      {!state.chosenEntityId ? (
        <p className="hint" role="status">
          {state.hits.length} possible match{state.hits.length === 1 ? "" : "es"} — pick one so
          nothing is guessed.
        </p>
      ) : null}
    </div>
  );
}
