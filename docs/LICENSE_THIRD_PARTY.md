# Third-party data and service terms

The [MIT licence](../LICENSE) covers the source code and the branding assets in
this repository, which were generated for this project. It does **not** cover
third-party data or services used by the application.

## Qloo

- Entity names, addresses, geocodes, images, opening hours, prices and affinity
  values are supplied by the Qloo API under the Qloo hackathon terms.
- They are **not redistributed** in this repository as a dataset.
- `fixtures/replay/*.json` and `fixtures/contract/*.json` contain a sanitised
  subset of genuine responses, used only so the test suite can run without live
  credentials. The Qloo hackathon guide permits private server-side caching but
  asks that response data not be published in a public repository. If those
  fixtures need to be removed from a public repository to comply with the terms,
  delete them and run `npm test` against live credentials instead — the suite is
  written to work either way, and replay mode is optional.
- Venue images are loaded from Qloo's image host at runtime and are not
  redistributed here.
- Live calls require a `QLOO_API_KEY` issued to the operator. No affiliate,
  partnership or endorsement by Qloo is implied.

## CSCS Apertus

- Language-model inference is provided by the CSCS inference API
  (`swiss-ai/Apertus-v1.5-70B`, an Apertus model). Its outputs are generated text
  and carry no warranty.
- Live calls require a `CSCS_INFERENCE_API_KEY`. No allocation, partnership or
  endorsement by CSCS or the Apertus project is implied.

## Data deliberately not collected or stored

- No names, email addresses, accounts or persistent identifiers.
- No demographic or health traits are collected, inferred or stored.
- Taste signals are pseudonymous participant labels and confirmed entity ids,
  held in memory for at most three hours and deletable from the interface.

## Media

The architecture diagram in `docs/` was produced for this project using the
diagram-design skill from `github.com/cathrynlavery/diagram-design` (MIT), applied
with this project's own brand tokens. No third-party diagram asset is redistributed.
