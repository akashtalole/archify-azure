# Spec reference

A diagram is one JSON file. Nodes and groups live in a **tree** (nesting = Azure grouping);
connections live in a flat `edges` list. Layout and routing are automatic.

```jsonc
{
  "meta": {
    "title": "Required",
    "subtitle": "optional one-liner",
    "theme": "light | dark",            // default light (the deck's light-background style)
    "lens": ["framework", "generative-ai"], // generative-ai (AI-workload findings) is also auto-enabled when Azure OpenAI / Foundry / AI Search / Machine Learning is drawn
    "review": true,                      // false hides the Well-Architected panel
    "output": "out/diagram.html"         // default: <spec>.html
  },
  "root": { "layout": "row", "gap": 80, "children": [ /* nodes and groups */ ] },
  "edges": [ { "from": "a", "to": "b", "step": 1, "label": "HTTPS", "style": "solid", "arrow": "end" } ]
}
```

## Nodes
`{ "id": "api", "icon": "apim", "label": "API Management", "sublabel": "Standard" }`

* `id` — letters, digits, `-`, `_`; unique across nodes and groups.
* `icon` — a service id or alias (`functions`, `storage`, `app-gateway`),
  or a general icon `gen:<id>` / bare alias (`users`, `mobile`, `internet`). Find ids with
  `archify-azure icons search <term>`. Unknown icons fail validation with suggestions.
* `label` — official service name, ≤ 2 lines (the tool wraps at 18 chars and warns beyond two lines).
  Use the full name once, short forms (`AKS`) thereafter. `sublabel` is a muted third line (role, size, AZ…).

## Groups
`{ "id": "vnet", "kind": "vnet", "label": "Virtual network", "layout": "row", "children": [...] }`

| kind | Style |
|---|---|
| `azure-cloud` | dark-navy border around the whole estate |
| `management-group` | purple, Management group icon |
| `subscription` | gold, Subscription icon |
| `region` | blue, dotted |
| `resource-group` | blue, Resource group icon |
| `vnet` | teal, Virtual network icon |
| `subnet` / `private-subnet` / `public-subnet` | blue / teal / green, tinted fill, Subnet icon |
| `nsg` | orange-red, Network security group icon |
| `availability-zone` | blue, dashed, no icon |
| `availability-set` | blue, dashed, Availability set icon |
| `on-premises` | grey |
| `generic`, `generic-dashed` | grey (give a `label`) |
| `custom` + `"icon": "<service>"` | group with the service icon |
| `stack` | **invisible** layout container; cannot be an edge endpoint |

`label` defaults to the kind's name (`""` hides it). `color` overrides the border colour (use sparingly — keep the defaults
where you can). Edges may end on a group (e.g. `region`) — the line meets its border.

## Layout
`layout` is `row` (default), `column` or `grid` (+ `columns`). `gap` is px between children (default 72; keep ≥ 56 so
labelled edges have room). `align` (`center` default | `start` | `end`).
Rows align children by **icon centre line**, so connected icons in one row get straight arrows; a column centres on
its middle child. Think "main flow left→right in one row; branches above/below in columns". `{"spacer": 60}` adds space.

Typical nesting: `azure-cloud › subscription › region › resource-group › vnet › subnet › nodes`; add `availability-zone` groups to show zone
placement. Put a zone-redundant service (Application Gateway, Azure SQL) beside the zone columns, not inside one zone.

## Edges
`from`/`to` node or group ids · `step` 1-99 (black numbered callout, also listed under *Flow*; parallel flows may
share a number) · `label` protocol/action · `desc` longer text for the Flow list · `style` solid|dashed
(dashed = async/control/replication/observability) · `arrow` end|both|none.
Routing is orthogonal, avoids other nodes and group headers, and prefers straight lines; `render` warns when it can't.

---

## Other diagram types
Set `"diagram_type"` (omitted = architecture; a spec with `participants` is a sequence, with `stages` a dataflow).
Editor/agent schemas: `archify-azure schema <type>` → `schemas/*.schema.json`.

### Sequence
```jsonc
{ "diagram_type": "sequence", "meta": { "title": "…" },
  "participants": [ { "id": "api", "icon": "apim", "label": "API Management", "sublabel": "optional" } ],
  "groups": [ { "kind": "azure-cloud", "label": "Azure", "members": ["api", "fn"] } ],   // members must be adjacent
  "messages": [
    { "from": "api", "to": "fn", "label": "invoke", "desc": "shown in the Flow list" },   // kind: sync (default)
    { "from": "fn", "to": "api", "kind": "return", "label": "200" },                     // dashed return
    { "from": "fn", "to": "q", "kind": "async", "label": "enqueue" },                    // dot at the sender
    { "from": "fn", "to": "fn", "kind": "self", "label": "validate" },
    { "note": "text", "over": ["fn", "q"] }
  ],
  "fragments": [ { "kind": "loop|alt|opt|par", "label": "retry", "from": 2, "to": 4, "elseAt": 3, "elseLabel": "else" } ] }  // message indexes, 0-based
```
Sync/async/self messages are numbered automatically (returns are not); `"step": false` suppresses a number.

### Dataflow
Stages become labelled columns; consecutive non-external stages share an Azure boundary.
```jsonc
{ "diagram_type": "dataflow", "meta": { "title": "…" },
  "stages": [ { "id": "src", "label": "Sources", "external": true, "items": [ /* nodes or groups */ ] },
              { "id": "ingest", "label": "Ingest", "items": [ … ] } ],
  "edges": [ { "from": "a", "to": "b", "step": 1, "label": "events" } ] }
```
