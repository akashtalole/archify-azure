resource "azurerm_resource_group" "rg" {
  name     = "rg-orders"
  location = "eastus"
}

resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-orders"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  address_space       = ["10.0.0.0/16"]
}

resource "azurerm_storage_account" "uploads" {
  name                     = "ordersuploads"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "ZRS"
}

resource "azurerm_servicebus_namespace" "bus" {
  name                = "orders-bus"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Standard"
}

resource "azurerm_linux_function_app" "api" {
  name                       = "orders-api"
  resource_group_name        = azurerm_resource_group.rg.name
  location                   = azurerm_resource_group.rg.location
  storage_account_name       = azurerm_storage_account.uploads.name
  virtual_network_subnet_id  = "subnet"
  app_settings = {
    BUS = azurerm_servicebus_namespace.bus.name
    KV  = azurerm_key_vault.kv.vault_uri
    DB  = azurerm_cosmosdb_account.db.endpoint
  }
}

resource "azurerm_key_vault" "kv" {
  name                = "orders-kv"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  tenant_id           = "00000000-0000-0000-0000-000000000000"
  sku_name            = "standard"
}

resource "azurerm_cosmosdb_account" "db" {
  name                = "orders-db"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
}

resource "azurerm_application_insights" "ai" {
  name                = "orders-ai"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  application_type    = "web"
}

resource "azurerm_api_management" "apim" {
  name                = "orders-apim"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  publisher_name      = "Contoso"
  publisher_email     = "ops@contoso.com"
  sku_name            = "Consumption_0"
}

resource "azurerm_api_management_backend" "api_backend" {
  name                = "orders-backend"
  resource_group_name = azurerm_resource_group.rg.name
  api_management_name = azurerm_api_management.apim.name
  protocol            = "http"
  url                 = "https://${azurerm_linux_function_app.api.default_hostname}"
}

resource "azurerm_eventgrid_system_topic" "uploads" {
  name                   = "uploads-topic"
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  source_arm_resource_id = azurerm_storage_account.uploads.id
  topic_type             = "Microsoft.Storage.StorageAccounts"
}
