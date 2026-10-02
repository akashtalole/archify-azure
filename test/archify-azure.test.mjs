import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, resolveIcon, searchIcons, iconsAvailable, catalog } from "../src/catalog.mjs";
import { validateSpec } from "../src/spec.mjs";
import { wrapLabel } from "../src/layout.mjs";
import { buildDiagram } from "../src/pipeline.mjs";
import { analyze } from "../src/analysis.mjs";
import { renderPage } from "../src/page.mjs";
import { reviewWorkload, riskLevel } from "../src/wa/evaluate.mjs";
import { LEGACY_RULES, PROCEDURAL_RULES } from "../src/wa/rules.mjs";
import { loadCorpus } from "../src/wa/corpus.mjs";

const needIcons = { skip: !iconsAvailable() && "icons not fetched (run npm run icons:fetch)" };
const read = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "examples", n), "utf8"));
const load = (n) => read(n + ".json");

test("catalog covers the Azure icon package", () => {
  assert.ok(catalog.services.length > 400);
  assert.ok(catalog.groups.some((g) => g.key === "Subscription"));
});

test("icon aliases resolve to catalog entries", () => {
  for (const a of ["functions", "app-service", "aks", "cosmos", "sql", "key-vault", "apim", "front-door", "service-bus", "storage", "openai"]) assert.ok(resolveIcon(a), `alias ${a}`);
  assert.equal(resolveIcon("users").kind, "general");
  assert.equal(resolveIcon("not-a-service"), null);
  assert.ok(searchIcons("cosmos").some((h) => h.id === "cosmos-db"));
});

test("official Power Platform icons are in the catalog with aliases and importer keywords", async () => {
  for (const [a, id] of [["copilot-studio", "copilot-studio"], ["copilot", "copilot-studio"], ["power-automate", "power-automate"], ["dataverse", "dataverse"], ["powerapps", "power-apps"], ["agent-365", "agent-365"]]) assert.equal(resolveIcon(a).entry.id, id, a);
  assert.equal(resolveIcon("copilot-studio").entry.category, "power-platform");
  const { guessIcon } = await import("../src/iconguess.mjs");
  assert.equal(guessIcon("Copilot Studio agent").icon, "copilot-studio");
  assert.notEqual(guessIcon("Order flow").icon, "power-automate");
});

test("label wrapping never breaks a word", () => {
  assert.deepEqual(wrapLabel("Application Gateway Ingress"), ["Application", "Gateway Ingress"]);
  assert.deepEqual(wrapLabel("Key Vault"), ["Key Vault"]);
});

test("validator reports unknown icons with suggestions, bad edges and duplicate ids", () => {
  const spec = { meta: { title: "t" }, root: { children: [{ id: "a", icon: "cosmosdb-x", label: "A" }, { id: "a", icon: "storage-accounts", label: "B" }] }, edges: [{ from: "a", to: "zzz" }] };
  const { errors } = validateSpec(spec);
  assert.ok(errors.some((e) => /unknown icon "cosmosdb-x"/.test(e)));
  assert.ok(errors.some((e) => /duplicate id/.test(e)));
  assert.ok(errors.some((e) => /unknown "to"/.test(e)));
});

test("layout-only stacks cannot be edge endpoints", () => {
  const spec = { meta: { title: "t" }, root: { children: [{ id: "s", kind: "stack", children: [{ id: "a", icon: "storage-accounts", label: "A" }] }, { id: "b", icon: "storage-accounts", label: "B" }] }, edges: [{ from: "s", to: "b" }] };
  assert.ok(validateSpec(spec).errors.some((e) => /layout-only/.test(e)));
});

