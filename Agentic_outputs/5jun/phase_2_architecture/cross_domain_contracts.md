# Cross-Domain Integration Contracts — DCMS

**Document Version:** 1.0  
**Date:** 2026-06-05  
**Status:** Approved  
**Author:** senior_architect_agent  

---

## 1. Purpose

This document defines the formal integration contracts between all service pairs in DCMS. Each contract specifies the protocol, schema/format, service-level agreement, and breaking-change policy. All service teams are bound to honour their producer contracts. Contract violations discovered in CI gate the merge.

Breaking-change policy definitions used throughout this document:

- **Backward-compatible change:** adding an optional field, adding a new endpoint, deprecating (but not removing) a field. Does not require a contract version bump.
- **Breaking change:** removing or renaming a field, changing a field type, changing an HTTP status code meaning, removing an endpoint, changing authentication scheme. Requires a contract version bump and coordinated deployment.
- **Contract freeze period:** 2 sprints notice before a breaking change ships to staging. Consumers must update within the freeze period.

---

## 2. Contract Table

| Contract ID | Producer | Consumer | Protocol | Schema / Format | SLA | Breaking-Change Policy |
|---|---|---|---|---|---|---|
| CTR-001 | api-gateway | web-ui (Frontend) | HTTPS REST JSON over HTTP/1.1 and HTTP/2 | See §3.1. JWT Bearer token in `Authorization` header. All responses: `Content-Type: application/json`. Error envelope: `{"code":"string","message":"string","request_id":"uuid"}`. Success responses per resource schema in OpenAPI 3.1 spec (`/docs/api/openapi.yaml`). | p95 < 200 ms at gateway; 99.9% availability | Additive changes (new endpoints, optional fields) are non-breaking. Field removal, rename, type change, or status code change requires a minor version bump in the URL path (`/api/v2/`) and 2-sprint deprecation notice. Both versions run simultaneously during migration. |
| CTR-002 | auth-service | api-gateway | HTTPS REST JSON (internal network) | JWT introspection: `POST /internal/auth/introspect` body `{"token":"<jwt>"}`. Response 200: `{"sub":"uuid","roles":["admin","developer","viewer"],"org_id":"uuid","exp":1234567890}`. Response 401: standard error envelope. RBAC claims embedded in JWT: `{"sub","roles[]","org_id","exp","iat","jti"}`. | p95 < 20 ms (cached); p95 < 50 ms (cold); 99.95% availability | Changes to RBAC claim names or JWT payload structure are breaking. auth-service publishes JWKS at `/.well-known/jwks.json`; api-gateway may cache JWKS for up to 5 minutes. Breaking changes require coordinated deployment with 1-sprint freeze. |
| CTR-003 | container-service | agent | gRPC over mTLS (port 9090) | Proto file: `proto/agent/v1/agent.proto`. RPCs: `StartContainer(ContainerSpec) returns (ContainerResponse)`, `StopContainer(ContainerRef) returns (OperationResult)`, `PauseContainer(ContainerRef) returns (OperationResult)`, `RestartContainer(ContainerRef) returns (OperationResult)`, `GetContainerStats(ContainerRef) returns (ContainerStats)`, `StreamContainerLogs(LogRequest) returns (stream LogLine)`, `ListContainers(ListRequest) returns (ContainerList)`, `ExecCommand(ExecRequest) returns (stream ExecOutput)`. See §3.3 for message schemas. | gRPC deadline: 30 s for lifecycle RPCs; 5 s for GetContainerStats; streaming RPCs: alive while client holds connection. Agent must respond to health check ping within 5 s. | Proto changes follow protobuf backward-compatibility rules: field numbers are never reused, fields are never removed, only additions allowed within a major version. Major proto version bump (`v2/`) requires 2-sprint freeze. mTLS certificates rotated every 30 days via Vault PKI; both parties must support 7-day overlap for zero-downtime rotation. |
| CTR-004 | All services | Prometheus (monitor-service scrapes) | HTTP GET (Prometheus scrape) | `/metrics` endpoint exposed by each service. Prometheus text format (OpenMetrics 1.0 compatible). Required labels on all custom metrics: `service="<service-name>"`, `host="<hostname>"`, `container_id="<id-or-empty>"`, `namespace="<org_id>"`. Standard Go runtime metrics included automatically via `promhttp`. Business metrics documented in `/docs/metrics_catalogue.md`. | Scrape interval: 15 s. Metric endpoint p99 < 5 ms. | Label additions are non-breaking. Label removal or rename requires monitor-service alert rule updates. Coordinate via `#observability` Slack channel before removing any label used in an existing alert rule. |
| CTR-005 | log-service | Loki | HTTP POST (Loki push API) | `POST /loki/api/v1/push`. Content-Type: `application/json`. Body: Loki push format v1: `{"streams":[{"stream":{"job":"dcms-logs","host":"<hostname>","container_id":"<id>","stream":"stdout|stderr"},"values":[["<nanosecond-unix-ts>","<log-line>"]]}]}`. Log lines must not exceed 256 KB. Batched pushes: max 1,000 log lines per push, max 1 s batch window. | Push p95 < 100 ms. Loki availability: 99.5% (observability tier, not critical path). | Loki label changes require Grafana dashboard updates. Label additions are non-breaking. New labels must be registered in the Loki stream schema document. |
| CTR-006 | All services | PostgreSQL | TCP (PostgreSQL wire protocol via pgBouncer :5432) | GORM ORM with typed Go structs. Each service owns its schema prefix (e.g., `container_svc.*`, `auth_svc.*`). Max 25 pgBouncer connections per service instance. Transaction-mode pooling. Migration ownership: each service runs its own `golang-migrate` migrations at startup in dev; migrations applied via CI job in staging/prod. Cross-service reads via dedicated read-only database views (`v_cross_service_*`). No direct cross-schema writes from foreign services. | Connection acquisition p99 < 5 ms (pgBouncer). Query SLA per service: < 20 ms for indexed lookups; < 100 ms for reporting queries. | Schema changes that affect cross-service views require 2-sprint freeze and view version bump. Column renames require an add-new-column + migrate-data + drop-old-column multi-step process across 3 deployments to avoid downtime. |
| CTR-007 | All services | Redis | TCP (Redis RESP3 protocol :6379 via Sentinel) | Key naming convention: `dcms:{service}:{entity}:{id}`. Examples: `dcms:container:status:abc123`, `dcms:auth:apikey:xyz789`. TTL standards: status cache 30 s; RBAC decision cache 60 s; rate-limit window 60 s; session tokens: TTL = JWT exp. Pub/sub channels: `dcms.container.events` (container lifecycle events), `dcms.alerts` (alert notifications). Event payload: JSON `{"event_type":"string","entity_id":"string","org_id":"string","payload":{},"timestamp":"ISO8601"}`. No cross-service key reads outside the owning service's namespace without explicit documentation. | Redis round-trip p99 < 2 ms. Sentinel failover < 15 s. | Key namespace changes are breaking. Pub/sub channel name changes require all consumers to update before the producer switches. New channels are non-breaking. TTL changes for shared cache keys must be reviewed by all consuming services. |
| CTR-008 | image-service | container-service | HTTPS REST JSON (internal network) | `GET /internal/images/{image_id}/available`. Response 200: `{"image_id":"uuid","name":"string","tag":"string","digest":"sha256:...","scan_status":"clean|vulnerable|scanning","scan_critical_count":0,"available_on_hosts":["host1","host2"]}`. Response 404: standard error envelope. Response 503: image-service unavailable. container-service must cache this response for 30 s to avoid thundering-herd on mass deployments. | p95 < 50 ms. image-service availability: 99.9%. container-service falls back to `available_on_hosts=[]` with a warning log if image-service returns 503. | Adding fields to the response is non-breaking. Removing `scan_status` or `available_on_hosts` is a breaking change requiring 2-sprint notice. image-service must not block container creation for scan_status=scanning; the decision to block is container-service's policy. |

