# draw.io exporter

`src/drawio/` produces an uncompressed `.drawio` (mxfile) that uses **draw.io's own Azure icon library** (`img/lib/azure2/…`). The reference for styles is the draw.io style reference (<https://www.drawio.com/docs/reference/diagram-generation/style-reference/>).

Unlike AWS (`mxgraph.aws4.*` stencils), draw.io's Azure library is **image based**: each icon is an `image;aspect=fixed;html=1;points=[];…;image=img/lib/azure2/<folder>/<File>.svg` cell that draw.io resolves from its own site, so the exporter embeds nothing for mapped icons.

| File | Role |
|---|---|
| `map.mjs` | Maps catalog entries to a draw.io icon path (`folder/File.svg`) |
| `export.mjs` | `toDrawio(diagram)`; architecture/dataflow and sequence builders; the `Doc` cell writer |
| `validate.mjs` | `validateDrawio(xml)` structural checks |
| `data/drawio/azure2.json` | About 700 icons `{ title, folder, file }`, extracted from `Sidebar-Azure2.js` |

## Icon table

`scripts/build-drawio-map.mjs` downloads (or reads) draw.io's `Sidebar-Azure2.js` and records, for each `createVertexTemplateEntry`, the folder, file and title. It refuses to write if too few icons parse (a format change upstream). The table contains **paths and titles only**; draw.io renders the SVGs.

## Mapping (`map.mjs`)

`drawioIconFor(entry)` returns the `folder/File.svg` path or `null`.

* An `OVERRIDES` table handles names that differ between Microsoft's package and draw.io's (for example the package's `Cognitive-Search` and draw.io's `Search`/`AI Search`).
* Otherwise the catalog key/name is normalised (case, punctuation, plurals) and matched to draw.io file names, preferring the matching category folder.
* `null` (about 35 of 539 services) means the exporter embeds the official SVG as `shape=image;image=data:image/svg+xml,<base64>` (the `;base64` marker is omitted because `;` separates style keys).

## Document structure (`export.mjs`)

* **Parents.** Each group becomes a container cell (`id="g-<id>"`); nodes are children with **relative** coordinates. `stack` groups are layout-only and are skipped; a node's parent is its nearest drawn ancestor.
* **Group styles**: Azure has no group stencils in draw.io, so groups are plain **container** cells styled from `groups.mjs` (border colour, dash, tinted fill) with the official group icon (Subscription, Resource group, Virtual network…) as a small image cell in the corner.
* **Icons** use draw.io's Azure palette style (`image` + `points=[…]` for connection constraints, `aspect=fixed`, label below). Labels are the pre-wrapped lines joined with `<br>`; sublabels are small grey `<font>` text.
* **Edges** parent to the lowest common ancestor of their endpoints; waypoints are converted to that parent's coordinates. `exitX/exitY/exitDx/exitDy` (and `entry*`) reproduce the router's port exactly: the fraction is clamped to [0,1] and the remainder goes into the dx/dy offset, with `exitPerimeter=0`. `labelOffset()` converts the label's anchor point into draw.io's relative position along the edge (−1…1).
* **Callouts** are `<object label="N" tooltip="N. description">` wrapping an ellipse cell.
* **Sequence** diagrams use floating edges (`sourcePoint`/`targetPoint`) for lifelines and messages, `umlFrame` for fragments, `note` for notes; an async message gets `startArrow=oval`.
* Output is deterministic: ids derive from spec ids (`n-`, `g-`, `e-`, `b-`…), and the diagram id from a hash of title and size.

## Validation

`validateDrawio(xml)` checks it is an `<mxfile>`; ids are unique; every `parent`, `source`, `target` resolves (`<object>` wrappers included); every `image=img/lib/azure2/…` icon exists in the table; tags balance. `export`, `render --drawio` and `finalize` all refuse to write an invalid file.

## Testing against draw.io itself

The tests check structure and the shape table. To **see** the result, load the file in draw.io's viewer:

```html
<div class="mxgraph" data-mxgraph='{"xml": "…escaped file…", "nav": false}'></div>
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
```

(For an offline check serve `viewer-static.min.js` locally and route requests for `img/lib/azure2/…` to a local copy of the icons, with a permissive CORS header — the viewer loads the images with `crossorigin`.) Compare against the PNG; icons, containers and routing should look the same.

## Adding something

* **A new group kind**: add it to `GROUP_KINDS` (`groups.mjs`), a draw.io style in `GROUP_STYLE`, and its corner icon (`GROUP_ICON_KEYS` in `catalog-build.mjs`).
* **A better mapping**: add to `OVERRIDES` in `map.mjs`; the test requires that most catalog services map.
* **Another format** (for example Mermaid or Excalidraw): read the same `diagram` object; see how `export.mjs` uses `model.nodes[*].iconRect`, `model.routes[*].pts`, `badgePos` and `labelPos`.
