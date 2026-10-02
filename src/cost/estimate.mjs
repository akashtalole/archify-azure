// Cost estimate for a diagram: price book + per-service usage assumptions -> monthly USD, with every
// assumption, rate and source recorded. Pure and deterministic: all arithmetic happens here, in code.
// Basis (stated in every report): public pay-as-you-go list prices from the Azure Retail Prices API; excludes taxes,
// support plans, Reservations / Savings Plans / Spot / enterprise discounts, and data transfer unless a node supplies `egressGbPerMonth`.
import { loadPriceBook, tiered, round4, PricingError } from "./pricebook.mjs";
import { PRICERS, SERVICE_PRICER, NO_CHARGE, line } from "./pricers.mjs";

export const CATEGORY = { functions: "Compute", appservice: "Compute", vm: "Compute", aks: "Compute", lb: "Network", appgw: "Network", frontdoor: "Network", firewall: "Network", bastion: "Network", publicip: "Network", egress: "Network",
  openai: "AI and agents", docintel: "AI and agents", contentsafety: "AI and agents", search: "AI and agents",
  storage: "Data and storage", cosmos: "Data and storage", sqldb: "Data and storage", redis: "Data and storage", acr: "Data and storage",
  apim: "Integration", servicebus: "Integration", eventhubs: "Integration", eventgrid: "Integration",
  loganalytics: "Security and operations", keyvault: "Security and operations" };

function readerFor(userUsage, scale, assumptions) {
  const record = (key, value, source, scaled) => { if (!assumptions.has(key)) assumptions.set(key, { key, value, source, ...(scaled ? { scaledByTraffic: true } : {}) }); };
  const u = (key, dflt) => {
    const v = userUsage?.[key];
    if (v !== undefined) { record(key, v, "spec"); return v; }
    if (dflt === undefined) throw new PricingError(`usage.${key} is required for this service`);
    record(key, dflt, "default");
    return dflt;
  };
  const vol = (key, dflt) => { const v = u(key, dflt); assumptions.set(key, { ...assumptions.get(key), scaledByTraffic: true }); return v * scale; };
  return { u, vol };
}

function pricerFor(n, usage) {
  if (usage.pricer) return usage.pricer;
  const k = n.icon.kind, id = n.icon.entry.id;
  if (k === "service") {
    if (["monitor", "application-insights"].includes(id)) return "loganalytics"; // workspace-based telemetry is billed as Log Analytics ingestion
    return SERVICE_PRICER[id] || null;
  }
  return null;
}