for (const name of ["three-tier", "serverless-api", "genai-rag", "product-catalog-search", "multi-agent-foundry-fabric-copilot"]) {
  test(`example ${name} renders with no routing warnings and clean routes`, needIcons, async () => {
    const { buildModel } = await import("../src/build.mjs");
    const { renderSvg } = await import("../src/render.mjs");
    const { model, warnings } = buildModel(load(name));
    assert.deepEqual(warnings.filter((w) => !/more than one edge/.test(w)), []);
    const svg = renderSvg(model, load(name));
    assert.match(svg, /^<svg /);
    assert.equal((svg.match(/<symbol /g) || []).length, new Set(svg.match(/<symbol id="[^"]+"/g)).size, "symbols deduplicated");
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, "unique ids");
    for (const sym of svg.match(/<symbol id="[^"]+"/g) || []) assert.match(sym, /id="[A-Za-z0-9_-]+"/, "symbol ids are selector-safe");
    for (const r of model.routes) for (const n of Object.values(model.nodes)) {
      if (n.id === r.edge.from || n.id === r.edge.to) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [a, b] = [r.pts[i], r.pts[i + 1]], c = n.iconRect;
        const hit = Math.max(a[0], b[0]) > c.x && Math.min(a[0], b[0]) < c.x + c.w && Math.max(a[1], b[1]) > c.y && Math.min(a[1], b[1]) < c.y + c.h;
        assert.ok(!hit, `${r.edge.from}->${r.edge.to} crosses ${n.id}`);
      }
    }
  });
}

test("review flags the classic gaps and recognises remedies", needIcons, async () => {
  const { buildModel } = await import("../src/build.mjs");
  const { reviewSpec } = await import("../src/review.mjs");
  const bare = { meta: { title: "t" }, root: { layout: "row", children: [
    { id: "u", icon: "users", label: "Users" }, { id: "fd", icon: "front-door", label: "Front Door" },
    { id: "pub", kind: "public-subnet", children: [{ id: "db", icon: "sql-database", label: "SQL" }, { id: "vm", icon: "virtual-machine", label: "VM" }] }] },
    edges: [{ from: "u", to: "fd" }, { from: "fd", to: "vm" }, { from: "vm", to: "db" }] };
  const r = reviewSpec(bare, buildModel(bare).model);
  const status = (id) => r.findings.find((f) => f.id === id)?.status;
  assert.equal(status("SEC-EDGE"), "gap");
  assert.equal(status("SEC-DB-PUBLIC"), "gap");
  assert.equal(status("OPS-OBSERVE"), "gap");
  const good = reviewSpec(load("three-tier"), buildModel(load("three-tier")).model);
  assert.equal(good.findings.find((f) => f.id === "SEC-EDGE").status, "ok");
});

test("AI workload rules fire for Azure OpenAI workloads", needIcons, async () => {
  const { buildModel } = await import("../src/build.mjs");
  const { reviewSpec } = await import("../src/review.mjs");
  const spec = { meta: { title: "t" }, root: { layout: "row", children: [{ id: "u", icon: "users", label: "Users" }, { id: "fm", icon: "openai", label: "Azure OpenAI" }] }, edges: [{ from: "u", to: "fm" }] };
  const r = reviewSpec(spec, buildModel(spec).model);
  assert.ok(r.genAI);
  assert.equal(r.findings.find((f) => f.id === "AI-GUARDRAILS").status, "gap");
  assert.equal(r.findings.find((f) => f.id === "AI-ENDPOINT").status, "gap");
});

test("sequence diagrams validate, render and expose nodes/edges for the viewer", needIcons, async () => {
  const { SpecError } = await import("../src/pipeline.mjs");
  const spec = load("agent-tool-call.sequence");
  const d = buildDiagram(spec);
  assert.equal(d.type, "sequence");
  const svg = d.svg("light");
  assert.equal((svg.match(/class="node"/g) || []).length, spec.participants.length);
  assert.ok((svg.match(/class="edge"/g) || []).length >= 6);
  assert.equal(d.steps.length, d.steps.map((s) => s.step).filter((v, i, a) => a.indexOf(v) === i).length, "unique step numbers");
  assert.throws(() => buildDiagram({ ...spec, messages: [{ from: "user", to: "nobody", label: "x" }] }), SpecError);
});

test("dataflow stages compile to labelled columns inside an Azure boundary", needIcons, async () => {
  const d = buildDiagram(load("clinical-notes.dataflow"));
  assert.equal(d.type, "dataflow");
  assert.deepEqual(d.warnings.filter((w) => !/more than one edge/.test(w)), []);
  assert.ok(d.model.groups.map((g) => g.kind).includes("azure-cloud"));
  assert.equal(d.model.groups.find((g) => g.id === "src").parent, null);
});

test("router approaches every port along its normal", needIcons, async () => {
  const d = buildDiagram(load("clinical-notes.dataflow"));
  for (const r of d.model.routes) {
    const n = d.model.nodes[r.edge.to];
    if (!n) continue;
    const [a, b] = r.pts.slice(-2);
    const ok = (b[0] === n.iconRect.x || b[0] === n.iconRect.x + n.iconRect.w) ? a[1] === b[1] : (b[1] === n.iconRect.y ? a[0] === b[0] : true);
    assert.ok(ok, `${r.edge.from}->${r.edge.to} must meet the icon perpendicular to its side`);
  }
});

// ---- viewer runtime (needs Chrome; skipped otherwise)
test("viewer: deep links drive reach and route over authored edges only", async (t) => {
  const { chromeAvailable, dumpDom } = await import("../src/browser.mjs");
  if (!iconsAvailable() || !chromeAvailable()) return t.skip("needs icons and Chrome");
  const { execFileSync } = await import("node:child_process");
  const out = path.join(ROOT, ".cache", "viewer-test.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(process.execPath, [path.join(ROOT, "bin", "archify-azure.mjs"), "render", path.join(ROOT, "examples", "genai-rag.json"), "-o", out, "--no-review"]);
  const bar = (dom) => ((dom.match(/<div id="bar"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const spec = load("genai-rag");
  const ids = JSON.stringify(spec).match(/"id":"([a-z0-9_]+)"/g).map((s) => s.slice(6, -1));
  const [first, last] = [spec.edges[0].from, spec.edges[0].to];
  let r = dumpDom(out, { hash: `#route=${first}~${last}` });
  assert.match(bar(r.dom), /1 hop/);
  assert.equal(r.errors.length, 0);
  r = dumpDom(out, { hash: `#route=${last}~${first}` });
  assert.match(bar(r.dom), /no directed route/);
  assert.ok(ids.length > 3);
  r = dumpDom(out, { search: "?present=1&theme=dark" });
  assert.match(r.dom, /<body[^>]*class="[^"]*present/);
  assert.match(r.dom, /<body[^>]*class="[^"]*dark/);
});

// ---- Mermaid import
test("mermaid flowchart import: shapes, chains, subgraphs, labels and icon mapping with confidence", async () => {
  const { importMermaid } = await import("../src/mermaid.mjs");
  const r = importMermaid(`flowchart LR
    U([Customer Browser]) -->|HTTPS| CDN[Front Door CDN] --> API[API Management]
    subgraph Azure Subscription
      API --> F[Orders Function App]
      F -.-> D[(Orders Cosmos DB)]
    end
    F --> P[Payment Gateway]`);
  assert.equal(r.type, "architecture");
  const map = Object.fromEntries(r.report.mappings.map((m) => [m.id, m]));
  assert.equal(map.CDN.icon, "front-door-and-cdn-profiles");
  assert.equal(map.API.icon, "api-management-services");
  assert.equal(map.F.icon, "function-apps");
  assert.equal(map.D.icon, "cosmos-db");
  assert.equal(map.P.confidence, "fallback", "unknown services are reported, not guessed");
  assert.deepEqual(r.report.unmapped, ["P"]);
  assert.equal(r.spec.edges.length, 5);
  assert.ok(r.spec.edges.some((e) => e.from === "F" && e.to === "D" && e.style === "dashed"));
  assert.ok(r.spec.edges.some((e) => e.label === "HTTPS"));
  assert.equal(JSON.stringify(r.spec.root).match(/"kind":"subscription"/g).length, 1, "subgraph named Azure Subscription becomes the subscription group");
});

test("mermaid sequence import: message kinds, notes and fragments", async () => {
  const { importMermaid } = await import("../src/mermaid.mjs");
  const r = importMermaid(`sequenceDiagram
    participant A as API Management
    participant L as Orders Function App
    A->>L: invoke
    L-->>A: ok
    loop retry
      L-)A: event
    end
    Note over A,L: shared note
    L->>L: validate`);
  assert.equal(r.type, "sequence");
  assert.deepEqual(r.spec.messages.map((m) => m.kind || (m.note ? "note" : "sync")), ["sync", "return", "async", "note", "self"]);
  assert.deepEqual(r.spec.fragments, [{ kind: "loop", label: "retry", from: 2, to: 2 }]);
});

test("imported specs validate and render", needIcons, async () => {
  const { importMermaid } = await import("../src/mermaid.mjs");
  for (const f of ["orders-flow.mmd", "checkout.sequence.mmd"]) {
    const r = importMermaid(fs.readFileSync(path.join(ROOT, "examples", "mermaid", f), "utf8"));
    assert.match(buildDiagram(r.spec).svg("light"), /^<svg /);
  }
  assert.throws(() => importMermaid("pie title x\n a: 1"), /unrecognized/);
});

// ---- IaC import
test("terraform (azurerm) import resolves references into edges and groups VNet-attached nodes", async () => {
  const { importIac } = await import("../src/iac.mjs");
  const r = importIac(path.join(ROOT, "examples", "iac", "terraform"));
  assert.equal(r.report.nodes, 8);
  assert.ok(r.spec.edges.length >= 5);
  assert.ok(Object.keys(r.report.skipped).some((k) => /resource_group/.test(k)));
  assert.match(JSON.stringify(r.spec.root), /"kind":"(vnet|azure-cloud)"/);
  const r2 = importIac(path.join(ROOT, "examples", "iac", "terraform"), { include: ["logs", "iam"] });
  assert.ok(r2.report.nodes >= r.report.nodes);
});

test("Bicep import maps resource types and symbolic references", async () => {
  const { importIac } = await import("../src/iac.mjs");
  const r = importIac(path.join(ROOT, "examples", "iac", "bicep"));
  assert.equal(r.report.nodes, 4);
  assert.ok(r.spec.edges.length >= 3);
  assert.deepEqual(Object.keys(r.report.skipped), ["Microsoft.Web/serverfarms"]);
});

test("iac import errors clearly on empty input and renders", needIcons, async () => {
  const { importIac } = await import("../src/iac.mjs");
  assert.throws(() => importIac(path.join(ROOT, "references")), /no Terraform|no .*Bicep|ARM/i);
  for (const d of ["terraform", "bicep"]) {
    const spec = importIac(path.join(ROOT, "examples", "iac", d)).spec;
    assert.deepEqual(buildDiagram(spec).warnings.filter((w) => !/more than one edge/.test(w)), []);
  }
});

// ---- finalize, schemas, guide
test("finalize passes on a good spec and writes a deterministic receipt", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const { finalize } = await import("../src/finalize.mjs");
  const out = path.join(ROOT, ".cache", "fin", "t.html");
  const a = finalize(path.join(ROOT, "examples", "three-tier.json"), { outHtml: out, png: false });
  const b = finalize(path.join(ROOT, "examples", "three-tier.json"), { outHtml: out, png: false });
  assert.equal(a.ok, true, JSON.stringify(a.stages.filter((s) => s.status === "fail")));
  assert.deepEqual(a.stages.map((s) => s.name), ["validate", "analyze", "render", "check", "browser-check"]);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "receipt is deterministic");
  assert.equal(a.visualReview, "not-performed");
  assert.match(a.outputs.html.sha256, /^[0-9a-f]{64}$/);
});

test("finalize stops at the first failing gate and lists every error", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const { finalize } = await import("../src/finalize.mjs");
  const bad = path.join(ROOT, ".cache", "bad.json");
  fs.mkdirSync(path.dirname(bad), { recursive: true });
  fs.writeFileSync(bad, JSON.stringify({ meta: { title: "bad" }, root: { children: [{ id: "a", icon: "cosmosdb-x", label: "A" }, { id: "b", icon: "storage-accounts", label: "B" }] }, edges: [{ from: "a", to: "zz" }] }));
  const r = finalize(bad, { outHtml: path.join(ROOT, ".cache", "bad.html") });
  assert.equal(r.ok, false);
  assert.deepEqual(r.stages.map((s) => s.name + ":" + s.status), ["validate:fail"]);
  assert.ok(r.stages[0].detail.errors.some((e) => /cosmosdb-x/.test(e)) && r.stages[0].detail.errors.some((e) => /zz/.test(e)));
});

