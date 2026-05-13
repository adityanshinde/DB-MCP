# Third-Party API Integrations Plan

## Philosophy

DB-MCP should not just connect to databases — it should connect to the entire data ecosystem. By integrating with popular data platforms, observability tools, and collaboration software, DB-MCP becomes the central nervous system for data-aware AI agents.

---

## Data Platform Integrations

### 1. dbt (Data Build Tool)
**Why**: dbt is the standard for data transformations. Understanding dbt models is essential for analytics.

**Tools**:
- `dbt_list_models` — List all models in a project
- `dbt_get_model_sql` — Get the compiled SQL for a model
- `dbt_get_model_lineage` — Upstream and downstream dependencies
- `dbt_run_model` — Execute a specific model (if write access granted)
- `dbt_test_results` — Get latest test results

**Integration**: Parse `manifest.json` and `catalog.json` from dbt artifacts

---

### 2. Airflow / Dagster / Prefect
**Why**: Orchestration tools define data pipelines. Understanding them helps trace data lineage.

**Tools**:
- `airflow_list_dags` — List DAGs
- `airflow_get_dag_runs` — Execution history
- `airflow_get_task_logs` — Recent task logs
- `dagster_get_assets` — Software-defined assets
- `prefect_get_flow_runs` — Flow execution status

---

### 3. Fivetran / Airbyte / Stitch
**Why**: ETL tools move data. Knowing source-to-destination mappings is crucial.

**Tools**:
- `fivetran_list_connectors` — Active data pipelines
- `fivetran_get_connector_schema` — Source table to destination mapping
- `airbyte_list_connections` — Sync configurations
- `airbyte_get_sync_history` — Recent syncs with row counts

---

## Observability & Monitoring Integrations

### 4. Datadog
**Why**: Monitor database performance metrics alongside query execution.

**Tools**:
- `datadog_get_database_metrics` — CPU, memory, connections over time
- `datadog_get_slow_queries` — Queries flagged by Datadog APM
- `datadog_get_alerts` — Active monitors for the database

---

### 5. New Relic
**Tools**:
- `newrelic_get_database_performance` — Query response time distribution
- `newrelic_get_error_analysis` — Database error trends

---

### 6. Grafana
**Tools**:
- `grafana_list_dashboards` — Find database-related dashboards
- `grafana_get_dashboard` — Panel data and queries

---

## Collaboration & Documentation Integrations

### 7. Notion
**Why**: Teams document schemas, runbooks, and analysis in Notion.

**Tools**:
- `notion_search_docs` — Search for database documentation
- `notion_get_schema_doc` — Get schema documentation page
- `notion_create_analysis` — Write query results to a Notion page

---

### 8. Confluence
**Tools**:
- `confluence_search_pages` — Find database documentation
- `confluence_get_page` — Read schema documentation

---

### 9. Slack
**Tools**:
- `slack_send_query_results` — Share query results to a channel
- `slack_search_conversations` — Find previous data discussions

---

## Cloud Platform Integrations

### 10. AWS
**Tools**:
- `aws_list_rds_instances` — Discover RDS databases
- `aws_get_rds_metrics` — CloudWatch metrics for a database
- `aws_list_redshift_clusters` — Redshift discovery
- `aws_get_s3_data` — Query S3 via Athena

---

### 11. GCP
**Tools**:
- `gcp_list_cloudsql_instances` — PostgreSQL/MySQL discovery
- `gcp_get_cloudsql_metrics` — Cloud Monitoring data
- `gcp_run_bigquery` — Execute BigQuery jobs

---

### 12. Azure
**Tools**:
- `azure_list_sql_servers` — Azure SQL discovery
- `azure_get_sql_metrics` — Azure Monitor metrics

---

## BI & Visualization Integrations

### 13. Tableau
**Tools**:
- `tableau_list_workbooks` — Find reports using the database
- `tableau_get_datasource` — Extract workbook SQL queries

---

