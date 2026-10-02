// Builds data/catalog.json from an extracted icon directory (see scripts/fetch-icons.mjs).
// Azure icons are named `<number>-icon-service-<Name>.svg` in category folders. The same service appears in several
// categories (for example Event Hubs in analytics and iot): the first category in PRIORITY wins.
import fs from "node:fs";
import path from "node:path";

const PRIORITY = ["compute", "containers", "web", "app-services", "networking", "databases", "storage", "integration", "ai-machine-learning", "analytics",
  "security", "identity", "monitor", "management-governance", "devops", "iot", "hybrid-multicloud", "migrate", "mobile", "new-icons", "other", "azure-ecosystem", "developer-tools", "general", "menu", "power-platform"];
const rank = (c) => { const i = PRIORITY.indexOf(c); return i < 0 ? 99 : i; };
const human = (key) => key.replace(/-/g, " ").replace(/\s+/g, " ").trim();
const slug = (key) => key.toLowerCase().replace(/^(azure|microsoft)-/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Generic icons from other categories that diagrams use as plain actors. */
const GENERAL_FROM_SERVICES = ["Users", "Groups"];

/** Group icons by archify-azure group kind (see src/groups.mjs): service key -> stable group key. */
export const GROUP_ICON_KEYS = {
  Subscription: "Subscriptions", "Resource-Group": "Resource-Groups", "Management-Group": "Management-Groups", Region: "Region-Management",
  VNet: "Virtual-Networks", Subnet: "Subnet", NSG: "Network-Security-Groups", "Availability-Set": "Availability-Sets",
};

const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])) : []);

export function buildCatalog(iconsDir, release = "Azure Architecture Icons") {
  const rel = (f) => path.relative(iconsDir, f).split(path.sep).join("/");
  const seen = new Set(), services = [], general = [], byKey = new Map();
  const files = walk(iconsDir).filter((f) => f.endsWith(".svg")).map((f) => {
    const cat = rel(f).split("/")[0];
    const m = path.basename(f).match(/^\d+-icon-service-(.+)\.svg$/) || path.basename(f).match(/^(.+)\.svg$/);
    return { f, cat, key: m[1].trim() };
  }).sort((a, b) => rank(a.cat) - rank(b.cat) || a.key.localeCompare(b.key));
  for (const { f, cat, key } of files) {
    if (seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    const entry = { key, id: slug(key), name: human(key), category: cat === "general" ? "General" : cat, file: rel(f) };
    byKey.set(key, entry);
    if (cat === "general" || GENERAL_FROM_SERVICES.includes(key)) general.push({ key, id: slug(key), name: human(key), file: rel(f) });
    else services.push(entry);
  }
  // ids must be unique: a later service whose slug collides keeps its full key
  const ids = new Set();
  for (const s of services) { if (ids.has(s.id)) s.id = s.key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); ids.add(s.id); }
  const gids = new Set();
  for (const g of general) { if (gids.has(g.id)) g.id += "-general"; gids.add(g.id); }
  const groups = Object.entries(GROUP_ICON_KEYS).flatMap(([gk, sk]) => (byKey.get(sk) ? [{ key: gk, dark: false, file: byKey.get(sk).file }] : []));
  const categories = Object.fromEntries([...new Set(services.map((s) => s.category))].sort().map((c) => [c, "#0078D4"]));
  return { generatedFrom: release, categories, services, resources: [], groups, general };
}