for (const f of ["three-tier.json", "serverless-api.json", "genai-rag.json", "product-catalog-search.json", "multi-agent-foundry-fabric-copilot.json", "agent-tool-call.sequence.json", "clinical-notes.dataflow.json"]) {
  test(`example ${f} passes finalize`, async (t) => {
    if (!iconsAvailable()) return t.skip("icons not fetched");
    const { finalize } = await import("../src/finalize.mjs");
    const r = finalize(path.join(ROOT, "examples", f), { outHtml: path.join(ROOT, ".cache", "ex", f.replace(/\.json$/, ".html")), png: false });
    assert.equal(r.ok, true, JSON.stringify(r.stages.filter((s) => s.status === "fail")));
  });
}

test("committed JSON Schemas are in sync with the code's enums", async () => {
  const { buildSchemas } = await import("../src/schemas.mjs");
  const { GROUP_KINDS } = await import("../src/groups.mjs");
  for (const [name, schema] of Object.entries(buildSchemas())) {
    const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", `${name}.schema.json`), "utf8"));
    assert.deepEqual(onDisk, schema, `${name}.schema.json is stale — run node scripts/build-schemas.mjs`);
  }
  assert.deepEqual(buildSchemas().architecture.$defs.groupKind.enum, Object.keys(GROUP_KINDS));
});

