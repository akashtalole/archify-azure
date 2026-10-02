// Maps archify-azure icon catalog entries to draw.io's built-in Azure icons (img/lib/azure2/<folder>/<File>.svg).
// Names are matched against the table extracted from draw.io itself (data/drawio/azure2.json), so a mapped icon
// always exists in the draw.io library; anything unmatched falls back to the embedded official SVG.
import fs from "node:fs";

const TABLE = JSON.parse(fs.readFileSync(new URL("../../data/drawio/azure2.json", import.meta.url), "utf8"));
const norm = (s) => String(s).toLowerCase().replace(/\.svg$/, "").replace(/[^a-z0-9]/g, "");
const folderOf = (cat) => String(cat || "").replace(/-/g, "_");

// Catalog key -> draw.io path, where the two libraries name an icon differently.
const OVERRIDES = {
  "Front-Door-and-CDN-Profiles": "networking/Front_Doors.svg",
  "Azure-Service-Bus": "integration/Service_Bus.svg",
  "Cognitive-Search": "app_services/Search_Services.svg",
  "Data-Factories": "databases/Data_Factory.svg",
  Language: "ai_machine_learning/Language_Services.svg",
  "Azure-Spring-Apps": "compute/Azure_Spring_Cloud.svg",
  "Azure-Fileshares": "storage/Azure_Fileshare.svg",
  "Private-Link-Services": "networking/Private_Link_Service.svg",
  "Azure-Managed-Grafana": "other/Grafana.svg",
  promethus: "other/Prometheus.svg",
  "Azure-Virtual-Desktop": "other/Windows_Virtual_Desktop.svg",
  "Azure-VMware-Solution": "azure_vmware_solution/AVS.svg",
  "Savings-Plans": "other/Savings_Plan.svg",
  pubsub: "integration/Azure_PubSub.svg",
  "Microsoft-Dev-Box": "other/MS_Dev_Box.svg",
  "Azure-Databox-Gateway": "storage/Data_Box.svg",
  "Azure-HPC-Workbenches": "other/Azure_HPC_Workbench.svg",
};

const byName = new Map();
for (const [p, v] of Object.entries(TABLE)) { const k = norm(v.file); (byName.get(k) || byName.set(k, []).get(k)).push(p); }

/** entry: a catalog service or general entry. Returns the draw.io path (folder/File.svg) or null. */
export function drawioIconFor(entry) {
  const o = OVERRIDES[entry.key];
  if (o && TABLE[o]) return o;
  const cands = byName.get(norm(entry.key)) || byName.get(norm(entry.name)) || [];
  if (!cands.length) return null;
  const f = folderOf(entry.category === "General" ? "general" : entry.category);
  return cands.find((c) => c.startsWith(f + "/")) || cands[0];
}
export const hasIcon = (p) => !!TABLE[p];
export const iconCount = () => Object.keys(TABLE).length;
