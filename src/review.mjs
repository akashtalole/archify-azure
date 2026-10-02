// Heuristic Azure Well-Architected review of a diagram spec. It reads WHICH services and groups are drawn and how they
// connect; it cannot see configuration, so every result is advisory ("consider"/"gap" to confirm), never a verdict.
// Rules map to the five framework pillars and, for Azure OpenAI / AI Foundry workloads, to the Azure Well-Architected
// guidance for AI workloads. The Well-Architected engine (src/wa/) turns these findings into recommendation outcomes.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./catalog.mjs";

const WA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "well-architected.json"), "utf8"));
export const PILLAR_INFO = WA.framework.pillars;
export const AI_GUIDANCE = WA["ai-workloads"];

const STATEFUL = ["sql-database", "sql-managed-instance", "sql-server", "cosmos-db", "cache-redis", "managed-redis", "database-postgresql-server", "database-mysql-server", "database-mariadb-server", "documentdb", "cognitive-search", "data-explorer-clusters", "synapse-analytics", "netapp-files"];
const DATA = [...STATEFUL, "storage-accounts", "disks"];
const EDGE = ["front-door-and-cdn-profiles", "application-gateways", "api-management-services", "static-apps", "traffic-manager-profiles", "cdn-profiles", "load-balancers"];
const OBS = ["monitor", "application-insights", "log-analytics-workspaces", "managed-grafana"];
const COMPUTE = ["virtual-machine", "vm-scale-sets", "app-services", "function-apps", "kubernetes-services", "container-instances", "container-apps-environments", "batch-accounts", "service-fabric-clusters", "spring-apps", "static-apps"];
const MODEL = ["openai", "ai-foundry", "foundry-models", "foundry-agent-service", "machine-learning", "foundry-application"];
const USERS = ["users", "mobile", "browser", "groups"];

