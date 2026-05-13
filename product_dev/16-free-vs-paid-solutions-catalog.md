# Free vs Paid Solutions Catalog

**Date**: May 13, 2026
**Purpose**: Map every proposed DB-MCP feature to its free (self-hosted / open-source) and paid (managed / SaaS) implementation options.

---

## How to Read This Document

For every feature area discussed across product development files (`01` through `15`), this catalog lists:

- **Free Tier / Self-Hosted**: Zero-cost options for development, small teams, or open-source stacks.
- **Paid / Managed**: SaaS or managed services for production scale, reliability, and reduced operational burden.
- **Hybrid**: Start free, pay only when scaling.
- **Recommendation**: Suggested default path based on typical DB-MCP user profiles.

---

## 1. Core Infrastructure

### 1.1 Hosting Platform

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Next.js App Hosting | Vercel Hobby (unlimited personal projects, 100 GB bandwidth) | Vercel Pro ($20/user/mo), Enterprise | **Vercel Hobby** for dev; upgrade when bandwidth exceeds 100 GB |
| Edge Functions | Cloudflare Workers Free (100k requests/day, 10ms CPU) | Cloudflare Workers Paid ($5/10M requests) | **Workers Free** for bridge SSE endpoints; paid for high traffic |
| Alternative Hosting | Netlify Free, Railway Free ($5 credit), Render Free | Render Pro ($19/mo), Railway Teams | **Render Free** for Postgres + web combo |
| Self-Hosted VM | Oracle Cloud Free Tier (2 AMD VMs forever), AWS EC2 t2.micro (12 mo) | AWS, GCP, Azure on-demand | **Oracle Cloud Free Tier** for permanent self-hosted staging |

### 1.2 Redis / Shared Storage

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Redis Cache | Docker `redis:alpine`, Redis Stack (vector + JSON) | Upstash Redis ($0.20/100k commands) | **Docker Redis** for local; **Upstash Free** (10k commands/day) for dev |
| Redis Persistent | Redis AOF on VPS | Upstash Pro ($10/mo), Redis Cloud | **Upstash Pro** when message volume exceeds free tier |
| Vector Search | Redis Stack (RediSearch), Chroma (local) | Pinecone ($70/mo starter), Weaviate Cloud | **Redis Stack** if already using Redis; **Chroma** for Python-centric |

**Upstash Free Tier Limits (2025)**:
- 10,000 commands/day
- 256 MB storage
- 1 database max
- Max 1,000 connections
- No persistence (best-effort)

**Upstash Paid**: Pay-per-request or fixed plans starting at $10/mo for 250 MB + unlimited commands.

### 1.3 Database Hosting (for DB-MCP metadata, not target DBs)

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| PostgreSQL | Docker `postgres:16`, Neon Free Tier (500 MB, 190 compute hours/mo) | Neon Pro ($19/mo), Supabase Free (500 MB) | **Neon Free** for project metadata, audit logs, query history |
| SQLite | Local file (already used) | N/A | **Continue using SQLite** for single-tenant deployments |

---

## 2. Authentication & Authorization

### 2.1 MCP-Native OAuth 2.1

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| OAuth 2.1 / OIDC Server | Keycloak (Apache 2.0, Docker), Authentik (MIT, modern UI), SuperTokens Core (Apache 2.0) | Auth0 (free 7.5k users), Clerk (free 10k MAU), FusionAuth | **Authentik** for self-hosted; **Clerk** for managed (best DX) |
| Social Login (GitHub, Google) | Keycloak/Authentik built-in | Auth0/Clerk built-in | Free in all options |
| API Key Management | Self-built with Redis (expiring keys) | Unkey (free 2.5k verifications/mo), WorkOS | **Self-built** for simplicity; **Unkey Free** for analytics |
| RBAC / Permissions | Casbin (Apache 2.0), Oso (Apache 2.0) | Auth0 RBAC, Permify Cloud | **Casbin** for self-hosted; already has Node.js adapter |

