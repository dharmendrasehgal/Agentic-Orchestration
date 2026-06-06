# Entity-Relationship Diagram — DCMS Database Domain
**Document Version:** 1.0.0  
**Date:** 2026-06-05  
**Agent:** db_architect_agent  
**Phase:** P3 — Domain Design  
**Consumers:** backend_architect_agent, content_creator_agent  

---

## Legend

```
+------------------+     Relation notation
|  TABLE_NAME      |     ──────────────  one-to-one  (1 ─── 1)
|  ─────────────── |     ──────────────  one-to-many (1 ─── *)
|  id (PK)         |     ──────────────  zero-or-one (1 ─── 0..1)
|  col_name        |     N:M junction tables shown explicitly
|  fk_col (FK)     |
+------------------+
```

Cardinality notation used on lines:
- `1` — exactly one
- `*` — zero or many
- `0..1` — zero or one (optional / nullable FK)

---

## Cluster A — Authentication & Authorization

```
+---------------------------+           1                  *     +---------------------------+
|       organizations       |─────────────────────────────────── |          users            |
|  ─────────────────────── |                                      |  ─────────────────────── |
|  id              (PK)    |                                      |  id              (PK)    |
|  name                    |                                      |  organization_id (FK)    |
|  slug            UNIQUE  |                                      |  email           UNIQUE  |
|  plan                    |                                      |  username        UNIQUE  |
|  max_hosts               |                                      |  password_hash           |
|  sso_enabled             |                                      |  external_id             |
|  oidc_issuer_url         |                                      |  auth_provider           |
|  is_active               |                                      |  is_active               |
|  deleted_at              |                                      |  is_mfa_enabled          |
|  created_at              |                                      |  mfa_secret_enc [ENC]    |
|  updated_at              |                                      |  failed_login_count      |
+---------------------------+                                      |  locked_until            |
            |                                                      |  anonymized_at           |
            | 1                                                    |  deleted_at              |
            |                                                      |  created_at              |
            |  *                                                   |  updated_at              |
+---------------------------+                                      +---------------------------+
|          roles            |                                                |
|  ─────────────────────── |                                                | 1
|  id              (PK)    |                                                |
|  organization_id (FK)    |──────── 0..1 (NULL=system)                    |  *
|  name                    |                                      +---------------------------+
|  description             |                                      |        user_roles         |
|  is_system               |                                      |  ─────────────────────── |
|  created_at              |      *                   *           |  id              (PK)    |
|  updated_at              |──────────────────────────────────── |  user_id         (FK)    |
+---------------------------+   N:M via role_permissions           |  role_id         (FK)    |
            |                                                      |  namespace_id    (FK)    |
            | *                                                    |  organization_id (FK)    |
            |                                                      |  granted_at              |
+--------------------------+                                       |  granted_by              |
|    role_permissions      |                                       +---------------------------+
|  ─────────────────────  |
|  role_id       (PK,FK)  |──────────── * to roles
|  permission_id (PK,FK)  |──────────── * to permissions
|  granted_at             |
|  granted_by             |
+--------------------------+
            |
            | *
+---------------------------+
|       permissions         |
|  ─────────────────────── |
|  id              (PK)    |
|  resource                |
|  action                  |
|  description             |
|  created_at              |
+---------------------------+
```

---

## Cluster A — Sessions & API Keys

```
+---------------------------+    1       *     +---------------------------+
|          users            |─────────────────|         sessions          |
|  id (PK)                 |                  |  ─────────────────────── |
|  ...                     |                  |  id              (PK)    |
+---------------------------+                  |  user_id         (FK)    |
            |                                  |  organization_id (FK)    |
            | 1                                |  token_hash      UNIQUE  |
            |                                  |  refresh_token_hash      |
            |  *                               |  ip_address              |
+---------------------------+                  |  is_mfa_verified         |
|         api_keys          |                  |  expires_at              |
|  ─────────────────────── |                  |  revoked_at              |
|  id              (PK)    |                  |  created_at              |
|  user_id         (FK)    |                  +---------------------------+
|  organization_id (FK)    |
|  name                    |
|  key_hash        UNIQUE  |
|  key_prefix              |
|  role_id         (FK)    |──────── * to roles
|  namespace_id    (FK)    |──────── 0..1 to namespaces
|  last_used_at            |
|  expires_at              |
|  revoked_at              |
|  created_at              |
|  updated_at              |
+---------------------------+
```

---

## Cluster B — Infrastructure: Clusters, Hosts, Namespaces