export function reviewSpec(spec, model) {
  const nodes = Object.values(model.nodes).map((n) => ({ id: n.id, svc: n.icon.kind === "service" ? n.icon.entry.id : null, kind: n.icon.kind, gen: n.icon.kind === "general" ? n.icon.entry.id : null, label: `${n.item.label || n.id} ${n.item.sublabel || ""}`, parent: n.parent }));
  const groups = model.groups;
  const byId = (id) => nodes.find((n) => n.id === id);
  const ofSvc = (...ids) => nodes.filter((n) => n.svc && ids.includes(n.svc));
  const has = (...ids) => ofSvc(...ids).length > 0;
  const labelHas = (re) => nodes.filter((n) => re.test(n.label) || re.test(n.id));
  const ancestors = (id) => { const out = []; let g = groups.find((x) => x.id === (byId(id)?.parent ?? id)); while (g) { out.push(g); g = groups.find((x) => x.id === g.parent); } return out; };
  const zoneCount = groups.filter((g) => g.kind === "availability-zone").length;
  const isAI = (spec.meta.lens || []).includes("generative-ai") || has(...MODEL.filter((m) => m !== "machine-learning"));
  const findings = [];
  const add = (pillar, id, status, title, detail, nodesIds = [], lens = "framework") => findings.push({ pillar, id, status, title, detail, nodes: nodesIds.map((n) => n.id || n), lens });

  // ---- Security
  const entry = ofSvc(...EDGE);
  if (entry.length) {
    const waf = has("web-application-firewall-policies-waf", "ddos-protection-plans", "firewalls") || labelHas(/\bwaf\b|web application firewall|ddos/i).length;
    add("security", "SEC-EDGE", waf ? "ok" : "gap", waf ? "Edge protection present" : "Internet-facing entry has no WAF / DDoS protection shown",
      "Protect public entry points (Front Door, Application Gateway, API Management) with Azure Web Application Firewall and DDoS Protection, and restrict origins to the front end.", waf ? ofSvc("web-application-firewall-policies-waf", "ddos-protection-plans", "firewalls") : entry);
  }
  const dbPublic = nodes.filter((n) => STATEFUL.includes(n.svc) && ancestors(n.id).some((g) => g.kind === "public-subnet"));
  if (dbPublic.length) add("security", "SEC-DB-PUBLIC", "gap", "Data store drawn in a public subnet", "Keep databases and caches off public subnets; reach PaaS data services through private endpoints and allow access only from the application tier.", dbPublic);
  else if (nodes.some((n) => STATEFUL.includes(n.svc))) add("security", "SEC-DB-PRIVATE", "ok", "Data stores are not placed in public subnets", "Least-privilege network placement for stateful services.", []);
  const paas = ofSvc(...DATA, "key-vaults");
  if (paas.length) {
    const pe = has("private-endpoints", "private-link", "private-link-service") || labelHas(/private (endpoint|link)/i).length;
    add("security", "SEC-PRIVATE-ENDPOINT", pe ? "ok" : "consider", pe ? "Private endpoints shown" : "No private endpoints shown for PaaS data services",
      "Disable public network access on PaaS data services and reach them through Azure Private Link private endpoints inside your virtual network.", ofSvc("private-endpoints", "private-link"));
  }
  if (ofSvc(...DATA).length) {
    const kv = has("key-vaults") || labelHas(/key vault|customer.managed key|cmk/i).length;
    add("security", "SEC-ENCRYPT", kv ? "ok" : "consider", kv ? "Key management shown" : "No Azure Key Vault shown for data at rest",
      "Encrypt data at rest and in transit; use Azure Key Vault customer-managed keys where you need key rotation, access policy or audit control.", ofSvc("key-vaults"));
  }
  if (entry.length || nodes.some((n) => USERS.includes(n.gen))) {
    const authn = has("entra-id-protection", "entra-managed-identities", "managed-identities", "ad-b2c", "enterprise-applications", "conditional-access", "entra-domain-services", "external-identities") || labelHas(/entra|azure ad|auth|oidc|saml|sso|managed identity/i).length;
    add("security", "SEC-IDENTITY", authn ? "ok" : "consider", authn ? "Identity service shown" : "No identity / authentication service shown",
      "Authenticate and authorize every request with Microsoft Entra ID (conditional access, RBAC) and use managed identities instead of stored credentials.", ofSvc("entra-id-protection", "entra-managed-identities", "managed-identities", "ad-b2c"));
  }
  if (nodes.length >= 4) {
    const detect = has("defender-for-cloud", "sentinel", "policy", "microsoft-defender-for-cloud") || labelHas(/defender|sentinel/i).length;
    add("security", "SEC-DETECT", detect ? "ok" : "consider", detect ? "Threat detection / posture services shown" : "No threat detection or posture management shown",
      "Enable Microsoft Defender for Cloud and Microsoft Sentinel (and Azure Policy) for posture management, threat detection and response; send activity logs to a central workspace.", ofSvc("defender-for-cloud", "sentinel", "policy"));
  }
  if (ofSvc("sql-database", "sql-managed-instance", "sql-server", "database-postgresql-server", "database-mysql-server", "database-mariadb-server", "cosmos-db").length) {
    const sec = has("key-vaults", "entra-managed-identities", "managed-identities") || labelHas(/secret|key vault|managed identity/i).length;
    add("security", "SEC-SECRETS", sec ? "ok" : "consider", sec ? "Secrets / passwordless access shown" : "No Key Vault or managed identity shown for database credentials",
      "Store secrets in Azure Key Vault or, better, connect with managed identities and Entra authentication so no credentials are embedded.", ofSvc("key-vaults", "entra-managed-identities", "managed-identities"));
  }

  // ---- Reliability
  const stateful = nodes.filter((n) => [...STATEFUL, "virtual-machine"].includes(n.svc));
  if (stateful.length) {
    const inVnet = stateful.some((n) => ancestors(n.id).some((g) => g.kind === "vnet"));
    if (inVnet || zoneCount) {
      const multi = zoneCount >= 2 || labelHas(/zone.?redundan|multi-?zone|availability zones?|geo-?redundan/i).length > 0;
      add("reliability", "REL-ZONES", multi ? "ok" : "gap", multi ? "Workload spans multiple availability zones" : "Workload is drawn in a single (or no) availability zone",
        "Deploy zone-redundant: spread compute across at least two availability zones and use zone-redundant tiers for databases, storage and gateways.", multi ? [] : stateful);
    }
  }
  if (ofSvc("virtual-machine").length) {
    const scale = has("vm-scale-sets", "availability-sets") || groups.some((g) => g.kind === "availability-set") || labelHas(/autoscal|scale set|vmss/i).length;
    add("reliability", "REL-SCALE", scale ? "ok" : "consider", scale ? "Scale sets / autoscale shown" : "Virtual machines without a scale set or autoscale",
      "Use Virtual Machine Scale Sets (or managed compute such as App Service, Container Apps or AKS) with autoscale so capacity follows demand and failed instances are replaced.", ofSvc("virtual-machine"));
  }
  if (ofSvc("sql-database", "sql-managed-instance", "sql-server", "cosmos-db", "storage-accounts", "disks", "virtual-machine").length) {
    const bk = has("recovery-services-vaults") || labelHas(/backup|replica|snapshot|point.in.time|geo-?replica|restore/i).length;
    add("reliability", "REL-BACKUP", bk ? "ok" : "consider", bk ? "Backup / recovery shown" : "No backup or recovery capability shown",
      "Define RPO/RTO and protect data with Azure Backup, point-in-time restore, geo-replication or Site Recovery, and test restores.", ofSvc("recovery-services-vaults"));
  }
  if (entry.length && ofSvc(...COMPUTE).length >= 2) {
    const async = has("service-bus", "event-grid-topics", "event-hubs", "logic-apps", "storage-queue") || labelHas(/queue|topic|event grid|service bus|event hub/i).length;
    add("reliability", "REL-DECOUPLE", async ? "ok" : "consider", async ? "Asynchronous decoupling shown" : "No queue / event service shown between tiers",
      "Decouple components with Azure Service Bus, Event Grid or Event Hubs so spikes and downstream failures do not cascade; add retries with backoff, timeouts and circuit breakers.", ofSvc("service-bus", "event-grid-topics", "event-hubs"));
  }

  // ---- Operational excellence
  if (nodes.length >= 3) {
    const obs = has(...OBS) || labelHas(/observab|monitor|grafana|app insights|log analytics/i).length;
    add("operational-excellence", "OPS-OBSERVE", obs ? "ok" : "gap", obs ? "Observability shown" : "No monitoring / observability shown",
      "Collect metrics, logs and traces with Azure Monitor, Application Insights and Log Analytics, and define alerts tied to business outcomes.", ofSvc(...OBS));
    const iac = has("devops", "automation-accounts", "blueprints") || labelHas(/bicep|terraform|arm template|github actions|ci\/?cd|pipeline|devops/i).length;
    add("operational-excellence", "OPS-IAC", iac ? "ok" : "consider", iac ? "IaC / delivery pipeline shown" : "No infrastructure-as-code or CI/CD shown",
      "Define infrastructure as code (Bicep or Terraform) and deploy through a pipeline (GitHub Actions or Azure Pipelines) with small, reversible changes and safe deployment practices.", ofSvc("devops"));
  }

  // ---- Performance efficiency
  if (entry.length && nodes.some((n) => USERS.includes(n.gen))) {
    const cdn = has("front-door-and-cdn-profiles", "cdn-profiles");
    add("performance-efficiency", "PERF-EDGE", cdn ? "ok" : "consider", cdn ? "Edge delivery shown" : "No CDN / global edge shown for end users",
      "Serve content and terminate TLS close to users with Azure Front Door or Azure CDN to cut latency.", ofSvc("front-door-and-cdn-profiles"));
  }
  if (ofSvc("sql-database", "sql-managed-instance", "database-postgresql-server", "database-mysql-server").length) {
    const cache = has("cache-redis", "managed-redis", "front-door-and-cdn-profiles") || labelHas(/cache|redis|read replica/i).length;
    add("performance-efficiency", "PERF-CACHE", cache ? "ok" : "consider", cache ? "Caching shown" : "Relational database with no cache / read scaling shown",
      "Add caching (Azure Managed Redis, CDN) or read replicas for read-heavy access, and choose the data store that fits the access pattern.", ofSvc("cache-redis", "managed-redis"));
  }

  // ---- Cost optimization
  if (nodes.length >= 3) {
    const fin = has("cost-management-and-billing") || labelHas(/budget|cost management|finops|cost/i).length;
    add("cost-optimization", "COST-VISIBILITY", fin ? "ok" : "consider", fin ? "Cost visibility shown" : "No cost visibility shown",
      "Tag resources, set Microsoft Cost Management budgets and alerts so spend maps to workloads and owners.", ofSvc("cost-management-and-billing"));
  }

  // ---- Azure AI workloads (Azure OpenAI, AI Foundry, agents)
  if (isAI) {
    const L = "generative-ai";
    const mods = ofSvc(...MODEL);
    const guard = labelHas(/guardrail|content (safety|filter)|prompt shield/i).length || has("content-safety") || spec.meta.guardrails === true;
    add("security", "AI-GUARDRAILS", guard ? "ok" : "gap", guard ? "Content safety shown" : "No content safety around model input/output",
      "Apply Azure AI Content Safety (content filters, prompt shields, groundedness detection) to prompts and responses, and add PII handling where needed.", mods, L);
    const log = has("monitor", "application-insights", "log-analytics-workspaces", "storage-accounts") || labelHas(/diagnostic|trace|observab|audit/i).length;
    add("operational-excellence", "AI-OBSERVE", log ? "ok" : "gap", log ? "Model telemetry destination shown" : "No model diagnostics / observability shown",
      "Send diagnostic logs, token usage, latency and content-filter events to Azure Monitor / Log Analytics and keep an audit trail; trace agent steps with Application Insights.", mods, L);
    const direct = (spec.edges || []).filter((e) => { const a = byId(e.from), b = byId(e.to); return a && b && USERS.includes(a.gen) && MODEL.includes(b.svc); });
    if (direct.length) add("security", "AI-ENDPOINT", "gap", "Clients call the model directly", "Front models with an authenticated, throttled gateway (API Management or an app tier) rather than exposing them to clients; validate inputs.", direct.map((e) => e.to), L);
    const inVnet = nodes.some((n) => COMPUTE.includes(n.svc) && ancestors(n.id).some((g) => g.kind === "vnet"));
    if (inVnet) {
      const pl = has("private-endpoints", "private-link") || labelHas(/private (endpoint|link)/i).length;
      add("security", "AI-PRIVATE", pl ? "ok" : "consider", pl ? "Private model connectivity shown" : "VNet compute calls model APIs without a private endpoint shown",
        "Keep prompts and responses off the public internet: use private endpoints for Azure OpenAI / AI Foundry and disable public network access.", mods, L);
    }
    const retrieval = has("cognitive-search", "cosmos-db", "database-postgresql-server", "documentdb") || labelHas(/vector|knowledge base|rag|retriev|grounding/i).length;
    add("performance-efficiency", "AI-RETRIEVAL", retrieval ? "ok" : "consider", retrieval ? "Retrieval / grounding data shown" : "No retrieval / grounding data source shown",
      "Ground responses in enterprise data (RAG with Azure AI Search or a vector-enabled database) and measure retrieval quality; version prompts, models and data sources.", ofSvc("cognitive-search", "cosmos-db"), L);
    const regions = groups.filter((g) => g.kind === "region").length;
    add("reliability", "AI-RESILIENCE", regions >= 2 || labelHas(/multi-?region|global deployment|provisioned throughput|ptu|fallback/i).length ? "ok" : "consider", regions >= 2 ? "Multiple regions shown" : "Single-region model inference",
      "Plan for throttling and quota limits (retries, queuing, provisioned throughput units) and consider global/data-zone deployments, a second region or a fallback model.", mods, L);
    add("cost-optimization", "AI-COST", labelHas(/cache|batch|router|smaller model|mini/i).length ? "ok" : "consider", "Model cost controls",
      "Choose the smallest model that meets quality targets, use prompt caching and batch deployments where possible, and track tokens and cost per request.", mods, L);
    if (has("foundry-agent-service") || labelHas(/\bagent\b/i).length) add("security", "AI-AGENCY", labelHas(/human|approval|least.privilege/i).length ? "ok" : "consider", "Agents and excessive agency",
      "Give agents least-privilege managed identities and scoped tools, validate tool inputs and outputs, and require human approval for high-impact actions.", ofSvc("foundry-agent-service"), L);
  }

  const order = Object.keys(PILLAR_INFO);
  findings.sort((a, b) => order.indexOf(a.pillar) - order.indexOf(b.pillar) || (a.status === "ok") - (b.status === "ok"));
  const summary = Object.fromEntries(order.map((p) => [p, { gap: 0, consider: 0, ok: 0 }]));
  for (const f of findings) summary[f.pillar][f.status]++;
  return { findings, summary, genAI: isAI };
}