**Authentik**:
- Free and open-source forever
- Docker-native, modern UI
- OAuth 2.0, OIDC, SAML, LDAP
- Built-in MFA (TOTP, WebAuthn)

**Clerk**:
- Free tier: 10,000 monthly active users
- OAuth providers included
- JWT session management
- Beautiful pre-built UI components

### 2.2 Enterprise Authorization

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| SAML SSO | Keycloak, Authentik | Okta (paid), OneLogin (paid) | **Authentik** for self-hosted SSO |
| SCIM Provisioning | Keycloak with LDAP | Okta, Azure AD (included in M365) | **Keycloak** for self-hosted |
| Audit Logging | Self-built to PostgreSQL | Datadog Audit, Splunk | **Self-built** with existing Neon Postgres |

---

## 3. AI / NL2SQL — Zero Cost to DB-MCP (User Brings Their Own LLM)

**Critical Principle**: DB-MCP does NOT integrate with LLM APIs. All reasoning happens in the user's IDE agent (Claude, GPT, Cursor, etc.). DB-MCP only provides rich data tools.

**What DB-MCP Provides (Free, Deterministic)**:
| Feature | Implementation | Cost to Us |
|---------|---------------|------------|
| NL2SQL Context | `get_nl2sql_context` tool — returns schema, relationships, sample data | **$0** |
| Schema Documentation Data | `get_schema_for_documentation` tool — returns metadata + profiling stats | **$0** |
| Query Explanation Data | `explain_query` + `get_indexes` + `get_table_stats` tools | **$0** |
| Data Quality Profile | `profile_data_quality` tool — deterministic statistical checks | **$0** |
| Schema Search Index | `get_schema_search_index` tool — text descriptions of schema | **$0** |
| Query History | `get_query_history` tool — persisted in Redis | **$0** |
| Result Statistics | Enhanced `run_query` with column stats, min/max, averages | **$0** |

**What the User Provides (Their Choice, Their Cost)**:
| User's LLM | Cost to User | When They Pay |
|-----------|-------------|---------------|
| Claude (via Cursor/Windsurf) | Included in IDE subscription | Already paying |
| ChatGPT Plus | $20/mo | Already paying |
| Local Ollama (CodeQwen, Llama) | $0 (GPU hardware) | One-time |
| OpenAI API (direct) | Per-token | If building custom agent |
| Gemini API | Per-token | If building custom agent |

**Cost Comparison If User Uses Direct API (for reference only)**:

| Model | Input Cost/1M | Output Cost/1M | Best For |
|-------|--------------|----------------|----------|
| Gemini 2.0 Flash | $0.075 | $0.30 | Cheapest fast model |
| GPT-4o-mini | $0.15 | $0.60 | High-volume NL2SQL |
| Claude 3.5 Haiku | $0.25 | $1.25 | Fast, good accuracy |
| Claude 3.5 Sonnet | $3.00 | $15.00 | Best accuracy |
| Local (Ollama) | $0 | $0 | Privacy, offline |

**Embeddings (Client-Side Only)**:
| Feature | User's Option | Cost to DB-MCP |
|---------|--------------|----------------|
| Embedding Model | nomic-embed-text (Ollama), OpenAI, Cohere | **$0** |
| Semantic Search | Agent embeds schema descriptions locally | **$0** |
| No vector DB needed | Descriptions <100KB, agent stores in context | **$0** |

### 3.3 Why No Server-Side LLM?

| Concern | Server-Side LLM | Client-Side (Our Approach) |
|---------|----------------|---------------------------|
| **Cost to DB-MCP** | $50-500/mo in API bills | **$0** |
| **Privacy** | Schema sent to OpenAI/Anthropic | **Schema stays in user's IDE** |
| **Model Choice** | We pick one model | **User uses whatever their IDE has** |
| **Flexibility** | We maintain prompts for all models | **Agent adapts to its own model** |
| **Offline Use** | Requires internet + API key | **Local Ollama works offline** |
| **Maintenance** | Track API changes, pricing, deprecations | **No API integration to maintain** |