```
+---------------------------+    1       *     +---------------------------+
|       organizations       |─────────────────|         clusters          |
|  id (PK)                 |                  |  ─────────────────────── |
|  ...                     |                  |  id              (PK)    |
+---------------------------+                  |  organization_id (FK)    |
                                               |  name            UNIQUE  |
                                               |  cluster_type            |
                                               |  api_endpoint            |
                                               |  kubeconfig_enc  [ENC]  |
                                               |  status                  |
                                               |  manager_host_id (FK)    |──── 0..1 to hosts
                                               |  deleted_at              |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+
                                                           |
                                                           | 1
                                                           |
                                                           |  *
+---------------------------+    1       *     +---------------------------+
|       organizations       |─────────────────|           hosts           |
|  id (PK)                 |                  |  ─────────────────────── |
|  ...                     |                  |  id              (PK)    |
+---------------------------+                  |  organization_id (FK)    |
                                               |  cluster_id      (FK)    |
                                               |  name                    |
                                               |  hostname        UNIQUE  |
                                               |  ip_address              |
                                               |  agent_port              |
                                               |  agent_version           |
                                               |  docker_version          |
                                               |  os_info         JSONB   |
                                               |  labels          JSONB   |
                                               |  status                  |
                                               |  last_heartbeat_at       |
                                               |  cpu_cores               |
                                               |  memory_bytes            |
                                               |  deleted_at              |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+
                                                           |
                            +──────────────────────────────+
                            |
                            | 1 (hosts.id ← cluster_id FK in namespaces optional)
+---------------------------+    1       *     +---------------------------+
|       organizations       |─────────────────|        namespaces         |
|  id (PK)                 |                  |  ─────────────────────── |
|  ...                     |                  |  id              (PK)    |
+---------------------------+                  |  organization_id (FK)    |
            ^                                  |  cluster_id      (FK)    |──── 0..1 to clusters
            |                                  |  name            UNIQUE  |
All resource tables carry organization_id FK   |  environment             |
and namespace_id FK for tenant isolation       |  labels          JSONB   |
                                               |  is_active               |
                                               |  deleted_at              |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+
```

---

## Cluster C — Resource Metadata (Images, Containers, Networks, Volumes)

```
+-------------+  1    *  +------------------+  1    *  +-----------------------------+
|   hosts     |──────────|     images       |──────────|   image_scan_results        |
|  id (PK)   |          |  ─────────────── |          |  ─────────────────────────  |
|  ...       |          |  id       (PK)   |          |  id              (PK)       |
+-------------+          |  organization_id (FK)       |  image_id        (FK)       |
      |                  |  host_id    (FK) |          |  organization_id (FK)       |
      |                  |  namespace_id(FK)|──0..1─── |  scanner                   |
      |                  |  repository      |          |  scanner_version            |
      |                  |  tag             |          |  scanned_at                 |
      |                  |  digest   UNIQUE |          |  critical_count             |
      |                  |  size_bytes      |          |  high_count                 |
      |                  |  architecture    |          |  medium_count               |
      |                  |  scan_status     |          |  low_count                  |
      |                  |  deleted_at      |          |  findings        JSONB      |
      |                  |  created_at      |          |  raw_report_path            |
      |                  |  updated_at      |          |  created_at                 |
      |                  +------------------+          +-----------------------------+
      |
      |  1                         1
      |         *            +---------------------------+
      |──────────────────────|         containers        |
      |                      |  ─────────────────────── |
      |                      |  id              (PK)    |
      |                      |  organization_id (FK)    |
      |                      |  namespace_id    (FK)    |
      |                      |  host_id         (FK)    |
      |                      |  image_id        (FK)    |──── 0..1 to images
      |                      |  docker_id       UNIQUE  |
      |                      |  name                    |
      |                      |  status                  |
      |                      |  image_ref               |
      |                      |  command         TEXT[]  |
      |                      |  env_vars        JSONB   |
      |                      |  labels          JSONB   |
      |                      |  port_bindings   JSONB   |
      |                      |  volume_mounts   JSONB   |
      |                      |  resource_limits JSONB   |
      |                      |  network_settings JSONB  |
      |                      |  health_status           |
      |                      |  restart_count           |
      |                      |  exit_code               |
      |                      |  started_at              |
      |                      |  finished_at             |
      |                      |  deleted_at              |
      |                      |  created_at              |
      |                      |  updated_at              |
      |                      +---------------------------+
      |
      |  1         *     +---------------------------+
      |──────────────────|         networks          |
      |                  |  ─────────────────────── |
      |                  |  id              (PK)    |
      |                  |  organization_id (FK)    |
      |                  |  host_id         (FK)    |
      |                  |  namespace_id    (FK)    |
      |                  |  docker_id       UNIQUE  |
      |                  |  name                    |
      |                  |  driver                  |
      |                  |  scope                   |
      |                  |  subnet          CIDR    |
      |                  |  gateway         INET    |
      |                  |  internal                |
      |                  |  labels          JSONB   |
      |                  |  options         JSONB   |
      |                  |  deleted_at              |
      |                  |  created_at              |
      |                  |  updated_at              |
      |                  +---------------------------+
      |
      |  1         *     +---------------------------+
      |──────────────────|          volumes          |
                         |  ─────────────────────── |
                         |  id              (PK)    |
                         |  organization_id (FK)    |
                         |  host_id         (FK)    |
                         |  namespace_id    (FK)    |
                         |  name            UNIQUE  |
                         |  driver                  |
                         |  mount_point             |
                         |  scope                   |
                         |  labels          JSONB   |
                         |  options         JSONB   |
                         |  size_bytes              |
                         |  used_bytes              |
                         |  last_measured_at        |
                         |  deleted_at              |
                         |  created_at              |
                         |  updated_at              |
                         +---------------------------+
```

