# Sites + Qloo + CSCS deployment contract

## Selected architecture
Browser → Sites server route → Qloo entity lookup/Insights → deterministic group ranking → CSCS Apertus 1.5 70B grounded explanation → browser. Only server routes access credentials. CSCS interprets requests and proposes typed plans; the controller validates and executes allowlisted Qloo tools. Neither model may invent candidates, alter hard exclusions or book anything.

Use Sites' current supported Vinext starter and native build integration. Hosted server is Cloudflare Workers: HTTP/HTTPS external calls, no raw TCP; do not rely on persistent process memory, local credential files, filesystem databases or long-running background workers. Enforce per-request deadlines, bounded tool steps and result sizes. Optional durable sessions use D1; no storage is needed for short anonymous trial state if not persisted. Follow installed Sites skill/helpers during actual implementation and packaging, not guessed shell commands.

## Required keys and model
QLOO_API_KEY: obtain through https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key . The guide is linked by the supplied competition attachment. Verify actual issued host/authentication and plan restrictions. User now reports the Qloo key is already in ~/.hermes/.env; access and issued host remain unverified. Do not ask them to obtain another key unnecessarily.
CSCS_INFERENCE_API_KEY: map the user's existing CSCS credential securely. User previously reported keys in ~/.hermes/.env; exact CSCS variable name remains unconfirmed. Inspect names only, parse required entry without shell-sourcing, never dump/copy the file or unrelated secrets. If the file is on another host, report it rather than pretending access.
CSCS_BASE_URL=https://api.inference.cscs.ch/v1
CSCS_MODEL=swiss-ai/Apertus-v1.5-70B

Confirm the exact model through /models; run a small real /chat/completions test. Keep 70B default. Never silently switch to 8B, HF, OpenAI or another model. The user chose CSCS; no new provider-choice approval is needed. Confirm allocation terms if restrictions on separate-project use remain unclear. Qloo and CSCS are distinct services requiring distinct credentials.

For published hosting, configure values through Sites runtime secrets/settings using supported native tools. Sites cannot read ~/.hermes/.env on the local machine. Never include values in client bundles, .openai/hosting.json, .env.example, screenshots, checkpoints or ZIP. Local env file must be ignored; document variable names only.

## Agent implementation
Validate CSCS JSON: intent, confirmed participant references, requested actions, needsClarification, explanation references. Treat unknown or ambiguous entities as clarification, not invented Qloo UUIDs. Tool allowlist: search entities, fetch documented recommendations, compare validated candidates, apply veto, regenerate explanation. Limit one request to a small bounded call budget, at most two replans, with explicit errors for malformed output or quota exhaustion.

Only send necessary pseudonymous taste signals and verified candidate facts to CSCS. Explainability is Qloo-derived when returned; model language is an interpretation and labeled accordingly. Validate each mentioned venue and evidence reference against the current candidate snapshot. If CSCS fails, use a clearly labeled deterministic explanation template; if Qloo fails, no fake live discovery. Show incomplete coverage and constraints that require venue verification.

## Sites workflow and eligibility
Develop from an empty project subdirectory using official Sites starter. Test full local flow and fresh runtime build. Prepare native source/package workflow, record actual saved version/commit, then publish when authorized. Keep review versions private while unfinished. Final hackathon demo must be public to anyone on internet and usable signed out; account/workspace public-publishing availability must be confirmed. A private Sites URL or a static marketing page does not satisfy the attached functional demo requirement.

Public source repository is separate from hosted Sites access: include source, assets, license and run/deployment instructions. Never publish secrets or personally identifiable trial data. Test the externally deployed app in a fresh anonymous browser, including Qloo and CSCS calls, missing keys, quota errors, invalid requests and mobile layout. Add server-side abuse controls before anonymous launch.

## Branding and no-footer acceptance
Use assets/encore-commons-logo.png for wordmark/tagline and assets/encore-commons-icon.png for app icon. They are generated raster originals, not SVG. Adapt icon/favicon formats during implementation using ordinary asset tooling; preserve originals. No footer components, attribution strips, copyright bars or closing blocks on any screen/export/report. Licensing belongs in LICENSE and substantive documentation.

## Source references
https://learn.chatgpt.com/docs/sites?surface=app
https://docs.cscs.ch/services/inference/api/#llm-inference-api-service
https://github.com/qloo/docs-public
These describe capabilities, not evidence that this application is already built or deployed.

User also reports the ElevenLabs key in the same env file; it is for local narration production. See docs/MEDIA_WORKFLOWS.md for secure mapping and voice selection.

## Confirmed Qloo hackathon server
Organizer-supplied server URL: https://hackathon.api.qloo.com . Use this origin for the issued hackathon key, not the generic production server. User reports the API key in ~/.hermes/.env; identify its actual variable name safely. Read https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide for authentication and endpoint paths. The supplied origin does not establish a /v2 base path for every operation: verify documented routes before composing URLs. Keep origin and route composition explicit to avoid duplicated version paths. Do not send this key to unverified hosts. Verify real entity search and Insights calls with sanitized results; key presence does not prove access. Hosted Sites needs a runtime secret because it cannot read the local env file.