---

## 4. Database Connectors & Drivers

### 4.1 Existing (Already Free/Open)

| Database | Driver | License | Cost |
|----------|--------|---------|------|
| PostgreSQL | `pg` (node-postgres) | MIT | Free |
| MSSQL | `mssql` (tedious) | MIT | Free |
| MySQL | `mysql2` | MIT | Free |
| SQLite | `sqlite3` / `better-sqlite3` | MIT | Free |

### 4.2 Proposed New Connectors

| Database | Free Driver | Paid Alternative | Recommendation |
|----------|-----------|------------------|----------------|
| MongoDB | `mongodb` (official, Apache 2.0) | MongoDB Atlas (free 512 MB-5 GB) | **Official driver** is free; Atlas free tier for testing |
| Redis | `ioredis` or `redis` (MIT) | Redis Cloud managed | **ioredis** (already a transitive dep) |
| Snowflake | `snowflake-sdk` (Apache 2.0) | N/A | **Official SDK** is free |
| BigQuery | `@google-cloud/bigquery` (Apache 2.0) | N/A | **Official SDK** is free |
| Elasticsearch | `@elastic/elasticsearch` (Apache 2.0) | Elastic Cloud (from $16/mo) | **Official SDK** is free |
| OpenSearch | `@opensearch-project/opensearch` (Apache 2.0) | AWS OpenSearch Serverless | **Official SDK** is free |
| Neo4j | `neo4j-driver` (Apache 2.0) | Neo4j Aura (free 200k nodes) | **Official driver** is free |
| InfluxDB | `@influxdata/influxdb-client` (MIT) | InfluxDB Cloud (free 10k writes/mo) | **Official SDK** is free |
| DuckDB | `duckdb` (MIT) | MotherDuck (free tier) | **duckdb** for local analytics |

**Key Insight**: All database drivers and official SDKs are free and open-source. The only cost is the database hosting itself.

---

## 5. Real-Time Synchronization & Streaming

### 5.1 Transport Layer

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| SSE (Server-Sent Events) | Node.js `events` module + Express/Next.js | N/A (protocol-level, no vendor) | **Built into Next.js** with no extra cost |
| WebSocket | `ws` library (MIT), Socket.io (MIT) | Ably (free 6M messages/mo), Pusher (free 200k messages/day) | **`ws` library** for self-hosted; **Socket.io** for rooms/ack |
| WebSocket Scaling | Redis Adapter for Socket.io (free) | Ably, Pusher paid tiers | **Redis Adapter** with existing Upstash |
| HTTP Long-Polling | Built into Next.js | N/A | Built-in, no cost |

### 5.2 Message Queue / Pub-Sub

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Redis Pub/Sub | Redis built-in (already using) | N/A | **Free**, already in stack |
| Task Queue | BullMQ (MIT, Redis-based) | AWS SQS (free 1M requests/mo), Google Pub/Sub | **BullMQ** with existing Redis |
| Event Bus | NATS (Apache 2.0), RabbitMQ (MPL) | AWS EventBridge, Azure Event Grid | **NATS** for high-throughput; **BullMQ** for simplicity |

---

## 6. GitHub Integration

### 6.1 Existing (Already Free)

| Feature | Implementation | Cost |
|---------|---------------|------|
| GitHub REST API | `@octokit/rest` (MIT) | Free (5000 requests/hour with PAT) |
| GitHub GraphQL | `@octokit/graphql` (MIT) | Free (5000 points/hour) |
| C# Code Analysis | `tree-sitter` (MIT) + grammars | Free |

