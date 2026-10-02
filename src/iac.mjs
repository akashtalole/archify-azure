// Infrastructure-as-code -> architecture spec. Reads Terraform (*.tf, azurerm provider), Bicep (*.bicep) and ARM templates
// (JSON) with zero-dependency scanners (no full parsers: resources, references, dependsOn) and produces the same spec the
// rest of the tool renders. It reports what it skipped so nothing is silently dropped.
import fs from "node:fs";
import path from "node:path";
import { layerItems } from "./layers.mjs";

// kind -> icon; `tf` and `arm` (Bicep and ARM resource types) are the type patterns that map to it. `body` narrows by the
// resource body (Cognitive Services accounts and App Service sites share one type). Order = upstream-first priority for glue edges.
const KINDS = [
  { k: "dns", icon: "dns-zones", tf: /^azurerm_(private_)?dns_zone$/, arm: /^Microsoft\.Network\/(privateD|d)nsZones$/i },
  { k: "cdn", icon: "front-door-and-cdn-profiles", tf: /^azurerm_(cdn_frontdoor_profile|cdn_profile|frontdoor)$/, arm: /^Microsoft\.(Cdn\/profiles|Network\/frontDoors)$/i },
  { k: "waf", icon: "web-application-firewall-policies-waf", tf: /^azurerm_(web_application_firewall_policy|cdn_frontdoor_firewall_policy)$/, arm: /^Microsoft\.Network\/(ApplicationGatewayWebApplicationFirewallPolicies|FrontDoorWebApplicationFirewallPolicies)$/i },
  { k: "api", icon: "api-management-services", tf: /^azurerm_api_management$/, arm: /^Microsoft\.ApiManagement\/service$/i },
  { k: "appgw", icon: "application-gateways", tf: /^azurerm_application_gateway$/, arm: /^Microsoft\.Network\/applicationGateways$/i },
  { k: "lb", icon: "load-balancers", tf: /^azurerm_lb$/, arm: /^Microsoft\.Network\/loadBalancers$/i },
  { k: "fw", icon: "firewalls", tf: /^azurerm_firewall$/, arm: /^Microsoft\.Network\/azureFirewalls$/i },
  { k: "grid", icon: "event-grid-topics", tf: /^azurerm_eventgrid_(topic|system_topic|domain)$/, arm: /^Microsoft\.EventGrid\/(topics|systemTopics|domains)$/i },
  { k: "bus", icon: "service-bus", tf: /^azurerm_servicebus_namespace$/, arm: /^Microsoft\.ServiceBus\/namespaces$/i },
  { k: "hub", icon: "event-hubs", tf: /^azurerm_eventhub_namespace$/, arm: /^Microsoft\.EventHub\/namespaces$/i },
  { k: "storage", icon: "storage-accounts", tf: /^azurerm_storage_account$/, arm: /^Microsoft\.Storage\/storageAccounts$/i },
  { k: "logic", icon: "logic-apps", tf: /^azurerm_logic_app_workflow$/, arm: /^Microsoft\.Logic\/workflows$/i },
  { k: "fn", icon: "function-apps", tf: /^azurerm_(linux_function_app|windows_function_app|function_app)$/, arm: /^Microsoft\.Web\/sites$/i, body: /functionapp/i },
  { k: "app", icon: "app-services", tf: /^azurerm_(linux_web_app|windows_web_app|app_service)$/, arm: /^Microsoft\.Web\/sites$/i },
  { k: "swa", icon: "static-apps", tf: /^azurerm_static_web_app$/, arm: /^Microsoft\.Web\/staticSites$/i },
  { k: "vm", icon: "virtual-machine", tf: /^azurerm_(linux_virtual_machine|windows_virtual_machine|virtual_machine)$/, arm: /^Microsoft\.Compute\/virtualMachines$/i },
  { k: "vmss", icon: "vm-scale-sets", tf: /^azurerm_(linux_|windows_)?virtual_machine_scale_set$/, arm: /^Microsoft\.Compute\/virtualMachineScaleSets$/i },
  { k: "aks", icon: "kubernetes-services", tf: /^azurerm_kubernetes_cluster$/, arm: /^Microsoft\.ContainerService\/managedClusters$/i },
  { k: "acr", icon: "container-registries", tf: /^azurerm_container_registry$/, arm: /^Microsoft\.ContainerRegistry\/registries$/i },
  { k: "aci", icon: "container-instances", tf: /^azurerm_container_group$/, arm: /^Microsoft\.ContainerInstance\/containerGroups$/i },
  { k: "capp", icon: "container-apps-environments", tf: /^azurerm_container_app(_environment)?$/, arm: /^Microsoft\.App\/(containerApps|managedEnvironments)$/i },
  { k: "openai", icon: "openai", tf: /^azurerm_cognitive_account$/, arm: /^Microsoft\.CognitiveServices\/accounts$/i, body: /OpenAI/ },
  { k: "ai", icon: "cognitive-services", tf: /^azurerm_cognitive_account$/, arm: /^Microsoft\.CognitiveServices\/accounts$/i },
  { k: "search", icon: "cognitive-search", tf: /^azurerm_search_service$/, arm: /^Microsoft\.Search\/searchServices$/i },
  { k: "ml", icon: "machine-learning", tf: /^azurerm_machine_learning_workspace$/, arm: /^Microsoft\.MachineLearningServices\/workspaces$/i },
  { k: "redis", icon: "cache-redis", tf: /^azurerm_redis(_enterprise)?_cache$|^azurerm_redis_enterprise_cluster$/, arm: /^Microsoft\.Cache\/redis(Enterprise)?$/i },
  { k: "sql", icon: "sql-database", tf: /^azurerm_(mssql_database|sql_database)$/, arm: /^Microsoft\.Sql\/servers\/databases$/i },
  { k: "pg", icon: "database-postgresql-server", tf: /^azurerm_postgresql_flexible_server$/, arm: /^Microsoft\.DBforPostgreSQL\/flexibleServers$/i },
  { k: "mysql", icon: "database-mysql-server", tf: /^azurerm_mysql_flexible_server$/, arm: /^Microsoft\.DBforMySQL\/flexibleServers$/i },
  { k: "cosmos", icon: "cosmos-db", tf: /^azurerm_cosmosdb_account$/, arm: /^Microsoft\.DocumentDB\/databaseAccounts$/i },
  { k: "df", icon: "data-factories", tf: /^azurerm_data_factory$/, arm: /^Microsoft\.DataFactory\/factories$/i },
  { k: "syn", icon: "synapse-analytics", tf: /^azurerm_synapse_workspace$/, arm: /^Microsoft\.Synapse\/workspaces$/i },
  { k: "kv", icon: "key-vaults", tf: /^azurerm_key_vault$/, arm: /^Microsoft\.KeyVault\/vaults$/i },
  { k: "pe", icon: "private-endpoints", tf: /^azurerm_private_endpoint$/, arm: /^Microsoft\.Network\/privateEndpoints$/i },
  { k: "bastion", icon: "bastions", tf: /^azurerm_bastion_host$/, arm: /^Microsoft\.Network\/bastionHosts$/i },
  { k: "insights", icon: "application-insights", tf: /^azurerm_application_insights$/, arm: /^Microsoft\.Insights\/components$/i },
  { k: "logs", icon: "log-analytics-workspaces", tf: /^azurerm_log_analytics_workspace$/, arm: /^Microsoft\.OperationalInsights\/workspaces$/i, optional: "logs" },
  { k: "iam", icon: "managed-identities", tf: /^azurerm_user_assigned_identity$/, arm: /^Microsoft\.ManagedIdentity\/userAssignedIdentities$/i, optional: "iam" },
];
const PRIORITY = KINDS.map((x) => x.k);
const GLUE = {
  tf: /^azurerm_(role_assignment|key_vault_(access_policy|secret|key)|monitor_diagnostic_setting|eventgrid_(system_topic_)?event_subscription|api_management_(api|backend|api_operation|named_value|product|subscription|logger)|app_service_(virtual_network_swift_connection|slot)|private_dns_zone_virtual_network_link|subnet_network_security_group_association|storage_(container|queue|table)|servicebus_(queue|topic|subscription)|eventhub|cosmosdb_(sql_database|sql_container)|mssql_(firewall_rule|server_extended_auditing_policy|virtual_network_rule)|monitor_(metric_alert|action_group)|private_dns_a_record|function_app_function)$/,
  arm: /^Microsoft\.(Authorization\/roleAssignments|Insights\/diagnosticSettings|EventGrid\/(systemTopics|topics)\/eventSubscriptions|ApiManagement\/service\/(apis|backends|products|subscriptions)|Web\/sites\/(config|slots|functions)|ServiceBus\/namespaces\/(queues|topics)|EventHub\/namespaces\/eventhubs|Storage\/storageAccounts\/(blobServices|queueServices)|Sql\/servers\/firewallRules|KeyVault\/vaults\/(secrets|accessPolicies))$/i,
};
const NET = { tf: /^azurerm_virtual_network$/, arm: /^Microsoft\.Network\/virtualNetworks$/i };
const VNET_HINT = /\b(subnet_id|virtual_network_subnet_id|delegated_subnet_id|subnet_ids|vnet_integration_subnet_id|subnetId|virtualNetworkSubnetId|subnet)\b/;