### 14. Looker
**Tools**:
- `looker_list_looks` — Saved queries
- `looker_get_look_sql` — Generated SQL for a Look
- `looker_get_explore` — Available fields and joins

---

### 15. Metabase
**Tools**:
- `metabase_list_questions` — Saved questions
- `metabase_get_question_sql` — Native query behind a question
- `metabase_list_dashboards` — Dashboards using the database

---

## CRM & Business Data Integrations

### 16. Salesforce
**Tools**:
- `salesforce_describe_object` — Schema for any Salesforce object
- `salesforce_query` — SOQL query execution
- `salesforce_get_record` — Specific record by ID

---

### 17. HubSpot
**Tools**:
- `hubspot_list_objects` — Contacts, Companies, Deals schemas
- `hubspot_search_contacts` — CRM search

---

### 18. Stripe
**Tools**:
- `stripe_list_customers` — Customer search
- `stripe_get_charges` — Transaction query
- `stripe_analyze_revenue` — Revenue metrics

---

## Integration Implementation Pattern

For each new integration, follow this template:

```typescript
// 1. Define the connector
interface IntegrationConnector {
  readonly name: string;
  readonly authType: 'api_key' | 'oauth2' | 'basic';
  validateCredentials(): Promise<boolean>;
}

// 2. Implement tools
async function listResources(input: Input): Promise<ToolResponse<Output>> {
  // Validate auth
  // Call external API
  // Cache results
  // Return standardized format
}

// 3. Register in MCP server
server.registerTool(
  'integration_name_tool_name',
  { title, description, inputSchema },
  handler
);

// 4. Add env vars to config
// INTEGRATION_API_KEY, INTEGRATION_BASE_URL, etc.
```

---

## Authentication Patterns

| Integration | Auth Pattern | Env Variables |
|-------------|--------------|---------------|
| Datadog | API Key | `DATADOG_API_KEY`, `DATADOG_APP_KEY` |
| Notion | OAuth2 / Token | `NOTION_TOKEN` |
| Slack | Bot Token | `SLACK_BOT_TOKEN` |
| AWS | IAM Role / Keys | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| GCP | Service Account | `GOOGLE_APPLICATION_CREDENTIALS` |
| Salesforce | OAuth2 | `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` |
| dbt | API Token | `DBT_CLOUD_TOKEN`, `DBT_ACCOUNT_ID` |

---

## Priority Matrix

| Integration | User Demand | Implementation Effort | Strategic Value | Priority |
|-------------|-------------|----------------------|-----------------|----------|
| dbt | High | Medium | Very High | P1 |
| Notion | Medium | Low | Medium | P2 |
| Datadog | Medium | Medium | Medium | P2 |
| Slack | Medium | Low | Medium | P2 |
| AWS RDS | Low | Medium | High | P3 |
| BigQuery | Medium | Medium | High | P2 |
| Tableau | Low | High | Low | P3 |
| Salesforce | Low | Medium | Medium | P3 |
| Metabase | Medium | Low | Medium | P2 |
| Airflow | Medium | Medium | Medium | P3 |

---

## Unified Integration Registry

Build a central registry so users can see all available integrations:

```typescript
// lib/integrations/registry.ts
interface IntegrationRegistration {
  id: string;
  name: string;
  category: 'database' | 'observability' | 'bi' | 'crm' | 'documentation';
  status: 'available' | 'beta' | 'coming_soon';
  tools: string[];
  requiredEnvVars: string[];
  documentationUrl: string;
}

export const INTEGRATIONS: IntegrationRegistration[] = [
  {
    id: 'datadog',
    name: 'Datadog',
    category: 'observability',
    status: 'coming_soon',
    tools: ['datadog_get_database_metrics', 'datadog_get_slow_queries'],
    requiredEnvVars: ['DATADOG_API_KEY', 'DATADOG_APP_KEY'],
    documentationUrl: '/docs/integrations/datadog'
  },
  // ...
];
```

Expose via API:
```
GET /api/integrations
{
  "integrations": [
    { "id": "datadog", "status": "coming_soon", "configured": false }
  ]
}
```
