// Conservative label -> Azure icon mapping for imported diagrams. Never silently invents: every result
// carries a confidence (exact | keyword | fallback) so the importer can report what needs a human look.
import { resolveIcon, searchIcons } from "./catalog.mjs";

// [pattern, icon id]; first match wins, so list specific before generic.
const KEYWORDS = [
  [/\b(api management|apim|api gateway|rest api|http api|api gw)\b/, "api-management-services"],
  [/\b(front door|cdn|edge cache)\b/, "front-door-and-cdn-profiles"],
  [/\b(application gateway|app gateway|agw)\b/, "application-gateways"],
  [/\b(load balancer|lb|alb|nlb|elb)\b/, "load-balancers"],
  [/\b(dns|route ?53|traffic manager)\b/, "dns-zones"],
  [/\b(waf|web application firewall)\b/, "web-application-firewall-policies-waf"],
  [/\b(ddos|shield)\b/, "ddos-protection-plans"],
  [/\b(firewall)\b/, "firewalls"],
  [/\b(content safety|guardrails?|content filter)\b/, "content-safety"],
  [/\b(onelake|lakehouse)\b/, "fabric-lakehouse"],
  [/\b(eventhouse|kql database)\b/, "fabric-event-house"],
  [/\b(fabric data agent|data agent)\b/, "fabric-data-agent"],
  [/\b(microsoft fabric)\b/, "fabric"],
  [/\b(copilot studio|copilotstudio|copilot)\b/, "copilot-studio"],
  [/\b(power apps|powerapps|canvas app|model-driven app)\b/, "power-apps"],
  [/\b(power automate|cloud flow)\b/, "power-automate"],
  [/\b(power pages)\b/, "power-pages"],
  [/\b(dataverse|common data service)\b/, "dataverse"],
  [/\b(ai builder)\b/, "ai-builder"],
  [/\b(agent 365)\b/, "agent-365"],
  [/\b(agents?|agent runtime|agent platform|agent service)\b/, "foundry-agent-service"],
  [/\b(llm|foundation model|openai|gen ?ai|gpt|model invocation|embeddings?)\b/, "openai"],
  [/\b(ml model|training job|ml platform|inference endpoint|machine learning)\b/, "machine-learning"],
  [/\b(fhir|healthcare apis?|ehr data)\b/, "fhir-service"],
  [/\b(document intelligence|form recognizer|ocr|textract)\b/, "form-recognizers"], [/\b(language|text analytics|comprehend|entities)\b/, "language"],
  [/\b(speech|transcribe|speech to text)\b/, "speech-services"], [/\b(vision|image analysis|rekognition)\b/, "computer-vision"],
  [/\b(vector (store|db|database)|ai search|cognitive search|search (index|engine|service)|opensearch|elasticsearch|kendra|enterprise search)\b/, "cognitive-search"],
  [/\b(service bus|queue|message buffer|sqs)\b/, "service-bus"],
  [/\b(event grid|event bus|events?|topic|sns|pub ?\/? ?sub|fan.?out|notifications?|eventbridge)\b/, "event-grid-topics"],
  [/\b(event hubs?|kafka|msk|kinesis|data stream|streaming)\b/, "event-hubs"],
  [/\b(stream analytics)\b/, "stream-analytics-jobs"],
  [/\b(state machine|logic apps?|step functions?|workflow|orchestrat\w*)\b/, "logic-apps"],
  [/\b(data lake|lake formation|datalake)\b/, "data-lake-storage-gen1"],
  [/\b(etl|data factory|glue|data catalog|crawler|pipeline orchestration)\b/, "data-factories"], [/\b(synapse|athena|ad hoc quer\w+|data warehouse|warehouse|redshift)\b/, "synapse-analytics"],
  [/\b(databricks|emr|spark|hadoop)\b/, "databricks"], [/\b(data explorer|adx)\b/, "data-explorer-clusters"],
  [/\b(bucket|object store|object storage|s3|blob|storage account)\b/, "storage-accounts"],
  [/\b(file share|file system|efs|nfs shared)\b/, "fileshares"], [/\b(block storage|ebs|disk|volume)\b/, "disks"],
  [/\b(nosql|cosmos\w*|dynamo\w*|key.?value store)\b/, "cosmos-db"],
  [/\b(postgres\w*)\b/, "database-postgresql-server"], [/\b(mysql)\b/, "database-mysql-server"],
  [/\b(database|db|sql|rds|aurora|relational)\b/, "sql-database"],
  [/\b(cache|redis|memcached|elasticache|valkey)\b/, "cache-redis"],
  [/\b(functions?|lambda|serverless|handler)\b/, "function-apps"],
  [/\b(kubernetes|k8s|aks|eks)\b/, "kubernetes-services"],
  [/\b(container apps?)\b/, "container-apps-environments"], [/\b(container instances?|fargate)\b/, "container-instances"], [/\b(container|docker|microservice|ecs|service mesh)\b/, "container-instances"],
  [/\b(container registry|acr|ecr)\b/, "container-registries"],
  [/\b(app service|web app|webapp|app runner|website)\b/, "app-services"], [/\b(batch job|batch)\b/, "batch-accounts"],
  [/\b(vm|virtual machine|server|instance|ec2|host)\b/, "virtual-machine"], [/\b(bastion)\b/, "bastions"],
  [/\b(auth\w*|login|sso|identity|oauth|oidc|idp|entra|azure ad|sign.?in|user pool|b2c)\b/, "entra-id-protection"],
  [/\b(managed identity|iam|role|permissions?|rbac)\b/, "entra-managed-identities"],
  [/\b(secrets?|vault|credentials?|kms|encryption|encrypt|cmk|key vault)\b/, "key-vaults"],
  [/\b(defender|guardduty|threat detection)\b/, "defender-for-cloud"], [/\b(sentinel|siem)\b/, "sentinel"], [/\b(audit|cloudtrail|activity log)\b/, "activity-log"],
  [/\b(app insights|application insights|tracing|traces?|x-?ray|apm)\b/, "application-insights"],
  [/\b(log analytics)\b/, "log-analytics-workspaces"],
  [/\b(monitor\w*|metrics?|logs?|logging|observab\w*|alarms?|cloudwatch|telemetry|dashboards?)\b/, "monitor"],
  [/\b(backup|recovery vault|site recovery)\b/, "recovery-services-vaults"],
  [/\b(ci ?\/? ?cd|pipeline|devops|github actions|codepipeline|build|codebuild)\b/, "devops"],
  [/\b(vnet|virtual network|network|vpc|virtual private cloud)\b/, "virtual-networks"],
  [/\b(vpn|vpn gateway)\b/, "virtual-network-gateways"], [/\b(expressroute|direct connect)\b/, "expressroute-circuits"], [/\b(private endpoint|private link)\b/, "private-link"],
  [/\b(email|mail|communication services)\b/, "communication-services"],
  [/\b(iot|device|sensor)\b/, "iot-hub"],
  [/\b(static web app|static site|frontend hosting|spa)\b/, "static-apps"], [/\b(graphql)\b/, "api-management-services"],
];
const GENERAL = [
  [/\b(terraform|bicep|arm template|iac|infrastructure as code|cdk|cloudformation)\b/, "gen:templates"],
  [/\b(users?|clients?|customers?|browser|patients?|clinicians?|staff|operators?|employees?|developers?|admins?|actors?|people)\b/, "users"],
  [/\b(mobile|ios|android|phone)\b/, "mobile"],
  [/\b(internet|public web|external)\b/, "gen:globe-success"],
  [/\b(on.?prem\w*|data ?cent(er|re)|legacy|mainframe|ehr|pacs|hl7|erp|crm)\b/, "gen:server-farm"],
  [/\b(document|pdf|report|file)\b/, "gen:file"],
];