test("guide routes scenarios to the right diagram type", async () => {
  const { guideScenario } = await import("../src/schemas.mjs");
  assert.equal(guideScenario("show the request lifecycle and call flow between API Management and Functions with retries").type, "sequence");
  assert.equal(guideScenario("ETL pipeline ingesting streams into a data lake and warehouse").type, "dataflow");
  const a = guideScenario("zone-redundant VNet architecture for an Azure OpenAI RAG agent platform");
  assert.equal(a.type, "architecture");
  assert.ok(a.hints.length > 0);
});

test("icon search matches whole words and honours aliases", () => {
  const ids = (q) => searchIcons(q, 5).map((h) => h.id);
  assert.equal(ids("aks")[0], "kubernetes-services");
  assert.ok(ids("cosmos").includes("cosmos-db"));
  assert.ok(ids("key vault").includes("key-vaults"));
});

// ---- Azure Well-Architected corpus
test("WA corpus parser extracts recommendations from a checklist page", async () => {
  const { parseChecklist } = await import("../src/wa/corpus.mjs");
  const { PILLARS } = await import("../src/wa/corpus.mjs");
  const html = `<table><tr><td>icon</td><td><a href="/azure/well-architected/security/segmentation">SE:04</a></td><td><strong>Create intentional segmentation</strong> and perimeters.</td></tr></table>`;
  const recs = parseChecklist(html, PILLARS.find((p) => p.id === "security"));
  assert.equal(recs.length, 1);
  assert.equal(recs[0].bp_id, "SE:04");
});

