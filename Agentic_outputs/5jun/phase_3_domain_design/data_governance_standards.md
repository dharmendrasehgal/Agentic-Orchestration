# DCMS Data Governance Standards

**Version:** 1.0.0
**Status:** Approved
**Owner:** Platform Engineering / Data Governance Board
**Last Updated:** 2026-06-05

---

## 1. Data Classification

All data stored or processed by DCMS must be assigned one of the four classification levels below. Classification governs encryption requirements, access controls, retention, and erasure obligations.

| Level | Label | Description | DCMS Column Examples |
|-------|-------|-------------|----------------------|
| **Public** | PUBLIC | Data intended or safe for unrestricted public disclosure | Image names, container status enums, published metric names, API endpoint paths |
| **Internal** | INTERNAL | Data for internal use within the organisation; not for public release | Container labels, environment variable keys (not values), network topology, host hostnames, cluster names, log timestamps |
| **Confidential** | CONFIDENTIAL | Sensitive business or operational data; access on a need-to-know basis | Environment variable values, image registry credentials (Vault refs), container exec commands, audit event payloads, alert rule expressions, user roles and permissions |
| **Restricted** | RESTRICTED | Highest sensitivity; direct regulatory, legal, or security impact | User names, user email addresses, hashed passwords, refresh tokens, session tokens, JWT signing keys, GDPR consent records, pgcrypto-encrypted PII columns |

### 1.1 Classification Assignment Rules

- Any column containing authentication credentials, tokens, or cryptographic material is automatically Restricted.
- Any column containing a user's personally identifiable information (PII) as defined in GDPR Article 4 is automatically Restricted.
- When a table contains a Restricted column, all access paths to that table must enforce row-level security (RLS) and column-level masking for non-privileged roles.
- Classification labels must be recorded in the `dcms_column_classifications` metadata table and reviewed at each schema migration.

---

## 2. PII Inventory

| Table | Column | Data Type | Classification | Retention | Erasure Method |
|-------|--------|-----------|----------------|-----------|----------------|
| `users` | `email` | `text` (pgcrypto encrypted) | RESTRICTED | Life of account + 30 days | Replace with `sha256(user_id || salt)` during nightly anonymisation job |
| `users` | `name` | `text` (pgcrypto encrypted) | RESTRICTED | Life of account + 30 days | Replace with hashed UUID string |
| `users` | `password_hash` | `text` (bcrypt) | RESTRICTED | Life of account | Overwrite with random 60-char bcrypt hash, then null after account deletion |
| `sessions` | `ip_address` | `inet` | CONFIDENTIAL | 30 days | Hard delete on session expiry; batch purge job nightly |
| `sessions` | `user_agent` | `text` | CONFIDENTIAL | 30 days | Hard delete on session expiry |
| `audit_events` | `actor_email` | `text` | RESTRICTED | 2 years | Anonymise to `sha256(actor_id || audit_salt)` after 2 years; row never deleted (immutable partition) |
| `audit_events` | `actor_ip` | `inet` | CONFIDENTIAL | 2 years | Null-out after retention period; row kept for event integrity |
| `consent_logs` | `user_email` | `text` | RESTRICTED | 7 years (legal) | Anonymise after 7 years; row retained for regulatory proof |
| `consent_logs` | `ip_address` | `inet` | CONFIDENTIAL | 7 years | Null-out after 7 years |
| `notification_targets` | `email_address` | `text` (pgcrypto encrypted) | RESTRICTED | Life of alert rule | Hard delete on rule removal; anonymise on user erasure request |
| `user_invitations` | `invitee_email` | `text` | RESTRICTED | 7 days (pending) | Hard delete on acceptance or expiry |

### 2.1 PII Discovery Process

A quarterly automated scan using `pii-detector` (regex + ML classifier) runs against the DCMS PostgreSQL schema. Any new columns matching PII patterns that are not in the inventory above trigger a P1 finding requiring a governance review within 5 business days.