export function guessIcon(label, hint = "") {
  const text = `${label || ""} ${hint}`.toLowerCase().replace(/[_]+/g, " ");
  const compact = text.replace(/[^a-z0-9 :]+/g, " ").replace(/\s+/g, " ").trim();
  // 1. exact service id / alias / full name (e.g. "Azure Cosmos DB", "Key Vault", "Azure Functions")
  const exact = resolveIcon(compact) || resolveIcon(compact.replace(/ /g, "-"));
  if (exact) return { icon: refOf(exact), confidence: "exact", matched: exact.entry.name };
  // 2. any single word or adjacent pair that is an exact service id/alias
  const words = compact.split(" ").filter(Boolean);
  for (let n = 2; n >= 1; n--) for (let i = 0; i + n <= words.length; i++) {
    const g = words.slice(i, i + n).join(" ");
    if (g.length < 3) continue;
    const hit = resolveIcon("svc:" + g.replace(/ /g, "-"));
    if (hit) return { icon: refOf(hit), confidence: "exact", matched: hit.entry.name };
  }
  // 3. Azure keyword table (also understands common AWS/GCP names)
  for (const [re, id] of KEYWORDS) if (re.test(compact)) { const hit = resolveIcon("svc:" + id); if (hit) return { icon: refOf(hit), confidence: "keyword", matched: hit.entry.name }; }
  for (const [re, id] of GENERAL) if (re.test(compact)) { const hit = resolveIcon(id); if (hit) return { icon: refOf(hit), confidence: "keyword", matched: hit.entry.name }; }
  // 4. strict catalog search (every token must match)
  const s = searchIcons(compact, 1)[0];
  if (s && s.kind === "service" && words.length <= 3) return { icon: s.id, confidence: "search", matched: s.name };
  return { icon: "gen:cubes", confidence: "fallback", matched: null };
}
const refOf = (r) => (r.kind === "service" ? r.entry.id : r.kind === "resource" ? "res:" + r.entry.id : "gen:" + r.entry.id);