test("committed WA snapshot is valid, canonical and carries provenance", () => {
  const fw = loadCorpus("framework");
  assert.equal(fw.pillars.length, 5);
  assert.ok(fw.bps.length >= 55);
  assert.ok(fw.bps.every((r) => /^(RE|SE|CO|OE|PE):\d{2}$/.test(r.bp_id)));
  assert.equal(fw.manifest.valid, true);
  assert.match(fw.manifest.provenance.retrievedAt, /^\d{4}-/);
});

test("WA corpus validation gate rejects empty and duplicate corpora", async () => {
  const { validateCorpus } = await import("../src/wa/corpus.mjs");
  assert.equal(validateCorpus({ pillars: [], bps: [], questions: [] }).valid, false);
  const fw = loadCorpus("framework");
  const dup = { ...fw, bps: [...fw.bps, fw.bps[0]] };
  assert.equal(validateCorpus(dup).valid, false);
});

// ---- Cost estimation (Azure Retail Prices API; deterministic math, explicit assumptions)
const costOf = async (spec, opts) => {
  const { estimateCost } = await import("../src/cost/estimate.mjs");
  return estimateCost(buildDiagram(spec), { asOf: new Date("2026-01-15T00:00:00Z"), ...opts });
};
const mini = (usage, icon = "function-apps") => ({ meta: { title: "t" }, root: { children: [{ id: "n", icon, label: "Node", usage }] } });

test("tiered pricing walks tier boundaries", async () => {
  const { tiered } = await import("../src/cost/pricebook.mjs");
  const rows = [{ b: 0, e: 100, usd: "1" }, { b: 100, e: 300, usd: "0.5" }, { b: 300, e: null, usd: "0.25" }];
  assert.equal(tiered(rows, 50).usd, 50);
  assert.equal(tiered(rows, 400).usd, 100 + 100 + 25);
  assert.equal(tiered(rows, 0).usd, 0);
});

