// Per-service cost models. Each pricer turns a node's usage assumptions into line items using rates from the
// price book (never hard-coded prices). Quantities are per month; free grants are part of the tiered meters; taxes,
// support plans, reservations and discounts are excluded.
import { tiered, round4, PricingError, HOURS_PER_MONTH } from "./pricebook.mjs";

const unitDiv = (unit) => { const m = String(unit).match(/^(\d+)(?:\s*([KM])(?![A-Za-z]))?/i); return m ? Number(m[1]) * (m[2] ? (m[2].toUpperCase() === "M" ? 1e6 : 1e3) : 1) : 1; };
const DAYS_PER_MONTH = HOURS_PER_MONTH / 24;
const nz = (s) => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, "");

/** Build a line item: qty (in the rate's unit) priced through tiers. `variable` lines scale with traffic. */
export function line(label, rows, qty, { variable = true, qtyLabel } = {}) {
  const t = tiered(rows, qty);
  return { label, qty, unit: rows[0].unit, usd: round4(t.usd), rate: rows.length === 1 ? Number(rows[0].usd) : null, tiered: t.tiers.length > 1, sku: rows[0].sku, usagetype: rows[0].u, variable, ...(qtyLabel ? { qtyLabel } : {}) };
}
const sumLines = (ls) => ls.reduce((s, l) => s + l.usd, 0);

// ---------------------------------------------------------------- Azure OpenAI / Foundry model matching
const normModel = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
/** Resolve a user model name against the parsed token meters. Exact match wins; otherwise the name must be an unambiguous prefix. */
export function findModel(pb, text) {
  const q = normModel(text);
  if (!q) throw new PricingError('usage.model is required (for example "gpt-4o-0806", "gpt-5-mini" or "text-embedding-3-small")');
  const plain = [...new Set(pb.ai.filter((r) => !r.modal).map((r) => r.model))];
  const all = [...new Set(pb.ai.map((r) => r.model))];
  const exact = all.filter((m) => normModel(m) === q);
  let pick = exact;
  if (!pick.length) pick = plain.filter((m) => normModel(m).startsWith(q + "-") || normModel(m).startsWith(q));
  if (!pick.length) throw new PricingError(`no Azure OpenAI / Foundry model matches "${text}" in the price book`);
  if (pick.length > 1) throw new PricingError(`"${text}" matches several models (${pick.slice(0, 6).join("; ")}) — use the full name including the version`);
  return pick[0];
}
function modelRates(pb, model, dep, batch) {
  const out = {};
  for (const r of pb.ai) {
    if (r.model !== model || r.dep !== dep || r.batch !== batch) continue;
    const kind = r.dir === "in" ? (r.cache ? "cachedIn" : "in") : "out";
    if (!out[kind]) out[kind] = r;
  }
  return out;
}

