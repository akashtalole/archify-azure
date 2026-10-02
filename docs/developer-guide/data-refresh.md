# Data refresh

Three committed snapshots feed the tool. All have scripts; none is fetched at runtime (except explicit `--refresh`).

| Data | Command | Source | Notes |
|---|---|---|---|
| **Icons** | `npm run icons:fetch` | Azure Architecture Icons package (V24) | Not committed. Update the URL for a new release. |
| **Prices** | `npm run prices:fetch` | Public Azure Retail Prices API | `data/prices/<region>.json`, pay-as-you-go only, filtered per service |
| **Well-Architected corpus** | `npm run wa:corpus` or `archify-azure wa corpus --refresh` | Azure Well-Architected checklist pages on Microsoft Learn | `data/wa/framework.json`; validation gate before saving |
| **draw.io shapes** | `npm run drawio:map` | `jgraph/drawio` `Sidebar-Azure2.js` | `data/drawio/azure2.json` |
| **Schemas** | `npm run schemas` | the code's own enums | no network; a test fails when stale |

## Prices

```bash
node scripts/fetch-prices.mjs                          # eastus, all configured services
node scripts/fetch-prices.mjs --services "Functions,Storage"
node scripts/fetch-prices.mjs --region westeurope      # new region
```

The source is `https://prices.azure.com/api/retail/prices` (public, no credentials), queried per `serviceName` and region with `$filter`. It pages with `NextPageLink`, is rate limited (the script spaces requests and retries 429/5xx with back-off) and returns list prices only. The `SERVICES` map in the script holds one **narrow predicate per service** (for example Virtual Machines: Linux, no Spot) to keep the snapshot near 1 MB. Azure OpenAI / Foundry token meters (service "Foundry Tools") are parsed into the `ai` table at fetch time. A new dimension means widening a predicate and re-running.

After a refresh:

1. `npm test` — cost tests read rates from the book, so they follow the new numbers.
2. Re-render the examples and compare the totals; large jumps deserve a look at the line items.
3. Commit the data file together with regenerated examples.

Remember the provenance shown in the Cost tab: each service's publication date and the retrieval date.

## Well-Architected corpus

```bash
archify-azure wa corpus --refresh                       # re-reads the five pillar checklist pages
```

Each pillar's checklist page (`learn.microsoft.com/azure/well-architected/<pillar>/checklist`) is a table of recommendation ids (`RE:01`…) with titles and links. A refresh fails (and saves nothing) if `validateCorpus` reports errors. If the page layout changes, fix `parseChecklist` generally, not by patching data. Then run the tests: the rule-id test reports any evidence rule whose recommendation id disappeared.

## draw.io icons

```bash
npm run drawio:map                                    # download Sidebar-Azure2.js
node scripts/build-drawio-map.mjs ./Sidebar-Azure2.js   # or use a local copy
```

Check the count printed (about 700 icons) and run the draw.io tests.

## Release checklist

1. `npm run icons:fetch && npm test`
2. Refresh data if needed (above), re-render examples, look at the PNGs.
3. Update `package.json` version and `THIRD_PARTY_NOTICES.md` (icon release, new sources).
4. Merge to `main`; the docs workflow publishes the site.
