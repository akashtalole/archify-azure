#!/usr/bin/env node
// Re-renders every examples/*.json to examples/out/: html + svg + png + draw.io, plus a finalize receipt.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "bin", "archify-azure.mjs");
const run = (...a) => { const r = spawnSync(process.execPath, [bin, ...a], { cwd: root, stdio: "inherit" }); if (r.status) process.exit(r.status); };
fs.mkdirSync(path.join(root, "examples", "out"), { recursive: true });
for (const f of fs.readdirSync(path.join(root, "examples")).filter((n) => n.endsWith(".json"))) {
  const out = path.join("examples", "out", f.replace(/\.json$/, ".html"));
  run("render", path.join("examples", f), "-o", out, "--svg", "--png", "--drawio");
  run("finalize", path.join("examples", f), "-o", out);
}