### 6.2 Enhanced GitHub Features

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Multi-Language Parsing | Tree-sitter (MIT) + language grammars | Sourcegraph (paid), Gitpod | **Tree-sitter** is free and fast |
| PR Review Assistant | Self-built using GitHub API + LLM | GitHub Copilot (from $10/mo), CodeRabbit (from $15/mo) | **Self-built** using existing GitHub API + GPT-4o-mini |
| Code Intelligence | Sourcegraph OSS (Apache 2.0) | Sourcegraph Enterprise | **Sourcegraph OSS** for self-hosted code intel |

**GitHub API Rate Limits**:
- Authenticated (PAT): 5,000 requests/hour
- GitHub App: 15,000 requests/hour
- Enterprise: Higher limits negotiable

---

## 7. New Tool Categories (Filesystem, Web, Cloud, K8s)

### 7.1 Filesystem Tools

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| File Read/Write | Node.js `fs` (built-in) | N/A | **Built-in**, free |
| File Search | `ripgrep` via `execa` (MIT) | N/A | **ripgrep** for fast regex search |
| Path Validation | `path` module + `resolve` (built-in) | N/A | **Built-in**, free |
| Large File Handling | Node.js streams (built-in) | N/A | **Built-in**, free |

### 7.2 Web Browser / Search

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Web Search API | SerpAPI (free 100 searches/mo), DuckDuckGo HTML scraping (unofficial) | SerpAPI paid ($50/mo), Bing Search API ($7/1000 queries), Google Custom Search ($5/1000 queries) | **SerpAPI free** for dev; **Bing API** for production volume |
| Web Page Fetch | Node.js `fetch` (built-in since Node 18) | N/A | **Built-in**, free |
| HTML to Markdown | `turndown` (MIT), `node-html-markdown` (MIT) | N/A | **turndown** for conversion |
| Web Scraping | `cheerio` (MIT), `playwright` (Apache 2.0) | ScrapingBee, ScraperAPI | **cheerio** for static HTML; **playwright** for JS-rendered |
| Screenshot | `playwright` (Apache 2.0) | Browserless (from $50/mo), ScrapingBee | **playwright** for self-hosted |

### 7.3 Document Integrations (Notion, Confluence)

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Notion API | Official API (free, rate limited) | N/A | **Free**, 3 requests/second |
| Confluence API | Official API (included in Confluence license) | N/A | **Free** if you have Confluence |
| Slack API | Official API (free tier) | N/A | **Free**, rate limits apply |
| Google Docs API | Google Cloud (free 1M quota units/day) | N/A | **Free tier** sufficient for most use |

**Notion API Limits**:
- 3 requests per second
- No free tier limit on total requests (just rate)
- Requires integration token (free to create)

### 7.4 Cloud Platform Tools

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| AWS SDK | `aws-sdk-js-v3` (Apache 2.0) | N/A | **Free**, pay only for AWS resources used |
| GCP SDK | `@google-cloud/*` (Apache 2.0) | N/A | **Free**, pay only for GCP resources |
| Azure SDK | `@azure/*` (MIT) | N/A | **Free**, pay only for Azure resources |
| Terraform State Read | `terraform show -json` (BSL license) | N/A | **Free**, read-only is safe |

**Important**: Cloud SDKs are free. You only pay for the cloud resources consumed (compute, storage, API calls to AWS/GCP/Azure services). IAM role-based access is free.

### 7.5 Kubernetes & Container Tools

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| K8s Client Library | `@kubernetes/client-node` (Apache 2.0) | N/A | **Free** |
| kubectl | Kubernetes project (Apache 2.0) | N/A | **Free** |
| Docker API | `dockerode` (Apache 2.0) | N/A | **Free** |
| Helm | Kubernetes project (Apache 2.0) | N/A | **Free** |

### 7.6 Email & Calendar

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Gmail API | Google Cloud (free 1M quota units/day) | N/A | **Free tier** sufficient |
| Outlook/Graph API | Microsoft Graph (free tier: 10k requests/10 min) | N/A | **Free tier** for personal/small biz |
| IMAP/SMTP | `imap` (MIT), `nodemailer` (MIT) | N/A | **Free** for direct mail server access |
| Calendar Parsing | `ical.js` (MPL) | N/A | **Free** |

