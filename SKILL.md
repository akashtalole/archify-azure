---
name: archify-azure
description: Create polished Azure architecture diagrams (standalone HTML + SVG/PNG/draw.io) from a typed JSON spec using the official Azure Architecture Icons, with a monthly cost estimate from the Azure Retail Prices API and an advisory Azure Well-Architected Framework review. Use when the user asks to diagram, visualize, document, cost or review an Azure architecture, virtual network topology, serverless or container design, data pipeline, or an Azure OpenAI / Foundry / RAG / agent workload.
license: MIT
metadata:
  version: "0.1"
  companion_to: tt-a1i/archify
---

# archify-azure

Turns a description of an Azure workload into a checked, explorable diagram. Same philosophy as Archify: write typed JSON,
let the tool lay out, route and validate, and report only what was actually verified.

## Setup (once)
```bash
npm run icons:fetch          # downloads the official Azure icon package into assets/azure-icons/ (not committed)
node bin/archify-azure.mjs doctor
```
No npm dependencies. PNG export additionally needs Chrome/Chromium (`CHROME_PATH`, or Playwright's browser).

## Diagram types
| Type | Use for | Start from |
|---|---|---|
| `architecture` (default) | Topology: subscriptions, virtual networks, zones, services, data stores | `init three-tier` / `serverless-api` / `genai-rag` |
| `sequence` | API call chains, request lifecycles, agent tool calls, retries, async handoffs | `init sequence` |
| `dataflow` | Pipelines, ETL/ELT, ingestion → store → serve, lineage | `init dataflow` |

Unsure? `node bin/archify-azure.mjs guide "<scenario>" --json`. Existing assets: a Mermaid flowchart/sequence
(`import mermaid`) or a Terraform (`azurerm`) / Bicep / ARM repo (`import iac`) — see [references/importers.md](references/importers.md);
review the icon mappings it lists and the relationships it inferred before delivering.

## Workflow
1. **Understand the workload.** Identify entry point, main request path, data stores, async paths, identity, and
   observability. For AI workloads also: model deployment, content safety, retrieval/grounding data, logging, agent tools.
   If the user pastes an architecture description, a Bicep/ARM/Terraform repo, or a Mermaid flowchart,
   read it for topology and re-author as a spec (do not mechanically convert styling).
2. **Pick icons.** `node bin/archify-azure.mjs icons search "<term>" --json`. Use service ids/aliases (`functions`, `storage`,
   `app-gateway`); never invent ids. Use exact official names in `label` (full name first, short form after).
3. **Read** [references/spec.md](references/spec.md) once, and the closest example in `examples/`
   (`three-tier` zones/VNet, `serverless-api`, `genai-rag`, `product-catalog-search`). Start from `node bin/archify-azure.mjs init <template>`.
4. **Author the spec** (see *Authoring rules*). Put it in `.archify-azure/<slug>-<timestamp>/spec.json`, with `meta.output` beside it.
5. **Finalize** (the one command): `node bin/archify-azure.mjs finalize <spec.json> --json`.
   It validates, renders, runs strict artifact checks and a real-browser check, exports the PNG and writes
   `<out>.receipt.json`. A non-zero exit is never success: exit 1 = a gate failed — read `stages[].detail.errors`, fix
   every listed item (unknown icons come with suggestions); layout warnings mean reorder `children`, change `layout`,
   widen `gap`, or move a node next to its main neighbour. Rerun the whole command after each edit; max ~4 repair rounds, then report what remains.
   (`render --strict` is the quick loop while iterating.)
6. **Look at the PNG** (open it) — the receipt says `visualReview: "not-performed"` because mechanics are checked, aesthetics are not. Fix collisions, tangled routes, unclear labels.
7. **Cost and review.** `finalize` also writes a **Cost** tab (Azure Retail Prices API) and a **Well-Architected review** tab into the same HTML;
   read `cost` and `review` in the receipt. Do not paper over gaps by adding decorative icons: either the architecture really has the control
   (add it, with its connection) or say it's out of scope. See `references/cost-estimation.md` and `references/well-architected.md`.
8. **Report:** absolute paths to `.html` (and `.svg`/`.png`), node/edge counts, warnings, monthly cost with its confidence and the key
   assumptions, the findings by risk, how many recommendations were actually evidenced, and explicitly: "cost is an indicative list-price
   estimate and the review is advisory — inferred from the drawing, not from deployed configuration".

## Cost estimation rules (adapted from the AWS billing-and-cost-management skill)
* Check today's date before quoting prices; the price book records its retrieval date.
* Never do cost arithmetic by reasoning: run `archify-azure cost` (deterministic code) and quote its numbers. 730 hours/month.
* Only public pay-as-you-go rates from the Azure Retail Prices API. Never invent a price; unpriced components stay "not-itemized" / "not-estimated".
* Put real usage in each node's `usage`; defaulted assumptions make the estimate "indicative". Point to the Azure Pricing Calculator for a quote.

## Well-Architected review rules (structure adapted from the AWS well-architected-review skill)
* The corpus is the frozen Azure Well-Architected Framework snapshot (`archify-azure wa corpus`); use canonical recommendation ids only (`RE:05`, `SE:07`…), never fabricate one.
* Five statuses: Implemented, Partially Implemented, Not Implemented, Not Applicable, Cannot Determine. Say "Cannot Determine" rather than guess.
* Risk = impact × likelihood; do not manufacture Criticals, and acknowledge strengths. Scores are provisional when few recommendations are evidenced.
* The report is CONFIDENTIAL: do not post it to broadly visible channels without approval.

## Authoring rules (Azure Architecture Center + Well-Architected)
* Structure first: `azure-cloud › subscription › region › resource-group › vnet › subnet`. Show ≥ 2 availability zones (or zone-redundant tiers) when the design claims high availability.
  PaaS and global services (Storage, Cosmos DB, Front Door, Entra ID, Key Vault, Service Bus, Monitor) sit outside the VNet or beside it, linked by private endpoints when used.
* One main flow, left → right, in a single `row` so icons share a centre line; branches above/below via `column`
  or `stack`. 6–15 nodes is the readable range; split bigger systems into several diagrams.
* Number only the primary request path (`step`); dashed edges for async, replication, control and telemetry.
* Label every non-obvious edge with protocol/action. Don't label edges that a label would not clarify.
* Use `custom` groups for service-scoped boundaries (e.g. a "Generative AI" group), `stack` only for alignment.
* Never alter icons; never invent services or icons; do not draw controls the user didn't ask for just to please the review.
* AI workloads: draw clients → authenticated API layer (API Management) → orchestrator → (content safety, retrieval, model) → logging.
  Name the safety node "… Content Safety" so the review recognises it; show the vector store / knowledge source (AI Search) and where
  diagnostic logs go. See [references/well-architected.md](references/well-architected.md).
* Readers get Reach, Route, Finder, Passport, presentation and export for free; point users at them and at deep links (`#focus=…&reach=downstream`, `#route=a~b`) — see [references/viewer-runtime.md](references/viewer-runtime.md). Reach/Route are authored reachability, not impact analysis: say so.
* Diagram conventions are summarised in [references/azure-diagram-guidelines.md](references/azure-diagram-guidelines.md).

## Commands
`finalize`, `render`, `export --format drawio`, `validate`, `cost`, `wa review|corpus`, `review`, `import mermaid|iac`, `icons search|info|categories|groups`, `guide`, `schema`, `init`, `fetch-icons`, `doctor` — run
`node bin/archify-azure.mjs --help`. Always pass `--json` when parsing results.

## Don't
* Don't claim visual quality you didn't inspect, or that the review certifies compliance.
* Don't commit the downloaded icon package; don't install this skill into a live agent setup unless asked.
