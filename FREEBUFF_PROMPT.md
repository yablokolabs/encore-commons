# Paste into Freebuff
Build **Encore Commons — Different tastes. One great night.** from scratch for the Qloo Agentic Hackathon. Follow PROJECT_BUILD.md and AGENTS.md. This is an implementation request, not a request for a plan only. Preserve unrelated work.

The product helps a group with different cultural tastes choose a venue around a user-entered show location. Resolve participants' favorite artists/films/books to verified Qloo entities, discover venue candidates using Qloo, compare individual fit, propose a balanced option, and replan after a veto. Make every tool result and uncertainty inspectable.

1. Inventory runtime and existing repo. Verify official Qloo hackathon API host, authentication, account entitlement, search/Insights contracts and rate limits; do not guess endpoints from examples. Ask for missing Qloo key through secure configuration, never chat plaintext. User reports all required keys in ~/.hermes/.env; safely identify names and verify access before requesting any missing key.
2. Build the Qloo discovery and per-person ranking vertical slice before LLM polish. A bounded deterministic agent state machine qualifies as an agentic workflow; it plans tool calls, checks outputs and replans. Use CSCS Apertus 1.5 70B for structured request interpretation, clarification and grounded explanations. The user has selected this provider; do not ask them to select it again. Follow docs/SITES_CSCS_SETUP.md for credential mapping and hosting.
3. Implement accessible polished onboarding, group board, source-linked alternatives, veto/replan and final shortlist. Keep provider keys server-side. No footer anywhere.
4. Run tests and a Qloo ablation showing what changes without taste grounding. Report genuine results, participant counts and limitations. Maintain progress, story and Built With while implementing. Verify and use required Hindsight bank encore-commons via configured API port 8888; log unresolved availability.
5. Prepare locally reviewable deployment configuration and public-demo checklist. Publish only when authorized. A local-only project is not an eligible final submission. Provide tested commands, actual source, license, deployed URL when available and remaining blockers.

No fabricated operational data: Qloo affinity is not proof of group satisfaction, distance is not walking route time, and cultural metadata is not verified hours, allergy safety, accessibility, availability or price. No booking execution. Offline fixtures support tests but cannot replace the required genuine Qloo-powered public app.

## Selected hosting and model
Build for Sites with the supported Vinext starter. Use Qloo for cultural data and CSCS Apertus 1.5 70B for language reasoning. Follow docs/SITES_CSCS_SETUP.md; this is the deployment contract. Use bundled branding assets. No website has yet been deployed.

## Required media and session integrations
Read docs/MEDIA_WORKFLOWS.md and docs/SESSION_TOOLING.md. Use diagram-design for architecture HTML/SVG → PNG and render the real PNG in README. Use Videowright in videos/ with ElevenLabs youthful adult British English female narration, producing MP4 and captions. All CSCS/Qloo/ElevenLabs keys are user-reported in ~/.hermes/.env; map safely without dumping/copying. Use Hindsight bank encore-commons via configured port-8888 service, context-mode, ADHD skill, nori senior-swe, headroom and ponytail after reading/discovering actual interfaces. Missing tools stay pending and are surfaced; do not pretend activation. No footers anywhere.

Use the exact source URLs in docs/SESSION_TOOLING.md. Include UditAkhourii/adhd for bounded ideation as well as i-have-adhd for output style. Preserve project rules and MCP settings when applying Nori senior-swe; verify real Freebuff compatibility.

## Confirmed Qloo hackathon server
Organizer-supplied server URL: https://hackathon.api.qloo.com . Use this origin for the issued hackathon key, not the generic production server. User reports the API key in ~/.hermes/.env; identify its actual variable name safely. Read https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide for authentication and endpoint paths. The supplied origin does not establish a /v2 base path for every operation: verify documented routes before composing URLs. Keep origin and route composition explicit to avoid duplicated version paths. Do not send this key to unverified hosts. Verify real entity search and Insights calls with sanitized results; key presence does not prove access. Hosted Sites needs a runtime secret because it cannot read the local env file.
