// Price ingestion from the public Azure Retail Prices API (https://prices.azure.com/api/retail/prices, no credentials,
// pay-as-you-go "Consumption" prices only). Rows are normalized into a compact form; tier ends are derived because the
// API only reports where a tier begins. The Azure OpenAI / Foundry model meters have no regular naming, so their rows are
// parsed into a separate `ai` table (model, direction, deployment type) by `parseModelMeter`.
export const API = "https://prices.azure.com/api/retail/prices";
export const GLOBAL_REGIONS = ["Global", ""]; // prices that apply to every region

const num = (x) => Number(x);

/** Compact row from one API item. u = meter, p = product, k = SKU, arm = armSkuName, r = armRegionName. */
export function compactRow(i) {
  return { sku: i.meterId, u: i.meterName, p: i.productName, k: i.skuName, unit: i.unitOfMeasure, usd: String(i.retailPrice), b: num(i.tierMinimumUnits || 0), e: null, r: i.armRegionName, arm: i.armSkuName || undefined };
}

/** Drop exact duplicates (the same meter is listed for the region and for Global) and fill each tier's end from the next tier. */
export function normalizeRows(items) {
  const seen = new Set(), rows = [];
  for (const i of items) {
    if (i.type && i.type !== "Consumption") continue;
    const key = `${i.meterId}|${i.tierMinimumUnits}|${i.retailPrice}|${i.skuName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(compactRow(i));
  }
  const byMeter = new Map();
  for (const r of rows) { const k = `${r.sku}|${r.p}|${r.k}`; (byMeter.get(k) || byMeter.set(k, []).get(k)).push(r); }
  for (const list of byMeter.values()) {
    list.sort((a, b) => a.b - b.b);
    list.forEach((r, n) => { r.e = n + 1 < list.length ? list[n + 1].b : null; });
  }
  return rows;
}

// ---- Azure OpenAI / Foundry model meters
const DIR = { inp: "in", inpt: "in", input: "in", in: "in", outp: "out", outpt: "out", out: "out", opt: "out", output: "out" };
const CACHE = new Set(["cchd", "ccchd", "cached", "cd", "cched", "cache"]);
const DEP = { glbl: "global", gl: "global", global: "global", regnl: "regional", rgnl: "regional", regional: "regional", dzone: "datazone", dz: "datazone", dzn: "datazone", datazone: "datazone" };
const MODALITY = new Set(["aud", "audio", "rt", "realtime", "tts", "transcribe", "img", "image", "ft", "grader", "hosting", "pp", "longco", "dev", "prvw", "preview", "txt", "text", "ptu", "finetune", "training"]);

/** Parse a Foundry Models meter name into {model, dir, dep, batch, cache}; null when it is not a plain token price. */
export function parseModelMeter(meterName, unit) {
  if (!/tokens?$/i.test(meterName) && !/^1[KM]$/i.test(unit)) return null;
  const tokens = meterName.toLowerCase().replace(/\btokens?\b/g, " ").replace(/\b1m\b/g, " ").replace(/(\d)\.(\d)/g, "$1_$2").split(/[^a-z0-9_]+/).filter(Boolean).map((t) => t.replace("_", "."));
  let dir = null, dep = null, batch = false, cache = false;
  const model = [];
  let seenDir = false;
  for (let n = 0; n < tokens.length; n++) {
    const t = tokens[n];
    if (DIR[t] && !seenDir && n > 0) { dir = DIR[t]; seenDir = true; continue; }
    if (t === "data" && tokens[n + 1] === "zone") { dep = "datazone"; n++; continue; }
    if (DEP[t]) { dep = DEP[t]; continue; }
    if (t === "batch") { batch = true; continue; }
    if (CACHE.has(t)) { cache = true; continue; }
    if (!seenDir) model.push(t);
  }
  if (!dir && model.some((t) => /embed/.test(t))) dir = "in"; // embedding models bill input tokens only
  if (!dir || !dep || !model.length) return null;
  return { model: model.join("-"), dir, dep, batch, cache, modal: model.some((t) => MODALITY.has(t)) };
}

export function modelRows(items) {
  const out = [], seen = new Set();
  for (const i of items) {
    if (i.type && i.type !== "Consumption") continue;
    const m = parseModelMeter(i.meterName, i.unitOfMeasure);
    if (!m || Number(i.tierMinimumUnits)) continue;
    const key = `${i.meterId}|${i.retailPrice}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...m, unit: i.unitOfMeasure, usd: String(i.retailPrice), meter: i.meterName, product: i.productName, sku: i.meterId });
  }
  return out;
}