### 7.7 Observability & Monitoring

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Metrics Collection | Prometheus (Apache 2.0), VictoriaMetrics (Apache 2.0) | Datadog (from $15/host/mo), New Relic (from $49/mo) | **Prometheus** for self-hosted; **Grafana Cloud Free** (10k metrics) for managed |
| Log Aggregation | Loki (AGPL), Vector (MPL) | Datadog Logs, Splunk | **Loki** with Grafana |
| Distributed Tracing | Jaeger (Apache 2.0), Tempo (AGPL) | Datadog APM, New Relic APM | **Jaeger** for self-hosted |
| Dashboards | Grafana (AGPL) — free & open-source | Grafana Cloud (free 3 users, 10k metrics) | **Grafana OSS** for self-hosted |
| Uptime Monitoring | Uptime Kuma (MIT) | Pingdom, Datadog Synthetics | **Uptime Kuma** for self-hosted |

**Grafana Cloud Free Tier**:
- 3 users
- 10,000 Prometheus metrics
- 50 GB logs
- 50 GB traces
- 500 VU/hr k6 testing
- Forever free

**Prometheus + Grafana + Loki Stack**:
- Completely free and open-source
- Runs on a single VM or Docker Compose
- Industry standard for Kubernetes monitoring
- Estimated cost on a $20/mo VPS: **free beyond VPS cost**

### 7.8 Code Execution Sandbox

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Docker Sandbox | Docker + `dockerode` (Apache 2.0) | N/A | **Free**, run on host with resource limits |
| gVisor Isolation | Google gVisor (Apache 2.0) | N/A | **Free**, stronger isolation than Docker alone |
| MicroVM (Firecracker) | AWS Firecracker (Apache 2.0) | N/A | **Free**, requires KVM support |
| Cloud Sandbox | N/A | Cloudflare Sandbox (paid), Modal (from $7/mo) | **Modal** for serverless GPU/code execution |
| WebAssembly Sandbox | Wasmtime (Apache 2.0), Wasmer (MIT) | N/A | **Wasmtime** for near-native speed sandboxing |

**Security Note**: Docker alone is NOT sufficient for untrusted code. Use gVisor or Firecracker for production untrusted execution.

---

## 8. Security & Compliance

### 8.1 PII Detection & Masking

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Rule-Based PII Detection | `presidio` (Microsoft, MIT) — regex + NER | N/A | **Presidio** for comprehensive PII detection |
| ML-Based PII Detection | `pii-masker` (DeBERTa-v3, MIT), `piiranha` (MIT) | Nightfall (from $49/mo), Skyflow | **pii-masker** for free ML-based detection |
| Data Masking | `presidio` anonymization engine | Skyflow (paid), Very Good Security | **Presidio** handles both detection and masking |
| Column-Level Masking | Self-built with SQL query rewriting | Immuta (paid), Privacera (paid) | **Self-built** for query-time masking |

**Presidio** (Microsoft):
- Free and open-source
- Pre-built recognizers: credit cards, emails, phone numbers, SSN, names, locations
- Custom recognizer support
- Integration with spaCy NER models
- Python-based; can run as a microservice

### 8.2 Audit & Compliance

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Audit Log Storage | PostgreSQL / SQLite (already in stack) | Splunk (paid), Datadog Audit | **Existing PostgreSQL** |
| SOC 2 Readiness | Drata (paid), Vanta (paid) | N/A | Not applicable for open-source core |
| GDPR Compliance | Self-built data export/deletion | OneTrust (paid) | **Self-built** for data subject requests |
| Encryption at Rest | LUKS (Linux), self-managed keys | AWS KMS, HashiCorp Vault Cloud | **Self-managed** for simplicity |