function runNode(n, ctx, scale) {
  const usage = { ...(n.item.usage || {}), ...(ctx.overrides?.[n.id] || {}) };
  const label = n.item.label || n.id;
  const base = { id: n.id, label, service: n.icon.entry.name, assumptions: [], notes: [], lines: [], monthlyUsd: 0 };
  if (n.icon.kind === "general") return { ...base, status: "not-billable", notes: ["General icon: not a billable Azure resource."] };
  if (usage.monthlyUsd !== undefined) return { ...base, status: "override", pricer: "override", category: usage.category || "Other", monthlyUsd: round4(Number(usage.monthlyUsd)), notes: [usage.note || "Monthly cost supplied in the spec (usage.monthlyUsd); not computed from the Price List."] };
  const pricer = pricerFor(n, usage);
  if (!pricer) {
    if (n.icon.kind === "service" && NO_CHARGE.has(n.icon.entry.id)) return { ...base, status: "no-charge", notes: [`${n.icon.entry.name} has no direct charge.`] };
    return { ...base, status: "not-estimated", notes: [`No cost model for ${n.icon.entry.name} yet. Supply \`usage.monthlyUsd\` on the node to include it.`] };
  }
  const model = PRICERS[pricer];
  if (!model) return { ...base, status: "error", notes: [`unknown pricer "${pricer}"`] };
  const assumptions = new Map();
  const { u, vol } = readerFor(usage, scale, assumptions);
  try {
    const res = model.run({ pb: ctx.pb, u, vol, node: n });
    const lines = res.lines.slice();
    if (usage.egressGbPerMonth) {
      const g = ctx.pb.dim("Bandwidth", (r) => /Routing Preference: Internet/.test(r.p) && r.u === "Standard Data Transfer Out", "internet data transfer out");
      lines.push(line("Data transfer out to the internet (GB)", g, usage.egressGbPerMonth * scale));
      ctx.services.add("Bandwidth");
    }
    const total = round4(lines.reduce((s, l) => s + l.usd, 0));
    for (const code of pricerServiceCodes(pricer)) ctx.services.add(code);
    return { ...base, status: res.notItemized ? "not-itemized" : "estimated", pricer, category: CATEGORY[pricer] || "Other", monthlyUsd: total, lines, assumptions: [...assumptions.values()], notes: [...(res.notes || []), ...(res.notItemized ? [res.notItemized] : [])], ...(res.model ? { model: res.model } : {}) };
  } catch (e) {
    if (!(e instanceof PricingError)) throw e;
    return { ...base, status: "needs-input", pricer, category: CATEGORY[pricer] || "Other", assumptions: [...assumptions.values()], notes: [e.message] };
  }
}
const SERVICE_CODES = { functions: ["Functions"], appservice: ["Azure App Service"], vm: ["Virtual Machines"], storage: ["Storage"], cosmos: ["Azure Cosmos DB"], sqldb: ["SQL Database"], servicebus: ["Service Bus"],
  eventhubs: ["Event Hubs"], apim: ["API Management"], appgw: ["Application Gateway"], frontdoor: ["Azure Front Door Service"], keyvault: ["Key Vault"], loganalytics: ["Log Analytics"], search: ["Azure Cognitive Search"],
  openai: ["Foundry Models"], docintel: ["Foundry Tools"], contentsafety: ["Foundry Tools"], redis: ["Redis Cache"], aks: ["Azure Kubernetes Service", "Virtual Machines"], acr: ["Container Registry"], firewall: ["Azure Firewall"],
  bastion: ["Azure Bastion"], eventgrid: ["Event Grid"], lb: ["Load Balancer"], publicip: ["Virtual Network"] };
const pricerServiceCodes = (p) => SERVICE_CODES[p] || [];

function runAll(nodes, ctx, scale) { return nodes.map((n) => runNode(n, ctx, scale)); }
const sum = (xs) => round4(xs.reduce((s, x) => s + x, 0));

export function estimateCost(diagram, { region, scale = 1, usage: overrides, scales = [1, 3, 10], asOf = new Date() } = {}) {
  const spec = diagram.spec || {};
  const rgn = region || spec.meta?.cost?.region || "eastus";
  const pb = loadPriceBook(rgn);
  const ctx = { pb, overrides, services: new Set() };
  const nodes = diagram.nodeList || [];
  const results = runAll(nodes, ctx, scale);
  const counted = results.filter((r) => ["estimated", "override"].includes(r.status));
  const monthly = sum(counted.map((r) => r.monthlyUsd));
  const byCategory = {};
  for (const r of counted) byCategory[r.category] = sum([(byCategory[r.category] || 0), r.monthlyUsd]);
  const defaulted = results.flatMap((r) => r.assumptions.filter((a) => a.source === "default").map((a) => ({ node: r.id, key: a.key, value: a.value })));
  const count = (st) => results.filter((r) => r.status === st).length;
  const sensitivity = scales.map((s) => ({ scale: s, monthlyUsd: s === scale ? monthly : sum(runAll(nodes, { pb, overrides, services: new Set() }, s).filter((r) => ["estimated", "override"].includes(r.status)).map((r) => r.monthlyUsd)) }));
  const whatIfs = computeWhatIfs(nodes, ctx, results, scale);
  return {
    schema_version: "archify-azure.cost.v1",
    asOf: asOf.toISOString().slice(0, 10), region: rgn, currency: "USD", scale,
    basis: "Public pay-as-you-go list prices from the Azure Retail Prices API (USD). Excludes taxes, support plans, Reservations, Savings Plans, Spot and enterprise or EA discounts, and data transfer unless a node sets egressGbPerMonth. Free grants are included where the meter has a free tier. Monthly = 730 hours. Not a quote: confirm with the Azure Pricing Calculator.",
    totals: { monthlyUsd: monthly, annualUsd: round4(monthly * 12), byCategory },
    coverage: { nodes: results.length, estimated: count("estimated"), override: count("override"), noCharge: count("no-charge"), notBillable: count("not-billable"), notItemized: count("not-itemized"), needsInput: count("needs-input"), notEstimated: count("not-estimated"), error: count("error") },
    confidence: defaulted.length ? "indicative" : "usage-based",
    defaultedAssumptions: defaulted,
    nodes: results, sensitivity, whatIfs,
    priceBook: { region: rgn, retrievedAt: pb.retrievedAt, publications: pb.publications(ctx.services) },
  };
}