const walk = (dir, exts, acc = []) => {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(\.|node_modules$|dist$|\.terraform$)/.test(d.name) && d.name !== ".") continue;
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f, exts, acc); else if (exts.some((e) => d.name.endsWith(e))) acc.push(f);
  }
  return acc;
};
const human = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** Body of a `{ ... }` block starting after position i (the opening brace is already consumed). Skips strings and comments. */
function block(text, i) {
  let depth = 1, inStr = null;
  const start = i;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (inStr) { if (ch === "\\") i++; else if (ch === inStr) inStr = null; }
    else if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === "#" || (ch === "/" && text[i + 1] === "/")) { while (i < text.length && text[i] !== "\n") i++; }
    else if (ch === "{") depth++; else if (ch === "}") depth--;
    i++;
  }
  return { body: text.slice(start, i - 1), end: i };
}

// ---------------- Terraform
function terraformResources(text, file) {
  const out = [], re = /(^|\n)\s*resource\s+"(azurerm_[a-z0-9_]+)"\s+"([^"]+)"\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const { body } = block(text, m.index + m[0].length);
    out.push({ type: m[2], name: m[3], body, file, id: `${m[2]}.${m[3]}` });
  }
  return out;
}
const tfRefs = (r, byId) => [...new Set([...r.body.matchAll(/\b(azurerm_[a-z0-9_]+)\.([A-Za-z0-9_-]+)/g)].map((x) => `${x[1]}.${x[2]}`))].filter((id) => id !== r.id && byId.has(id));

