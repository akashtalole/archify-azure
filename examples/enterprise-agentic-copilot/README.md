# Enterprise agentic claims operations

A larger use case that combines **Copilot Studio**, **Power Automate** (with Dataverse and Power Apps), **Azure AI Foundry** and **Microsoft Fabric**
for an insurer's claims and customer operations. It uses the official Power Platform and Microsoft Fabric icons.

| Spec | What it shows | Output |
|---|---|---|
| [`architecture.json`](architecture.json) | Customer and adjuster copilots, document-intake and approval flows, Dataverse case records, API Management AI gateway, Foundry orchestrator with policy / fraud-signal / action agents, AI Search, Functions tool API, Fabric lakehouse, mirroring, Real-Time Intelligence, semantic model, Fabric data agent and Power BI | [html](out/architecture.html) · [png](out/architecture.png) · [draw.io](out/architecture.drawio) |
| [`claim-run.sequence.json`](claim-run.sequence.json) | One claim question from chat to approved payout: grounding in policy wording and Fabric data, threshold-based human approval through Power Automate | [html](out/claim-run.sequence.html) · [png](out/claim-run.sequence.png) |
| [`data-platform.dataflow.json`](data-platform.dataflow.json) | CDC, telematics and documents → OneLake medallion → certified semantic model, Fabric data agent and AI Search index → Power BI, Foundry agents and Copilot Studio | [html](out/data-platform.dataflow.html) · [png](out/data-platform.dataflow.png) |

Regenerate with `npm run examples`.

## Design points the example demonstrates
* **Division of labour.** Copilot Studio owns the conversation and channel; Power Automate owns deterministic business steps (document intake, approvals);
  Foundry owns open-ended reasoning with specialist agents; Fabric owns governed analytical data; Dataverse is the system of record.
* **One AI gateway.** Copilot Studio reaches Foundry only through API Management (token limits, auth, logging).
* **Data stays governed.** Agents reach Fabric through the Fabric data agent, as the signed-in user, instead of copying data into prompts.
* **Humans approve money.** The action agent can propose a payout; above the threshold the approval flow routes it to an adjuster in Teams.

## Limits
* Prices cover the Azure pieces only (API Management, Azure OpenAI, AI Search, Content Safety, Functions, Key Vault). Power Platform licences,
  Copilot Studio messages, Fabric capacity and Microsoft Purview are not in the Azure Retail Prices API and show as *not estimated*.
* Whether the real deployment uses private endpoints, managed identities and Purview policies cannot be seen in the diagram; the review marks those *Cannot Determine*.
