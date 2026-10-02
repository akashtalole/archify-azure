# Importers

Both importers produce an ordinary spec you can edit, then render with `finalize`. They report what they could not
map instead of guessing silently.

## Mermaid → spec
```bash
archify-azure import mermaid flow.mmd -o spec.json --title "Orders" [--number] [--render]
cat flow.mmd | archify-azure import mermaid - -o spec.json
```
* `flowchart`/`graph`: node shapes, `A --> B --> C` chains, `A & B`, labelled (`-->|x|`, `-- x -->`) and dashed edges,
  nested `subgraph`s. Subgraph titles that name Azure boundaries (Azure, Management group, Subscription, Region,
  Resource group, VNet, Subnet, public/private subnet, NSG, Availability zone/set, on-prem/data center) become those group kinds; others become generic groups.
  Nodes are layered left→right (`LR`) or top→down (`TD`) from the edges.
* `sequenceDiagram`: participants/actors (`as` aliases), `->>` sync, `-->>` return, `-)` async, self messages,
  `Note over`, `loop/alt/opt/par … else/and … end`.
* **Icons** come from `src/iconguess.mjs`: exact service name/alias → Azure keyword table → strict catalog search →
  generic icon. The command lists everything that was not an *exact* match; review those. Mermaid colours and
  `classDef` styling are ignored. `stateDiagram` is not supported.

## Terraform / Bicep / ARM → spec
```bash
archify-azure import iac ./infra -o spec.json [--include logs,iam] [--title "…"] [--render]
```
* Reads Terraform `azurerm_*` resources (`*.tf`), Bicep (`*.bicep`, `resource sym 'Type@version' = {…}`, `existing` too) and ARM JSON
  templates. Zero-dependency scanners: not full parsers, no module / `for_each` / `copy` expansion (run `bicep build` and import the ARM JSON).
* A resource that **references** another becomes an edge ("uses"); ARM `dependsOn` and `resourceId()` are followed.
  **Glue** resources (Event Grid subscriptions, API Management APIs/backends, diagnostic settings, role assignments, Key Vault
  secrets and access policies, private DNS links…) are not drawn; they are resolved into edges between the real services.
* Resources with virtual network wiring (`subnet_id`, `virtual_network_subnet_id`, `delegated_subnet_id`, `subnetId`…) are grouped in a virtual network.
* Resource groups, role assignments, diagnostic settings, secrets, subnets and unknown types are skipped and counted; `--include logs,iam`
  also shows Log Analytics workspaces and managed identities.
* Treat the result as a draft: references show dependency, not necessarily runtime traffic.
