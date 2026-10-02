# Well-Architected guidance in archify-azure

Source: the [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/) — five pillars
(Reliability `RE`, Security `SE`, Cost Optimization `CO`, Operational Excellence `OE`, Performance Efficiency `PE`) and
59 recommendations taken from the pillar checklist pages. Azure's AI workload guidance maps onto the same pillars, so
AI findings are flagged `lens: "generative-ai"` but cite ordinary recommendations.

## What the review is — and isn't
`archify-azure review` / the page panel inspects **which services, boundaries and connections are drawn**. It cannot
see configuration (encryption flags, zone-redundancy toggles, RBAC assignments). Results are therefore:
`ok` (evidence of the practice is drawn), `consider` (not drawn — confirm or add), `gap` (strong signal of a gap).
Treat it as a prompt for a real Well-Architected review (Azure Advisor, the Well-Architected Review assessment), never as a score.

## Heuristic rule ids by pillar
| Pillar | Rule ids |
|---|---|
| Operational excellence | `OPS-OBSERVE`, `OPS-IAC`, `AI-OBSERVE` |
| Security | `SEC-EDGE`, `SEC-DB-PUBLIC`/`SEC-DB-PRIVATE`, `SEC-PRIVATE-ENDPOINT`, `SEC-ENCRYPT`, `SEC-IDENTITY`, `SEC-DETECT`, `SEC-SECRETS`, `AI-GUARDRAILS`, `AI-ENDPOINT`, `AI-PRIVATE`, `AI-AGENCY` |
| Reliability | `REL-ZONES`, `REL-SCALE`, `REL-BACKUP`, `REL-DECOUPLE`, `AI-RESILIENCE` |
| Performance efficiency | `PERF-EDGE`, `PERF-CACHE`, `AI-RETRIEVAL` |
| Cost optimization | `COST-VISIBILITY`, `AI-COST` |

## Making a diagram "review-friendly"
Draw what a reviewer would ask about: Front Door / Application Gateway with WAF at the edge, Microsoft Entra ID, Key Vault,
zone-redundant tiers or two `availability-zone` groups, autoscaling (VM scale sets, App Service, Container Apps), backup,
queues or topics between tiers (Service Bus, Event Grid), Azure Monitor / Application Insights / Defender for Cloud, and for
AI workloads a node labelled *Content Safety*, the retrieval store (AI Search), the logging destination and an API layer
(API Management) between clients and the model. If a practice is deliberately out of scope, say so in `meta.subtitle`
rather than adding decorative icons.

## Review report (Well-Architected tab)
`archify-azure wa review spec.json [--mode full|quick|pillar|score] [--pillars security,reliability] [--filter critical|critical-high|all] [--criticality low|standard|high|critical]`
Every recommendation in the frozen corpus (`data/wa/framework.json`, 59) gets one of five statuses. Only recommendations the
diagram can evidence are judged; the rest are `Cannot Determine` with a hint about the evidence needed. The HTML tab follows the
review skill's template: classification banner, coverage audit, executive summary, scorecards, full recommendation ledger
(filterable), findings by risk, trade-offs (computed from the cost estimate), Eisenhower matrix, SMART remediation plan and next steps.
