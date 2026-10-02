# Cost estimation

`archify-azure cost spec.json [--region r] [--scale 1,3,10] [--usage usage.json] [--json]` prices each node from
`data/prices/<region>.json`, built from the public **Azure Retail Prices API** (`npm run prices:fetch`, no credentials).
Monthly = 730 hours; pay-as-you-go list prices (USD) only.

Statuses per node: `estimated`, `override` (`usage.monthlyUsd`), `no-charge`, `not-billable`, `not-itemized` (no separate meter),
`needs-input`, `not-estimated` (no cost model yet), `error`. Give a node a `usage` object (for example Functions `requestsPerMonth`,
`avgDurationMs`, `memoryMb`; Azure OpenAI `model`, `inputTokensPerMonth`, `outputTokensPerMonth`, `deployment`) to replace defaults;
every assumption is shown as "from spec" or "assumed". Azure OpenAI `model` is matched exactly or as an unambiguous prefix.
Free grants listed by the API as zero-price tiers are included. Excludes taxes, support, Reservations, Savings Plans, Spot,
Azure Hybrid Benefit, EA discounts, credits and data transfer unless `egressGbPerMonth` is set.
Confirm any number in the Azure Pricing Calculator. The full usage key table is in `docs/user-guide/cost.md`.
