// Well-Architected corpus: every pillar and recommendation from the Azure Well-Architected Framework documentation.
// Each pillar publishes a checklist table (code, recommendation) on Microsoft Learn; the codes (RE:01, SE:05, CO:07,
// OE:03, PE:09) are canonical and are never invented. A validation gate must pass before any assessment, and a committed
// snapshot makes reviews work offline (`wa corpus --refresh` re-reads the live pages).
// Azure's framework has no question level (AWS has pillar > question > best practice), so `questions` stays empty and a
// "best practice" (BP) here is one recommendation.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../catalog.mjs";

const LEARN = "https://learn.microsoft.com/en-us/azure/well-architected/";
export const PILLARS = [
  { id: "reliability", name: "Reliability", prefix: "RE", page: "reliability/checklist" },
  { id: "security", name: "Security", prefix: "SE", page: "security/checklist" },
  { id: "cost-optimization", name: "Cost Optimization", prefix: "CO", page: "cost-optimization/checklist" },
  { id: "operational-excellence", name: "Operational Excellence", prefix: "OE", page: "operational-excellence/checklist" },
  { id: "performance-efficiency", name: "Performance Efficiency", prefix: "PE", page: "performance-efficiency/checklist" },
];
export const SOURCES = { framework: { name: "Azure Well-Architected Framework", base: LEARN, file: "framework.json" } };
const ID = /^(RE|SE|CO|OE|PE):\d{2}$/;
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** Pure: parse one pillar checklist page into BP records. */
export function parseChecklist(html, pillar, pageUrl = LEARN + pillar.page) {
  const out = [];
  for (const row of html.matchAll(/<tr>\s*<td>[^<]*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
    const link = /<a href="([^"]*)"[^>]*>\s*([A-Z]{2}:\d{2})\s*<\/a>/.exec(row[1]); // a cell may link the same code twice
    if (!link) continue;
    const [, href, id] = link, cell = row[2];
    if (out.some((b) => b.bp_id === id)) continue;
    const strong = /<strong>([\s\S]*?)<\/strong>/.exec(cell);
    const title = text(strong ? strong[1] : cell), desc = text(strong ? cell.replace(strong[0], "") : "");
    out.push({ bp_id: id, bp_title: title, bp_description: desc, bp_url: new URL(href, pageUrl).href.replace(/\/$/, ""), question_id: null, pillar_id: pillar.id, pillar_name: pillar.name });
  }
  return out;
}

/** The skill's validation gate. Returns {valid, errors, counts}. */
export function validateCorpus(c) {
  const errors = [];
  if (!c.bps.length) errors.push("zero recommendations parsed (acquisition failure)");
  const ids = new Set(c.bps.map((b) => b.bp_id));
  if (ids.size !== c.bps.length) errors.push("duplicate recommendation ids");
  for (const b of c.bps) {
    if (!ID.test(b.bp_id)) errors.push(`non-canonical recommendation id ${b.bp_id}`);
    const p = c.pillars.find((x) => x.id === b.pillar_id);
    if (!p) errors.push(`${b.bp_id} refers to unknown pillar`);
    else if (p.prefix && !b.bp_id.startsWith(p.prefix + ":")) errors.push(`${b.bp_id} does not belong to pillar ${p.name} (expected prefix ${p.prefix})`);
    if (!b.bp_title) errors.push(`${b.bp_id} has no title`);
  }
  for (const p of c.pillars) if (!c.bps.some((b) => b.pillar_id === p.id)) errors.push(`pillar ${p.name} carries no recommendation`);
  const per = Object.fromEntries(c.pillars.map((p) => [p.id, c.bps.filter((b) => b.pillar_id === p.id).length]));
  const total = c.bps.length || 1;
  if (c.pillars.length > 1 && Math.max(...Object.values(per)) / total > 0.6) errors.push("implausible spread: one pillar holds >60% of recommendations");
  return { valid: errors.length === 0, errors, counts: { pillars: c.pillars.length, questions: 0, bps: c.bps.length, perPillar: per } };
}

/** Network: read the five checklist pages (HTTPS, learn.microsoft.com only) and return a validated corpus. */
export async function acquireCorpus(lens = "framework", { fetchImpl = fetch } = {}) {
  const src = SOURCES[lens];
  if (!src) throw new Error(`unknown corpus "${lens}" (${Object.keys(SOURCES).join(", ")})`);
  const bps = [];
  for (const p of PILLARS) {
    const url = LEARN + p.page;
    if (!url.startsWith("https://learn.microsoft.com/")) throw new Error("corpus must be fetched over HTTPS from learn.microsoft.com");
    let res;
    for (let attempt = 0; attempt < 2; attempt++) { // retry once
      try { res = await fetchImpl(url); if (res.ok) break; } catch (e) { if (attempt) throw new Error(`cannot read ${url}: ${e.message}`); }
    }
    if (!res?.ok) throw new Error(`cannot read ${url}: HTTP ${res?.status}`);
    bps.push(...parseChecklist(await res.text(), p, url));
  }
  const parsed = { pillars: PILLARS.map(({ id, name, prefix, page }) => ({ id, name, prefix, url: LEARN + page })), questions: [], bps };
  const manifest = { ...validateCorpus(parsed), provenance: { indexUrl: LEARN + "pillars", retrievedAt: new Date().toISOString() } };
  return { schema_version: "archify-azure.wa-corpus.v1", lens, name: src.name, ...parsed, manifest };
}

const snapFile = (lens) => path.join(ROOT, "data", "wa", SOURCES[lens].file);
export function loadCorpus(lens = "framework") {
  if (!SOURCES[lens]) throw new Error(`unknown corpus "${lens}"`);
  const f = snapFile(lens);
  if (!fs.existsSync(f)) throw new Error(`no corpus snapshot for ${lens}; run \`archify-azure wa corpus --refresh\``);
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  const v = validateCorpus(c); // never trust a snapshot silently: revalidate on load
  if (!v.valid) throw new Error(`corpus snapshot for ${lens} failed validation: ${v.errors.join("; ")}`);
  return c;
}
export function saveCorpus(c) { fs.mkdirSync(path.join(ROOT, "data", "wa"), { recursive: true }); fs.writeFileSync(snapFile(c.lens), JSON.stringify(c, null, 1) + "\n"); }
export const corpusAgeDays = (c) => Math.floor((Date.now() - Date.parse(c.manifest.provenance.retrievedAt)) / 86400000);
