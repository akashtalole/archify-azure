# Well-Architected engine

Implements the structure of the AWS `aws-well-architected-review` skill — applied to the **Azure Well-Architected Framework** — for **diagram evidence**: a frozen, validated corpus → one of five statuses per recommendation → impact × likelihood risk → Eisenhower prioritisation → report data. Everything is deterministic code.

| File | Role |
|---|---|
| `wa/corpus.mjs` | Acquire, validate, save and load the corpus (`PILLARS`, `SOURCES`, `parseChecklist`, `validateCorpus`, `acquireCorpus`, `loadCorpus`, `corpusAgeDays`) |
| `wa/rules.mjs` | Evidence rules: which recommendations a diagram can speak to (`LEGACY_RULES`, `PROCEDURAL_RULES`, `STATUS`, `OWNER`) |
| `wa/evaluate.mjs` | `reviewWorkload(diagram, options)` → report object; `riskLevel`, `RISK_ORDER`, `MODES` |
| `review.mjs` | The original heuristic findings; the *legacy rules* map these ids to recommendations |
| `report.mjs` | Renders the report as the HTML tab |

## Corpus (`data/wa/framework.json`)

Azure publishes the framework as five pillar sections (Reliability `RE`, Security `SE`, Cost Optimization `CO`, Operational Excellence `OE`, Performance Efficiency `PE`) with a **checklist page** each: a table of recommendations such as `SE:04` with a title, description and link. The corpus is built from those pages, not from a hard-coded recommendation list (the pillar pages themselves are listed in `PILLARS`). Azure has no question level, so `question_id` is `null` and the report groups by pillar.

`parseChecklist` reads each table row, tolerating rows where one id is linked twice. `validateCorpus` is the skill's gate and runs on acquisition **and on every snapshot load**: non-empty, canonical unique ids (`^(RE|SE|CO|OE|PE):\d{2}$`), every recommendation carries its pillar's prefix, every pillar has at least one, and no pillar holds more than 60 % of all recommendations. Current count: 59 recommendations.

## Evidence rules

A rule turns diagram facts into BP outcomes. Two shapes exist.

**Legacy rule** — derived from a finding in `review.mjs`:

```js
{ legacy: "SEC-EDGE", fw: { "SE:06": {}, "SE:08": {} },
  impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
  rec: "Put Azure Web Application Firewall in front of every internet-facing entry point…", measure: "100 % of public endpoints behind a WAF policy" }
```

The legacy finding's status (`ok`, `gap`, `consider`) maps to BP statuses (`Implemented`, `Not Implemented`, `Cannot Determine`); `okAs` / `considerAs` or per-status overrides inside the BP object change that.

**Procedural rule** — free-form, reads the diagram context:

```js
{ id: "TELEMETRY", pillar: "operational-excellence", evaluate(ctx) {
    const n = ctx.of("application-insights", "log-analytics-workspaces", "monitor");
    if (!n.length) return null;                          // rule does not apply
    return { title: "Observability",
             fw: { "OE:07": { status: "Implemented", evidence: `${n.map((x) => x.label.trim()).join(", ")} drawn.` } },
             nodes: n.map((x) => x.id) };
} }
```

`ctx` provides `nodes`, `groups`, `edges`, `cost`, `isAI`, `spec`, `has(...ids)`, `of(...ids)` (nodes of those services) and `labelHas(regex)`. A rule may also return `impact`, `likelihood`, `effort`, `weeks`, `rec`, `measure` for gaps.

### The invariants

1. **Only canonical recommendation ids.** A test checks that every id used in a rule exists in the corpus; never type one from memory.
2. **Evidence or nothing.** A rule returns a recommendation outcome only if the diagram shows something. Absence of a drawn control is *To confirm*, not a gap, unless a drawn element shows the opposite (a public database).
3. **Everything else is `Cannot Determine`** with a hint (`needsFor(title)`: process, IaC/configuration, or runtime evidence). Do not mark recommendations Implemented to improve scores.

## `reviewWorkload` steps

1. Run rules → `outcomes` (one per rule, keyed by BP).
2. **Merge per BP** with precedence *Not Implemented > Partially > Implemented* (Implemented plus Cannot Determine → Partially) *> Cannot Determine > Not Applicable*; BPs with no outcome become Cannot Determine.
3. **Findings**: gaps with risk metadata → `riskLevel(impact, likelihood)`; `criticality` adjusts impact (critical: +1 for Security and Reliability; low: −1 for Reliability); `consider`-derived gaps lower likelihood. Sorted by risk then pillar; ids `F-001…`.
4. **Quadrants**: importance high for Critical/High (or Medium Security/Reliability at high/critical criticality); `Do First` = important + low effort, `Plan` = important + larger effort, `Delegate` = less important + not high effort, `Defer` otherwise. SMART goal: target date (`now` + weeks), owner (`OWNER[pillar]`), measure.
5. **Questions and scores**: per pillar `1 + 4 × (I + ½P) / (I + P + N)`, `null` below three determinable recommendations; coverage percentage.
6. **Trade-offs** from the cost estimate: the cost of zone redundancy, Content Safety share of AI spend, Log Analytics volume.
7. **Report**: coverage audit (sources, counts, snapshot age, limits), executive summary data, strengths, next steps, banner and legend.

The risk matrix, statuses and calibration (no manufactured Criticals, acknowledge strengths) follow the skill; do not change them without reading the skill again.

## Adding a rule

1. Decide which recommendation the diagram can *really* evidence (read the recommendation on Microsoft Learn).
2. Look up the canonical id: `archify-azure wa corpus --json` or search `data/wa/*.json`.
3. Add a legacy rule (if `review.mjs` already detects it) or a procedural rule.
4. Run `npm test` (the corpus-id test) and `archify-azure wa review examples/<x>.json`; check the new row in the ledger and the evidence text.
5. Add a test with a minimal spec that triggers the rule and one that does not.
6. Describe the new evidence in `docs/user-guide/well-architected.md` if users need to know how to trigger it (for example "name the node … Content Safety").

## Refreshing the corpus

See [Data refresh](data-refresh.md). After a refresh, run the tests: a renamed or removed recommendation id breaks the rule-id test, which is the point.