### 8.3 Rate Limiting & DDoS Protection

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Rate Limiting | `rate-limiter-flexible` (MIT) + Redis | N/A | **rate-limiter-flexible** with existing Redis |
| API Gateway | Kong Gateway (Apache 2.0), Traefik (MIT) | AWS API Gateway (from $3.50/million requests) | **Kong** for self-hosted gateway |
| DDoS Protection | Cloudflare Free (basic DDoS) | Cloudflare Pro ($20/mo), AWS Shield Advanced | **Cloudflare Free** is surprisingly capable |
| WAF | ModSecurity (Apache 2.0), Coraza (Apache 2.0) | AWS WAF, Cloudflare WAF (Pro+) | **Coraza** for self-hosted WAF |

---

## 9. MCP Ecosystem & Protocol Compliance

### 9.1 MCP SDK & Runtime

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| MCP Server SDK | `@modelcontextprotocol/sdk` (MIT) | N/A | **Free**, official SDK |
| MCP Inspector | `npx @modelcontextprotocol/inspector` | N/A | **Free**, official debugging tool |
| MCP Registry Publishing | MCP Registry (free to publish) | N/A | **Free** |

### 9.2 A2A Protocol

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| A2A JS SDK | `a2a-js` (Apache 2.0) | N/A | **Free**, official Google SDK |
| A2A Python SDK | `a2a-py` (Apache 2.0) | N/A | **Free** |
| Agent Card Hosting | Self-hosted `/agent.json` endpoint | N/A | **Free** |

### 9.3 AG-UI Protocol

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| AG-UI SDK | `ag-ui` (MIT) | N/A | **Free** |
| Event Streaming | SSE (built into Next.js) | N/A | **Free** |

---

## 10. Third-Party Integrations

### 10.1 Data Platforms

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| dbt Integration | dbt Core (Apache 2.0) | dbt Cloud (free 1 seat, 1 project) | **dbt Core** for self-hosted parsing of `manifest.json` |
| Airflow Integration | Apache Airflow (Apache 2.0) | Astronomer (from $0.11/hour) | **Airflow REST API** is free to query |
| Dagster Integration | Dagster (Apache 2.0) | Dagster Cloud (free 5 seats) | **Dagster GraphQL API** is free |
| Prefect Integration | Prefect (Apache 2.0) | Prefect Cloud (free 10k task runs/mo) | **Prefect REST API** is free |

### 10.2 BI & Visualization

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Metabase | Metabase (AGPL) — free & open-source | Metabase Cloud (from $85/mo) | **Metabase OSS** for self-hosted |
| Apache Superset | Apache Superset (Apache 2.0) | Preset Cloud (free tier) | **Superset** for advanced analytics |
| Cube.js | Cube Core (Apache 2.0) | Cube Cloud (free 2k requests/day) | **Cube Core** for semantic layer |
| Looker Studio | Free (Google) | Looker (paid, enterprise) | **Looker Studio** for free dashboards |

### 10.3 Collaboration & Communication

| Feature | Free / Self-Hosted | Paid / Managed | Recommendation |
|---------|-------------------|----------------|----------------|
| Slack Integration | Slack Bolt SDK (MIT), Web API (free tier) | N/A | **Free**, Slack apps are free to build |
| Discord Integration | `discord.js` (Apache 2.0) | N/A | **Free** |
| MS Teams Integration | Microsoft Graph SDK (free tier) | N/A | **Free** |
| Jira Integration | Atlassian REST API (free for small teams) | N/A | **Free** for teams < 10 |

---

## 11. Summary: Total Cost of Ownership

### 11.1 Free-Only Stack (Self-Hosted Everything) — Our Cost: $0

| Component | Technology | Cost to DB-MCP Operator |
|-----------|-----------|------------------------|
| App Hosting | Oracle Cloud Free Tier (2 VMs) | **$0** |
| Database (metadata) | SQLite or Docker Postgres | **$0** |
| Cache / Storage | Docker Redis Stack | **$0** |
| Auth | Authentik (Docker) | **$0** |
| AI/LLM | User's IDE agent (Claude/Cursor) or their local Ollama | **$0** |
| Vector DB | Not needed (agent handles embeddings locally) | **$0** |
| Monitoring | Prometheus + Grafana + Loki on same VM | **$0** |
| Message Queue | Redis Pub/Sub (built-in) | **$0** |
| Rate Limiting | `rate-limiter-flexible` + Redis | **$0** |
| PII Detection | Presidio (Docker) | **$0** |
| Code Sandbox | Docker + gVisor | **$0** |
| **Total** | | **$0** |