/** Deterministic what-ifs computed from the same price book (never estimated by reasoning). */
function computeWhatIfs(nodes, ctx, results, scale) {
  const out = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const r of results) {
    const n = byId.get(r.id);
    const usage = { ...(n.item.usage || {}), ...(ctx.overrides?.[n.id] || {}) };
    if (r.status !== "estimated") continue;
    const rerun = (patch) => { const alt = runNode({ ...n, item: { ...n.item, usage: { ...usage, ...patch } } }, { ...ctx, overrides: {}, services: new Set() }, scale); return alt.status === "estimated" ? alt.monthlyUsd : null; };
    if (r.pricer === "functions" && (usage.plan || "consumption") === "consumption") {
      const alt = rerun({ plan: "flex" });
      if (alt !== null && alt < r.monthlyUsd) out.push({ id: `functions-flex:${r.id}`, node: r.id, pillar: "cost-optimization", title: `Run ${r.label} on the Flex Consumption plan`, monthlyDeltaUsd: round4(alt - r.monthlyUsd), basis: "Same executions, duration and memory re-priced with Flex Consumption on-demand rates; excludes always-ready instances and assumes the app fits the plan." });
    }
    if (r.pricer === "sqldb" && usage.zoneRedundant) {
      const alt = rerun({ zoneRedundant: false });
      if (alt !== null) out.push({ id: `sql-zr:${r.id}`, node: r.id, pillar: "reliability", title: `Cost of zone redundancy for ${r.label}`, monthlyDeltaUsd: round4(r.monthlyUsd - alt), basis: "Zone-redundant price minus non-zone-redundant price for the same vCores, tier and storage — the monthly price of the availability-zone resilience.", tradeoff: true });
    }
    if (r.pricer === "openai" && usage.batchEligiblePct > 0 && (usage.mode || "standard") === "standard") {
      const std = r.monthlyUsd, batch = rerun({ mode: "batch" });
      if (batch !== null && batch < std) out.push({ id: `openai-batch:${r.id}`, node: r.id, pillar: "cost-optimization", title: `Move ${usage.batchEligiblePct}% of ${r.label} traffic to a batch deployment`, monthlyDeltaUsd: round4(-(std - batch) * usage.batchEligiblePct / 100), basis: "Standard vs batch token rates from the Retail Prices API for the same model and deployment type; only latency-tolerant traffic qualifies." });
    }
    if (r.pricer === "storage" && usage.infrequentPct > 0 && (usage.accessTier || "hot") === "hot") {
      const alt = rerun({ accessTier: "cool" });
      if (alt !== null) out.push({ id: `blob-cool:${r.id}`, node: r.id, pillar: "cost-optimization", title: `Tier ${usage.infrequentPct}% of ${r.label} data to the Cool tier`, monthlyDeltaUsd: round4((alt - r.monthlyUsd) * usage.infrequentPct / 100), basis: "Blob lines re-priced at the Cool tier; excludes data retrieval fees and the 30-day minimum retention." });
    }
  }
  return out.filter((w) => w.monthlyDeltaUsd !== 0);
}