test("Functions cost equals executions × rate + GB-seconds × rate (free grant included), read from the price book", needIcons, async () => {
  const { loadPriceBook, tiered } = await import("../src/cost/pricebook.mjs");
  const pb = loadPriceBook("eastus");
  const e = pb.dim("Functions", (r) => r.p === "Functions" && r.k === "Standard" && /Total Executions/.test(r.u), "e"), t = pb.dim("Functions", (r) => r.p === "Functions" && r.k === "Standard" && /Execution Time/.test(r.u), "t");
  const unit = Number((e[0].unit.match(/^(\d+)/) || [0, 1])[1]) * (/M/i.test(e[0].unit) ? 1e6 : /K/i.test(e[0].unit) ? 1e3 : 1);
  const usage = { plan: "consumption", requestsPerMonth: 20_000_000, avgDurationMs: 300, memoryMb: 1024 };
  const est = await costOf(mini(usage));
  const expected = tiered(e, 20_000_000 / unit).usd + tiered(t, 20_000_000 * 0.3).usd;
  assert.ok(Math.abs(est.nodes[0].monthlyUsd - Math.round(expected * 1e4) / 1e4) < 1e-9, `${est.nodes[0].monthlyUsd} vs ${expected}`);
  assert.equal(est.nodes[0].status, "estimated");
  assert.equal(est.confidence, "usage-based");
});

test("defaults are recorded as assumptions and make the estimate indicative", needIcons, async () => {
  const est = await costOf(mini({ requestsPerMonth: 1e6 }));
  assert.equal(est.confidence, "indicative");
  assert.ok(est.defaultedAssumptions.some((a) => a.key === "avgDurationMs"));
  assert.deepEqual(est.nodes[0].assumptions.find((a) => a.key === "requestsPerMonth"), { key: "requestsPerMonth", value: 1e6, source: "spec", scaledByTraffic: true });
});

test("traffic sensitivity scales variable costs but not fixed hourly costs", needIcons, async () => {
  const fn = await costOf(mini({ requestsPerMonth: 1e8, avgDurationMs: 100, memoryMb: 512 }), { scales: [1, 10] });
  assert.ok(fn.sensitivity[1].monthlyUsd > fn.sensitivity[0].monthlyUsd * 5);
  const vm = await costOf(mini({ vmSize: "Standard_D2s_v5", count: 2 }, "virtual-machine"), { scales: [1, 10] });
  assert.equal(vm.sensitivity[0].monthlyUsd, vm.sensitivity[1].monthlyUsd, "instance-hours do not scale with traffic");
});

test("honesty: unmodelled, ambiguous and unknown inputs are reported, never invented", needIcons, async () => {
  const unmodelled = await costOf(mini({}, "digital-twins"));
  assert.equal(unmodelled.nodes[0].status, "not-estimated");
  assert.equal(unmodelled.totals.monthlyUsd, 0);
  const noModel = await costOf(mini({ inputTokensPerMonth: 1e6 }, "openai"));
  assert.equal(noModel.nodes[0].status, "needs-input");
  assert.match(noModel.nodes[0].notes[0], /usage\.model/);
  const typo = await costOf(mini({ model: "gpt-nonexistent-9" }, "openai"));
  assert.equal(typo.nodes[0].status, "needs-input");
  const badVm = await costOf(mini({ vmSize: "Standard_Nope" }, "virtual-machine"));
  assert.equal(badVm.nodes[0].status, "needs-input");
});

test("override costs are labelled as user-supplied; no-charge and general icons are not priced", needIcons, async () => {
  const o = await costOf({ meta: { title: "t" }, root: { children: [{ id: "a", icon: "digital-twins", label: "DT", usage: { monthlyUsd: 123.456, note: "from quote" } }, { id: "b", icon: "virtual-networks", label: "VNet" }, { id: "c", icon: "users", label: "Users" }] } });
  assert.deepEqual(o.nodes.map((n) => n.status), ["override", "no-charge", "not-billable"]);
  assert.equal(o.totals.monthlyUsd, 123.456);
  assert.equal(o.nodes[0].notes[0], "from quote");
});