// ---------------- Bicep
function bicepResources(text, file) {
  const out = [], re = /(^|\n)\s*resource\s+([A-Za-z_]\w*)\s+'([A-Za-z0-9.\/]+)@[^']+'\s*(?:existing\s*)?=\s*(?:\[[^\n]*\n\s*)?\{/g;
  let m;
  while ((m = re.exec(text))) {
    const { body } = block(text, m.index + m[0].length);
    out.push({ type: m[3], name: m[2], body, file, id: m[2], existing: /existing\s*=/.test(m[0]) });
  }
  return out.filter((r) => !r.existing);
}
const bicepRefs = (r, byId) => [...byId.keys()].filter((id) => id !== r.id && new RegExp(`\\b${id}\\b`).test(r.body));

// ---------------- ARM (JSON)
function armResources(text, file) {
  let j; try { j = JSON.parse(text); } catch { return []; }
  const flat = [];
  const walkRes = (list, parent) => { for (const r of list || []) { const type = parent ? `${parent}/${r.type}` : r.type; flat.push({ type, name: String(r.name || type), body: JSON.stringify(r), file, id: String(r.name || type) + "|" + type, json: r }); walkRes(r.resources, type); } };
  walkRes(j.resources, null);
  return flat;
}
const armRefs = (r, all) => {
  const deps = JSON.stringify(r.json?.dependsOn || []);
  const names = new Set();
  for (const o of all) {
    if (o.id === r.id) continue;
    const lit = /^[A-Za-z0-9_.-]+$/.test(o.name) ? o.name : null;
    if ((lit && (deps.includes(lit) || r.body.includes(`'${lit}'`) || r.body.includes(`"${lit}"`))) || (deps.includes(o.type) && all.filter((x) => x.type === o.type).length === 1)) names.add(o.id);
  }
  return [...names];
};

