#!/usr/bin/env node
// Downloads the official Azure Architecture Icons package, extracts the SVGs into assets/azure-icons/ and
// rebuilds data/catalog.json. The icons are NOT committed to this repo: Microsoft distributes them under its own
// terms (https://learn.microsoft.com/azure/architecture/icons/).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readZip } from "../src/zip.mjs";
import { buildCatalog } from "../src/catalog-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip";
const RELEASE = "Azure Architecture Icons V24 + Power Platform + Microsoft Fabric icons";
// Official Power Platform / Copilot Studio icons (https://learn.microsoft.com/power-platform/guidance/icons), added as category `power-platform`.
const POWER_URL = process.env.ARCHIFY_POWER_ICON_URL || "https://download.microsoft.com/download/498606aa-6d27-4f13-aa5c-1401078c153b/Power-Platform-icons-scalable.zip";
// Microsoft Fabric icons (https://learn.microsoft.com/fabric/fundamentals/icons): the npm package @fabric-msft/svg-icons as published in
// microsoft/fabric-samples (docs-samples/Icons.zip). We keep the 5 workload icons (48px, colour) and every 64px item icon.
const FABRIC_URL = process.env.ARCHIFY_FABRIC_ICON_URL || "https://raw.githubusercontent.com/microsoft/fabric-samples/main/docs-samples/Icons.zip";
const FABRIC_WORKLOADS = { fabric: "Microsoft-Fabric", power_bi: "Fabric-Power-BI", real_time_intelligence: "Fabric-Real-Time-Intelligence", data_engineering: "Fabric-Data-Engineering", data_science: "Fabric-Data-Science" };
const titleCase = (s) => s.split("_").map((w) => (w.length <= 3 && /^(sql|kql|rdl|api|ai)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join("-");
const POWER_NAMES = { CopilotStudio: "Copilot-Studio", Agent365: "Agent-365", AIBuilder: "AI-Builder", Dataverse: "Dataverse", PowerApps: "Power-Apps", PowerAutomate: "Power-Automate", PowerPages: "Power-Pages", PowerPlatform: "Microsoft-Power-Platform", PowerBI: "Power-BI" };

const args = process.argv.slice(2);
const zipArg = args.find((a) => a.endsWith(".zip") && fs.existsSync(a) && !/power|fabric/i.test(a));
const fabricZipArg = args.find((a) => a.endsWith(".zip") && fs.existsSync(a) && /fabric/i.test(a));
const powerZipArg = args.find((a) => a.endsWith(".zip") && fs.existsSync(a) && /power/i.test(a));
const url = args.find((a) => a.startsWith("http")) || process.env.ARCHIFY_AZURE_ICON_URL || DEFAULT_URL;
const out = path.resolve(process.env.ARCHIFY_AZURE_ICONS || path.join(root, "assets", "azure-icons"));

let buf;
if (zipArg) buf = fs.readFileSync(zipArg);
else {
  console.error(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  buf = Buffer.from(await res.arrayBuffer());
}

fs.rmSync(out, { recursive: true, force: true });
let n = 0;
for (const e of readZip(buf)) {
  // Azure_Public_Service_Icons/Icons/<category>/<id>-icon-service-<Name>.svg
  const m = /^[^/]+\/Icons\/([^/]+)\/([^/]+\.svg)$/.exec(e.name);
  if (e.isDir || !m) continue;
  const cat = m[1].replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const dest = path.join(out, cat, m[2].replace(/\s+/g, ""));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, e.data());
  n++;
}
console.error(`Extracted ${n} SVG icons to ${path.relative(process.cwd(), out)}`);

// Fabric icons are in a 30 MB npm-package zip; ".../dist/svg/<name>_<size>_<style>.svg". Failure is not fatal.
if (!args.includes("--no-fabric")) {
  try {
    let fbuf;
    if (fabricZipArg) fbuf = fs.readFileSync(fabricZipArg);
    else { console.error(`Downloading ${FABRIC_URL}`); const r = await fetch(FABRIC_URL); if (!r.ok) throw new Error(`HTTP ${r.status}`); fbuf = Buffer.from(await r.arrayBuffer()); }
    let fn = 0;
    for (const e of readZip(fbuf)) {
      const m = /dist\/svg\/([a-z0-9_]+?)_(\d+)_(item|color)\.svg$/.exec(e.name);
      if (e.isDir || !m) continue;
      const [, name, size, style] = m;
      let key = null;
      if (style === "color" && size === "48" && FABRIC_WORKLOADS[name]) key = FABRIC_WORKLOADS[name];
      else if (style === "item" && size === "64") key = "Fabric-" + titleCase(name);
      if (!key) continue;
      const dest = path.join(out, "fabric", `${key}.svg`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.data());
      fn++;
    }
    console.error(`Extracted ${fn} Microsoft Fabric icons`);
  } catch (e) { console.error(`warning: Fabric icons not added (${e.message})`); }
}

// Power Platform icons: <Name>_scalable.svg (flat or in a folder). Failure to download is not fatal.
if (!args.includes("--no-power")) {
  try {
    let pbuf;
    if (powerZipArg) pbuf = fs.readFileSync(powerZipArg);
    else { console.error(`Downloading ${POWER_URL}`); const r = await fetch(POWER_URL); if (!r.ok) throw new Error(`HTTP ${r.status}`); pbuf = Buffer.from(await r.arrayBuffer()); }
    let pn = 0;
    for (const e of readZip(pbuf)) {
      const m = /(?:^|\/)([A-Za-z0-9]+)_scalable\.svg$/.exec(e.name);
      if (e.isDir || !m || !POWER_NAMES[m[1]]) continue;
      const dest = path.join(out, "power-platform", `${POWER_NAMES[m[1]]}.svg`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.data());
      pn++;
    }
    console.error(`Extracted ${pn} Power Platform icons`);
  } catch (e) { console.error(`warning: Power Platform icons not added (${e.message})`); }
}
const cat = buildCatalog(out, RELEASE);
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "catalog.json"), JSON.stringify(cat, null, 1) + "\n");
console.error(`Catalog: ${cat.services.length} services, ${cat.general.length} general, ${cat.groups.length} group icons`);
