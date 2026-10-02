# Examples

Each example is a spec in the repository's `examples/` folder, rendered to a live page you can open (diagram, cost and review tabs, draw.io download). Specs carry **illustrative** usage; the cost note on each page says what was assumed. They are demonstrations, not quotes.

## Architecture

| Example | What it shows | Page | draw.io |
|---|---|---|---|
| Three-tier web app | Two zones, Front Door + WAF, Application Gateway, VM scale sets, Azure SQL zone-redundant, Key Vault | [open](../live/three-tier.html) | [file](../live/three-tier.drawio) |
| Serverless API | Entra External ID, API Management, Functions, Cosmos DB, Service Bus | [open](../live/serverless-api.html) | [file](../live/serverless-api.drawio) |
| RAG assistant on Azure OpenAI | Content Safety, model deployment, AI Search vector index, diagnostic logging | [open](../live/genai-rag.html) | [file](../live/genai-rag.drawio) |
| **Product catalog search** | Hybrid keyword + vector search on Azure AI Search, Azure OpenAI embeddings, event-driven indexing | [open](../live/product-catalog-search.html) | [file](../live/product-catalog-search.drawio) |
| **Multi-agent: Copilot Studio + Foundry + Fabric** | Copilot Studio front door, Foundry orchestrator with knowledge/data/action agents, Fabric data agent, AI Search, Logic Apps, Content Safety | [open](../live/multi-agent-foundry-fabric-copilot.html) | [file](../live/multi-agent-foundry-fabric-copilot.drawio) |

!!! note "Icons"
    Copilot Studio and Microsoft Fabric use the official Power Platform and Fabric icon sets. Fabric capacity and Copilot Studio messages are not in the Retail Prices API and are not priced.

![Product catalog search](../assets/example-product-catalog.png)

## Enterprise agentic claims operations

A larger use case in its own folder, `examples/enterprise-agentic-copilot/`: Copilot Studio customer and adjuster copilots, Power Automate intake and approval flows, Dataverse, Power Apps, an API Management AI gateway, a Foundry orchestrator with policy / fraud / action agents, and a Microsoft Fabric lakehouse with a data agent, semantic model and Power BI.

| Example | Type | Page |
|---|---|---|
| Claims and customer operations platform | architecture | [open](../live/enterprise-architecture.html) |
| Claim question to approved payout | sequence | [open](../live/enterprise-claim-run.sequence.html) |
| Claims data platform on Fabric | dataflow | [open](../live/enterprise-data-platform.dataflow.html) |

## Dynamics 365 to Fabric analytics

`examples/dynamics365-fabric-analytics/`: Business Central and the customer engagement apps (Sales, Customer Service, Field Service on Dataverse) feeding Microsoft Fabric. Customer engagement data arrives through **Dataverse Link to Fabric** (read-only OneLake shortcuts); Business Central, which is not a built-in mirroring source, arrives through an **open mirrored database** fed by an extract function. The folder README lists what the Microsoft documentation says about each path.

| Example | Type | Page |
|---|---|---|
| Business Central and CE apps to Fabric | architecture | [open](../live/d365-architecture.html) |
| Three ways into OneLake | dataflow | [open](../live/d365-data-mirroring.dataflow.html) |

## Sequence and dataflow

| Example | Type | Page |
|---|---|---|
| Agent tool call with content safety and approval | sequence | [open](../live/agent-tool-call.sequence.html) |
| Clinical notes pipeline | dataflow | [open](../live/clinical-notes.dataflow.html) |

## Imported

| Example | Source | Page |
|---|---|---|
| Orders flow | Mermaid flowchart | [open](../live/mermaid-orders-flow.html) |
| Checkout | Mermaid sequence | [open](../live/mermaid-checkout.sequence.html) |
| Terraform stack | `examples/iac/terraform/` (`azurerm_*`) | [open](../live/iac-terraform.diagram.html) |
| Bicep file | `examples/iac/bicep/` | [open](../live/iac-bicep.diagram.html) |

## Regenerate

```bash
npm run icons:fetch
node bin/archify-azure.mjs finalize examples/product-catalog-search.json
npm run examples          # re-renders every examples/*.json to examples/out/
```
