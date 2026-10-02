# Third-party notices

## Archify (MIT)
archify-azure is a companion to [tt-a1i/archify](https://github.com/tt-a1i/archify) (MIT, © tt-a1i) and follows its
conventions: typed JSON in, validated standalone HTML/SVG out, an agent skill (`SKILL.md`), `finalize`-style
receipts, dark/light themes. No Archify source is copied; the Azure-specific renderer, router and review engine here
are original. Archify itself is based on Cocoon-AI/architecture-diagram-generator (MIT).
It is also the Azure sibling of [archify-aws](https://github.com/akashtalole/archify-aws) (same author, MIT).

## Azure Architecture Icons
Not redistributed in this repository. `npm run icons:fetch` downloads the official package from Microsoft
(<https://learn.microsoft.com/azure/architecture/icons/>) into `assets/azure-icons/` (git-ignored). The icons are
© Microsoft Corporation and subject to Microsoft's terms for the Azure Architecture Icons: use them to depict Azure
architecture, do not crop, flip, rotate, distort or recolour them, and do not imply Microsoft endorsement. Rendered
diagrams embed the icons they use — check the current Microsoft terms before publishing diagrams widely.

## Azure Retail Prices API
Cost estimates use list prices from the public Azure Retail Prices REST API (<https://prices.azure.com/api/retail/prices>,
documented at <https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices>). `data/prices/` is a
filtered snapshot of that data; prices are © Microsoft and change over time. Estimates are indicative and are not a quote.

## Azure Well-Architected Framework
Recommendation ids and titles in `data/wa/framework.json` are taken from the public Azure Well-Architected Framework
checklist pages on Microsoft Learn (<https://learn.microsoft.com/azure/well-architected/>) with links back to each page.
The review rules are heuristics written for this project, not Microsoft content.

## draw.io (Apache-2.0)
`data/drawio/azure2.json` lists icon paths and titles from draw.io's built-in Azure library
(`Sidebar-Azure2.js` in [jgraph/drawio](https://github.com/jgraph/drawio), Apache-2.0, © JGraph Ltd). Exported `.drawio` files
reference the icons by their draw.io paths (`img/lib/azure2/…`); the icons themselves are not copied.

## AWS Agent Toolkit skills
The cost-estimation and Well-Architected review features follow the workflows described in the `billing-and-cost-management` and
`aws-well-architected-review` skills of <https://github.com/aws/agent-toolkit-for-aws> (core-skills), which is licensed by AWS under its own
terms. Their rules (deterministic cost arithmetic, frozen corpus, five statuses, impact × likelihood, Eisenhower prioritisation) are
paraphrased and applied to Azure; no skill text or data is redistributed.