**Note**: User may have their own costs (Cursor subscription $20/mo, ChatGPT Plus $20/mo, or GPU for Ollama). DB-MCP pays nothing.

### 11.2 Managed Stack (Developer / Small Team) — Our Cost: $0-30

| Component | Technology | Cost to DB-MCP Operator |
|-----------|-----------|------------------------|
| App Hosting | Vercel Hobby | **$0** |
| Database (metadata) | Neon Free Tier | **$0** |
| Cache / Storage | Upstash Free (10k commands/day) | **$0** |
| Auth | Clerk Free (10k MAU) | **$0** |
| AI/LLM | User's IDE agent | **$0** |
| Vector DB | Not needed | **$0** |
| Monitoring | Grafana Cloud Free | **$0** |
| Message Queue | Upstash Redis (already counted) | **$0** |
| Rate Limiting | Upstash + self-built | **$0** |
| PII Detection | Presidio microservice on Vercel/Render | **$0** |
| Code Sandbox | Docker on Render Free | **$0** |
| **Total** | | **$0-30/mo** (domain + optional Pro upgrades) |

### 11.3 Production Stack (Growing Team) — Our Cost: $50-150

| Component | Technology | Cost to DB-MCP Operator |
|-----------|-----------|------------------------|
| App Hosting | Vercel Pro ($20) or Render Pro ($19) | **$20** |
| Database (metadata) | Neon Pro ($19) or Supabase Pro ($25) | **$19** |
| Cache / Storage | Upstash Pro ($10) or Redis Cloud ($30) | **$10** |
| Auth | Clerk Pro ($25/mo) or Auth0 (usage-based) | **$25** |
| AI/LLM | User's IDE agent | **$0** |
| Vector DB | Not needed | **$0** |
| Monitoring | Grafana Cloud Pro ($29) or Datadog (usage) | **$29** |
| Message Queue | Upstash Pro (already counted) | **$0** |
| Rate Limiting | Unkey Pro ($10) or self-built | **$0** |
| PII Detection | Presidio self-hosted | **$0** |
| Code Sandbox | Docker + gVisor on Pro tier | **$0** |
| CDN / DDoS | Cloudflare Pro ($20) | **$20** |
| **Total** | | **~$50-150/mo** |

### 11.4 Enterprise Stack — Our Cost: $1,500-5,000

| Component | Technology | Cost to DB-MCP Operator |
|-----------|-----------|------------------------|
| App Hosting | Vercel Enterprise or AWS ECS | **$500+** |
| Database (metadata) | RDS Postgres or Neon Enterprise | **$200+** |
| Cache / Storage | Redis Enterprise or ElastiCache | **$300+** |
| Auth | Okta or Auth0 Enterprise | **$500+** |
| AI/LLM | User's IDE agent / their Azure OpenAI | **$0** |
| Monitoring | Datadog Enterprise or New Relic | **$1,000+** |
| Message Queue | AWS SQS + SNS or Confluent Kafka | **$300+** |
| PII Detection | Skyflow or Very Good Security | **$500+** |
| Code Sandbox | Firecracker cluster or Modal Teams | **$500+** |
| CDN / DDoS / WAF | Cloudflare Enterprise or AWS Shield | **$500+** |
| **Total** | | **$1,500-5,000/mo** |

---

## 12. Strategic Recommendations by Phase

### Phase 1: Foundation (Weeks 1-4)
**Our Budget**: $0/month