---

## Cluster D — Deployments

```
+---------------------------+    1       *     +---------------------------+
|       organizations       |─────────────────|        deployments        |
|  id (PK)                 |                  |  ─────────────────────── |
+---------------------------+                  |  id              (PK)    |
                                               |  organization_id (FK)    |
+---------------------------+    1       *     |  namespace_id    (FK)    |
|        namespaces         |─────────────────|  cluster_id      (FK)    |
|  id (PK)                 |                  |  name                    |
+---------------------------+                  |  deployment_type         |
                                               |  desired_spec    JSONB   |
+---------------------------+    1       *     |  current_spec    JSONB   |
|         clusters          |─────────────────|  status                  |
|  id (PK)                 |                  |  desired_replicas        |
+---------------------------+                  |  ready_replicas          |
                                               |  rollout_strategy        |
+---------------------------+    1       *     |  initiated_by    (FK)    |
|           users           |─────────────────|  started_at              |
|  id (PK)                 |                  |  completed_at            |
+---------------------------+                  |  error_message           |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+
```

---

## Cluster E — Alerting & Notifications

```
+---------------------------+    1       *     +---------------------------+
|       organizations       |─────────────────|       alert_rules         |
|  id (PK)                 |                  |  ─────────────────────── |
+---------------------------+                  |  id              (PK)    |
                                               |  organization_id (FK)    |
+---------------------------+    1       *     |  namespace_id    (FK)    |
|        namespaces         |─────────────────|  name                    |
|  id (PK)                 |                  |  metric                  |
+---------------------------+                  |  condition_operator      |
                                               |  threshold_value         |
                                               |  duration_seconds        |
                                               |  severity                |
                                               |  is_active               |
                                               |  evaluation_interval     |
                                               |  labels          JSONB   |
                                               |  created_by      (FK)    |──── 0..1 to users
                                               |  deleted_at              |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+
                                                           |
                                                           | 1
                                                           |
                                                           |  *
                                               +---------------------------+
                                               |          alerts           |
                                               |  ─────────────────────── |
                                               |  id              (PK)    |
                                               |  organization_id (FK)    |
                                               |  alert_rule_id   (FK)    |
                                               |  namespace_id    (FK)    |
                                               |  resource_type           |
                                               |  resource_id             |
                                               |  severity                |
                                               |  status                  |
                                               |  message                 |
                                               |  labels          JSONB   |
                                               |  fired_at                |
                                               |  resolved_at             |
                                               |  silenced_until          |
                                               |  silenced_by     (FK)    |──── 0..1 to users
                                               |  acknowledged_by (FK)    |──── 0..1 to users
                                               |  notification_sent       |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+


+---------------------------+    1       *     +---------------------------+
|       organizations       |─────────────────| notification_channels     |
|  id (PK)                 |                  |  ─────────────────────── |
+---------------------------+                  |  id              (PK)    |
                                               |  organization_id (FK)    |
                                               |  name                    |
                                               |  channel_type            |
                                               |  config_enc      [ENC]  |
                                               |  is_active               |
                                               |  last_test_at            |
                                               |  deleted_at              |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+
                                                           |
                                                           | 1
                                                           |
                                                           |  *
+---------------------------+    1       *     +---------------------------+
|       alert_rules         |─────────────────| notification_subscriptions|
|  id (PK)                 |  0..1 (NULL=all) |  ─────────────────────── |
+---------------------------+                  |  id                 (PK) |
                                               |  organization_id    (FK) |
                                               |  alert_rule_id      (FK) |──── 0..1 to alert_rules
                                               |  notification_channel_id |──── (FK) to notification_channels
                                               |  severity_filter  TEXT[] |
                                               |  namespace_filter UUID[] |
                                               |  is_active               |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+
```

---

## Cluster F — Audit & Registry Credentials

