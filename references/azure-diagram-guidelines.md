# Azure diagram guidelines applied by archify-azure

Distilled from the *Azure Architecture Icons* terms and the conventions of the Azure Architecture Center. Microsoft does
not publish a group-style deck like AWS does, so group styling here is a documented house style that follows what the
Architecture Center diagrams do (thin coloured boundary, corner icon, label to its right). The renderer enforces what it
can; the rest is for whoever authors the spec.

| Guidance | What archify-azure does |
|---|---|
| Use icons unmodified: no cropping, flipping, rotating, distorting or recolouring | Service icons embedded unmodified at 64px, group icons at 32px |
| Groups = icon + label inside a thin boundary; nested groups keep a buffer | Corner icon + label; 1.25px borders; 24px padding |
| Boundaries: Azure, management group, subscription, region, resource group, virtual network, subnet, NSG, availability zone/set, on-premises | `kind` presets in `src/groups.mjs` (Subscription, Resource group, Virtual network, Subnet, NSG, Availability set use the official group icons) |
| Custom group for a service: service icon + border | `kind: "custom"` with `icon` |
| Labels: official service name, ≤ 2 lines, never break mid-word; full name once, short form afterwards | 12px Arial, auto-wrap at word boundaries, warning past 2 lines |
| Arrows: straight lines and right angles; open arrowhead | Orthogonal router, open chevron arrowhead, 2px lines |
| Numbered callouts for the primary flow | `step` badges (black circle, white bold number) |
| Light background for web and documents; dark for presentations | `theme: light|dark` (and a toggle in the HTML page) |

Group colours (house style): Azure `#243A5E`, management group `#5C2D91`, subscription `#C19C00`, region and resource group
`#0078D4`, virtual network `#008272`, subnets blue / teal / green with tinted fills, NSG `#D83B01`, on-premises grey.
Run `archify-azure icons categories` and `archify-azure icons groups` for the catalog's categories and group kinds.

Typical nesting: `azure-cloud › subscription › region › resource-group › vnet › subnet › nodes`. PaaS services that are not
injected into a subnet (Storage, Cosmos DB, Key Vault, Service Bus, Entra ID, Front Door) sit outside the VNet or beside it,
connected through private endpoints when the design uses Private Link.
