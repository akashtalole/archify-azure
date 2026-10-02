#!/usr/bin/env node
// Builds data/drawio/azure2.json: every icon in draw.io's built-in Azure library (img/lib/azure2/<category>/<File>.svg)
// with its title, extracted from draw.io's Sidebar-Azure2.js (Apache-2.0, jgraph/drawio).
//   node scripts/build-drawio-map.mjs [path/to/Sidebar-Azure2.js]   (downloads it when no path is given)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = "https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/js/diagramly/sidebar/Sidebar-Azure2.js";
const src = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : await (await fetch(URL_)).text();

// palette function name -> image folder, from `this.addAzure2XPalette(gn, r, sb, s + 'folder/')`
const folders = {};
for (const m of src.matchAll(/this\.(addAzure2\w+Palette)\(gn, r, sb, s \+ '([^']+)'\)/g)) folders[m[1]] = m[2].replace(/\/$/, "");
const out = {};
const parts = src.split(/\n\tSidebar\.prototype\.(addAzure2\w+Palette) = function/);
for (let i = 1; i < parts.length; i += 2) {
  const folder = folders[parts[i]];
  if (!folder) continue;
  for (const m of parts[i + 1].matchAll(/createVertexTemplateEntry\(s \+ '([^']+\.svg);',\s*([^,]+),\s*([^,]+),\s*'',\s*'([^']*)'/g)) {
    const key = `${folder}/${m[1]}`;
    if (!out[key]) out[key] = { title: m[4], folder, file: m[1] };
  }
}
if (Object.keys(out).length < 400) throw new Error(`only ${Object.keys(out).length} icons parsed — draw.io's Sidebar-Azure2.js format may have changed`);
fs.mkdirSync(path.join(ROOT, "data", "drawio"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data", "drawio", "azure2.json"), JSON.stringify(out) + "\n");
console.log(`${Object.keys(out).length} icons in ${new Set(Object.values(out).map((v) => v.folder)).size} folders -> data/drawio/azure2.json`);