```
+---------------------------+    1       *     +---------------------------+
|       organizations       |─────────────────|   registry_credentials    |
|  id (PK)                 |                  |  ─────────────────────── |
+---------------------------+                  |  id              (PK)    |
                                               |  organization_id (FK)    |
                                               |  name                    |
                                               |  registry_url            |
                                               |  username                |
                                               |  secret_enc      [ENC]  |
                                               |  is_active               |
                                               |  deleted_at              |
                                               |  created_at              |
                                               |  updated_at              |
                                               +---------------------------+


+---------------------------+
|        audit_events       |    PARTITIONED BY RANGE (created_at) — monthly partitions
|  ─────────────────────── |    Append-only. No FK enforcement (survives user/org deletion).
|  id              (PK)    |
|  actor_id        [ref]   |────  soft reference to users.id (not enforced FK)
|  organization_id [ref]   |────  soft reference to organizations.id (not enforced FK)
|  action                  |
|  resource_type           |
|  resource_id             |
|  old_data        JSONB   |
|  new_data        JSONB   |
|  source_ip       INET    |
|  user_agent              |
|  trace_id                |
|  created_at       (PK)   |────  partition key
+---------------------------+
Partitions: audit_events_2026_01 … audit_events_2026_12 (+ future months via cron/migration)
```

---

## Full Cross-Reference Table

| Table | References (FK → Target) | Referenced By (Target ← FK) |
|---|---|---|
| organizations | — | users, roles, user_roles, api_keys, sessions, clusters, hosts, namespaces, images, image_scan_results, networks, volumes, containers, deployments, alert_rules, alerts, notification_channels, notification_subscriptions, registry_credentials |
| users | organizations | user_roles, api_keys, sessions, deployments(initiated_by), alert_rules(created_by), alerts(silenced_by, acknowledged_by) |
| roles | organizations(0..1) | user_roles, api_keys, role_permissions |
| permissions | — | role_permissions |
| role_permissions | roles, permissions | — |
| user_roles | users, roles, namespaces(0..1), organizations | — |
| sessions | users, organizations | — |
| api_keys | users, organizations, roles, namespaces(0..1) | — |
| clusters | organizations, hosts(manager_host_id 0..1) | hosts, namespaces, deployments |
| hosts | organizations, clusters(0..1) | images, networks, volumes, containers |
| namespaces | organizations, clusters(0..1) | user_roles(0..1), api_keys(0..1), images(0..1), networks(0..1), volumes(0..1), containers(0..1), deployments(0..1), alert_rules(0..1), alerts(0..1), notification_subscriptions(array) |
| images | organizations, hosts, namespaces(0..1) | image_scan_results, containers(0..1) |
| image_scan_results | images, organizations | — |
| networks | organizations, hosts, namespaces(0..1) | — |
| volumes | organizations, hosts, namespaces(0..1) | — |
| containers | organizations, namespaces(0..1), hosts, images(0..1) | — |
| deployments | organizations, namespaces(0..1), clusters(0..1), users(initiated_by 0..1) | — |
| alert_rules | organizations, namespaces(0..1), users(created_by 0..1) | alerts, notification_subscriptions(0..1) |
| alerts | organizations, alert_rules, namespaces(0..1), users(silenced_by, acknowledged_by 0..1) | — |
| notification_channels | organizations | notification_subscriptions |
| notification_subscriptions | organizations, alert_rules(0..1), notification_channels | — |
| registry_credentials | organizations | — |
| audit_events | none (soft references only) | — |

---

## Redis Data Structures (Non-Relational — Reference)

These structures live in Redis 7 and are NOT represented in PostgreSQL. Included here for completeness so backend_architect_agent can cross-reference.

| Redis Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `dcms:container:{org_id}:{container_id}` | HASH | 300s | CQRS read model — container state (monitor-service writes; api-gateway/container-service reads) |
| `dcms:containers:ns:{namespace_id}` | SORTED SET (score=updated_at) | 300s | Container list per namespace for O(1) reads |
| `dcms:session:{token_hash}` | STRING (JSON) | TTL = session.expires_at | Fast session lookup bypassing PostgreSQL on most auth checks |
| `dcms:rbac:{user_id}:{org_id}` | STRING (JSON) | 60s | Cached RBAC decision (role+permissions); invalidated on role change |
| `dcms:host:heartbeat:{host_id}` | STRING | 45s | Agent heartbeat — absence triggers UNREACHABLE status |
| `dcms:ratelimit:{key_or_user_id}` | STRING (counter) | 60s | Sliding-window rate limit counter per API key |
| `dcms:lock:container:{docker_id}` | STRING (lock token) | 30s | Distributed lock preventing concurrent lifecycle operations on same container |
| `dcms:sse:{org_id}` | PUBSUB channel | N/A | SSE event fan-out channel; api-gateway subscribes per org |
| `dcms:alert:dedup:{rule_id}:{resource_id}` | STRING | 300s | Notification deduplication; prevents storm amplification |
| `dcms:notif:retry:{notification_id}` | ZSET (score=next_attempt_at) | 7d | Retry queue for failed webhook/email deliveries |
