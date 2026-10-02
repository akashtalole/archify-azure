# Dynamics 365 (Business Central and customer engagement apps) to Fabric analytics

Operational data from **Dynamics 365 Business Central** and the **customer engagement apps** (Sales, Customer Service, Field Service, on Dataverse) flowing
into **Microsoft Fabric** for analytics, using the official Dynamics 365 and Fabric icons.

| Spec | What it shows | Output |
|---|---|---|
| [`architecture.json`](architecture.json) | Business Central and CE apps → Fabric landing (open mirrored database, Dataverse lakehouse) → curated lakehouse → semantic model, Power BI and a Fabric data agent, with an Azure extract function | [html](out/architecture.html) · [png](out/architecture.png) · [draw.io](out/architecture.drawio) |
| [`data-mirroring.dataflow.json`](data-mirroring.dataflow.json) | The three ways in (Dataverse Link to Fabric, open mirroring, pipelines) and the medallion that follows | [html](out/data-mirroring.dataflow.html) · [png](out/data-mirroring.dataflow.png) |

## What the Microsoft documentation says (checked while building this example)
* **Customer engagement apps and Finance and Operations apps** keep their data in Dataverse. **Link to Microsoft Fabric** (Power Apps, *Link data* → *Fabric link*)
  creates a lakehouse and SQL endpoint in a Fabric workspace with **read-only OneLake shortcuts** to the Dataverse tables; the data stays in Dataverse and updates can take
  up to about 60 minutes. Tables must have **Track changes** enabled, and linked tables consume Dataverse storage. This is a shortcut link, not database mirroring.
  ([Link to Fabric](https://learn.microsoft.com/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric))
* **Business Central** documents Fabric as the option for advanced analytics ([Introduction to Fabric and Business Central](https://learn.microsoft.com/dynamics365/business-central/admin-fabric))
  and its API v2.0 and guidance for extracts to data lakes; it is **not** one of Fabric's built-in mirroring sources (Azure SQL, SQL Managed Instance, Cosmos DB, PostgreSQL, SQL Server, Oracle, SAP, Snowflake, BigQuery, Databricks catalog).
  The mirroring-style pattern drawn here uses **open mirroring**: an extract function writes change files to the mirrored database's landing zone and Fabric applies them to Delta tables
  ([Open mirroring](https://learn.microsoft.com/fabric/mirroring/open-mirroring)). That function is custom code (or a partner tool), so it is shown as an Azure component.
* The Dataverse-linked lakehouse and the mirrored database both feed one curated lakehouse through OneLake shortcuts, so reports can join finance and CRM data without a second copy.

## Limits
* Dynamics 365 licences, Dataverse storage and Fabric capacity are not in the Azure Retail Prices API; only the Azure extract function and Key Vault are priced.
* The diagram shows the pattern, not the schedule or security configuration (workspace identity, row-level security, Purview labels), which the review marks *Cannot Determine*.
