# Database Ecosystem Expansion Plan

## Overview

Current support: PostgreSQL, MSSQL, MySQL, SQLite (all relational/SQL).

Target: Expand to NoSQL, data warehouses, vector databases, key-value stores, and document databases. The goal is to make DB-MCP the universal data access layer for AI agents.

---

## Phase 1: Document & NoSQL Databases

### MongoDB
**Use Case**: Applications with flexible schemas, JSON-like data, rapid prototyping.

**Tools to Add**:
- `mongodb_list_collections` — List all collections in a database
- `mongodb_get_collection_schema` — Infer schema from sample documents
- `mongodb_find_documents` — Query with filters, projection, sort, limit
- `mongodb_aggregate` — Execute read-only aggregation pipelines
- `mongodb_count_documents` — Count with filter
- `mongodb_search_indexes` — List and inspect text/search indexes
- `mongodb_get_index_stats` — Index usage and cardinality

**Connection**: `MONGODB_URL` or `MONGODB_URLS` (multiple connections)

**Schema Inference Approach**:
```typescript
// Sample 100 documents, flatten nested keys
// Report: field path, inferred type, nullability, sample values
// Example output:
// { path: "user.address.zip", type: "string", nullable: true, samples: ["90210", "10001"] }
```

**Security Considerations**:
- Block write operations: insert, update, delete, drop
- Validate pipeline stages are read-only ($match, $group, $project, $sort, $limit)
- Prevent `$out` and `$merge` stages

---

### Redis
**Use Case**: Caching, real-time analytics, session stores, leaderboards.

**Tools to Add**:
- `redis_list_keys` — Scan keys with pattern (e.g., `user:*`)
- `redis_get_value` — Get string/hash/set/zset by key
- `redis_get_key_info` — TTL, type, memory usage
- `redis_analyze_keyspace` — Prefix distribution, memory by prefix
- `redis_search` — Full-text search via RediSearch (if available)

**Connection**: `REDIS_URL` (supports `redis://` and `rediss://`)

**Read-Only Enforcement**:
- Whitelist commands: GET, HGET, HGETALL, LRANGE, SMEMBERS, ZRANGE, SCAN, KEYS (with limits), TTL, TYPE, INFO, DBSIZE
- Blocklist: SET, DEL, FLUSHDB, CONFIG, SHUTDOWN, AUTH (handled internally)

---

## Phase 2: Data Warehouses & OLAP

### Snowflake
**Use Case**: Enterprise analytics, massive scale SQL queries, data sharing.

**Tools to Add**:
- `snowflake_list_databases` — Account-level database listing
- `snowflake_list_schemas` — Schemas within a database
- `snowflake_list_tables` — Tables and views
- `snowflake_get_table_schema` — Column metadata with Snowflake-specific types
- `snowflake_execute_query` — Read-only SELECT with warehouse selection
- `snowflake_explain_query` — Query plan with cost estimation
- `snowflake_get_warehouse_stats` — Credit usage, queue time

**Connection**: `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_ROLE`, `SNOWFLAKE_WAREHOUSE`

**Cost Controls**:
- Auto-suspend warehouses after query
- Query timeout enforced (15s default)
- Warn on large result sets (scans > 1M rows)

---

### Google BigQuery
**Use Case**: Google Cloud analytics, petabyte-scale queries, ML integration.

**Tools to Add**:
- `bigquery_list_datasets` — Project datasets
- `bigquery_list_tables` — Tables in dataset
- `bigquery_get_table_schema` — Schema with BigQuery types (RECORD, ARRAY)
- `bigquery_execute_query` — Read-only SELECT with dry-run option
- `bigquery_estimate_query_cost` — Bytes to be processed
- `bigquery_get_table_partitions` — Partition metadata

**Connection**: `BIGQUERY_PROJECT_ID`, `BIGQUERY_CREDENTIALS_JSON` (service account)

**Cost Controls**:
- Dry-run mode: validate query and report bytes without executing
- Max bytes billed enforcement
- Partition pruning validation

---

### Amazon Redshift
**Use Case**: AWS data warehousing, integration with S3 data lakes.

**Tools to Add**:
- `redshift_list_schemas` — Schemas in cluster
- `redshift_list_tables` — Tables with sort/dist keys
- `redshift_get_table_schema` — Columns with encoding
- `redshift_execute_query` — Read-only SELECT
- `redshift_explain_query` — Query plan with disk/CPU estimates
- `redshift_get_cluster_stats` — Node health, disk usage

**Connection**: `REDSHIFT_HOST`, `REDSHIFT_PORT`, `REDSHIFT_DATABASE`, `REDSHIFT_USER`, `REDSHIFT_PASSWORD`