// ---------------------------------------------------------------- pricers
const SKU = (s) => nz(s).replace(/^standard/, "");
export const PRICERS = {
  functions: {
    label: "Azure Functions",
    run({ pb, u, vol }) {
      const plan = u("plan", "consumption");
      if (plan === "premium") {
        const n = u("instances", 1), vcpu = u("vcpu", 1), mem = u("memoryGb", 3.5), hrs = u("hoursPerMonth", HOURS_PER_MONTH);
        const c = pb.dim("Functions", (r) => r.p === "Premium Functions" && /vCPU Duration/.test(r.u), "Functions Premium vCPU"), m = pb.dim("Functions", (r) => r.p === "Premium Functions" && /Memory Duration/.test(r.u), "Functions Premium memory");
        return { lines: [line("Premium vCPU hours", c, n * vcpu * hrs, { variable: false }), line("Premium memory GiB-hours", m, n * mem * hrs, { variable: false })], notes: ["Premium plan: always-ready instances billed for the whole month."] };
      }
      const flex = plan === "flex";
      const req = vol("requestsPerMonth", 1e6), ms = u("avgDurationMs", 200), mem = u("memoryMb", 512);
      const gbs = req * (ms / 1000) * (Math.max(128, mem) / 1024);
      const prod = flex ? "Flex Consumption" : "Functions", sku = flex ? "On Demand" : "Standard";
      const e = pb.dim("Functions", (r) => r.p === prod && r.k === sku && /Total Executions/.test(r.u), "Functions executions"), t = pb.dim("Functions", (r) => r.p === prod && r.k === sku && /Execution Time/.test(r.u), "Functions execution time");
      return { lines: [line("Executions", e, req / unitDiv(e[0].unit)), line("Execution time (GB-seconds)", t, gbs, { qtyLabel: `${Math.round(gbs).toLocaleString("en-US")} GB-s` })], notes: [`${flex ? "Flex Consumption" : "Consumption"} plan; the monthly free grant is included in the tiered meters.`] };
    },
  },
  appservice: {
    label: "Azure App Service",
    run({ pb, u }) {
      const sku = nz(u("sku", "P1v3")), os = u("os", "linux"), n = u("instances", 2), hrs = u("hoursPerMonth", HOURS_PER_MONTH);
      const rows = pb.dim("Azure App Service", (r) => nz(r.k) === sku && r.unit === "1 Hour" && /App Service .*Plan/.test(r.p) && !/Free|Shared|Isolated|Container|Spot|Reserved/.test(r.p) && (os === "linux" ? /- Linux/.test(r.p) : !/Linux/.test(r.p)), `App Service ${sku} (${os})`);
      return { lines: [line(`${sku.toUpperCase()} plan instance-hours (${os})`, rows, n * hrs, { variable: false })], notes: ["Plan price per instance-hour; apps on the same plan share it."] };
    },
  },
  vm: {
    label: "Azure Virtual Machines",
    run({ pb, u }) {
      const size = u("vmSize", "Standard_D2s_v5"), n = u("count", 2), hrs = u("hoursPerMonth", HOURS_PER_MONTH);
      const rows = pb.dim("Virtual Machines", (r) => r.arm === size, `${size} Linux pay-as-you-go`);
      return { lines: [line(`${size} instance-hours (Linux)`, rows, n * hrs, { variable: false })], notes: ["Linux pay-as-you-go compute only; excludes OS and data disks, public IPs, networking and Windows/SQL licences."] };
    },
  },
  storage: {
    label: "Azure Storage (Blob)",
    run({ pb, u, vol }) {
      const tier = u("accessTier", "hot"), red = u("redundancy", "LRS"), gb = vol("storageGb", 100), wr = vol("writeOperationsPerMonth", 1e5), rd = vol("readOperationsPerMonth", 1e6);
      const T = tier[0].toUpperCase() + tier.slice(1).toLowerCase(), sku = `${T} ${red}`;
      const p = (re, what) => pb.dim("Storage", (r) => /^(General Block Blob v2|Blob Storage)$/.test(r.p) && r.k === sku && re.test(r.u), `${what} (${sku})`);
      const s = p(/Data Stored$/, "blob data stored"), w = p(/Write Operations$/, "write operations"), r = p(/(Read Operations|All Other Operations)$/, "read operations");
      return { lines: [line(`Data stored, ${sku} (GB-month)`, s, gb), line("Write operations", w, wr / unitDiv(w[0].unit)), line("Read operations", r, rd / unitDiv(r[0].unit))], notes: ["Excludes data retrieval and early-deletion charges, egress and transactions on other APIs."] };
    },
  },
  cosmos: {
    label: "Azure Cosmos DB",
    run({ pb, u, vol }) {
      const mode = u("mode", "provisioned"), ru = u("ruPerSecond", 1000), gb = vol("storageGb", 50), hrs = u("hoursPerMonth", HOURS_PER_MONTH), regions = u("regions", 1);
      const lines = [];
      if (mode === "autoscale") {
        const r = pb.dim("Azure Cosmos DB", (x) => x.p === "Azure Cosmos DB autoscale" && /100 RUs$/.test(x.u) && x.k === "AP1", "Cosmos DB autoscale RU/s");
        lines.push(line("Autoscale 100 RU/s units (max RU/s, hours)", r, (ru / 100) * hrs * regions, { variable: false }));
      } else {
        const r = pb.dim("Azure Cosmos DB", (x) => x.p === "Azure Cosmos DB" && x.k === "RUs" && /^100 RU\/s$/.test(x.u), "Cosmos DB provisioned RU/s");
        lines.push(line("Provisioned 100 RU/s units (hours)", r, (ru / 100) * hrs * regions, { variable: false }));
      }
      const s = pb.dim("Azure Cosmos DB", (x) => x.p === "Azure Cosmos DB" && x.k === "RUs" && x.u === "Data Stored", "Cosmos DB transactional storage");
      lines.push(line("Transactional storage (GB-month)", s, gb * regions));
      return { lines, notes: ["Single-region writes, standard provisioned or autoscale throughput. Serverless, multi-region writes, backup and analytical storage are not modelled."] };
    },
  },
  sqldb: {
    label: "Azure SQL Database",
    run({ pb, u, vol }) {
      const tier = u("tier", "general-purpose"), vcores = u("vcores", 2), zr = u("zoneRedundant", false), gb = vol("storageGb", 100), hrs = u("hoursPerMonth", HOURS_PER_MONTH);
      const fam = tier === "business-critical" ? "Business Critical" : "General Purpose";
      const prod = new RegExp(`Single/Elastic Pool ${fam} - Compute Gen5`);
      const c = pb.dim("SQL Database", (r) => prod.test(r.p) && r.k === `${vcores} vCore${zr ? " Zone Redundancy" : ""}` && (zr ? /Zone Redundancy vCore/ : /^vCore$/).test(r.u), `${fam} Gen5 ${vcores} vCore${zr ? " zone-redundant" : ""}`);
      const lines = [line(`${fam} Gen5 ${vcores} vCore${zr ? " (zone redundant)" : ""} hours`, c, hrs, { variable: false })];
      const sRe = new RegExp(`Single/Elastic Pool ${fam}( Zone Redundant)?.*Data Stored|Data Stored`);
      const sk = zr ? `${fam} Zone Redundancy` : fam;
      const s = pb.dim("SQL Database", (r) => /Data Stored$/.test(r.u) && r.k.startsWith(sk) && (zr ? /Zone Redundancy/.test(r.k) : !/Zone/.test(r.k)) && sRe.test(r.p + " " + r.u), `${fam} data storage`);
      lines.push(line("Data storage (GB-month)", s, gb));
      return { lines, notes: ["Provisioned vCore, single database. Excludes backup storage beyond the free allocation, licence benefit and serverless auto-pause."], zone: zr };
    },
    whatIf({ usage, base, rerun }) { return null; },
  },
  servicebus: {
    label: "Azure Service Bus",
    run({ pb, u, vol }) {
      const tier = u("tier", "standard"), hrs = HOURS_PER_MONTH;
      if (tier === "premium") {
        const mu = u("messagingUnits", 1), r = pb.dim("Service Bus", (x) => x.k === "Premium" && /Messaging Unit/.test(x.u), "Service Bus Premium messaging unit");
        return { lines: [line("Premium messaging unit-hours", r, mu * hrs, { variable: false })] };
      }
      const ops = vol("operationsPerMonth", 5e6), T = tier === "basic" ? "Basic" : "Standard";
      const o = pb.dim("Service Bus", (x) => x.k === T && /Messaging Operations$/.test(x.u), `Service Bus ${T} operations`);
      const lines = [line(`${T} messaging operations`, o, ops / unitDiv(o[0].unit))];
      if (T === "Standard") { const b = pb.dim("Service Bus", (x) => x.k === "Standard" && x.u === "Standard Base Unit" && /Month/.test(x.unit), "Service Bus Standard base charge"); lines.unshift(line("Standard base charge (month)", b, 1, { variable: false })); }
      return { lines };
    },
  },
  eventhubs: {
    label: "Azure Event Hubs",
    run({ pb, u, vol }) {
      const tier = u("tier", "standard"), tu = u("throughputUnits", 1), ev = vol("ingressEventsPerMonth", 1e7), T = tier === "basic" ? "Basic" : "Standard";
      const t = pb.dim("Event Hubs", (x) => x.k === T && /Throughput Unit/.test(x.u), `Event Hubs ${T} throughput unit`), e = pb.dim("Event Hubs", (x) => x.k === T && /Ingress Events/.test(x.u), `Event Hubs ${T} ingress events`);
      return { lines: [line(`${T} throughput unit-hours`, t, tu * HOURS_PER_MONTH, { variable: false }), line("Ingress events", e, ev / unitDiv(e[0].unit))] };
    },
  },
  apim: {
    label: "Azure API Management",
    run({ pb, u, vol }) {
      const tier = u("tier", "standard");
      if (tier === "consumption") {
        const calls = vol("callsPerMonth", 1e6), r = pb.dim("API Management", (x) => x.k === "Consumption" && /Calls$/.test(x.u), "API Management consumption calls");
        return { lines: [line("Consumption calls", r, calls / unitDiv(r[0].unit))] };
      }
      const T = tier.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), units = u("units", 1);
      const r = pb.dim("API Management", (x) => x.k === T && new RegExp(`^${T} Unit$`).test(x.u), `API Management ${T} unit`);
      return { lines: [line(`${T} unit-hours`, r, units * HOURS_PER_MONTH, { variable: false })] };
    },
  },
  appgw: {
    label: "Azure Application Gateway",
    run({ pb, u, vol }) {
      const waf = u("waf", true), cu = u("avgCapacityUnits", 3), prod = waf ? "Application Gateway WAF v2" : "Application Gateway Standard v2";
      const f = pb.dim("Application Gateway", (x) => x.p === prod && x.u === "Standard Fixed Cost", `${prod} fixed cost`), c = pb.dim("Application Gateway", (x) => x.p === prod && x.u === "Standard Capacity Units", `${prod} capacity units`);
      return { lines: [line("Fixed cost (gateway-hours)", f, HOURS_PER_MONTH, { variable: false }), line("Capacity unit-hours", c, cu * HOURS_PER_MONTH)], notes: [`${waf ? "WAF v2" : "Standard v2"} SKU; autoscale capacity units assumed constant.`] };
    },
  },
  frontdoor: {
    label: "Azure Front Door",
    run({ pb, u, vol }) {
      const tier = u("tier", "standard"), T = tier === "premium" ? "Premium" : "Standard", gb = vol("egressGbPerMonth", 100), req = vol("requestsPerMonth", 1e7);
      const base = pb.dim("Azure Front Door Service", (x) => x.p === "Azure Front Door" && x.k === T && x.u === `${T} Base Fees`, `Front Door ${T} base fee`);
      const lines = [line(`${T} base fee (month)`, base, 1, { variable: false })];
      const r = pb.tryDim("Azure Front Door Service", (x) => x.p === "Azure Front Door" && x.k === T && x.u === `${T} Requests` && /10K/.test(x.unit), "Front Door requests");
      if (r) lines.push(line("Requests", r, req / unitDiv(r[0].unit)));
      const d = pb.tryDim("Azure Front Door Service", (x) => x.p === "Azure Front Door" && x.k === T && x.u === `${T} Data Transfer Out`, "Front Door data transfer out");
      if (d) lines.push(line("Edge data transfer out (GB), zone 1", d, gb));
      return { lines, notes: ["Zone 1 (North America and Europe) rates; other zones cost more. Routing-rule overage and WAF custom rules are not modelled."] };
    },
  },
  keyvault: {
    label: "Azure Key Vault",
    run({ pb, u, vol }) {
      const ops = vol("operationsPerMonth", 1e5), r = pb.dim("Key Vault", (x) => x.k === "Standard" && x.u === "Operations", "Key Vault operations");
      return { lines: [line("Secret and key operations", r, ops / unitDiv(r[0].unit))], notes: ["Standard tier software-protected keys; HSM keys and certificates are not modelled."] };
    },
  },
  loganalytics: {
    label: "Azure Monitor Log Analytics",
    run({ pb, u, vol }) {
      const gb = vol("ingestGbPerMonth", 10), ret = u("retentionDays", 31), kept = vol("retainedGb", 10);
      const i = pb.dim("Log Analytics", (x) => x.k === "Analytics Logs" && /Data Ingestion$/.test(x.u), "Log Analytics ingestion");
      const lines = [line("Data ingestion (GB)", i, gb)];
      if (ret > 31) { const r = pb.dim("Log Analytics", (x) => x.k === "Analytics Logs" && /Data Retention$/.test(x.u), "Log Analytics retention"); lines.push(line(`Retention beyond 31 days (GB-month, ${ret} days)`, r, kept * ((ret - 31) / 30))); }
      return { lines, notes: ["Pay-as-you-go ingestion with the monthly free allowance in the tier; commitment tiers are not modelled."] };
    },
  },
  search: {
    label: "Azure AI Search",
    run({ pb, u }) {
      const sku = u("sku", "standard-s1"), units = u("searchUnits", 3);
      const name = { basic: "Basic", "standard-s1": "Standard S1", "standard-s2": "Standard S2", "standard-s3": "Standard S3" }[sku];
      if (!name) throw new PricingError(`unknown AI Search sku "${sku}" (basic, standard-s1, standard-s2, standard-s3)`);
      const r = pb.dim("Azure Cognitive Search", (x) => x.k === name && x.u === `${name} Unit`, `AI Search ${name} unit`);
      return { lines: [line(`${name} search unit-hours (replicas × partitions)`, r, units * HOURS_PER_MONTH, { variable: false })], notes: ["Semantic ranker, document cracking and agentic retrieval are billed separately and not modelled."] };
    },
  },
  openai: {
    label: "Azure OpenAI / Foundry model inference",
    run({ pb, u, vol }) {
      const model = findModel(pb, u("model", undefined)), dep = u("deployment", "global"), mode = u("mode", "standard");
      if (!["global", "regional", "datazone"].includes(dep)) throw new PricingError(`usage.deployment must be global, regional or datazone (got "${dep}")`);
      const rates = modelRates(pb, model, dep, mode === "batch");
      if (!rates.in) throw new PricingError(`no ${mode} ${dep} input-token rate for ${model} in the price book`);
      const inTok = vol("inputTokensPerMonth", 5e6), outTok = vol("outputTokensPerMonth", rates.out ? 1e6 : 0), cached = vol("cachedInputTokensPerMonth", 0);
      const q = (r, tokens) => tokens / unitDiv(r.unit);
      const row = (r) => [{ sku: r.sku, u: r.meter, unit: r.unit, usd: r.usd, b: 0, e: null }];
      const lines = [line(`${model}: input tokens (${mode}, ${dep})`, row(rates.in), q(rates.in, inTok), { qtyLabel: `${Math.round(inTok).toLocaleString("en-US")} tokens` })];
      if (rates.out) lines.push(line(`${model}: output tokens (${mode}, ${dep})`, row(rates.out), q(rates.out, outTok), { qtyLabel: `${Math.round(outTok).toLocaleString("en-US")} tokens` }));
      if (cached > 0 && rates.cachedIn) lines.push(line("Cached input tokens", row(rates.cachedIn), q(rates.cachedIn, cached)));
      return { lines, model, notes: [`Model matched in the Retail Prices API: ${model}. Pay-as-you-go ${mode} ${dep} deployment; provisioned throughput (PTU) is not modelled.`] };
    },
  },
  docintel: {
    label: "Azure Document Intelligence",
    run({ pb, u, vol }) {
      const feature = u("feature", "read"), pages = vol("pagesPerMonth", 10000), F = { read: "Read", layout: "Layout", prebuilt: "Pre-built", custom: "Custom" }[feature];
      if (!F) throw new PricingError(`unknown Document Intelligence feature "${feature}" (read, layout, prebuilt, custom)`);
      const r = pb.dim("Foundry Tools", (x) => x.p === "Azure Document Intelligence" && x.k === "S0" && new RegExp(`^S0 ${F} Pages$`).test(x.u), `Document Intelligence ${F} pages`);
      return { lines: [line(`${F} pages`, r, pages / unitDiv(r[0].unit))], notes: ["S0 pay-as-you-go pages; commitment tiers and add-on features are not modelled."] };
    },
  },
  contentsafety: {
    label: "Azure AI Content Safety",
    run({ pb, u, vol }) {
      const text = vol("textRecordsPerMonth", 1e5), img = vol("imagesPerMonth", 0);
      const t = pb.dim("Foundry Tools", (x) => x.p === "Content Safety" && x.k === "Standard" && x.u === "Standard Text Records", "Content Safety text records");
      const lines = [line("Text records (1,000 characters each)", t, text / unitDiv(t[0].unit))];
      if (img > 0) { const i = pb.dim("Foundry Tools", (x) => x.p === "Content Safety" && x.k === "Standard" && x.u === "Standard Images", "Content Safety images"); lines.push(line("Images", i, img / unitDiv(i[0].unit))); }
      return { lines };
    },
  },
  redis: {
    label: "Azure Cache for Redis",
    run({ pb, u }) {
      const tier = u("tier", "standard"), size = u("size", "C1"), n = u("instances", 1);
      const T = tier[0].toUpperCase() + tier.slice(1).toLowerCase();
      const r = pb.dim("Redis Cache", (x) => x.p === `Azure Redis Cache ${T}` && x.k === size && x.u === `${size} Cache`, `Redis ${T} ${size}`);
      return { lines: [line(`${T} ${size} cache-hours`, r, n * HOURS_PER_MONTH, { variable: false })], notes: ["Azure Cache for Redis tiers; Azure Managed Redis is not modelled yet."] };
    },
  },
  aks: {
    label: "Azure Kubernetes Service",
    run({ pb, u }) {
      const tier = u("tier", "standard"), size = u("nodeVmSize", "Standard_D4s_v5"), n = u("nodeCount", 3);
      const lines = [];
      if (tier !== "free") { const r = pb.dim("Azure Kubernetes Service", (x) => x.u === "Standard Uptime SLA", "AKS Standard tier"); lines.push(line("Standard tier cluster-hours (uptime SLA)", r, HOURS_PER_MONTH, { variable: false })); }
      const v = pb.dim("Virtual Machines", (x) => x.arm === size, `${size} Linux pay-as-you-go`);
      lines.push(line(`${n} × ${size} node-hours (Linux)`, v, n * HOURS_PER_MONTH, { variable: false }));
      return { lines, notes: ["Free tier has no cluster fee; node pools are billed as virtual machines (disks, load balancer and egress excluded)."] };
    },
  },
  acr: {
    label: "Azure Container Registry",
    run({ pb, u }) {
      const sku = u("sku", "standard"), T = sku[0].toUpperCase() + sku.slice(1).toLowerCase();
      const r = pb.dim("Container Registry", (x) => x.k === T && x.u === `${T} Registry Unit`, `Container Registry ${T}`);
      return { lines: [line(`${T} registry-days`, r, DAYS_PER_MONTH, { variable: false })], notes: ["Included storage per tier; storage above the included amount and geo-replication are not modelled."] };
    },
  },
  firewall: {
    label: "Azure Firewall",
    run({ pb, u, vol }) {
      const sku = u("sku", "standard"), T = sku[0].toUpperCase() + sku.slice(1).toLowerCase(), gb = vol("dataProcessedGbPerMonth", 100);
      const d = pb.dim("Azure Firewall", (x) => x.k === T && x.u === `${T} Deployment`, `Firewall ${T} deployment`), p = pb.dim("Azure Firewall", (x) => x.k === T && x.u === `${T} Data Processed`, `Firewall ${T} data processed`);
      return { lines: [line(`${T} deployment-hours`, d, HOURS_PER_MONTH, { variable: false }), line("Data processed (GB)", p, gb)] };
    },
  },
  bastion: {
    label: "Azure Bastion",
    run({ pb, u }) {
      const sku = u("sku", "basic"), T = sku[0].toUpperCase() + sku.slice(1).toLowerCase();
      const r = pb.dim("Azure Bastion", (x) => x.k === T && x.u === `${T} Gateway`, `Bastion ${T}`);
      return { lines: [line(`${T} bastion-hours`, r, HOURS_PER_MONTH, { variable: false })], notes: ["Outbound data transfer is excluded."] };
    },
  },
  eventgrid: {
    label: "Azure Event Grid",
    run({ pb, u, vol }) {
      const ops = vol("operationsPerMonth", 5e6), r = pb.dim("Event Grid", (x) => x.k === "Standard" && x.u === "Standard Event Operations", "Event Grid operations");
      return { lines: [line("Event operations", r, ops / unitDiv(r[0].unit))], notes: ["The first million operations per month are free (in the tiered meter)."] };
    },
  },
  lb: {
    label: "Azure Load Balancer",
    run({ pb, u }) {
      const rules = u("rules", 5), inc = pb.dim("Load Balancer", (x) => x.k === "Standard" && x.u === "Standard Included LB Rules and Outbound Rules" && x.unit === "1 Hour", "Load Balancer included rules");
      const lines = [line("Standard LB, first 5 rules (hours)", inc, HOURS_PER_MONTH, { variable: false })];
      if (rules > 5) { const o = pb.dim("Load Balancer", (x) => x.k === "Standard" && x.u === "Standard Overage LB Rules and Outbound Rules" && x.usd !== "0", "Load Balancer overage rules"); lines.push(line("Additional rule-hours", o, (rules - 5) * HOURS_PER_MONTH, { variable: false })); }
      return { lines, notes: ["Standard SKU; data processed is billed per GB in some regions and is not modelled."] };
    },
  },
  publicip: {
    label: "Azure Public IP",
    run({ pb, u }) {
      const n = u("count", 1), r = pb.dim("Virtual Network", (x) => x.k === "Standard" && x.u === "Standard IPv4 Static Public IP", "Standard IPv4 static public IP");
      return { lines: [line("Standard static IPv4 address-hours", r, n * HOURS_PER_MONTH, { variable: false })] };
    },
  },
};

