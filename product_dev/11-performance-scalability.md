# Performance & Scalability Plan

## Current Performance Baseline

Based on code analysis, here's what we know:
- Query timeout: 15 seconds
- Max rows: 50 (hard limit)
- L1 cache: In-memory Map (unbounded, no eviction besides TTL)
- L2 cache: Upstash Redis (HTTP REST API, network round-trip)
- Connection pooling: Enabled for Postgres, MSSQL, MySQL
- No connection pooling metrics exposed

---

## Performance Bottlenecks

### 1. L1 Cache Unbounded Growth
**Issue**: `lib/cache/toolCache.ts` uses a plain `Map` with no size limit.

**Impact**: Memory leak in long-running processes. Each unique query creates a cache entry.

**Fix**:
```typescript
class LRUCache<K, V> extends Map<K, V> {
  private maxSize: number;
  constructor(maxSize = 1000) {
    super();
    this.maxSize = maxSize;
  }
  set(key: K, value: V): this {
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
    }
    return super.set(key, value);
  }
}
```

### 2. L2 Cache Synchronous
**Issue**: `readThroughCache` awaits Redis even when L1 hit is available.

**Impact**: Unnecessary Redis calls on cache hits.

**Fix**: Check L1 first, return immediately if found. Only check L2 on L1 miss.

### 3. GitHub API Rate Limits
**Issue**: 5,000 requests/hour for authenticated users.

**Impact**: Hitting limits during deep code analysis.

**Fix**:
- Use GitHub GraphQL API (batch multiple REST calls into one request)
- Implement request queuing with backoff
- Add `Retry-After` handling for 403 rate limit responses

### 4. Connection Pool Exhaustion
**Issue**: No visibility into pool utilization.

**Impact**: Requests queue or timeout when pools are saturated.

**Fix**:
- Expose pool metrics: active, idle, waiting, total
- Add connection pool health checks
- Alert when utilization > 80%

---

## Caching Strategy Improvements

### Tiered Cache Architecture
```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │
┌──────▼───────┐     ┌──────────────┐
│   L1 Cache   │────▶│   L2 Cache   │
│   (Memory)   │     │   (Redis)    │
│   1000 items │     │   100K items │
│   TTL: 5min  │     │   TTL: 1hr   │
└──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│   Source     │
│ (DB/GitHub)  │
└──────────────┘
```

### Cache Warming
- Pre-fetch schema metadata on startup
- Background refresh before TTL expires (stale-while-revalidate pattern)
- Warm cache after connection re-establishment

### Cache Invalidation
- Manual: `POST /api/cache/invalidate` (admin only)
- Automatic: On schema change detection
- Selective: Per-database, per-schema, per-table invalidation

---

## Database Connection Optimization

### Connection Pool Tuning
```typescript
// Per-database defaults
const POOL_CONFIGS = {
  postgres: { min: 2, max: 10, idleTimeoutMillis: 30000 },
  mssql:    { min: 2, max: 10, pool: { max: 10, min: 0 } },
  mysql:    { connectionLimit: 10, queueLimit: 0 },
  sqlite:   { max: 1 } // SQLite is file-based
};
```

### Dynamic Pool Scaling
- Scale up on high latency (> 500ms p95)
- Scale down on low utilization (< 20% for 5 minutes)
- Max pool size capped at 50 to prevent DB overload

---

## Query Performance Optimization

### Query Analysis Dashboard
Track per-query metrics:
- Average execution time
- 95th percentile execution time
- Rows scanned vs rows returned ratio
- Index usage (from EXPLAIN plans)
- Cache hit rate per query pattern

### Slow Query Detection
```typescript
if (executionTime > 5000) {
  log.warn('Slow query detected', {
    query: normalizedQuery,
    executionTime,
    connection,
    suggestedAction: 'Consider adding an index or rewriting the query'
  });
}
```

### Result Streaming
For large result sets:
- Stream results via SSE (Server-Sent Events) instead of buffering
- Client receives rows as they arrive
- Reduces memory pressure on server

---

## Scalability Architecture

### Horizontal Scaling
```
                    ┌─────────────┐
                    │   Load      │
                    │  Balancer   │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐     ┌─────────┐     ┌─────────┐
      │ MCP     │     │ MCP     │     │ MCP     │
      │ Server  │     │ Server  │     │ Server  │
      │ #1      │     │ #2      │     │ #3      │
      └────┬────┘     └────┬────┘     └────┬────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                    ┌─────────────┐
                    │   Shared    │
                    │    Redis    │
                    │   (Cache)   │
                    └─────────────┘
```

### Requirements for Horizontal Scaling
1. **Stateless servers**: No local state (sessions in Redis, not memory)
2. **Sticky sessions**: MCP sessions pinned to one server (or use shared session store)
3. **Shared cache**: All servers use same Redis cluster
4. **Database connection limits**: Total pool size across all servers < DB max connections

### Auto-Scaling Triggers
- Scale out: CPU > 70% or request queue > 50 pending
- Scale in: CPU < 20% for 10 minutes
- Max replicas: 10
- Min replicas: 2 (for HA)

---

## Load Testing Plan

### Test Scenarios
1. **Spike Test**: 100 concurrent users, 0→100 in 10 seconds
2. **Soak Test**: 10 concurrent users, sustained for 24 hours
3. **Stress Test**: Gradually increase load until failure
4. **Cache Test**: 90% cache hit rate vs 0% cache hit rate

### Tools
- **k6**: Scriptable load testing
- **Artillery**: HTTP load testing
- **Grafana + Prometheus**: Metrics collection and visualization

### Success Criteria
| Metric | Target |
|--------|--------|
| p50 latency | < 100ms |
| p95 latency | < 500ms |
| p99 latency | < 1000ms |
| Error rate | < 0.1% |
| Throughput | > 100 req/sec per instance |
| Memory usage | < 512MB per instance |

---

## Monitoring & Alerting

### Key Metrics to Track
1. **Request Rate**: Total requests per second
2. **Error Rate**: 5xx errors per minute
3. **Latency**: p50, p95, p99 response times
4. **Cache Performance**: L1 hit rate, L2 hit rate, cache misses
5. **DB Connections**: Active, idle, waiting
6. **GitHub API**: Remaining rate limit, latency
7. **Memory Usage**: Heap size, RSS
8. **CPU Usage**: User + system time

### Alert Thresholds
```yaml
alerts:
  - name: High Error Rate
    condition: error_rate > 1%
    duration: 5m
    severity: critical

  - name: High Latency
    condition: p95_latency > 1000ms
    duration: 10m
    severity: warning

  - name: Low Cache Hit Rate
    condition: l1_hit_rate < 50%
    duration: 30m
    severity: warning

  - name: GitHub Rate Limit
    condition: github_remaining < 100
    severity: warning

  - name: Memory Leak
    condition: memory_growth_rate > 10MB/hour
    duration: 2h
    severity: critical
```

### Observability Stack
- **Metrics**: Prometheus + Grafana
- **Logging**: Structured JSON → Loki or Datadog
- **Tracing**: OpenTelemetry → Jaeger or Honeycomb
- **Alerting**: PagerDuty or Opsgenie integration
