# Mermaid and infrastructure as code

Both importers produce an ordinary spec that you can edit and render with `finalize`. They **report what they could not map** instead of guessing silently.

## Mermaid → spec

```bash
archify-azure import mermaid flow.mmd -o spec.json --title "Orders" [--number] [--render]
cat flow.mmd | archify-azure import mermaid - -o spec.json
```

* **`flowchart` / `graph`**: node shapes, `A --> B --> C` chains, `A & B`, labelled (`-->|x|`, `-- x -->`) and dashed edges, nested `subgraph`s. Subgraph titles that name Azure boundaries (Azure, Management group, Subscription, Region, Resource group, VNet, Subnet, public/private subnet, NSG, Availability zone/set, on-prem/data center) become those group kinds; others become generic groups. Nodes are layered left → right (`LR`) or top → down (`TD`) from the edges.
* **`sequenceDiagram`**: participants and actors (`as` aliases), `->>` sync, `-->>` return, `-)` async, self messages, `Note over`, and `loop`/`alt`/`opt`/`par … else/and … end`.
* **Icons** are guessed conservatively: exact service name or alias → Azure keyword table → strict catalog search → a generic icon. The command lists everything that was not an *exact* match; review those. Mermaid colours and `classDef` styling are ignored; `stateDiagram` is not supported.
* `--number` numbers the edges as steps; `--render` renders immediately.

## Terraform / Bicep / ARM → spec

```bash
archify-azure import iac ./infra -o spec.json [--include logs,iam] [--title "…"] [--render]
```

* Reads Terraform `azurerm_*` resources (`*.tf`), Bicep (`*.bicep`: `resource sym 'Type@version' = {…}`, including `existing`) and ARM JSON templates. The scanners are **zero-dependency and not full parsers**: no modules, `for_each`/`copy` loops or conditional expansion — run `bicep build` and import the ARM JSON if a Bicep file is too dynamic.
* A resource that **references** another becomes an edge ("uses"). **Glue** resources (Event Grid subscriptions, API Management APIs and backends, diagnostic settings, role assignments, Key Vault secrets and access policies, private DNS links…) are not drawn; they are resolved into edges between the real services. ARM `dependsOn` and `resourceId()` references are followed.
* Resources with virtual network wiring (`subnet_id`, `virtual_network_subnet_id`, `delegated_subnet_id`, `vnet_integration_subnet_id`, `subnetId`…) are grouped inside a virtual network.
* Resource groups, role assignments, diagnostic settings, secrets, subnets and unknown types are skipped and counted; `--include logs,iam` also shows Log Analytics workspaces and managed identities.

!!! tip "Treat the result as a draft"
    A reference shows dependency, not necessarily runtime traffic. Add `step` numbers, labels and `usage` after importing, then run `finalize`.

Examples: `examples/mermaid/` and `examples/iac/` (a Terraform stack and a Bicep file with their generated specs and pages).