/** Catalog service id -> pricer. */
export const SERVICE_PRICER = {
  "function-apps": "functions", "app-services": "appservice", "virtual-machine": "vm", "storage-accounts": "storage", "cosmos-db": "cosmos", "sql-database": "sqldb",
  "service-bus": "servicebus", "event-hubs": "eventhubs", "api-management-services": "apim", "application-gateways": "appgw", "front-door-and-cdn-profiles": "frontdoor",
  "key-vaults": "keyvault", "log-analytics-workspaces": "loganalytics", "cognitive-search": "search", openai: "openai", "form-recognizers": "docintel", "content-safety": "contentsafety",
  "cache-redis": "redis", "kubernetes-services": "aks", "container-registries": "acr", firewalls: "firewall", bastions: "bastion", "event-grid-topics": "eventgrid", "load-balancers": "lb",
  "public-ip-addresses": "publicip", "foundry-models": "openai",
};
/** Services with no direct charge (the cost is in what they manage). */
export const NO_CHARGE = new Set(["web-application-firewall-policies-waf", "entra-id-protection", "entra-managed-identities", "managed-identities", "policy", "advisor", "virtual-networks", "network-security-groups", "application-security-groups", "route-tables", "network-interfaces", "private-endpoints-free", "resource-groups", "subscriptions", "management-groups", "blueprints", "cost-management-and-billing", "alerts", "activity-log", "diagnostics-settings"]);
export { sumLines };
