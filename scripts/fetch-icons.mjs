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
const RELEASE = "Azure Architecture Icons V24";

const args = process.argv.slice(2);
const zipArg = args.find((a) => a.endsWith(".zip") && fs.existsSync(a));
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
const cat = buildCatalog(out, RELEASE);
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "catalog.json"), JSON.stringify(cat, null, 1) + "\n");
console.error(`Catalog: ${cat.services.length} services, ${cat.general.length} general, ${cat.groups.length} group icons`);