test("Azure OpenAI cost matches tokens × per-token rate; model matching is exact or an unambiguous prefix", needIcons, async () => {
  const { loadPriceBook } = await import("../src/cost/pricebook.mjs");
  const { findModel } = await import("../src/cost/pricers.mjs");
  const pb = loadPriceBook();
  const model = findModel(pb, "gpt-4o-0806");
  const inR = pb.ai.find((r) => r.model === model && r.dir === "in" && r.dep === "global" && !r.batch && !r.cache), outR = pb.ai.find((r) => r.model === model && r.dir === "out" && r.dep === "global" && !r.batch);
  const per = (r) => Number(r.usd) / (Number((r.unit.match(/^(\d+)/) || [0, 1])[1]) * (/M/i.test(r.unit) ? 1e6 : /K/i.test(r.unit) ? 1e3 : 1));
  const est = await costOf(mini({ model: "gpt-4o-0806", inputTokensPerMonth: 10e6, outputTokensPerMonth: 2e6 }, "openai"));
  assert.ok(Math.abs(est.nodes[0].monthlyUsd - (10e6 * per(inR) + 2e6 * per(outR))) < 1e-3, `${est.nodes[0].monthlyUsd}`);
  assert.throws(() => findModel(pb, "gpt"), /several models/);
});

test("zone-redundancy what-if is the real price difference", needIcons, async () => {
  const zr = await costOf(mini({ tier: "general-purpose", vcores: 4, zoneRedundant: true, storageGb: 100 }, "sql-database"));
  const single = await costOf(mini({ tier: "general-purpose", vcores: 4, zoneRedundant: false, storageGb: 100 }, "sql-database"));
  const w = zr.whatIfs.find((x) => /^sql-zr/.test(x.id));
  assert.ok(w, "what-if present");
  assert.ok(Math.abs(w.monthlyDeltaUsd - (zr.totals.monthlyUsd - single.totals.monthlyUsd)) < 1e-4);
});

test("cost estimate is deterministic and carries provenance", needIcons, async () => {
  const spec = load("genai-rag");
  const a = await costOf(spec), b = await costOf(spec);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.asOf, "2026-01-15");
  assert.match(a.basis, /pay-as-you-go|on-demand|Retail/i);
  const sumNodes = Math.round(a.nodes.filter((n) => ["estimated", "override"].includes(n.status)).reduce((s, n) => s + n.monthlyUsd, 0) * 1e4) / 1e4;
  assert.equal(a.totals.monthlyUsd, sumNodes);
  assert.equal(a.totals.annualUsd, Math.round(sumNodes * 12 * 1e4) / 1e4);
});

// ---- Well-Architected review engine and report tabs
const sample = () => buildDiagram(load("genai-rag"));

test("WA rules only cite recommendation ids from the corpus", () => {
  const ids = new Set(loadCorpus("framework").bps.map((r) => r.bp_id));
  for (const r of LEGACY_RULES) for (const id of Object.keys(r.fw || {})) assert.ok(ids.has(id), id);
  const src = fs.readFileSync(path.join(ROOT, "src", "wa", "rules.mjs"), "utf8");
  for (const m of src.matchAll(/"((?:RE|SE|CO|OE|PE):\d{2})"/g)) assert.ok(ids.has(m[1]), m[1]);
  assert.ok(PROCEDURAL_RULES.length > 0);
});

test("risk matrix follows the review skill", () => {
  assert.equal(riskLevel("Severe", "High"), "Critical");
  assert.equal(riskLevel("Severe", "Low"), "High");
  assert.equal(riskLevel("Moderate", "High"), "High");
  assert.equal(riskLevel("Moderate", "Medium"), "Medium");
  assert.equal(riskLevel("Minor", "High"), "Medium");
  assert.equal(riskLevel("Minor", "Low"), "Low");
});

test("review assesses every recommendation exactly once, deterministically", () => {
  const d = sample(), { cost } = analyze(d, { review: false }), now = new Date("2026-10-01T00:00:00Z");
  const a = reviewWorkload(d, { cost, now }), b = reviewWorkload(d, { cost, now });
  assert.deepEqual(a, b);
  const fw = loadCorpus("framework");
  assert.equal(a.ledger.length, fw.bps.length);
  assert.equal(new Set(a.ledger.map((x) => x.bp_id)).size, fw.bps.length);
  assert.ok(a.ledger.some((x) => x.status === "Cannot Determine"));
  for (const f of a.findings) assert.match(f.id, /^F-\d{3}$/);
});

test("review modes and criticality", () => {
  const d = sample();
  assert.equal(reviewWorkload(d, { mode: "score" }).ledger.length, 0);
  const sec = reviewWorkload(d, { mode: "pillar", pillars: ["security"] });
  assert.ok(sec.ledger.length > 0 && sec.ledger.every((x) => x.pillar_id === "security"));
  assert.throws(() => reviewWorkload(d, { mode: "bogus" }));
});