---

### Databricks
**Use Case**: Lakehouse architecture, Spark SQL, Delta Lake.

**Tools to Add**:
- `databricks_list_catalogs` — Unity Catalog catalogs
- `databricks_list_schemas` — Schemas in catalog
- `databricks_list_tables` — Tables and views (including Delta)
- `databricks_get_table_schema` — Schema with Delta metadata
- `databricks_execute_query` — Spark SQL execution
- `databricks_get_table_history` — Delta time travel history

**Connection**: `DATABRICKS_HOST`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN`

---

## Phase 3: Vector & Search Databases

### pgvector (PostgreSQL Extension)
**Use Case**: AI/ML embeddings, semantic search, RAG applications.

**Tools to Add**:
- `pgvector_list_indexes` — HNSW, IVFFlat indexes
- `pgvector_search_similar` — k-NN search with embedding vector
- `pgvector_get_index_stats` — Index build status, recall

**Note**: Extends existing PostgreSQL connector; just adds vector-specific tools.

---

### Pinecone
**Use Case**: Managed vector search at scale.

**Tools to Add**:
- `pinecone_list_indexes` — Available indexes
- `pinecone_describe_index` — Dimension, metric, pod type
- `pinecone_query_vectors` — k-NN search with metadata filtering
- `pinecone_fetch_vectors` — Retrieve by ID

**Connection**: `PINECONE_API_KEY`, `PINECONE_ENVIRONMENT`

---

### Elasticsearch / OpenSearch
**Use Case**: Full-text search, log analytics, vector search (dense_vector).

**Tools to Add**:
- `elasticsearch_list_indices` — Index listing with health
- `elasticsearch_get_mapping` — Field mappings and types
- `elasticsearch_search` — Query DSL execution with result limits
- `elasticsearch_get_index_stats` — Doc count, storage, shard distribution
- `elasticsearch_analyze_text` — Tokenization preview

**Connection**: `ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`

**Read-Only Enforcement**:
- Whitelist: GET, SEARCH, COUNT, MGET, EXPLAIN, FIELD_CAPS, INDEX_STATS
- Blocklist: INDEX, CREATE, DELETE, UPDATE, BULK

---

## Phase 4: Graph & Time-Series Databases

### Neo4j
**Use Case**: Relationship-heavy data, knowledge graphs, recommendation engines.

**Tools to Add**:
- `neo4j_list_labels` — Node labels
- `neo4j_list_relationship_types` — Relationship types
- `neo4j_get_schema` — Property keys, constraints, indexes
- `neo4j_execute_read_query` — Cypher MATCH queries only
- `neo4j_get_node_sample` — Sample nodes with properties

**Read-Only Enforcement**: Parse Cypher AST, block CREATE, DELETE, SET, REMOVE, MERGE

---

### InfluxDB / TimescaleDB
**Use Case**: Time-series metrics, IoT data, monitoring.

**Tools to Add**:
- `timeseries_list_measurements` — Measurements/buckets
- `timeseries_get_field_keys` — Fields and types
- `timeseries_execute_query` — Flux/InfluxQL/TSQL read-only
- `timeseries_get_aggregates` — Downsampling previews

---

## Connector Implementation Checklist

For each new database:

1. **Driver Selection**: Choose official or most popular Node.js driver
2. **Connection Management**: Support static URL and named connection pools
3. **Query Validation**: Implement read-only validation specific to the query language
4. **Schema Introspection**: Map database-native metadata to unified `TableInfo`/`ColumnInfo` types
5. **Limit Injection**: Apply database-specific result limits
6. **Error Handling**: Map driver errors to unified `ToolResponse` format
7. **Caching**: Integrate with `readThroughMetadataCache`
8. **Metrics**: Instrument queries with `logMcpEvent`/`logMcpError`
9. **Documentation**: Update README with connection examples
10. **Tests**: Add integration tests with Dockerized database

---

## Priority Matrix

| Database | User Demand | Implementation Complexity | Strategic Value | Priority |
|----------|------------|--------------------------|-----------------|----------|
| MongoDB  | High       | Medium                   | High            | P1       |
| Redis    | High       | Low                      | Medium          | P1       |
| Snowflake| Medium     | Medium                   | High            | P2       |
| BigQuery | Medium     | Medium                   | High            | P2       |
| Elasticsearch | Medium | Medium                | Medium          | P2       |
| Pinecone | Medium     | Low                      | High            | P2       |
| Neo4j    | Low        | High                     | Medium          | P3       |
| InfluxDB | Low        | Medium                   | Low             | P3       |
| Databricks | Low      | High                     | Medium          | P3       |
| Redshift | Low        | Medium                   | Medium          | P3       |
