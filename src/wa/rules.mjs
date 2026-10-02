// Evidence rules: what a diagram (and the cost estimate) can say about specific Azure Well-Architected recommendations.
// Every recommendation id used here (RE:05, SE:07 …) is validated against the corpus (see test) — ids are never invented.
// Statuses: Implemented | Partially Implemented | Not Implemented | Not Applicable | Cannot Determine.
// A diagram shows architecture, not process or configuration, so most recommendations stay "Cannot Determine"; that is reported, not hidden.

export const STATUS = ["Implemented", "Partially Implemented", "Not Implemented", "Not Applicable", "Cannot Determine"];
export const OWNER = { reliability: "Platform / SRE", security: "Security engineering", "cost-optimization": "FinOps + engineering", "operational-excellence": "DevOps / SRE", "performance-efficiency": "Application team" };

/** Rules derived from the heuristic findings in review.mjs: legacy id -> recommendation outcomes. `ai: true` marks Azure AI workload rules. */
export const LEGACY_RULES = [
  { legacy: "SEC-EDGE", fw: { "SE:06": {}, "SE:08": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Put Azure Web Application Firewall (on Front Door or Application Gateway) and DDoS Protection in front of every internet-facing entry point; start in detection mode, then enforce.", measure: "100% of public endpoints behind a WAF policy with diagnostic logging enabled" },
  { legacy: "SEC-DB-PUBLIC", fw: { "SE:04": {}, "SE:06": {} }, impact: "Severe", likelihood: "Medium", effort: "Low", weeks: 1,
    rec: "Move databases and caches off public subnets, disable public network access and allow access only from the application tier through private endpoints and network security groups.", measure: "No stateful store reachable from the internet (verify with Network Watcher / Defender for Cloud)" },
  { legacy: "SEC-DB-PRIVATE", fw: { "SE:04": {} }, impact: "Moderate", likelihood: "Low", effort: "Low", weeks: 1, rec: "Keep stateful stores on private networks.", measure: "—" },
  { legacy: "SEC-PRIVATE-ENDPOINT", fw: { "SE:06": {}, "SE:04": {} }, impact: "Moderate", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Disable public network access on PaaS data services (Storage, SQL, Cosmos DB, Key Vault) and connect through Azure Private Link private endpoints with private DNS zones.", measure: "Every PaaS data service has public access disabled and a private endpoint" },
  { legacy: "SEC-ENCRYPT", fw: { "SE:07": {} }, impact: "Severe", likelihood: "Low", effort: "Low", weeks: 2,
    rec: "Manage encryption keys in Azure Key Vault (customer-managed keys where you need rotation, access policy or audit control) and enforce encryption at rest and TLS in transit on every data store.", measure: "All data stores report encryption with a CMK where required; key rotation enabled" },
  { legacy: "SEC-IDENTITY", fw: { "SE:05": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Authenticate and authorize every request through Microsoft Entra ID with conditional access, MFA and least-privilege RBAC; use managed identities for workload-to-workload access.", measure: "All user and workload access federated through Entra ID; zero stored credentials" },
  { legacy: "SEC-DETECT", fw: { "SE:10": {}, "SE:01": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Enable Microsoft Defender for Cloud and Microsoft Sentinel, assign Azure Policy initiatives for the baseline, and send activity and diagnostic logs to a central, access-restricted Log Analytics workspace.", measure: "Defender plans and Sentinel enabled for all subscriptions in scope; policy compliance reported" },
  { legacy: "SEC-SECRETS", fw: { "SE:09": {} }, impact: "Severe", likelihood: "Medium", effort: "Low", weeks: 1,
    rec: "Use managed identities with Entra authentication for databases, and keep any remaining secrets in Azure Key Vault with rotation.", measure: "No credentials in code, images or app settings" },
  { legacy: "REL-ZONES", fw: { "RE:05": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Deploy zone-redundant: at least two availability zones for compute, zone-redundant tiers for databases, storage and gateways.", measure: "Workload survives loss of one availability zone in a game day" },
  { legacy: "REL-SCALE", fw: { "RE:06": {}, "PE:05": {}, "CO:12": {} }, considerAs: "Not Implemented", impact: "Moderate", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Use Virtual Machine Scale Sets with autoscale (or managed compute such as App Service, Container Apps, Functions or AKS) so capacity follows demand and failed instances are replaced automatically.", measure: "Capacity scales with load and an instance failure self-heals without manual action" },
  { legacy: "REL-BACKUP", fw: { "RE:09": {} }, impact: "Severe", likelihood: "Low", effort: "Low", weeks: 2,
    rec: "Protect data with Azure Backup (vault with soft delete and cross-region restore where required) or database point-in-time restore, and test restores against your RPO/RTO.", measure: "Automated backups with a successful restore test each quarter" },
  { legacy: "REL-DECOUPLE", fw: { "RE:07": {}, "PE:10": {} }, impact: "Moderate", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Decouple tiers with Azure Service Bus, Event Grid or Event Hubs so traffic spikes and downstream failures do not cascade; add retries with backoff, timeouts and circuit breakers.", measure: "Downstream outage does not fail upstream requests; queues absorb bursts" },
  { legacy: "OPS-OBSERVE", fw: { "OE:07": {}, "RE:10": {}, "PE:04": {}, "SE:10": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Collect metrics, logs and traces with Azure Monitor, Application Insights and Log Analytics, and define alerts tied to business outcomes.", measure: "Dashboards and alerts for every tier; mean time to detect < 5 minutes" },
  { legacy: "OPS-IAC", fw: { "OE:05": {}, "OE:11": {} }, impact: "Moderate", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Define infrastructure as code (Bicep or Terraform) and deploy through a pipeline with small, reversible changes, environment promotion and automated rollback.", measure: "100% of production changes deployed from a pipeline" },
  { legacy: "PERF-EDGE", fw: { "PE:03": {}, "PE:09": {} }, impact: "Minor", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Serve content and terminate TLS close to users with Azure Front Door or Azure CDN to reduce latency.", measure: "p95 latency for remote users reduced against baseline" },
  { legacy: "PERF-CACHE", fw: { "PE:08": {}, "PE:07": {} }, impact: "Minor", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Add caching (Azure Managed Redis, CDN) or read replicas for read-heavy access.", measure: "Cache hit ratio above target; database read load reduced" },
  { legacy: "COST-VISIBILITY", fw: { "CO:03": {}, "CO:04": {}, "CO:01": {} }, impact: "Minor", likelihood: "High", effort: "Low", weeks: 1,
    rec: "Set Microsoft Cost Management budgets with alert thresholds and enforce cost-allocation tags (Azure Policy) so spend maps to this workload.", measure: "Budget alerts active; 100% of resources tagged" },
  // ---- Azure AI workloads
  { legacy: "AI-GUARDRAILS", ai: true, fw: { "SE:08": {}, "RE:07": {} }, impact: "Severe", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Apply Azure AI Content Safety (content filters, prompt shields, groundedness detection) to prompts and responses, and handle PII before it reaches the model.", measure: "Content safety enforced on 100% of model calls; interventions logged" },
  { legacy: "AI-OBSERVE", ai: true, fw: { "OE:07": {}, "SE:10": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Send model diagnostics (requests, latency, token usage, content-filter events) to Log Analytics, trace agent steps with Application Insights and keep an audit trail.", measure: "Diagnostic settings on for all model resources; dashboards for latency, tokens and content-filter events" },
  { legacy: "AI-ENDPOINT", ai: true, fw: { "SE:04": {}, "SE:06": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Front models with an authenticated, throttled gateway (API Management or an app tier) instead of exposing them to clients; validate and sanitize inputs.", measure: "No client reaches a model endpoint except through the gateway" },
  { legacy: "AI-PRIVATE", ai: true, fw: { "SE:06": {} }, impact: "Moderate", likelihood: "Low", effort: "Low", weeks: 2,
    rec: "Use private endpoints for Azure OpenAI / AI Foundry and disable public network access so prompts and responses stay off the public internet.", measure: "Model API traffic from VNet compute uses private endpoints" },
  { legacy: "AI-RETRIEVAL", ai: true, fw: { "PE:03": {}, "PE:08": {} }, okAs: "Cannot Determine", impact: "Minor", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Ground responses in enterprise data (RAG with Azure AI Search or a vector-enabled database) and measure retrieval relevance and latency.", measure: "Retrieval quality measured on a labelled set" },
  { legacy: "AI-RESILIENCE", ai: true, fw: { "RE:05": {}, "RE:06": {} }, impact: "Moderate", likelihood: "Low", effort: "Medium", weeks: 4,
    rec: "Plan for throttling and quota limits (retries, queuing, provisioned throughput units) and consider global or data-zone deployments, a second region or a fallback model.", measure: "Inference continues within SLO when the primary deployment is throttled" },
  { legacy: "AI-COST", ai: true, fw: { "CO:07": {}, "CO:12": {} }, impact: "Minor", likelihood: "High", effort: "Low", weeks: 2,
    rec: "Select the smallest model that meets quality targets; use prompt caching and batch deployments where possible; track cost per request.", measure: "Cost per request tracked and below target" },
  { legacy: "AI-AGENCY", ai: true, fw: { "SE:05": {}, "SE:08": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Give agents least-privilege managed identities and scoped tools, enforce policy at the tool boundary and add human approval for high-impact actions.", measure: "Every tool call authorized; high-impact actions require approval" },
];

const money = (x) => "$" + Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Procedural rules. Each returns {title, fw: {id: {status, evidence, …}}, nodes} or null when it does not apply. */
export const PROCEDURAL_RULES = [
  { id: "SEGMENTATION", pillar: "security", evaluate(ctx) {
      const subs = ctx.groups.filter((g) => ["subscription", "management-group"].includes(g.kind)), nsgs = ctx.groups.filter((g) => g.kind === "nsg"), subnets = ctx.groups.filter((g) => ["subnet", "public-subnet", "private-subnet"].includes(g.kind)), fw = ctx.of("firewalls", "network-security-groups", "application-security-groups");
      if (!subs.length && !nsgs.length && subnets.length < 2 && !fw.length) return null;
      const parts = [subs.length && `${subs.length} subscription/management-group boundar${subs.length === 1 ? "y" : "ies"}`, subnets.length && `${subnets.length} subnet${subnets.length === 1 ? "" : "s"}`, nsgs.length && `${nsgs.length} network security group${nsgs.length === 1 ? "" : "s"}`, fw.length && fw.map((n) => n.label.trim()).join(", ")].filter(Boolean);
      return { title: "Intentional segmentation", fw: { "SE:04": { status: "Partially Implemented", evidence: `Diagram shows ${parts.join(", ")}; whether the segments follow trust boundaries is not observable.` } }, nodes: fw.map((n) => n.id) };
    } },
  { id: "GOVERNANCE", pillar: "operational-excellence", evaluate(ctx) {
      const n = ctx.of("policy", "blueprints", "advisor");
      if (!n.length && !ctx.groups.some((g) => g.kind === "management-group")) return null;
      const ev = `${[...n.map((x) => x.label.trim()), ...(ctx.groups.some((g) => g.kind === "management-group") ? ["management groups"] : [])].join(", ")} drawn for standards and governance.`;
      return { title: "Standards and governance", fw: { "OE:02": { status: "Partially Implemented", evidence: ev }, "SE:01": { status: "Partially Implemented", evidence: ev } }, nodes: n.map((x) => x.id) };
    } },
  { id: "DATACLASS", pillar: "security", evaluate(ctx) {
      const n = ctx.of("information-protection", "data-catalog", "defender-for-cloud").concat(ctx.labelHas(/purview|sensitivity label|information protection/i));
      if (!n.length) return null;
      const ids = [...new Set(n.map((x) => x.id))];
      return { title: "Sensitivity classification and labelling", fw: { "SE:03": { status: "Partially Implemented", evidence: `${[...new Set(n.map((x) => x.label.trim()))].join(", ")} drawn for classification; label coverage is not observable.` } }, nodes: ids };
    } },
  { id: "TRACING", pillar: "operational-excellence", evaluate(ctx) {
      const trace = ctx.of("application-insights").length || ctx.labelHas(/open ?telemetry|otel|tracing|traces|app insights/i).length;
      if (!trace) return null;
      const nodes = [...ctx.of("application-insights"), ...ctx.labelHas(/open ?telemetry|otel|tracing|traces|app insights/i)].map((n) => n.id);
      const ev = `Application tracing/telemetry is drawn (${[...new Set(nodes)].join(", ")}).`;
      return { title: "Distributed tracing", fw: { "OE:07": { status: "Implemented", evidence: ev }, "PE:04": { status: "Partially Implemented", evidence: ev } }, nodes: [...new Set(nodes)] };
    } },
  { id: "HYBRID", pillar: "reliability", evaluate(ctx) {
      const link = ctx.of("expressroute-circuits", "virtual-network-gateways", "local-network-gateways", "virtual-wans"), onprem = ctx.groups.filter((g) => g.kind === "on-premises").length || ctx.labelHas(/on.?prem|data cent|hospital|ehr/i).length;
      if (!link.length && !onprem) return { title: "Hybrid connectivity", fw: { "RE:05": { status: "Not Applicable", evidence: "No on-premises or private-link connectivity is drawn." } } };
      if (!link.length) return { title: "Hybrid connectivity", fw: { "RE:05": { status: "Cannot Determine", evidence: "On-premises systems are drawn but no private connection is shown." } } };
      const redundant = link.length >= 2;
      return { title: "Hybrid connectivity redundancy", fw: { "RE:05": { status: redundant ? "Implemented" : "Partially Implemented", evidence: redundant ? `${link.length} connectivity components drawn.` : "A single connectivity component is drawn; redundant connectivity (second ExpressRoute circuit or VPN backup) is not shown.", ...(redundant ? {} : { impact: "Severe", likelihood: "Low", effort: "Medium", weeks: 6, rec: "Add a redundant path (second ExpressRoute circuit at a different peering location, or a site-to-site VPN as backup).", measure: "Loss of one path does not interrupt on-premises connectivity" }) } }, nodes: link.map((n) => n.id) };
    } },
  { id: "AGENT-GOVERNANCE", pillar: "security", evaluate(ctx) {
      if (!ctx.isAI) return null;
      const apim = ctx.of("api-management-services").concat(ctx.labelHas(/ai gateway|mcp/i)), eva = ctx.labelHas(/evaluation/i);
      const fw = {};
      if (apim.length) fw["SE:06"] = { status: "Partially Implemented", evidence: `${[...new Set(apim.map((n) => n.label.trim()))].join(", ")} mediates access to model and tool APIs; per-API authorization is not observable in a diagram.` };
      if (eva.length) fw["PE:04"] = { status: "Partially Implemented", evidence: "Evaluation of model or agent quality is drawn; ground-truth dataset ownership is not shown." };
      return Object.keys(fw).length ? { title: "Governed model and tool access, with evaluation", fw, nodes: [...apim, ...eva].map((n) => n.id) } : null;
    } },
  { id: "HUMAN-REVIEW", pillar: "security", evaluate(ctx) {
      const h = ctx.labelHas(/human review|reviewer|approval|human.in.the.loop/i);
      if (!ctx.isAI || !h.length) return null;
      const ids = [...new Set(h.map((n) => n.id))];
      return { title: "Human oversight of model outputs", fw: { "SE:08": { status: "Partially Implemented", evidence: `Human approval is drawn for flagged outputs/actions (${ids.join(", ")}); combine with deterministic policy for high-impact actions.` } }, nodes: ids };
    } },
  { id: "COST-MODEL", pillar: "cost-optimization", evaluate(ctx) {
      const c = ctx.cost;
      if (!c) return null;
      const priced = c.coverage.estimated + c.coverage.override, total = c.coverage.nodes - c.coverage.notBillable - c.coverage.noCharge;
      const ev = `A design-time cost model was generated from the Azure Retail Prices API: ${priced} of ${total} billable components priced, ${money(c.totals.monthlyUsd)}/month pay-as-you-go (${c.confidence}; volumes ${c.defaultedAssumptions.length ? "partly assumed" : "supplied"}).`;
      const out = { title: "Design-time cost model", fw: { "CO:02": { status: priced >= total ? "Implemented" : "Partially Implemented", evidence: ev } } };
      const egress = c.nodes.some((n) => n.assumptions?.some((a) => a.key === "egressGbPerMonth"));
      out.fw["CO:10"] = egress ? { status: "Partially Implemented", evidence: "Data transfer out is modelled for at least one component." } : { status: "Cannot Determine", evidence: "Data transfer (bandwidth) is excluded from the estimate because no node sets egressGbPerMonth; model it before launch." };
      const compute = (c.totals.byCategory.Compute || 0) + c.nodes.filter((n) => ["sqldb", "cosmos", "vm", "search", "redis"].includes(n.pricer)).reduce((s, n) => s + n.monthlyUsd, 0);
      if (compute > 0 && compute / (c.totals.monthlyUsd || 1) >= 0.15) out.fw["CO:05"] = { status: "Cannot Determine", evidence: `Compute and database capacity is ${money(compute)}/month at pay-as-you-go rates (${Math.round(100 * compute / c.totals.monthlyUsd)}% of the estimate); whether Reservations or Savings Plans apply is not shown. Evaluate with Azure Advisor recommendations after 30+ days of steady usage.` };
      return out;
    } },
  { id: "COST-AI-CONCENTRATION", pillar: "cost-optimization", evaluate(ctx) {
      const c = ctx.cost;
      if (!c || !ctx.isAI) return null;
      const model = c.nodes.filter((n) => n.pricer === "openai" && n.status === "estimated");
      if (!model.length) return null;
      const share = model.reduce((s, n) => s + n.monthlyUsd, 0) / (c.totals.monthlyUsd || 1);
      const ev = `${model.map((n) => n.model || n.label).join(", ")} accounts for ${Math.round(share * 100)}% of the estimated monthly cost (${money(model.reduce((s, n) => s + n.monthlyUsd, 0))}); model right-sizing should be validated against quality targets.`;
      return { title: "Model inference dominates cost", fw: { "CO:07": { status: share >= 0.5 ? "Partially Implemented" : "Implemented", evidence: ev, ...(share >= 0.5 ? { impact: "Moderate", likelihood: "High", effort: "Low", weeks: 2, rec: "Validate that the chosen model is the smallest that meets quality targets; use prompt caching, batch deployments and token budgets.", measure: "Cost per request tracked; model choice justified by an evaluation" } : {}) } }, nodes: model.map((n) => n.id) };
    } },
];