test("page has Diagram, Cost and Well-Architected tabs with a full ledger", () => {
  const d = sample(), an = analyze(d), html = renderPage(d, an.wa, "light", an.cost);
  for (const id of ["tab-diagram", "tab-cost", "tab-wa"]) assert.ok(html.includes(`id="${id}"`));
  assert.equal((html.match(/<tr data-s="/g) || []).length, an.wa.ledger.length + (an.wa.lensLedger || []).length);
  assert.ok(!renderPage(d, null, "light", null).includes('id="tab-wa"'));
});

test("numbered callouts carry the same description as the Flow list (architecture and sequence)", async () => {
  const { stepText } = await import("../src/render.mjs");
  assert.equal(stepText(undefined, "A", "B", "x"), "A → B (x)");
  assert.equal(stepText("Custom text", "A", "B", "x"), "Custom text");
  for (const f of ["product-catalog-search.json", "agent-tool-call.sequence.json"]) {
    const d = buildDiagram(read(f));
    const svg = d.svg("light"), html = renderPage(d, null, "light", null);
    assert.ok(d.steps.length > 0);
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    for (const s of d.steps) {
      const text = stepText(s.desc, s.fromLabel, s.toLabel, s.label);
      assert.ok(svg.includes(`<title>${s.step}. ${esc(text)}</title>`), `badge ${s.step} title`);
      assert.ok(svg.includes(`data-tip="${esc(text)}"`), `badge ${s.step} data-tip`);
      assert.ok(html.includes(`<span>${esc(text)}</span>`), `flow ${s.step}`);
    }
  }
});

// ---- draw.io export (draw.io's Azure icon library: img/lib/azure2/...)
test("every catalog service maps to a draw.io Azure icon or falls back to the embedded SVG", async () => {
  const { drawioIconFor } = await import("../src/drawio/map.mjs");
  const all = catalog.services;
  const mapped = all.filter((e) => drawioIconFor(e));
  assert.ok(mapped.length / all.length > 0.6, `${mapped.length}/${all.length} mapped`);
  assert.match(drawioIconFor(all.find((e) => e.id === "function-apps")), /^[a-z_]+\/.+\.svg$/);
});

test("draw.io export is valid, uses the Azure library, and keeps hierarchy, routing and callouts", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const { toDrawio } = await import("../src/drawio/export.mjs");
  const { validateDrawio } = await import("../src/drawio/validate.mjs");
  for (const f of ["three-tier.json", "product-catalog-search.json", "clinical-notes.dataflow.json", "agent-tool-call.sequence.json"]) {
    const d = buildDiagram(read(f));
    const xml = toDrawio(d);
    assert.deepEqual(validateDrawio(xml), [], f);
    assert.ok(xml.includes("image=img/lib/azure2/"), f);
    for (const s of d.steps) assert.ok(xml.includes(`tooltip="${s.step}. `), `${f}: tooltip for step ${s.step}`);
    assert.equal(toDrawio(d), xml, "deterministic");
  }
  const arch = toDrawio(buildDiagram(load("three-tier")));
  assert.ok(/parent="g-/.test(arch), "nodes are children of their groups");
  assert.ok(/<Array as="points">/.test(arch) && /exitX=/.test(arch) && /entryX=/.test(arch), "routing preserved");
});

test("validateDrawio reports broken references and unknown icons", async () => {
  const { validateDrawio } = await import("../src/drawio/validate.mjs");
  const bad = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" style="image=img/lib/azure2/compute/Nope.svg;" vertex="1" parent="1"/><mxCell id="a" edge="1" parent="1" source="a" target="zzz"/></root></mxGraphModel></diagram></mxfile>';
  const p = validateDrawio(bad).join("\n");
  assert.match(p, /duplicate id a/);
  assert.match(p, /target "zzz" does not exist/);
  assert.match(p, /unknown draw\.io Azure icon/);
});

test("the page offers a draw.io download backed by the same export", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const d = buildDiagram(load("three-tier"));
  const html = renderPage(d, null, "light", null);
  assert.ok(html.includes('data-x="drawio"') && html.includes('id="drawio-data"'));
  const m = /<script type="application\/json" id="drawio-data">([\s\S]*?)<\/script>/.exec(html);
  const { toDrawio } = await import("../src/drawio/export.mjs");
  assert.equal(JSON.parse(m[1].replace(/\\u003c/g, "<")), toDrawio(d));
});
