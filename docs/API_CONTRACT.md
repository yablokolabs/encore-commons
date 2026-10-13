# Verified API contract

Verified live on **2026-10-13** (Asia/Kolkata) against the organiser-supplied
hackathon origin. Every request below was executed for real; the samples are
sanitised (the credential header is omitted, entity ids are the provider's own).
Nothing here was inferred from a documentation example alone.

Sources read before testing:

- Hackathon guide — <https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide>
- Entity type parameter guide — <https://docs.qloo.com/reference/available-parameters-by-entity-type>
- Location-based insights — <https://docs.qloo.com/reference/insights-with-location-use-case>
- Parameter overview — <https://docs.qloo.com/reference/parameter-overview>
- CSCS inference API — <https://docs.cscs.ch/services/inference/api/#llm-inference-api-service>

## Qloo

| Item | Verified value |
| --- | --- |
| Origin | `https://hackathon.api.qloo.com` (not `api.qloo.com`, not `staging.api.qloo.com`) |
| Auth | `X-Api-Key: <key>` request header. A bearer token or a query parameter returns 401. |
| Search route | `/search` (no version segment) |
| Insights route | `/v2/insights` (versioned) |
| Tags route | `/v2/tags` |
| Method | `GET` for all three. A `POST` with a JSON body to `/v2/insights` returns 400. |
| Credential shape | 45 characters, user-reported in `~/.hermes/.env` as `QLOO_API_KEY`. Values are never printed. |
| Rate limiting | Observed. A tripped rate limit answers **HTTP 200** with `{"error_msg":"Rate limit exceeded"}` rather than a 429, so it must be detected from the body. |

### Routes are composed explicitly

The origin is stored **without** a version path, and each route carries its own
version segment. `/search` is unversioned while `/v2/insights` is versioned, so a
single global `/v2` prefix would break search and duplicate the prefix on
insights. `QLOO_ROUTES` in `lib/qloo/client.ts` is the single place these live,
and a unit test asserts the composed path is exactly `/v2/insights`.

### Entity types differ between search and insights

The developer guide warns about this and it is real:

- `/search?types=` accepts `urn:entity:actor, album, artist, author, book, brand,
  destination, director, locality, movie, person, place, podcast, tv_show,
  videogame, demographics, tag`. Note `urn:entity:videogame` (no underscore).
- `/v2/insights?filter.type=` accepts `urn:entity:artist, book, brand,
  destination, movie, person, place, podcast, tv_show, video_game` (with an
  underscore). An unsupported value returns 403.

Passing `urn:entity:video_game` to `/search` returns 400. The two vocabularies
are kept separate in `packages/domain/src/schemas.ts`.

### Parameters verified by real request

| Parameter | Verified behaviour |
| --- | --- |
| `take` | Integer, **1–50**. `take=100` returns `{"errors":[{"message":"take must be an integer value between 1 and 50"}]}`. |
| `signal.interests.entities` | Comma-separated **raw entity ids**. Prefixing with `urn:entity:artist:` returns `the signal.interests.entities parameter contains invalid entity ids`. |
| `filter.location.query=<city>` | Restricts place results to that city. `Berlin` returned Berlin places; `Lisbon` returned Lisbon places. |
| `filter.location=POINT(lon lat)` + `filter.location.radius=<m>` | Restricts around coordinates. WKT is required: `filter.location=52.52,13.405` returns `WKT format is invalid and cannot be parsed`. |
| `signal.location.query=<text>` | Returned Barcelona, Lisbon and Rome for a Berlin query. It behaves as a location **signal**, not a restriction. The app therefore prefers `filter.location` / `filter.location.query` for restriction. |
| `filter.results.entities=<id,id>` | Returns **exactly** the requested entities and still populates `query.affinity`. This is the mechanism that makes one shared candidate set comparable across participants. |
| `filter.exclude.entities=<id>` | Removes that entity from the result set. |
| `query.affinity` | Per-entity affinity for the supplied signal set, e.g. `0.8986405609541313`. A relative 0–1 signal. Not a probability and not calibrated to an individual. |

Unsupported parameters are **silently ignored** rather than erroring, so an empty
result is not proof of a data problem. The app validates parameters against the
documented list instead of inferring correctness from a 200 response.

### Sanitised live samples

`fixtures/contract/search-radiohead.json` — `GET /search?query=Radiohead&types=urn:entity:artist&take=2`
resolved to `Radiohead`, `entity_id=70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C`,
`types=["urn:entity:artist"]`, tags `Electronic, Indie, Alternative Rock, Rock`.

`fixtures/contract/insights-place.json` — `GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<id>&filter.location.query=Berlin&take=3`
returned real places with `query.affinity`, `location.lat/lon`, `geocode`
(`city`, `country_code`, `neighborhood`), `hours`, `phone`, `website` and
`business_rating`.

### Caching and data rights

The hackathon guide states private server-side caching is permitted with no time
limit, but Qloo response data must **not** be stored in a public repository,
because that publishes it outside the terms of the key. Consequences applied here:

- The short-lived session store holds provider results **in memory** only.
- `fixtures/replay/*.json` contains a sanitised subset used by the test suite. It
  is deliberately small, contains no credential and is documented as test data
  rather than a redistributable dataset. If the terms require it to be removed
  from a public repository, delete the fixtures and run the tests against live
  credentials instead — the suite is written to work either way.

## CSCS

| Item | Verified value |
| --- | --- |
| Base URL | `https://api.inference.cscs.ch/v1` |
| Auth | `Authorization: Bearer <key>` |
| Models route | `GET /v1/models` → 200 |
| Chat route | `POST /v1/chat/completions` → 200 |
| Selected model | `swiss-ai/Apertus-v1.5-70B` |
| Credential shape | 40 characters, user-reported in `~/.hermes/.env` as `CSCS_INFERENCE_API_KEY`. Value never printed. |

Live model list (11 entries) includes `swiss-ai/Apertus-v1.5-70B`,
`swiss-ai/Apertus-v1.5-70B-thinking`, `swiss-ai/Apertus-v1.5-8B`,
`swiss-ai/Apertus-70B-Instruct-2509` and others. **The app pins the 70B model and
never falls back to the 8B variant.** Verified reply latency for a minimal call
was 574 ms.

## What is deliberately not claimed

- No booking, reservation, payment, ticketing or calendar integration exists or
  is attempted.
- Distance is straight-line between coordinates, never a walking route or time.
- Provider hours, price, ratings, access and availability are unverified
  third-party metadata and are labelled `verified: false` everywhere they surface.
- Affinity is cultural fit between confirmed favourites and a venue. It is not a
  probability of enjoyment and it is not calibrated to any individual.
