#!/usr/bin/env node
// Re-renders every spec in examples/*.json and examples/<folder>/*.json (except iac/ and mermaid/, which hold imports)
// to the sibling out/ folder: html + svg + png + draw.io, plus a finalize receipt.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "bin", "archify-azure.mjs");
const run = (...a) => { const r = spawnSync(process.execPath, [bin, ...a], { cwd: root, stdio: "inherit" }); if (r.status) process.exit(r.status); };
const dirs = ["examples", ...fs.readdirSync(path.join(root, "examples"), { withFileTypes: true }).filter((d) => d.isDirectory() && !["out", "iac", "mermaid"].includes(d.name)).map((d) => path.join("examples", d.name))];
for (const dir of dirs) {
  const out = path.join(dir, "out");
  fs.mkdirSync(path.join(root, out), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, dir)).filter((n) => n.endsWith(".json"))) {
    const html = path.join(out, f.replace(/\.json$/, ".html"));
    run("render", path.join(dir, f), "-o", html, "--svg", "--png", "--drawio");
    run("finalize", path.join(dir, f), "-o", html);
  }
}