---

## 3. Encryption Standards

### 3.1 Encryption at Rest

| Data Store | Mechanism | Scope |
|------------|-----------|-------|
| PostgreSQL PII columns | AES-256-GCM via `pgcrypto` extension (`pgp_sym_encrypt`) | Columns listed in PII Inventory §2 marked RESTRICTED |
| PostgreSQL non-PII data | Transparent disk encryption (OS-level LUKS2 / cloud provider disk encryption) | All PostgreSQL data volumes |
| Loki log storage | Object store (S3/MinIO) with AES-256 server-side encryption (SSE-S3 or SSE-KMS) | All log chunks and index files |
| Prometheus TSDB | Disk encryption at block-device level | Prometheus data directory |
| Vault storage backend | Vault's own seal encryption (Shamir or AWS KMS auto-unseal) | All Vault data |
| S3 backup buckets | SSE-KMS with customer-managed key (CMK) | All pg_dump exports and WAL archives |
| Container secrets | Vault dynamic secrets; never written to disk outside Vault | Runtime injection only |

**pgcrypto column encryption pattern:**

```sql
-- Write
UPDATE users
SET email = pgp_sym_encrypt(
  'user@example.com',
  current_setting('app.pgcrypto_key'),
  'compress-algo=1, cipher-algo=aes256'
)
WHERE id = $1;

-- Read
SELECT pgp_sym_decrypt(email::bytea, current_setting('app.pgcrypto_key')) AS email
FROM users
WHERE id = $1;
```

The `app.pgcrypto_key` setting is injected at connection startup from Vault via the pgBouncer `connect_query` hook; it never appears in application source code.

### 3.2 Encryption in Transit

