param location string = resourceGroup().location

resource plan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'plan-web'
  location: location
  sku: { name: 'P1v3' }
}

resource web 'Microsoft.Web/sites@2023-01-01' = {
  name: 'web-shop'
  location: location
  properties: {
    serverFarmId: plan.id
  }
}

resource sql 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  name: 'sql-shop/shopdb'
  location: location
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-shop'
  location: location
  properties: { tenantId: subscription().tenantId, sku: { family: 'A', name: 'standard' } }
}

resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: 'redis-shop'
  location: location
  properties: { sku: { name: 'Standard', family: 'C', capacity: 1 } }
}

resource webConfig 'Microsoft.Web/sites/config@2023-01-01' = {
  parent: web
  name: 'appsettings'
  properties: {
    SQL: sql.name
    REDIS: redis.name
    KV: kv.name
  }
}