export function importIac(root, { include = [], title } = {}) {
  const target = path.resolve(root);
  const stat = fs.statSync(target);
  const files = stat.isDirectory() ? walk(target, [".tf", ".bicep", ".json"]) : [target];
  const report = { source: target, files: [], formats: [], resources: 0, nodes: 0, skipped: {}, glue: 0, warnings: [] };
  const all = [];
  for (const f of files) {
    let text; try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    let rs = [], fmt = null;
    if (f.endsWith(".tf")) { rs = terraformResources(text, f).map((r) => ({ ...r, fmt: "tf" })); fmt = "terraform"; }
    else if (f.endsWith(".bicep")) { rs = bicepResources(text, f).map((r) => ({ ...r, fmt: "bicep" })); fmt = "bicep"; }
    else if (/"\$schema"\s*:\s*"[^"]*deploymentTemplate|"resources"\s*:\s*\[/.test(text)) { rs = armResources(text, f).map((r) => ({ ...r, fmt: "arm" })); fmt = "arm"; }
    if (rs.length) { all.push(...rs); report.files.push(path.relative(process.cwd(), f)); if (!report.formats.includes(fmt)) report.formats.push(fmt); }
  }
  if (!all.length) throw new Error(`no Terraform (azurerm), Bicep or ARM template resources found in ${root}`);
  report.resources = all.length;
  const byId = new Map(all.map((r) => [r.id, r]));
  const isTf = (r) => r.fmt === "tf";
  const classify = (r) => {
    const ty = r.type;
    if ((isTf(r) ? NET.tf : NET.arm).test(ty)) return { role: "vnet" };
    if ((isTf(r) ? GLUE.tf : GLUE.arm).test(ty)) return { role: "glue" };
    const kind = KINDS.find((k) => (isTf(r) ? k.tf : k.arm).test(ty) && (!k.body || isTf(r) && /^azurerm_(linux|windows)?_?function_app$/.test(ty) || k.body.test(r.body)));
    if (kind) return kind.optional && !include.includes(kind.optional) ? { role: "skip", why: kind.optional } : { role: "node", kind };
    return { role: "skip", why: ty };
  };
  const nodes = new Map(), glue = [], vnets = [], used = new Set();
  const nodeId = (s) => { let id = s.replace(/[^\w-]+/g, "_"); if (!/^[A-Za-z]/.test(id)) id = "r" + id; return id; };
  const uniq = (r) => { let id = nodeId(r.name); if (used.has(id)) id = nodeId(r.type.replace(/^azurerm_|^Microsoft\./, "").replace(/[./]/g, "_") + "_" + r.name); used.add(id); return id; };
  for (const r of all) {
    const c = classify(r); r.cls = c;
    if (c.role === "node") nodes.set(r.id, { r, kind: c.kind, id: uniq(r), label: human(r.name.replace(/^\[.*\]$/, c.kind.k)), sublabel: r.type.replace(/^azurerm_|^Microsoft\./, "").replace(/[./]/g, " "), vnet: VNET_HINT.test(r.body) });
    else if (c.role === "glue") glue.push(r);
    else if (c.role === "vnet") vnets.push(r);
    else report.skipped[c.why] = (report.skipped[c.why] || 0) + 1;
  }
  report.glue = glue.length;
  const refsOf = (r) => (r.fmt === "tf" ? tfRefs(r, byId) : r.fmt === "bicep" ? bicepRefs(r, byId) : armRefs(r, all));
  const edges = [], seen = new Set();
  const addEdge = (a, b, label, dashed) => { if (!a || !b || a === b || !nodes.has(a) || !nodes.has(b)) return; const k = a + ">" + b; if (seen.has(k)) return; seen.add(k); edges.push({ from: nodes.get(a).id, to: nodes.get(b).id, ...(label ? { label } : {}), ...(dashed ? { style: "dashed" } : {}) }); };
  const pr = (id) => { const n = nodes.get(id); return n ? PRIORITY.indexOf(n.kind.k) : 999; };
  // direct references: A uses B
  for (const n of nodes.values()) for (const ref of refsOf(n.r)) if (nodes.has(ref)) addEdge(n.r.id, ref);
  // glue resources connect the most "upstream" referenced node to the others (event subscriptions, diagnostic settings, role assignments...)
  const resolveGlue = (g, depth = 0) => [...new Set(refsOf(g).flatMap((id) => (nodes.has(id) ? [id] : byId.get(id)?.cls.role === "glue" && depth < 2 ? resolveGlue(byId.get(id), depth + 1) : [])))];
  for (const g of glue) {
    const refs = resolveGlue(g).sort((a, b) => pr(a) - pr(b));
    if (refs.length >= 2) for (const t of refs.slice(1)) addEdge(refs[0], t, glueLabel(g));
  }
  // ---- build items (VNet-attached nodes go inside a virtual network group, everything inside Azure)
  const mk = (n) => ({ id: n.id, icon: n.kind.icon, label: n.label, sublabel: n.sublabel });
  const inVnet = [], outside = [];
  for (const n of nodes.values()) (n.vnet && vnets.length ? inVnet : outside).push(n);
  const items = outside.map(mk);
  if (inVnet.length) items.push({ id: "vnet", kind: "vnet", label: "Virtual network", children: inVnet.map(mk) });
  if (nodes.size > 40) report.warnings.push(`${nodes.size} resources become nodes — consider narrowing the path or splitting the diagram (readable range is ~6-20).`);
  const layered = layerItems(items, edges, "LR");
  const cloud = { id: "cloud", kind: "azure-cloud", layout: "row", gap: 64, children: layered };
  const spec = {
    meta: { title: title || `${path.basename(target)} — architecture from ${report.formats.join(" + ")}`, subtitle: `${nodes.size} resources, ${edges.length} relationships inferred from references; verify against the deployed system`, output: "iac-diagram.html" },
    root: { layout: "row", gap: 70, children: [cloud] },
    edges,
  };
  report.nodes = nodes.size;
  report.edges = edges.length;
  if (!edges.length) report.warnings.push("no relationships could be inferred from references");
  return { type: "architecture", spec, report };
  function glueLabel(g) {
    if (/event_subscription|eventSubscriptions/i.test(g.type)) return "subscribes";
    if (/diagnostic/i.test(g.type)) return "logs to";
    if (/role_assignment|roleAssignments|access_policy|accessPolicies/i.test(g.type)) return "authorizes";
    if (/private_dns|servicebus_subscription/i.test(g.type)) return undefined;
    return undefined;
  }
}
