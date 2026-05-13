# Security Hardening from Product Perspective

## Product-Level Security Principles

1. **Secure by Default**: Every feature should be safe out of the box
2. **Defense in Depth**: Multiple layers of protection
3. **Least Privilege**: Users and API keys get minimum necessary access
4. **Transparency**: Clear audit trails and security status visibility
5. **Fail Secure**: When security checks fail, deny access (not warn)

---

## Authentication & Access Control

### API Key System

**Design Decisions**:
- Use bearer tokens (not query params — prevents accidental logging)
- Token format: `mcp_` prefix + 32 char random hex (e.g., `mcp_a1b2c3...`)
- No token rotation required (but support it via UI)

**Key Management UI**:
```
┌──────────────────────────────────────────┐
│  API Keys                                  │
│                                            │
│  Name              Role       Created    │
│  ─────────────────────────────────────── │
│  Production       admin      2024-01-15 │
│  Analyst Team     analyst    2024-02-01 │
│  CI/CD            viewer     2024-03-10 │
│                                            │
│  [Create New Key] [Revoke All]            │
└──────────────────────────────────────────┘
```

### Role Permissions Matrix

| Action | Admin | Analyst | Viewer |
|--------|-------|---------|--------|
| run_query | ✅ | ✅ | ❌ |
| execute_stored_procedure | ✅ | ❌ | ❌ |
| list_tables | ✅ | ✅ | ✅ |
| get_table_schema | ✅ | ✅ | ✅ |
| get_database_info | ✅ | ✅ | ✅ |
| explain_query | ✅ | ✅ | ❌ |
| View metrics | ✅ | ❌ | ❌ |
| Manage API keys | ✅ | ❌ | ❌ |
| Manage connections | ✅ | ❌ | ❌ |

---

## Data Protection

### PII Detection & Masking

**Automatic Detection** (regex patterns):
- Email addresses
- US Social Security Numbers
- Credit card numbers (Luhn-validated)
- Phone numbers (international formats)
- IP addresses
- API keys and tokens

**Masking Modes**:
- `redact`: Replace with `[REDACTED]`
- `partial`: Show first/last 2 chars (emails: `al***@***.com`)
- `hash`: SHA-256 hash for consistency checks
- `none`: Disabled (admin override)

**Product UI**:
```
Security Settings
├── PII Detection: [Enabled ▼]
│   ├── Default Masking: [Partial ▼]
│   ├── Per-Column Overrides:
│   │   ├── users.email → Redact
│   │   ├── users.phone → Partial
│   │   └── orders.credit_card → Hash
│   └── Exempt Roles: [admin]
└── Audit Log: [View 1,234 events]
```

### Connection Encryption
- All database URLs must use SSL/TLS (reject `postgres://`, require `postgresql://` or `postgresql+ssl://`)
- GitHub PAT stored encrypted at rest (AES-256-GCM)
- SQLite paths restricted to allowed directories

---

## Audit & Compliance

### Audit Log Schema
```typescript
interface AuditEvent {
  id: string;
  timestamp: string;
  api_key_id: string;
  api_key_name: string;
  ip_address: string;
  user_agent: string;
  action: string;
  resource: string;
  database?: string;
  connection?: string;
  query?: string;        // Only for read tools
  query_hash?: string;   // SHA-256 of normalized query
  rows_returned?: number;
  duration_ms: number;
  success: boolean;
  error_message?: string;
}
```

### Compliance Features
- **SOC 2 Prep**: Audit logs, access controls, encryption at rest
- **GDPR**: Data export (query history), right to be forgotten (delete API key + audit logs)
- **HIPAA**: BAA available for Enterprise tier, PHI detection rules
- **PCI DSS**: Credit card detection and redaction

---

## Security Dashboard

### Real-Time Security Monitor
```
┌──────────────────────────────────────────────┐
│  Security Dashboard                          │
│                                              │
│  Threat Level: 🟢 Normal                     │
│                                              │
│  Today's Activity:                           │
│  ├── Total Queries: 1,234                     │
│  ├── Blocked Queries: 3 (0.2%)               │
│  ├── Failed Auth: 12                         │
│  └── Unique IPs: 8                           │
│                                              │
│  Recent Alerts:                              │
│  ⚠️  14:23 — Stored procedure blocked for    │
│      analyst key "CI/CD"                     │
│  ⚠️  14:15 — PII detected in query results   │
│      (users.email column)                    │
│                                              │
│  [View Full Audit Log] [Export Report]       │
└──────────────────────────────────────────────┘
```

---

## Secure Development Lifecycle

### CI/CD Security Checks
```yaml
# .github/workflows/security.yml
jobs:
  security:
    steps:
      - name: Dependency Audit
        run: npm audit --audit-level=moderate
      
      - name: Secret Scanning
        uses: trufflesecurity/trufflehog@main
      
      - name: Static Analysis
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/owasp-top-ten
      
      - name: SAST
        uses: sonarqube/sonarqube-action@master
```

### Security Release Process
1. **Triage**: CVSS scoring within 24 hours
2. **Fix**: Patch within severity-based SLA (Critical: 24h, High: 7d, Medium: 30d)
3. **Test**: Regression tests + security regression test
4. **Disclose**: Public advisory for CVE-eligible issues
5. **Notify**: Email all users with severity >= High

---

## Security Feature Roadmap

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| API Key Auth | P0 | Low | Bearer token validation |
| Role-Based Access | P0 | Medium | Admin/Analyst/Viewer roles |
| Audit Logging | P1 | Medium | Query all activity |
| PII Detection | P1 | Medium | Regex-based data masking |
| Rate Limiting | P1 | Low | Redis sliding window |
| Request Size Limits | P1 | Low | 100KB cap |
| Connection Encryption Enforcement | P1 | Low | Require SSL |
| Secret Scanning in CI | P2 | Low | TruffleHog integration |
| Dependabot Alerts | P2 | Low | Already available via GitHub |
| Penetration Testing | P3 | High | Annual third-party pentest |
| Bug Bounty Program | P3 | Medium | HackerOne or Bugcrowd |
