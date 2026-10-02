// Azure group styles. Microsoft does not publish a group-style deck like AWS does, so these follow the conventions of
// the Azure Architecture Center: a thin coloured border per boundary, a 32px icon in the top-left corner (the
// official Subscription, Resource group, Virtual network… icons) and the label to its right.
export const GROUP_KINDS = {
  "azure-cloud":      { label: "Azure", color: "#243A5E", icon: null, dash: "", fillLight: "none", fillDark: "none" },
  "management-group": { label: "Management group", color: "#5C2D91", icon: "Management-Group", dash: "", fillLight: "none", fillDark: "none" },
  "subscription":     { label: "Subscription", color: "#C19C00", icon: "Subscription", dash: "", fillLight: "none", fillDark: "none" },
  "region":           { label: "Region", color: "#0078D4", icon: "Region", dash: "2 3", fillLight: "none", fillDark: "none" },
  "resource-group":   { label: "Resource group", color: "#0078D4", icon: "Resource-Group", dash: "", fillLight: "none", fillDark: "none" },
  "vnet":             { label: "Virtual network", color: "#008272", icon: "VNet", dash: "", fillLight: "none", fillDark: "none" },
  "subnet":           { label: "Subnet", color: "#0078D4", icon: "Subnet", dash: "", fillLight: "#EFF6FC", fillDark: "#0078D418" },
  "private-subnet":   { label: "Private subnet", color: "#008272", icon: "Subnet", dash: "", fillLight: "#E6F6F4", fillDark: "#00827218" },
  "public-subnet":    { label: "Public subnet", color: "#107C10", icon: "Subnet", dash: "", fillLight: "#F0F7EF", fillDark: "#107C1018" },
  "nsg":              { label: "Network security group", color: "#D83B01", icon: "NSG", dash: "", fillLight: "none", fillDark: "none" },
  "availability-zone": { label: "Availability zone", color: "#0078D4", icon: null, dash: "6 4", fillLight: "none", fillDark: "none" },
  "availability-set": { label: "Availability set", color: "#0078D4", icon: "Availability-Set", dash: "6 4", fillLight: "none", fillDark: "none" },
  "on-premises":      { label: "On-premises", color: "#7A7574", icon: null, dash: "", fillLight: "none", fillDark: "none" },
  "generic":          { label: "", color: "#7A7574", icon: null, dash: "", fillLight: "none", fillDark: "none" },
  "generic-dashed":   { label: "", color: "#7A7574", icon: null, dash: "6 4", fillLight: "none", fillDark: "none" },
  // stack: invisible container used only for layout (no border, no padding); cannot be an edge endpoint
  "stack":            { label: "", color: "none", icon: null, dash: "", fillLight: "none", fillDark: "none" },
  // custom group: pass `icon` (a service id) -> uses a blue border and the 32px service icon
  "custom":           { label: "", color: "#7A7574", icon: null, dash: "", fillLight: "none", fillDark: "none" },
};

export const PILLARS = ["reliability", "security", "cost-optimization", "operational-excellence", "performance-efficiency"];
