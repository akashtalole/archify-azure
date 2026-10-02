# Icon catalog

The official **Azure Architecture Icons** package is **not committed**. `scripts/fetch-icons.mjs` downloads it (V24, `Azure_Public_Service_Icons_V24.zip` from the Azure Architecture Center), extracts the service SVGs by category folder (`NNNNN-icon-service-<Name>.svg`) and the group icons into `assets/azure-icons/` (git-ignored; override with `ARCHIFY_AZURE_ICONS`) and rebuilds `data/catalog.json` through `src/catalog-build.mjs`. A small zero-dependency ZIP reader (`src/zip.mjs`) does the extraction.

## Catalog (`data/catalog.json`)

```json
{ "generatedFrom": "Azure Architecture Icons V24",
  "categories": […], "services": [ { "key": "App-Services", "id": "app-services", "name": "App Services", "category": "compute", "file": "compute/10035-icon-service-App-Services.svg" } ],
  "groups": [ { "key": "Subscription", "dark": false, "file": "…" } ],
  "general": [ { "id": "users", "name": "Users", "file": "general/…" } ] }
```

Currently 539 services, 97 general icons and 8 group icons. Ids are slugs of the file name with `azure-`/`microsoft-` prefixes removed. `GROUP_ICON_KEYS` in `catalog-build.mjs` maps group kinds to icons (Subscription, Resource-Group, Management-Group, Region, VNet, Subnet, NSG, Availability-Set). Azure has no separate "resource" icon tier, so `catalog.resources` is empty.

`data/aliases.json` maps friendly names (`functions`, `aks`, `cosmos`, `apim`, `front-door`) to service ids; a separate map exists for general icons.

## Resolution (`src/catalog.mjs`)

* `resolveIcon(ref)` accepts a service id or alias, a full key, `res:<id>`, or `gen:<id>`; it returns `{ kind: "service" | "resource" | "general", entry }` or `null`.
* `searchIcons(query, limit)` ranks whole-word and word-prefix matches (so "ses" does not hit "databases"); aliases always qualify.
* `didYouMean(ref)` powers the suggestions in validation errors (Levenshtein).
* `iconFile(entry)` and `groupIconFile(key, dark)` return absolute paths.

## Adding or changing icons

1. Update the package URL in `scripts/fetch-icons.mjs` (and `THIRD_PARTY_NOTICES.md` release number).
2. `npm run icons:fetch`, then `npm test`.
3. Add aliases for new popular services in `data/aliases.json`.
4. Re-run `npm run drawio:map` if draw.io has new Azure icons, and check `every catalog service maps to a draw.io Azure icon` in the tests.
5. Re-render examples; icons are embedded in every page.

!!! warning "Never alter icons"
    Microsoft's terms for the Azure icons forbid cropping, flipping, rotating, distorting or recolouring. The renderer embeds files unmodified; only gradient ids are prefixed to avoid collisions, and symbol ids are sanitised to selector-safe characters.
