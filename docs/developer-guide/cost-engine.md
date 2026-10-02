# Cost engine

All cost arithmetic lives in `src/cost/`. The rules are adapted from the AWS billing-and-cost-management skill: **never reason about money, run code; public pay-as-you-go list rates only; 730 hours per month; never invent a price.**

| File | Role |
|---|---|
| `pricefile.mjs` | Ingests Retail Prices API items into compact rate rows (`compactRow`, `normalizeRows`); parses Azure OpenAI / Foundry token meters into a separate `ai` table (`parseModelMeter`, `modelRows`). |
| `pricebook.mjs` | `loadPriceBook(region)`; `dim()`, `tryDim()`, `tiered()`, `round4()`, `money()`, `HOURS_PER_MONTH`, `PricingError`. |
| `pricers.mjs` | One pricer per service; `SERVICE_PRICER` (catalog id → pricer), `NO_CHARGE`, `findModel` (OpenAI/Foundry model matching), `unitDiv` (price units such as `1M`, `10K`). |
| `estimate.mjs` | `estimateCost(diagram, options)`: runs pricers, totals, sensitivity, what-ifs, provenance. |

## Price book (`data/prices/<region>.json`)

```json
{ "schema_version": "archify-azure.prices.v1", "region": "eastus", "retrievedAt": "…",
  "services": { "Functions": { "publicationDate": "…", "rows": [ { "sku": "<meterId>", "u": "Total Executions", "p": "Functions", "k": "Standard", "unit": "1M", "usd": "0.2", "b": 0, "e": null, "arm": "…" } ] } },
  "ai": [ { "model": "gpt-4o-0806", "dir": "in", "dep": "global", "batch": false, "cache": false, "modal": false, "unit": "1M", "usd": "2.5", "meter": "…", "sku": "…" } ] }
```

`u` is the meter name, `p` the product name, `k` the SKU name, `arm` the ARM SKU (for example a VM size); `b`/`e` are tier begin/end (the API gives only the start; ends are derived). **Free grants are tier-0 rows with a zero price**, so `tiered()` includes them automatically. `dim(code, predicate, what)` returns the tier rows for **one** dimension and throws if the predicate matches meters with *different* rates (the same meter listed for a region and for `Global` is fine). A silently wrong meter is worse than "not estimated".

The API returns `unitOfMeasure` strings such as `1 Hour`, `1M`, `10K`, `1 GB/Month`; `unitDiv(unit)` turns them into the quantity one price applies to.

## A pricer

```js
functions: {
  label: "Azure Functions",
  run({ pb, u, vol }) {
    const req = vol("requestsPerMonth", 1e6), ms = u("avgDurationMs", 200), mem = u("memoryMb", 512);
    const e = pb.dim("Functions", (r) => r.p === "Functions" && r.k === "Standard" && /Total Executions/.test(r.u), "Functions executions");
    return { lines: [ line("Executions", e, req / unitDiv(e[0].unit)) ] };
  },
}
```

* `u(key, default)` reads `node.usage[key]`, records it as **spec** or **default**, and returns it.
* `vol(key, default)` is the same for volumes that **scale with traffic** (sensitivity multiplies these; fixed capacity such as instance counts uses `u`).
* `line(label, rows, qty, opts)` prices through tiers and records `qty`, `unit`, `rate`, `sku`, `usagetype`.
* Return `{ lines, notes?, notItemized? }`; throw `PricingError` for anything that cannot be priced without guessing. `estimate.mjs` turns that into `status: "error"` or `needs-input`.
* What-ifs live in `computeWhatIfs` in `estimate.mjs`: Functions Flex Consumption, SQL zone redundancy, Azure OpenAI batch deployment, Blob Cool tier — each recomputed with the same pricer and the same price book.

### Adding a service

1. Fetch its rates: add the Retail Prices `serviceName` and a **narrow filter** to `SERVICES` in `scripts/fetch-prices.mjs` (keep the snapshot small), then `node scripts/fetch-prices.mjs --services "<serviceName>"`.
2. Write the pricer in `pricers.mjs` and map the catalog id in `SERVICE_PRICER`; add a `CATEGORY` entry in `estimate.mjs`.
3. Add its usage keys to the user guide table (`docs/user-guide/cost.md`).
4. Add a test that reads the rate **from the price book itself** (never hard-codes a price) and checks the formula — see the Functions test.
5. Verify one number by hand against the Azure pricing page or calculator.

### Azure OpenAI / Foundry model matching

Token prices are separate meters with irregular names (`gpt-4o-0806-Inp-glbl`, `gpt-5-mini-outp-regnl`, batch and cached variants). `parseModelMeter` turns each into `{ model, dir, dep, batch, cache, modal }` at fetch time. `findModel(pb, text)` normalises the user's text and accepts an **exact** model name or an **unambiguous prefix**; several candidates are an error that lists them. Embedding models have no output rate, so the output line is omitted. Multimodal/audio/realtime meters (`modal`) are excluded from plain matching.

## `estimateCost` result

```text
{ schema_version, asOf, region, currency, scale, basis,
  totals: { monthlyUsd, annualUsd, byCategory },
  coverage: { nodes, estimated, override, noCharge, notBillable, notItemized, needsInput, notEstimated, error },
  confidence: "indicative" | "stated", defaultedAssumptions: [ { node, key, value } ],
  nodes: [ { id, label, service, status, pricer, category, monthlyUsd, lines, assumptions, notes } ],
  sensitivity: [ { scale, monthlyUsd } ], whatIfs: [ … ], priceBook: { region, retrievedAt, publications } }
```

Totals include only `estimated` and `override` nodes. Pass `asOf: new Date(…)` in tests for reproducibility.

## Gotchas learnt the hard way

* The Retail Prices API is **rate limited** (HTTP 429): the fetch script spaces requests and backs off.
* Product and meter names are not stable across services; always match on `p`/`k`/`u` together and let `dim()` fail on ambiguity.
* Front Door is priced through its "Zone 1" meters; Application Gateway and Load Balancer mix hourly and per-unit meters in one service — filter by product.
* Linux and Windows variants share meter names with different product names (App Service, VMs): filter explicitly.
* A `Set.add(...codes)` only adds the first argument — loop.
* The "scaled by traffic" flag must be set on the assumption entry even when the key already exists.