| Traffic Path | Protocol | Certificate Authority |
|---|---|---|
| Client browser / CLI to API Gateway | TLS 1.3 (TLS 1.2 minimum fallback disabled) | Public CA (Let's Encrypt / ACM) |
| API Gateway to microservices | mTLS 1.3 (service mesh — Linkerd or Istio) | Internal DCMS CA (Vault PKI engine) |
| Microservice to PostgreSQL | TLS 1.3 with `sslmode=verify-full` | Internal DCMS CA |
| Microservice to Redis | TLS 1.3 | Internal DCMS CA |
| Microservice to Vault | TLS 1.3 with certificate pinning | Vault's self-signed CA (pinned in each service config) |
| Microservice to Loki | TLS 1.3 | Internal DCMS CA |
| Prometheus scrape targets | TLS 1.3 with bearer token | Internal DCMS CA |
| Agent to DCMS backend (gRPC) | mTLS 1.3 | Internal DCMS CA (per-host short-lived cert, 24h TTL) |

**Cipher suites enforced (TLS 1.3 only):**
- `TLS_AES_256_GCM_SHA384`
- `TLS_CHACHA20_POLY1305_SHA256`
- `TLS_AES_128_GCM_SHA256` (only where AES-NI hardware is unavailable)

HSTS header with `max-age=31536000; includeSubDomains; preload` is set on all external API responses.

---

## 4. Key Management

### 4.1 Vault Transit Engine (Application-Layer Encryption)

All application-layer encryption and decryption calls route through the **Vault Transit** secrets engine. Plaintext never leaves the application memory; only ciphertext is persisted.

| Key Name | Algorithm | Key Size | Used For |
|----------|-----------|----------|----------|
| `dcms-pii-users` | AES-GCM-256 | 256-bit | `users.email`, `users.name` |
| `dcms-pii-notifications` | AES-GCM-256 | 256-bit | `notification_targets.email_address` |
| `dcms-registry-creds` | AES-GCM-256 | 256-bit | Registry credential payloads |
| `dcms-signing-rs256` | RSA-4096 | 4096-bit | JWT RS256 signing (auth-service) |
| `dcms-audit-hmac` | HMAC-SHA256 | 256-bit | Audit event integrity HMAC |

### 4.2 Key Rotation Schedule

| Key | Rotation Frequency | Trigger | Process |
|-----|--------------------|---------|---------|
| `dcms-pii-*` Transit keys | 90 days | Scheduled + on compromise | Vault `rotate` API; Vault handles re-wrap transparently for new encryptions; old key versions retained for decryption until re-encryption job completes |
| `dcms-signing-rs256` | 180 days | Scheduled | New key version created; old version kept active for 24h to drain in-flight tokens; public JWKS endpoint updated automatically |
| `dcms-audit-hmac` | 365 days | Scheduled | Re-HMAC job runs after rotation to update audit_events.integrity_hash for rows in active partition |
| Database pgcrypto key | 90 days | Scheduled | New key written to Vault KV; migration job re-encrypts all PII columns in batches of 1000; zero-downtime via dual-read pattern |
| TLS certificates (internal CA) | 24h (agent certs), 90d (service certs) | TTL-based auto-renewal | Vault PKI `renew` called by each service before expiry; agent re-enrolls on restart |
| TLS certificates (external) | 90 days | Automated (Let's Encrypt / cert-manager) | cert-manager CertificateRequest renewed 30 days before expiry |

### 4.3 Key Access Control

- Vault policies grant each microservice the minimum transit operations needed (e.g., `container-service` can encrypt/decrypt `dcms-pii-users` but cannot read raw key material).
- Vault AppRole authentication with short-lived secret IDs (TTL: 10 minutes, use limit: 1).
- Vault audit logs forwarded to the DCMS logging pipeline for SIEM correlation.
- Key material never written to application logs, error messages, or distributed traces.

---

## 5. Retention Policies

| Table / Data Store | Retention Period | Justification | Enforcement Mechanism |
|--------------------|------------------|---------------|-----------------------|
| `audit_events` | 2 years | Regulatory compliance (SOC 2, ISO 27001) | Append-only partition; data older than 2 years moved to cold storage (S3 Glacier); rows with anonymised PII retained indefinitely as event record |
| `sessions` | 30 days from creation or last use | Minimize PII exposure | Nightly batch job deletes rows where `expires_at < NOW() - INTERVAL '30 days'` |
| `container_snapshots` | 90 days | Operational debugging window | Nightly job; rows older than 90 days hard-deleted |
| `image_scan_results` | 1 year | Security audit trail | Nightly job; results older than 1 year purged; summary retained in `images.vulnerability_history` JSONB |
| `container_logs` (Loki) | 30 days hot (SSD tier), 90 days cold (object store) | Debugging + cost balance | Loki retention config; hot→cold compaction at 30 days; full deletion at 90 days |
| `prometheus_metrics` (TSDB) | 15 days raw, 1 year downsampled | Trend analysis | Prometheus `--storage.tsdb.retention.time=15d`; Thanos compactor writes 5m and 1h resolution to S3 for 1 year |
| `alert_history` | 1 year | SLO reporting | Nightly job purges resolved alerts older than 1 year |
| `user_invitations` | 7 days from creation | Security (prevent stale tokens) | Background job deletes unaccepted invitations at expiry |
| `consent_logs` | 7 years | GDPR Article 7 proof of consent | Partition-based archival after 2 years; no deletion within 7 years |
| `notification_events` | 90 days | Deliverability debugging | Nightly purge job |
| `pg_dump backups` (S3) | 30 days daily dumps; 1 year weekly full | Recovery RPO/RTO requirements | S3 lifecycle rule; Glacier transition at 7 days for dailies |
| `WAL archive` (PITR) | 7 days | Point-in-time recovery window | `pgbackrest` archive-push; lifecycle rule cleans up |

---

## 6. GDPR Compliance

### 6.1 Right to Erasure (Article 17)

DCMS implements erasure via a **soft-delete plus anonymisation** pattern rather than hard deletion. This preserves referential integrity and immutable audit records while removing identifying information.

**Erasure Request Flow:**

1. User submits DELETE request to `/users/{id}` (or submits via Data Subject Request portal).
2. `auth-service` marks `users.status = 'pending_erasure'` and `users.erasure_requested_at = NOW()`.
3. Active sessions for the user are immediately invalidated (Redis key deleted, `sessions` rows marked expired).
4. Nightly anonymisation job (`dcms-gdpr-worker`) processes all `pending_erasure` users:
   - `users.email` replaced with `sha256(user_id || erasure_salt)@anonymised.dcms.internal`
   - `users.name` replaced with `ANONYMISED-<sha256_short>`
   - `users.password_hash` overwritten with a freshly generated bcrypt hash of a random 256-bit value
   - `users.status` set to `anonymised`
   - `notification_targets.email_address` anonymised for all rules owned by the user
   - `audit_events.actor_email` replaced with `ANONYMISED-<sha256_short>` for rows within the mutable window (rows in the append-only frozen partition use a separate column `actor_display` which is nulled)
5. Erasure completion event is written to `erasure_log` table (UUID, request timestamp, completion timestamp) — no PII retained in this log.
6. DCMS sends confirmation to the original email address (fetched from Vault before anonymisation) within 30 days as required by GDPR.

**What is NOT erased:**

- `audit_events` rows (event itself is retained for legal/security reasons; only PII columns are anonymised as described above)
- `consent_logs` rows within 7-year legal retention window (PII anonymised but record preserved)

### 6.2 Data Portability (Article 20)

```
GET /users/{id}/export
Authorization: Bearer <token>  (user can only export own data; admin can export any)
Accept: application/json
```

Returns a ZIP-compressed JSON package containing:

```json
{
  "export_date": "2026-06-05T00:00:00Z",
  "user": { "id": "...", "email": "...", "name": "...", "role": "...", "created_at": "..." },
  "sessions": [ { "created_at": "...", "ip_address": "...", "user_agent": "..." } ],
  "consent_logs": [ { "consent_type": "...", "granted_at": "...", "withdrawn_at": "..." } ],
  "containers_created": [ { "container_id": "...", "name": "...", "created_at": "..." } ],
  "audit_events_as_actor": [ { "event_type": "...", "resource_id": "...", "timestamp": "..." } ]
}
```

Export generation is asynchronous for large accounts; a `202 Accepted` with a task_id is returned and the export is available for 24 hours via a signed S3 URL delivered by email.

### 6.3 Consent Tracking

The `consent_logs` table records each time a user grants or withdraws consent for a given processing purpose.

```sql
CREATE TABLE consent_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    user_email    TEXT NOT NULL,           -- pgcrypto encrypted; anonymised after 7 years
    consent_type  TEXT NOT NULL,           -- e.g. 'analytics', 'marketing', 'data_processing'
    granted       BOOLEAN NOT NULL,
    ip_address    INET,
    user_agent    TEXT,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at  TIMESTAMPTZ,
    legal_basis   TEXT NOT NULL,           -- e.g. 'consent', 'legitimate_interest', 'contract'
    version       TEXT NOT NULL            -- version of the privacy policy accepted
);
CREATE INDEX idx_consent_logs_user_id ON consent_logs(user_id);
CREATE INDEX idx_consent_logs_consent_type ON consent_logs(consent_type, granted_at DESC);
```

Consent state is evaluated in real-time for each data processing request. A withdrawn consent is never backdated; it takes effect from `withdrawn_at` forward.

### 6.4 Data Protection Officer Contact

All GDPR queries, SAR (Subject Access Requests), and erasure requests must be directed to `dpo@dcms.internal`. SLA: acknowledge within 72 hours, respond within 30 days.

---

## 7. Backup Strategy

### 7.1 Schedule and Method

| Backup Type | Tool | Frequency | Destination | Retention |
|-------------|------|-----------|-------------|-----------|
| Full logical backup | `pg_dump` (compressed, parallel) | Daily at 02:00 UTC | S3 bucket `dcms-backups-prod` (SSE-KMS) | 30 days |
| Full physical backup | `pgbackrest --type=full` | Weekly (Sunday 01:00 UTC) | S3 bucket `dcms-backups-prod/pgbackrest/` | 4 weeks |
| Incremental physical backup | `pgbackrest --type=incr` | Daily (Mon–Sat 01:00 UTC) | S3 bucket `dcms-backups-prod/pgbackrest/` | 7 days (until next full) |
| WAL archive (PITR) | `pgbackrest archive-push` | Continuous (every WAL segment) | S3 bucket `dcms-backups-prod/wal/` | 7 days |

### 7.2 Point-in-Time Recovery

PITR is enabled via `pgbackrest` WAL archiving. Recovery objective:

- **RPO:** Maximum 5 minutes (WAL segment size = 16 MB; typical fill time < 2 minutes under load)
- **RTO:** 30 minutes to recover to any point within the 7-day WAL window

Recovery procedure is documented in `RUNBOOK_POSTGRES_RECOVERY.md` and is tested quarterly via automated restore drills to a staging cluster.

### 7.3 Backup Verification

- Daily: `pgbackrest check` verifies WAL archiving is functioning.
- Weekly: Automated restore of the weekly full backup to an isolated `backup-verify` PostgreSQL instance; `pg_dump --schema-only` diff run against expected schema hash.
- Monthly: Full application smoke test against the restored backup instance, executed by the on-call DBA.

### 7.4 Backup Access Controls

- S3 bucket policy: only the `dcms-backup-writer` IAM role (used by pgbackrest on DB hosts) has `s3:PutObject`; only the `dcms-backup-reader` IAM role (used by restore automation) has `s3:GetObject`. No developer has direct S3 access.
- Backup bucket has S3 Object Lock enabled (GOVERNANCE mode, 30-day minimum retention) to protect against accidental or malicious deletion.
- All backup-related IAM actions are logged to CloudTrail and forwarded to the SIEM.

---

## 8. Row-Level Security (RLS)

RLS is enforced at the PostgreSQL level to ensure that even a compromised application process cannot read another organisation's data.

### 8.1 Policy Design

Each multi-tenant table has an `org_id UUID NOT NULL` column. The JWT `org_id` claim is injected into the PostgreSQL session via `SET LOCAL app.current_org_id = $1` in the pgBouncer `connect_query`.

**Pattern applied to every multi-tenant table:**

```sql
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers FORCE ROW LEVEL SECURITY;   -- enforces on table owner too

CREATE POLICY containers_org_isolation ON containers
    USING (org_id = current_setting('app.current_org_id')::uuid);
```

### 8.2 Tables with RLS Enabled

| Table | RLS Policy | Notes |
|-------|------------|-------|
| `users` | `org_id = current_org_id` | Admins also see only their own org |
| `containers` | `org_id = current_org_id` | — |
| `images` | `org_id = current_org_id` | Public library images have `org_id = NULL`; policy uses `org_id IS NULL OR org_id = current_org_id` |
| `networks` | `org_id = current_org_id` | — |
| `volumes` | `org_id = current_org_id` | — |
| `audit_events` | `org_id = current_org_id` | Auditor role sees own org only |
| `alert_rules` | `org_id = current_org_id` | — |
| `sessions` | `user_id IN (SELECT id FROM users)` | Enforced via users RLS chain |
| `consent_logs` | `user_id IN (SELECT id FROM users)` | — |

### 8.3 Privileged Access

- The `dcms_migration` PostgreSQL role (used by migration runner) is explicitly exempt from RLS (`BYPASSRLS`) to allow schema migrations to operate across all tenants.
- The `dcms_analytics_reader` role (used for business intelligence queries on replicas) has a separate RLS policy that permits cross-org reads but strips RESTRICTED columns via a secure view.
- Both privileged roles require MFA-gated Vault credential issuance before use; all sessions are audit-logged.

---

## 9. Database Access Control

### 9.1 Network Access

- PostgreSQL port 5432 is not exposed outside the private VPC subnet.
- No direct DB access from the public internet under any circumstance.
- Developer access: SSH bastion host with MFA, then `psql` via an SSH tunnel; session recorded by Teleport session recording.
- CI/CD pipeline access: ephemeral Vault-issued credentials via `database/creds/dcms-migration`; TTL = 15 minutes.

### 9.2 pgBouncer Connection Pooling

Each microservice connects to pgBouncer (transaction-mode pooling), not directly to PostgreSQL.

| Service | pgBouncer Pool | Max Pool Size | PostgreSQL Role |
|---------|---------------|---------------|-----------------|
| `container-service` | `dcms_container_pool` | 20 | `dcms_container_rw` |
| `auth-service` | `dcms_auth_pool` | 15 | `dcms_auth_rw` |
| `image-service` | `dcms_image_pool` | 10 | `dcms_image_rw` |
| `monitor-service` | `dcms_monitor_pool` | 10 | `dcms_monitor_rw` |
| `log-service` | `dcms_log_pool` | 8 | `dcms_log_rw` |
| `user-service` | `dcms_user_pool` | 10 | `dcms_user_rw` |
| Analytics replica | `dcms_analytics_pool` | 5 | `dcms_analytics_reader` (RO) |

Each PostgreSQL role has only the minimum `GRANT` privileges for the tables it owns. Cross-service table reads go through the API layer, not direct DB queries.

### 9.3 Read Replicas

A PostgreSQL streaming read replica is provisioned for:

- Grafana data source (long-running analytics queries)
- `/users/{id}/export` GDPR export generation
- `dcms-analytics-service` (internal BI)

The replica is in a separate pgBouncer pool with `statement_timeout = 60s` and `idle_in_transaction_session_timeout = 30s` to prevent analytics queries from blocking primary.

---

## 10. Migration Governance (Expand-Contract Pattern)

All schema changes MUST follow the **expand-contract** pattern to enable zero-downtime deployments.

### 10.1 Pattern Phases

| Phase | Action | Notes |
|-------|--------|-------|
| **Expand** | Add new columns/tables as nullable or with defaults; do NOT remove old columns yet | All application versions in flight can still read/write using the old schema |
| **Migrate** | Deploy new application code that writes to both old and new columns/structures | Dual-write period; background job backfills existing rows into new structure |
| **Verify** | Confirm 100% of rows are backfilled; enable constraints on new column | Monitor backfill job; verify no nulls remain |
| **Contract** | Remove old columns/tables in a follow-up migration, deployed separately | Old application version must no longer be in service |
| **Cleanup** | Remove dual-write code from application; update indexes | Final cleanup PR |

### 10.2 Migration Review Checklist

Every `migrations/*.sql` file requires approval from at least one member of the Database Governance team. The reviewer must confirm all five steps:

1. **Backwards compatibility confirmed:** The migration can be applied while the current production version is still running (no immediate `NOT NULL` without default, no `DROP COLUMN` that is currently read).
2. **Lock analysis completed:** Any `ALTER TABLE` statement has been checked for table-level locks. Long-lock operations (e.g., adding a non-null column without default on a large table) use `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` (PostgreSQL 11+ instant DDL) or are scheduled during a maintenance window.
3. **Rollback script present:** A corresponding `down` migration exists and has been tested on a staging database snapshot.
4. **Performance impact assessed:** `EXPLAIN ANALYZE` output included in the PR for any migration that adds indexes on tables > 1M rows. `CREATE INDEX CONCURRENTLY` is used; never plain `CREATE INDEX` on live tables.
5. **Data classification labels updated:** If new columns are added, the `dcms_column_classifications` metadata table has been updated in the same migration transaction, and the PII inventory (§2) updated in the PR description.

### 10.3 Migration Execution

- Migrations are run by `golang-migrate` at service startup with an advisory lock (`pg_advisory_lock`) to prevent concurrent execution.
- Migrations are version-controlled in `services/<service>/db/migrations/`.
- Each migration file is named `{timestamp}_{description}.{up|down}.sql`.
- Failed migrations trigger an automatic rollback and a PagerDuty alert; the deployment is halted.

---

## 11. Audit Trail

### 11.1 Audited Operations

The `audit_events` table receives an entry for every state-changing operation. The following operations are mandatory audit triggers:

| Operation Category | Specific Events | Severity |
|--------------------|-----------------|----------|
| Authentication | login_success, login_failure, logout, token_refresh, mfa_bypass_attempt | INFO / WARNING |
| User Management | user_invited, user_role_changed, user_disabled, user_anonymised, erasure_request | WARNING |
| Container Lifecycle | container_created, container_started, container_stopped, container_deleted, container_exec | INFO / WARNING |
| Image Management | image_pulled, image_deleted, image_scan_triggered, scan_result_critical | INFO / WARNING / CRITICAL |
| Cluster Operations | node_drained, node_activated, swarm_join, swarm_leave | WARNING |
| Access Control | rbac_denial, rls_violation_attempt, policy_changed | WARNING / CRITICAL |
| Configuration | alert_rule_created, alert_rule_deleted, registry_credential_added | WARNING |
| Data Access | gdpr_export_generated, pii_column_accessed_by_privileged_role | CONFIDENTIAL / CRITICAL |
| System | vault_key_rotated, backup_completed, backup_failed, migration_applied | INFO / WARNING |
| Security | brute_force_detected, suspicious_exec_command, cve_critical_found | CRITICAL |

### 11.2 Audit Event Schema

```sql
CREATE TABLE audit_events (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    org_id          UUID         NOT NULL,
    actor_id        UUID,                          -- NULL for system-generated events
    actor_email     TEXT,                          -- pgcrypto encrypted; see §2
    actor_ip        INET,
    actor_role      TEXT,
    event_type      TEXT         NOT NULL,         -- snake_case from table above
    severity        TEXT         NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
    resource_type   TEXT,                          -- 'container', 'image', 'user', etc.
    resource_id     TEXT,
    payload         JSONB,                         -- sanitised event details (no secrets)
    integrity_hash  TEXT         NOT NULL,         -- HMAC-SHA256 of (id||event_type||payload||timestamp)
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
```

### 11.3 Immutability Guarantee

- `audit_events` is a partitioned table, partitioned by month.
- Each monthly partition is created at the start of the month.
- At month-end, the partition is set `READ ONLY` via PostgreSQL publication DDL and the partition table is detached from the parent for writes. A read-only replica-accessible view is created in its place.
- The `integrity_hash` column contains an HMAC-SHA256 computed using the Vault `dcms-audit-hmac` key over the concatenation of `id`, `event_type`, `payload::text`, and `created_at`. This allows tamper detection even if a partition is somehow modified.
- No `DELETE` or `UPDATE` permission is granted on `audit_events` to any application role. Only the `dcms_audit_archiver` role (TTL: 5min, Vault-issued, audit-logged) can execute the monthly archival job.
- Audit event records older than 2 years are compressed and moved to S3 Glacier but are never deleted.

### 11.4 Audit Log Access

- DCMS UI surfaces audit events to users with the `admin` or `auditor` role.
- `auditor` role can search and export events for their own `org_id` only (enforced by RLS).
- `admin` can silence specific alert rules but cannot delete or modify audit events.
- External SIEM integration: audit events are forwarded in real-time via a Kafka topic (`dcms.audit.events`) to the organisation's SIEM (Splunk / Elastic) using the `dcms-audit-exporter` service.
