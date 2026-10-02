#!/usr/bin/env node
// Builds data/prices/<region>.json from the public Azure Retail Prices API (pay-as-you-go, no credentials).
//   node scripts/fetch-prices.mjs [--region eastus] [--services "Functions,Storage"]
// The API is rate limited: requests are spaced out and 429/5xx responses are retried with back-off.
// The price list is list pricing only; it does not reflect your discounts, credits, reservations or free grants.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API, normalizeRows, modelRows } from "../src/cost/pricefile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const region = opt("--region", "eastus");
const only = opt("--services")?.split(",");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const linuxOnDemand = (r) => !/Windows|Cloud Services/.test(r.p) && !/Spot|Low Priority/.test(r.k) && !/Spot|Low Priority/.test(r.u);
// serviceName -> row filter. Keep the snapshot small: only the pricing dimensions the pricers use.
export const SERVICES = {
  Functions: () => true, "Azure App Service": () => true, "Virtual Machines": linuxOnDemand,
  Storage: (r) => /^(Blob Storage|General Block Blob v2|Queues v2)$/.test(r.p),
  "Azure Cosmos DB": (r) => /^Azure Cosmos DB( autoscale)?$/.test(r.p),
  "SQL Database": (r) => /Compute Gen5|Data Stored|Zone Redundan|IO Rate|Serverless/.test(r.p + " " + r.u) || /Single Standard|Single Basic|Single Premium/.test(r.p),
  "Service Bus": () => true, "Event Hubs": () => true, "API Management": () => true, "Application Gateway": () => true,
  "Azure Front Door Service": () => true, "Key Vault": () => true, "Log Analytics": () => true, "Azure Monitor": () => true, "Application Insights": () => true,
  "Azure Cognitive Search": () => true, "Redis Cache": () => true, "Azure Container Apps": () => true, "Azure Kubernetes Service": (r) => /Uptime SLA|Standard|Premium/.test(r.k) && !/Anyscale/.test(r.k),
  "Container Registry": () => true, "Azure Firewall": () => true, "Azure Bastion": () => true, "Event Grid": () => true, "Logic Apps": () => true,
  "Load Balancer": () => true, "Virtual Network": () => true, Bandwidth: (r) => /Routing Preference: Internet|Data Transfer Out/.test(r.p + " " + r.u),
  "Foundry Tools": (r) => /Document Intelligence|^Content Safety$/.test(r.p) && !/Disconnected/.test(r.p),
  "Foundry Models": () => false, // parsed into the `ai` table instead
};
// Front Door lists regional prices by "Zone" instead of Azure region; zone 1 (US/Europe) is used.
const REGION_FILTER = { "Azure Front Door Service": ["Zone 1", "Global", ""] };

async function get(url) {
  for (let a = 0; a < 10; a++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status} for ${url}`);
    await sleep(3000 * (a + 1));
  }
  throw new Error(`giving up on ${url}`);
}
async function fetchService(name) {
  const regions = REGION_FILTER[name] || [region, "Global", ""];
  const flt = `serviceName eq '${name}' and priceType eq 'Consumption' and (${regions.map((r) => `armRegionName eq '${r}'`).join(" or ")})`;
  let next = `${API}?currencyCode=USD&$filter=${encodeURIComponent(flt)}`;
  const items = [];
  while (next) { const j = await get(next); items.push(...j.Items); next = j.NextPageLink; await sleep(600); }
  return items;
}

const file = path.join(root, "data", "prices", `${region}.json`);
const book = fs.existsSync(file) && only ? JSON.parse(fs.readFileSync(file, "utf8")) : { schema_version: "archify-azure.prices.v1", region, services: {}, ai: [] };
book.retrievedAt = new Date().toISOString();
for (const name of Object.keys(SERVICES)) {
  if (only && !only.includes(name)) continue;
  const items = await fetchService(name);
  if (!items.length) { console.error(`${name}: no rows for ${region}`); continue; }
  if (name === "Foundry Models") { book.ai = modelRows(items); console.error(`${name}: ${book.ai.length} token meters parsed from ${items.length} rows`); continue; }
  const rows = normalizeRows(items).filter(SERVICES[name]);
  const dates = items.map((i) => i.effectiveStartDate).filter(Boolean).sort();
  book.services[name] = { publicationDate: dates.length ? dates[dates.length - 1] : null, rows };
  console.error(`${name}: ${rows.length} rows kept of ${items.length}`);
}
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(book) + "\n");
console.error(`wrote ${path.relative(root, file)} (${(fs.statSync(file).size / 1e6).toFixed(2)} MB)`);