---

## 3. Contract Detail Supplements

### 3.1 REST Error Envelope (CTR-001)

All REST error responses from api-gateway and all backend services follow this envelope:

```json
{
  "code": "CONTAINER_NOT_FOUND",
  "message": "Container abc123 was not found in organization xyz",
  "request_id": "01J4XYZQ0000000000000000",
  "details": [
    {
      "field": "container_id",
      "issue": "resource_not_found"
    }
  ]
}
```

HTTP status to `code` prefix mapping:

| HTTP Status | Code Prefix | Usage |
|---|---|---|
| 400 | `INVALID_*` | Request validation failure |
| 401 | `AUTH_*` | Missing or expired token |
| 403 | `FORBIDDEN_*` | Insufficient RBAC permissions |
| 404 | `*_NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT_*` | State conflict (e.g., container already running) |
| 422 | `UNPROCESSABLE_*` | Business rule violation |
| 429 | `RATE_LIMIT_*` | Rate limit exceeded |
| 500 | `INTERNAL_*` | Unexpected server error (do not leak internal details) |
| 503 | `SERVICE_UNAVAILABLE_*` | Upstream dependency unavailable |

### 3.2 JWT Claims Schema (CTR-002)

Standard claims (RFC 7519):

```json
{
  "iss": "https://auth.dcms.example.com",
  "sub": "usr_01J4XYZQ0000000000000000",
  "aud": ["dcms-api"],
  "exp": 1780000000,
  "iat": 1779996400,
  "jti": "01J4XYZQ0000000000000001"
}
```