| Feature | Choice | Why |
|---------|--------|-----|
| Hosting | Vercel Hobby | Free forever for personal/low-traffic |
| Cache | Upstash Free | Zero-config, enough for dev |
| Auth | Clerk Free | Best DX, 10k MAU limit |
| AI | User's IDE agent (Claude/Cursor) | **$0 to us** |
| Storage | SQLite or Neon Free | No extra infra needed |

### Phase 2: Developer Experience (Weeks 5-8)
**Our Budget**: $0-30/month

| Feature | Choice | Why |
|---------|--------|-----|
| Hosting | Vercel Pro ($20) | Custom domains, more bandwidth |
| Cache | Upstash Pro ($10) | Higher command limits |
| Auth | Clerk Pro ($25) | SAML prep, more MAU |
| AI | User's IDE agent | **$0 to us** |
| Monitoring | Grafana Cloud Free | Sufficient until 10k metrics |

### Phase 3: Ecosystem Expansion (Weeks 9-12)
**Our Budget**: $20-50/month

| Feature | Choice | Why |
|---------|--------|-----|
| PII Detection | Presidio Docker container | Free, Microsoft-backed |
| Code Sandbox | Docker + gVisor on Render | Free tier sufficient |
| Cloud Integrations | AWS SDK (pay per use) | Only pay for API calls made |
| Document Integrations | Notion/Slack APIs (free tiers) | No cost for moderate usage |
| Vector DB | Not needed | Agent handles embeddings locally |

### Phase 4: AI-Native Intelligence (Weeks 13-16)
**Our Budget**: $50-100/month

| Feature | Choice | Why |
|---------|--------|-----|
| NL2SQL | `get_nl2sql_context` tool + user agent | **$0 to us** |
| Schema Docs | `get_schema_for_documentation` tool + user agent | **$0 to us** |
| Semantic Search | `get_schema_search_index` tool + user agent | **$0 to us** |
| Data Quality | `profile_data_quality` tool (deterministic) | **$0 to us** |
| Knowledge Graph | Redis-based structured storage | Reuse existing stack |

### Phase 5: Scale & Enterprise (Months 5-6)
**Our Budget**: $500-2,000/month

| Feature | Choice | Why |
|---------|--------|-----|
| Hosting | Vercel Enterprise or AWS | Scale requirements |
| Cache | Redis Enterprise | Clustering, persistence |
| Auth | Auth0 Enterprise or Okta | SSO, SCIM, audit |
| AI | User's enterprise LLM / Azure OpenAI | **$0 to us** |
| Monitoring | Datadog or Grafana Cloud Pro | SLA requirements |
| Support | Vendor support contracts | Enterprise requirement |

---

## 13. Key Takeaways

1. **DB-MCP's LLM cost is $0**. We do not integrate with OpenAI, Anthropic, Gemini, or any LLM API. The user's IDE agent (Claude, GPT, Cursor) handles all reasoning.

2. **80% of features can be built with entirely free tools**. Database drivers, MCP SDK, web scraping, file system, K8s client, email APIs — all free.

3. **The only paid costs to DB-MCP are**: Redis/cache hosting at scale, auth provider (optional), and monitoring. AI costs belong to the user.

4. **Start with the managed free tier, self-host when limits hit**. This is the cheapest path: Vercel Hobby → Pro, Upstash Free → Pro, Clerk Free → Pro.

5. **No vector database needed**. Semantic schema search is handled client-side by the agent. Schema descriptions are small (<100KB) and easily cached.

6. **Security tools (PII, rate limiting, audit) have excellent free options**. Presidio, rate-limiter-flexible, and self-built audit logs cost nothing.

7. **Cloud SDKs are universally free**. You only pay for the cloud resources you consume, not the SDK itself.

8. **User's existing IDE subscription covers their AI costs**. Cursor ($20/mo), Windsurf, Claude Desktop — these already include LLM access. We leverage what they already pay for.

---

*This catalog is a living document. Pricing and tiers change frequently. Verify current pricing before committing to any vendor.*
