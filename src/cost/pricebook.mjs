// Price book access: loads data/prices/<region>.json (built by scripts/fetch-prices.mjs from the public Azure Retail Prices API).
// All lookups are explicit and fail loudly on ambiguity — a silently wrong meter is worse than "not estimated".
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../catalog.mjs";

export class PricingError extends Error {}
export const HOURS_PER_MONTH = 730; // Azure pricing convention (730 hours in a month)

export function loadPriceBook(region = "eastus") {
  const f = path.join(ROOT, "data", "prices", `${region}.json`);
  if (!fs.existsSync(f)) throw new PricingError(`no price book for ${region}; run \`node scripts/fetch-prices.mjs --region ${region}\``);
  const book = JSON.parse(fs.readFileSync(f, "utf8"));
  const rows = (code) => { const s = book.services[code]; if (!s) throw new PricingError(`price book has no ${code}; run scripts/fetch-prices.mjs --services "${code}"`); return s.rows; };
  return {
    region, retrievedAt: book.retrievedAt,
    ai: book.ai || [],
    has: (code) => !!book.services[code],
    rows,
    publication: (code) => book.services[code]?.publicationDate ?? null,
    publications: (codes) => Object.fromEntries([...codes].filter((c) => book.services[c]).map((c) => [c, book.services[c].publicationDate])),
    /** One pricing dimension (possibly tiered). Throws if the predicate matches more than one meter with different rates. */
    dim(code, pred, what) {
      const hit = rows(code).filter(pred);
      if (!hit.length) throw new PricingError(`no Retail Prices rate for ${what} (${code})`);
      const byMeter = new Map();
      for (const r of hit) (byMeter.get(r.sku) || byMeter.set(r.sku, []).get(r.sku)).push(r);
      const sig = (rs) => rs.slice().sort((a, b) => a.b - b.b).map((r) => `${r.b}|${r.e}|${r.usd}|${r.unit}`).join(";");
      const sigs = new Set([...byMeter.values()].map(sig));
      // several meters are fine when they carry the same price (the same meter listed for the region and for Global); differing prices are ambiguous
      if (sigs.size > 1) throw new PricingError(`ambiguous Retail Prices match for ${what} (${code}): ${byMeter.size} meters with different rates (${[...new Set(hit.map((r) => `${r.k}: ${r.u}`))].slice(0, 5).join("; ")}) — be more specific`);
      return [...byMeter.values()][0].slice().sort((a, b) => a.b - b.b);
    },
    /** Zero-or-more: like dim but returns null when nothing matches. */
    tryDim(code, pred, what) { try { return this.dim(code, pred, what); } catch (e) { if (/^no Retail Prices rate/.test(e.message)) return null; throw e; } },
  };
}

/** Tiered monthly cost for a quantity over rows with tier begin/end (rate units). Returns {usd, tiers:[{from,to,qty,rate,usd}]}. */
export function tiered(rows, qty) {
  let usd = 0;
  const tiers = [];
  for (const r of rows) {
    const rate = Number(r.usd);
    const hi = r.e === null ? Infinity : r.e;
    const seg = Math.max(0, Math.min(qty, hi) - r.b);
    if (seg > 0) { usd += seg * rate; tiers.push({ from: r.b, to: r.e, qty: seg, rate, usd: seg * rate }); }
  }
  return { usd, tiers };
}
export const round4 = (x) => Math.round(x * 1e4) / 1e4;
export const money = (x) => (x < 1 && x > 0 ? "$" + x.toFixed(4) : "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