DCMS custom claims (namespace `https://dcms.io/`):

```json
{
  "https://dcms.io/roles": ["developer", "container:write", "image:read"],
  "https://dcms.io/org_id": "org_01J4XYZQ0000000000000002",
  "https://dcms.io/plan": "enterprise"
}
```

### 3.3 gRPC Message Schemas (CTR-003)

Key message types from `proto/agent/v1/agent.proto`:

```protobuf
message ContainerSpec {
  string name         = 1;
  string image        = 2;
  repeated string cmd = 3;
  repeated EnvVar env = 4;
  repeated PortBinding ports = 5;
  repeated VolumeMount volumes = 6;
  map<string, string> labels = 7;
  ResourceLimits resources = 8;
  string network_id   = 9;
  RestartPolicy restart_policy = 10;
}

message ContainerResponse {
  string container_id = 1;
  string status       = 2;  // RUNNING, EXITED, ERROR
  string error_msg    = 3;
  google.protobuf.Timestamp started_at = 4;
}

message LogLine {
  string container_id = 1;
  string stream       = 2;  // stdout | stderr
  string line         = 3;
  google.protobuf.Timestamp timestamp = 4;
}

message ContainerStats {
  string container_id  = 1;
  double cpu_percent   = 2;
  uint64 memory_bytes  = 3;
  uint64 memory_limit  = 4;
  uint64 net_rx_bytes  = 5;
  uint64 net_tx_bytes  = 6;
  uint64 block_read    = 7;
  uint64 block_write   = 8;
  google.protobuf.Timestamp collected_at = 9;
}
```

### 3.4 Redis Pub/Sub Event Payload (CTR-007)

All events on `dcms.container.events`:

```json
{
  "event_type": "CONTAINER_STARTED",
  "entity_id": "abc123def456",
  "org_id": "org_01J4XYZQ0000000000000002",
  "host": "worker-node-03",
  "payload": {
    "image": "nginx:1.25",
    "name": "web-frontend",
    "ports": [{"host_port": 8080, "container_port": 80}]
  },
  "timestamp": "2026-06-05T14:32:00.000Z",
  "schema_version": "1"
}
```

Valid `event_type` values: `CONTAINER_CREATED`, `CONTAINER_STARTED`, `CONTAINER_STOPPED`, `CONTAINER_PAUSED`, `CONTAINER_RESUMED`, `CONTAINER_REMOVED`, `CONTAINER_FAILED`, `CONTAINER_OOM_KILLED`, `CONTAINER_HEALTH_CHANGED`.

All events on `dcms.alerts`:

```json
{
  "event_type": "ALERT_FIRED",
  "alert_name": "ContainerCPUHigh",
  "severity": "warning",
  "org_id": "org_01J4XYZQ0000000000000002",
  "entity_id": "abc123def456",
  "labels": {"container": "web-frontend", "host": "worker-node-03"},
  "annotations": {"summary": "CPU > 80% for 5 min"},
  "fired_at": "2026-06-05T14:35:00.000Z",
  "schema_version": "1"
}
```

---

## 4. Contract Ownership and Governance

| Contract ID | Producer Owner | Consumer Owner | Review Cadence |
|---|---|---|---|
| CTR-001 | api-gateway team | frontend team | Every sprint; OpenAPI spec auto-generated from Go handler annotations |
| CTR-002 | auth team | api-gateway team | Every sprint; JWT schema changes reviewed in security-focused PR |
| CTR-003 | container-service team | agent team | Per-sprint; `.proto` changes require tech-lead approval |
| CTR-004 | All service teams | observability team | Monthly metrics catalogue review |
| CTR-005 | log-service team | observability team | Monthly |
| CTR-006 | Each service (own schema) | All teams | Per-migration PR; cross-service view changes reviewed by DBA |
| CTR-007 | Each key owner | All consuming teams | Quarterly key namespace audit |
| CTR-008 | image-service team | container-service team | Per-sprint |

Contract change proposals must be raised as a GitHub Issue tagged `contract-change` at least 2 sprints before the intended merge date. The affected consumer teams must acknowledge the issue before the producer proceeds.
