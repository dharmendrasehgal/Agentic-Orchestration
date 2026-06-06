# Backend Architecture — Generic Docker Container Management System (DCMS)

**Document Version:** 1.0
**Phase:** P3 — Domain Design
**Date:** 2026-06-05
**Status:** Approved
**Author:** backend_architect_agent
**Consumes:** solution_architecture.md v1.0, cross_domain_contracts.md v1.0, technology_stack.md v1.0, nfr.md v1.0

---

## Table of Contents

1. [Service Responsibility Matrix](#1-service-responsibility-matrix)
2. [Internal Service Communication Patterns](#2-internal-service-communication-patterns)
3. [Authentication and Authorization Flow](#3-authentication-and-authorization-flow)
4. [Container Lifecycle State Machine](#4-container-lifecycle-state-machine)
5. [CQRS Pattern for Container State](#5-cqrs-pattern-for-container-state)
6. [Agent Architecture](#6-agent-architecture)
7. [Error Handling Patterns](#7-error-handling-patterns)
8. [Middleware Chain](#8-middleware-chain)
9. [Configuration Management](#9-configuration-management)
10. [Service Mesh and Internal DNS](#10-service-mesh-and-internal-dns)

---

## 1. Service Responsibility Matrix

Each of the 12 services owns a clearly bounded domain. The table below captures the domain, key endpoints, direct dependencies, and scaling posture for every service.

### 1.1 api-gateway

| Attribute | Detail |
|---|---|
| Domain | Single external ingress; traffic management |
| Technology | Go 1.22 + Gin 1.9; Kong Gateway 3.7 plugin layer |
| Port | 8080 (HTTP/HTTPS, SSE) |
| Key Endpoints | `/*` — proxied to downstream services; `GET /health`; `GET /events` (SSE fan-out stream) |
| Responsibilities | TLS termination delegation (Nginx/Kong upstream), JWT signature validation (cached JWKS from auth-service), request ID injection (`X-Request-ID`), rate-limit enforcement (Kong rate-limit plugin), path-based routing to downstream services, SSE fan-out from Redis pub/sub to connected browser clients, CORS headers, structured access logging |
| Dependencies | auth-service (introspection on cache miss), Redis (JWKS cache, SSE pub/sub subscription, rate-limit counters), all downstream services (proxied traffic) |
| Scaling | Horizontal, stateless. 2+ replicas behind Kong/Nginx. SSE state maintained per-connection; Redis pub/sub subscription re-established on replica start. Scale metric: p95 latency > 150 ms or CPU > 60%. |

### 1.2 auth-service

| Attribute | Detail |
|---|---|
| Domain | Identity, authentication, authorization |
| Technology | Go 1.22 + Gin 1.9 + GORM 2.0 + PostgreSQL 16 |
| Port | 8081 |
| Key Endpoints | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /internal/auth/introspect`, `GET /.well-known/jwks.json`, `GET /users`, `POST /users`, `PATCH /users/{id}/role` |
| Responsibilities | Local account authentication (bcrypt cost 12), OIDC bridge to external IdP (Keycloak/Entra ID), JWT issuance (RS256, 1-hour access token + 24-hour refresh token), JWT introspection endpoint for api-gateway, RBAC policy enforcement (admin/operator/viewer), API key hashing and validation, MFA (TOTP) for admin role, account lockout after 5 failures/10 min |
| Dependencies | PostgreSQL (users, RBAC, API keys, sessions, audit log), Redis (RBAC decision cache TTL 60s, token blacklist, lockout counters), Vault (JWT signing key rotation) |
| Scaling | Horizontal. Read-heavy (introspection). Redis caches RBAC decisions. Scale metric: request rate or cache miss rate. Replica count: 2 minimum. |

### 1.3 container-service

| Attribute | Detail |
|---|---|
| Domain | Container lifecycle management |
| Technology | Go 1.22 + Gin 1.9 + GORM 2.0 + Moby SDK 26.1 + gRPC 1.64 client |
| Port | 8082 |
| Key Endpoints | `GET /containers`, `POST /containers`, `GET /containers/{id}`, `DELETE /containers/{id}`, `POST /containers/{id}/start`, `POST /containers/{id}/stop`, `POST /containers/{id}/restart`, `POST /containers/{id}/pause`, `POST /containers/{id}/unpause`, `POST /containers/{id}/exec`, `GET /containers/{id}/stats` (SSE), `GET /containers/{id}/logs` (SSE) |
| Responsibilities | Container CRUD and lifecycle command execution, persisting container metadata in PostgreSQL (`container_svc.*` schema), resolving target host via cluster-service, dispatching lifecycle RPCs to per-host agent over gRPC/mTLS, updating container state in PostgreSQL and publishing events to Redis `dcms.container.events`, enforcing image scan gate via image-service (CTR-008), idempotency key enforcement on create/start operations |
| Dependencies | PostgreSQL (container metadata, state), Redis (event publish, read model invalidation), agent (gRPC mTLS port 9090), cluster-service (host resolution), image-service (availability/scan check, CTR-008), Vault (mTLS cert for agent gRPC) |
| Scaling | Horizontal, stateless HTTP layer. gRPC connections to agents are per-host; each container-service instance maintains its own connection pool. Scale metric: in-flight gRPC calls or CPU > 65%. Replica count: 2 minimum. |

### 1.4 image-service

| Attribute | Detail |
|---|---|
| Domain | Container image management and security scanning |
| Technology | Go 1.22 + Gin 1.9 + GORM 2.0 + Moby SDK 26.1 + Trivy 0.51 Go library |
| Port | 8083 |
| Key Endpoints | `GET /images`, `POST /images/pull`, `GET /images/{id}`, `DELETE /images/{id}`, `POST /images/{id}/scan`, `GET /images/{id}/scan/results`, `GET /internal/images/{id}/available` |
| Responsibilities | Image pull from registries (Docker Hub, private registries with credential encryption), image metadata persistence, CVE scanning via Trivy (CRITICAL findings block deployment), SBOM generation (CycloneDX), image availability tracking per host, internal availability endpoint for container-service (CTR-008) |
| Dependencies | PostgreSQL (image metadata, scan results), Docker Registry (HTTP v2 pull protocol), Vault (decryption of registry credentials), Redis (scan result cache TTL 300s) |
| Scaling | Horizontal. Trivy scans are CPU-bound (scan workers). Scale scan replicas independently via CPU HPA threshold 70%. Replica count: 2 minimum. |

### 1.5 network-service

| Attribute | Detail |
|---|---|
| Domain | Docker overlay network management |
| Technology | Go 1.22 + Gin 1.9 + GORM 2.0 + Moby SDK 26.1 |
| Port | 8084 |
| Key Endpoints | `GET /networks`, `POST /networks`, `GET /networks/{id}`, `DELETE /networks/{id}`, `POST /networks/{id}/connect`, `POST /networks/{id}/disconnect` |
| Responsibilities | Docker overlay network CRUD (bridge, overlay, macvlan driver support), IPAM configuration, DNS resolution configuration for container service discovery, network inspection and topology reporting, network attachment/detachment for running containers |
| Dependencies | PostgreSQL (network metadata), Moby SDK (Docker Engine via agent gRPC or direct for manager node operations), Redis (network state cache) |
| Scaling | Low throughput. 2 replicas for HA. Network operations are infrequent; scale is dictated by HA requirements, not load. |

### 1.6 volume-service

| Attribute | Detail |
|---|---|
| Domain | Persistent storage management |
| Technology | Go 1.22 + Gin 1.9 + GORM 2.0 + Moby SDK 26.1 |
| Port | 8085 |
| Key Endpoints | `GET /volumes`, `POST /volumes`, `GET /volumes/{id}`, `DELETE /volumes/{id}`, `POST /volumes/{id}/backup` |
| Responsibilities | Named Docker volume CRUD, bind-mount registration and metadata tracking, backup schedule metadata (actual backup execution is out-of-scope for v1; metadata only), volume usage statistics per container, volume pruning (unused volumes) |
| Dependencies | PostgreSQL (volume metadata), Moby SDK (volume inspection, creation, deletion), Redis (usage cache) |
| Scaling | Low throughput. 2 replicas for HA. |

### 1.7 monitor-service

| Attribute | Detail |
|---|---|
| Domain | Metrics collection, CQRS projections, alerting |
| Technology | Go 1.22 + Prometheus client 1.20 + Redis |
| Port | 8086 |
| Key Endpoints | `GET /monitoring/metrics`, `GET /monitoring/alerts`, `GET /monitoring/alerts/{id}/acknowledge` |
| Responsibilities | Prometheus scrape of all service `/metrics` endpoints and cAdvisor, maintenance of CQRS read projections in Redis (container status summary, host health), alert rule evaluation (threshold-based on container CPU > 80%, memory > 90%, restart loops), alert publication to Redis `dcms.alerts` channel, alert state persistence in PostgreSQL |
| Dependencies | PostgreSQL (alert rules, alert history), Redis (CQRS read projections, alert dedup, `dcms.alerts` publish), Prometheus (scrape pull) or cAdvisor (push via remote write), all services (metrics scrape targets) |
| Scaling | Horizontal. Redis writes for projections are idempotent (last-write-wins on keyed projections). Scale up for large cluster metric ingestion. Replica count: 2 minimum. |

### 1.8 log-service

| Attribute | Detail |
|---|---|
| Domain | Container log aggregation and streaming |
| Technology | Go 1.22 + Gin 1.9 + Loki HTTP push client |
| Port | 8087 |
| Key Endpoints | `GET /containers/{id}/logs` (SSE stream — also proxied via api-gateway), `GET /logs/search` |
| Responsibilities | Subscribe to agent `StreamContainerLogs` gRPC stream, forward log lines to Loki (`/loki/api/v1/push`) in batches (max 1000 lines, max 1s window), serve log-tail SSE streams to api-gateway, LogQL-based search proxying to Loki, log line parsing and label extraction (container_id, host, stream=stdout/stderr) |
| Dependencies | agent (gRPC streaming `StreamContainerLogs`), Loki (HTTP push API), Redis (log cursor state for reconnect, SSE channel routing) |
| Scaling | Horizontal, I/O-bound. Each replica independently tails assigned containers. Scale with log volume. Replica count: 2 minimum. |

### 1.9 cluster-service

| Attribute | Detail |
|---|---|
| Domain | Docker Swarm cluster and node management |
| Technology | Go 1.22 + Gin 1.9 + GORM 2.0 + Moby SDK 26.1 |
| Port | 8089 |
| Key Endpoints | `GET /clusters`, `GET /clusters/nodes`, `GET /clusters/nodes/{id}`, `POST /clusters/nodes/{id}/drain`, `POST /clusters/nodes/{id}/activate`, `DELETE /clusters/nodes/{id}` |
| Responsibilities | Docker Swarm manager API calls (node join, drain, remove, inspect), host registration and deregistration, cluster health aggregation (online/offline/degraded per node), least-loaded node selection for container scheduling, Swarm service deployment management, host reachability tracking (heartbeat missed count) |
| Dependencies | PostgreSQL (node registry, host metadata), Redis (heartbeat store, host status cache TTL 30s), Moby SDK (Swarm manager API on manager nodes) |
| Scaling | Low replica count (2). Swarm manager API calls are serialized to the primary manager. Additional replicas add HA, not throughput. |

### 1.10 notification-service

| Attribute | Detail |
|---|---|
| Domain | Alert and event notification delivery |
| Technology | Go 1.22 + Gin 1.9 + Redis subscriber |
| Port | 8088 |
| Key Endpoints | `GET /notifications/channels`, `POST /notifications/channels`, `DELETE /notifications/channels/{id}`, `GET /notifications/history` |
| Responsibilities | Subscribe to Redis `dcms.alerts` channel, deduplicate alerts (Redis-based dedup key TTL 5min), route alerts to configured channels (Slack webhook, SMTP email, generic HTTP webhook), exponential backoff retry (30s → 1m → 5m → 15m → 30m, max 5 retries), dead-letter queue for undeliverable notifications (PostgreSQL `notification_dlq` table), notification history persistence |
| Dependencies | Redis (`dcms.alerts` subscription, dedup keys), PostgreSQL (channel config, notification history, DLQ), external: Slack API, SMTP relay, webhook URLs |
| Scaling | Horizontal. Redis dedup prevents storm amplification on multi-replica deploy. Replica count: 2 minimum. |

### 1.11 web-ui

| Attribute | Detail |
|---|---|
| Domain | Browser-based management dashboard (frontend — listed for completeness) |
| Technology | React 18 + TypeScript 5.4 + Vite 5 + TailwindCSS 3.4; served by Nginx 1.25 |
| Port | 80 (Nginx, production); 3000 (Vite dev server) |
| Key Endpoints | Static SPA assets; Nginx proxies `/api/` to api-gateway; Nginx proxies `/events` SSE endpoint to api-gateway |
| Responsibilities | Browser UI for all DCMS operations; consumes REST and SSE endpoints via api-gateway; no direct backend calls |
| Dependencies | api-gateway (all data access) |
| Scaling | Stateless static. CDN-cacheable assets. Nginx gzip. Scale by adding Nginx replicas behind load balancer. |

### 1.12 agent

| Attribute | Detail |
|---|---|
| Domain | Per-host Docker Engine proxy |
| Technology | Go 1.22 static binary; gRPC 1.64 server; Moby SDK 26.1; mTLS cert from Vault PKI |
| Port | 9090 (gRPC, mTLS) |
| Key Endpoints | gRPC RPCs: `StartContainer`, `StopContainer`, `PauseContainer`, `RestartContainer`, `RemoveContainer`, `ExecCommand`, `GetContainerStats`, `StreamContainerLogs`, `ListContainers`, `HealthCheck` |
| Responsibilities | Receive and execute container lifecycle commands from container-service via gRPC/mTLS, translate commands to Moby SDK calls against local Docker daemon (Unix socket `/var/run/docker.sock`), stream container stats and logs back to monitor-service and log-service, emit heartbeat every 30s to cluster-service via gRPC `Heartbeat` RPC, enforce resource limits from ContainerSpec, maintain local log buffer (up to 1 hour) when log-service is unreachable |
| Dependencies | Docker daemon (Unix socket), Vault (mTLS certificate and key, renewed every 30 days with 7-day overlap), Redis (not direct; agent is downstream of container-service) |
| Scaling | One per Docker host. Vertically sized. Target: 500 containers/host at < 2% CPU overhead. Not horizontally scaled. |

---

## 2. Internal Service Communication Patterns

### 2.1 Pattern Overview

DCMS uses three communication patterns determined by latency, consistency, and coupling requirements:

```
Pattern        | Transport         | Use Cases                              | Coupling
---------------|-------------------|----------------------------------------|----------
Synchronous    | REST/HTTP + JSON  | CRUD operations, queries, introspection | Tight (caller waits)
Async Events   | Redis pub/sub     | State change propagation, SSE fan-out  | Loose (fire-and-forget)
Binary RPC     | gRPC + mTLS       | Agent lifecycle commands, streaming    | Tight (deadline-bound)
```

### 2.2 REST (Synchronous, Service-to-Service)

Used for: api-gateway → downstream services (proxied user requests), container-service → image-service (image availability check, CTR-008), api-gateway → auth-service (token introspection, CTR-002).

All internal REST calls:
- Use HTTP/1.1 keep-alive connection pools (per-service, min 5 idle, max 20 connections).
- Carry `X-Request-ID` header propagated from api-gateway for trace correlation.
- Carry `X-Org-ID` header extracted from decoded JWT claims by api-gateway.
- Use the standard error envelope defined in CTR-001 (§3.1 of cross_domain_contracts.md).
- Are subject to a circuit breaker (see §7.1).

Internal service DNS addresses follow Docker Swarm service DNS: `http://container-service:8082`, `http://auth-service:8081`, etc.

### 2.3 Redis Pub/Sub (Asynchronous Events)

Used for: container-service → Redis `dcms.container.events` → api-gateway SSE fan-out and monitor-service projections; monitor-service → Redis `dcms.alerts` → notification-service.

Channel definitions (from CTR-007):

| Channel | Producer | Consumers | Event Types |
|---|---|---|---|
| `dcms.container.events` | container-service | api-gateway (SSE), monitor-service (projections) | `CONTAINER_CREATED`, `CONTAINER_STARTED`, `CONTAINER_STOPPED`, `CONTAINER_PAUSED`, `CONTAINER_RESUMED`, `CONTAINER_REMOVED`, `CONTAINER_FAILED`, `CONTAINER_OOM_KILLED`, `CONTAINER_HEALTH_CHANGED` |
| `dcms.alerts` | monitor-service | notification-service, api-gateway (SSE) | `ALERT_FIRED`, `ALERT_RESOLVED` |
| `dcms.host.events` | cluster-service | api-gateway (SSE), monitor-service | `HOST_ONLINE`, `HOST_OFFLINE`, `HOST_DEGRADED` |

Event payload schema (canonical, from CTR-007):

```json
{
  "event_type": "CONTAINER_STARTED",
  "entity_id": "abc123def456",
  "org_id": "org_01J4XYZQ0000000000000002",
  "host": "worker-node-03",
  "payload": {},
  "timestamp": "2026-06-05T14:32:00.000Z",
  "schema_version": "1"
}
```

Delivery guarantee: Redis pub/sub is at-most-once. For events that must not be lost (alert fires, container state transitions), the producing service also persists the event to PostgreSQL before publishing to Redis. Consumers that need reliability read from PostgreSQL on reconnect rather than relying solely on the missed pub/sub message.

### 2.4 gRPC (Binary RPC, Agent Communication)

Used exclusively for: container-service → agent, log-service → agent, monitor-service → agent.

Transport: gRPC over TLS 1.3 with mutual authentication (mTLS). Client certificate issued by Vault PKI engine with 30-day TTL. Both parties support a 7-day cert overlap for zero-downtime rotation.

Proto source of truth: `proto/agent/v1/agent.proto` (CTR-003). Key service definition:

```protobuf
service AgentService {
  rpc StartContainer    (ContainerSpec)    returns (ContainerResponse);
  rpc StopContainer     (ContainerRef)     returns (OperationResult);
  rpc PauseContainer    (ContainerRef)     returns (OperationResult);
  rpc RestartContainer  (ContainerRef)     returns (OperationResult);
  rpc RemoveContainer   (ContainerRef)     returns (OperationResult);
  rpc ExecCommand       (ExecRequest)      returns (stream ExecOutput);
  rpc GetContainerStats (ContainerRef)     returns (ContainerStats);
  rpc StreamContainerLogs (LogRequest)    returns (stream LogLine);
  rpc ListContainers    (ListRequest)      returns (ContainerList);
  rpc Heartbeat         (HeartbeatRequest) returns (HeartbeatResponse);
  rpc HealthCheck       (HealthRequest)    returns (HealthResponse);
}
```

gRPC deadlines (enforced by container-service client):
- Lifecycle RPCs (`StartContainer`, `StopContainer`, etc.): 30s
- `GetContainerStats`: 5s
- `ExecCommand`: configurable per-request, default 300s
- `StreamContainerLogs`: connection held until client cancels
- `Heartbeat`: 5s
- `HealthCheck`: 3s

Connection management: container-service maintains one persistent gRPC connection per registered host. Connections are established lazily on first command and maintained with keepalive pings (every 60s, timeout 10s). Failed connections trigger circuit breaker (see §7.1).

---

## 3. Authentication and Authorization Flow

### 3.1 JWT Issuance (auth-service)

```
Client                    api-gateway              auth-service           PostgreSQL / Redis
  │                           │                         │                       │
  │  POST /auth/login         │                         │                       │
  │  {email, password}        │                         │                       │
  ├──────────────────────────►│                         │                       │
  │                           │  POST /auth/login       │                       │
  │                           │  (proxied)              │                       │
  │                           ├────────────────────────►│                       │
  │                           │                         │  SELECT user WHERE    │
  │                           │                         │  email = ?            │
  │                           │                         ├──────────────────────►│
  │                           │                         │◄──────────────────────┤
  │                           │                         │  bcrypt.CompareHash() │
  │                           │                         │  Check lockout counter│
  │                           │                         │  (Redis)              │
  │                           │                         │                       │
  │                           │                         │  Issue JWT (RS256):   │
  │                           │                         │  access_token (1h)    │
  │                           │                         │  refresh_token (24h)  │
  │                           │                         │                       │
  │                           │  200 {access_token,     │                       │
  │                           │       refresh_token}    │                       │
  │                           │◄────────────────────────┤                       │
  │  200 {access_token,       │                         │                       │
  │       refresh_token}      │                         │                       │
  │◄──────────────────────────┤                         │                       │
```

JWT payload (RS256, signed with Vault-managed RSA-2048 key):

```json
{
  "iss": "https://auth.dcms.example.com",
  "sub": "usr_01J4XYZQ0000000000000000",
  "aud": ["dcms-api"],
  "exp": 1780003600,
  "iat": 1780000000,
  "jti": "01J4XYZQ0000000000000001",
  "https://dcms.io/roles": ["operator"],
  "https://dcms.io/org_id": "org_01J4XYZQ0000000000000002",
  "https://dcms.io/plan": "enterprise"
}
```

### 3.2 Kong JWT Validation Plugin

Kong Gateway validates the JWT signature on every inbound request using the JWKS endpoint published by auth-service at `/.well-known/jwks.json`. JWKS is cached in Kong's in-memory store with a 5-minute TTL.

Kong plugin pipeline per request:
1. `rate-limiting` plugin: check and increment rate-limit counter in Redis (1000 req/min per org, 100 req/min per user by default).
2. `jwt` plugin: verify JWT signature against cached JWKS. If signature invalid or token expired → reject with HTTP 401 before routing.
3. `request-transformer` plugin: extract JWT claims (`sub`, `org_id`, `roles`) and inject as headers (`X-User-ID`, `X-Org-ID`, `X-User-Roles`) for downstream services.
4. `request-id` plugin: inject `X-Request-ID` (ULID) if not already present.
5. Route to upstream service.

### 3.3 RBAC Enforcement in Downstream Services

Each downstream service receives decoded claims in HTTP headers injected by Kong. Services do not re-validate the JWT signature; they trust the `X-User-Roles` header (Kong is the trust boundary within the internal network).

RBAC role-to-permission matrix:

| Permission | admin | operator | viewer |
|---|---|---|---|
| `containers:read` | Y | Y | Y |
| `containers:write` | Y | Y | N |
| `containers:delete` | Y | Y | N |
| `containers:exec` | Y | Y | N |
| `images:read` | Y | Y | Y |
| `images:write` | Y | Y | N |
| `images:delete` | Y | N | N |
| `networks:read` | Y | Y | Y |
| `networks:write` | Y | Y | N |
| `volumes:read` | Y | Y | Y |
| `volumes:write` | Y | Y | N |
| `clusters:read` | Y | Y | Y |
| `clusters:manage` | Y | N | N |
| `users:read` | Y | N | N |
| `users:write` | Y | N | N |
| `alerts:read` | Y | Y | Y |
| `alerts:manage` | Y | Y | N |

Permission check is applied by a Go middleware function `RequirePermission(perm string)` registered per route group.

### 3.4 Token Refresh and Revocation

Refresh: `POST /auth/refresh` accepts the refresh token (HttpOnly cookie or Authorization header), validates it against a Redis-backed refresh token store (key: `dcms:auth:refresh:{jti}`, TTL = token exp), and issues a new access token + rotated refresh token.

Revocation: `POST /auth/logout` adds the access token `jti` to a Redis blacklist (`dcms:auth:blacklist:{jti}`, TTL = remaining token exp). Kong's `jwt` plugin checks this blacklist via a custom Lua plugin hook on every request. Refresh token is deleted from the Redis store.

API key authentication: API keys are hashed (SHA-256) and stored in PostgreSQL `auth_svc.api_keys`. On each request, Kong's `key-auth` plugin extracts the API key, hashes it, and looks up the hash in Redis (cache TTL 60s, fallback to PostgreSQL). API keys carry embedded permissions and org_id in their PostgreSQL record.

---

## 4. Container Lifecycle State Machine

### 4.1 States

| State | Description | Persisted In |
|---|---|---|
| `PENDING` | Container spec accepted; awaiting agent acknowledgment | PostgreSQL |
| `CREATING` | Agent received spec; Docker daemon is setting up the container | PostgreSQL |
| `CREATED` | Container created in Docker; not yet started | PostgreSQL + Redis CQRS projection |
| `STARTING` | Container start command dispatched; awaiting running confirmation | PostgreSQL |
| `RUNNING` | Container process is executing; health checks passing | PostgreSQL + Redis |
| `UNHEALTHY` | Container running but Docker health check failing | PostgreSQL + Redis |
| `PAUSED` | Container process frozen (SIGSTOP equivalent) | PostgreSQL + Redis |
| `STOPPING` | Container stop command dispatched; graceful shutdown in progress | PostgreSQL |
| `STOPPED` | Container process exited with code 0 or non-zero | PostgreSQL + Redis |
| `RESTARTING` | Container is restarting per restart policy | PostgreSQL |
| `REMOVING` | Delete command received; container being removed from Docker | PostgreSQL |
| `REMOVED` | Container fully removed from Docker | PostgreSQL (tombstone record) |
| `DEAD` | Container in an unrecoverable error state (OOM killed with no restart, image pull failure, runtime error) | PostgreSQL + Redis |
| `FAILED` | DCMS-level failure (agent unreachable, gRPC timeout) | PostgreSQL |
| `IMAGE_PULL_ERROR` | Image could not be pulled during start | PostgreSQL |

### 4.2 State Transition Diagram

```
                                        ┌────────────────┐
                                        │    PENDING      │
                                        └───────┬────────┘
                                                │ agent ack received
                                                ▼
                                        ┌────────────────┐
                              ┌─────────│    CREATING     │─────────────┐
                              │         └───────┬────────┘             │
                              │                 │ docker create success │ docker create fail
                              │                 ▼                       ▼
                              │         ┌────────────────┐     ┌──────────────────┐
                              │         │    CREATED      │     │IMAGE_PULL_ERROR  │
                              │         └───────┬────────┘     │    / FAILED       │
                              │                 │ start cmd     └──────────────────┘
                              │                 ▼
                              │         ┌────────────────┐
                              │         │   STARTING      │
                              │         └───────┬────────┘
                              │                 │ process started
                              │                 ▼
   ┌─ pause ──────────────────┤         ┌────────────────┐
   │                          │◄── unpause ─── │    RUNNING     │◄─── restart complete ───┐
   ▼                          │         └───────┬────────┘                                │
┌──────────┐                  │                 │                                          │
│  PAUSED  │                  │         ┌───────┴────────┐                                │
└──────────┘                  │         │                │                                 │
                              │    health fail     stop cmd                                │
                              │         │                │                                 │
                              │         ▼                ▼                                 │
                              │  ┌───────────┐  ┌────────────────┐                        │
                              │  │ UNHEALTHY │  │   STOPPING      │                        │
                              │  └───────────┘  └───────┬────────┘                        │
                              │         │                │ process exited                  │
                              │  health OK              ▼                                  │
                              │         └──────► ┌────────────────┐   restart policy      │
                              │                  │    STOPPED      │──────────────────────►│
                              │                  └───────┬────────┘                       │
                              │                          │ delete cmd              ┌────────────────┐
                              │                          ▼                         │  RESTARTING    │
                              │                  ┌────────────────┐               └────────────────┘
                              │                  │   REMOVING     │
                              │                  └───────┬────────┘
                              │                          │ remove complete
                              │                          ▼
                              │                  ┌────────────────┐
                              │                  │    REMOVED     │
                              │                  └────────────────┘
                              │
                    OOM kill / fatal error
                              │
                              ▼
                      ┌──────────┐
                      │   DEAD   │
                      └──────────┘
```

### 4.3 Events Emitted per Transition

| Transition | Redis Event Published | PostgreSQL Update |
|---|---|---|
| PENDING → CREATING | `CONTAINER_CREATED` | state = CREATING |
| CREATING → CREATED | — (internal) | state = CREATED |
| STARTING → RUNNING | `CONTAINER_STARTED` | state = RUNNING, started_at |
| RUNNING → PAUSED | `CONTAINER_PAUSED` | state = PAUSED, paused_at |
| PAUSED → RUNNING | `CONTAINER_RESUMED` | state = RUNNING |
| RUNNING → STOPPING | — (internal) | state = STOPPING |
| STOPPING → STOPPED | `CONTAINER_STOPPED` | state = STOPPED, stopped_at, exit_code |
| RUNNING → RESTARTING | — (internal) | state = RESTARTING |
| RUNNING → DEAD | `CONTAINER_OOM_KILLED` or `CONTAINER_FAILED` | state = DEAD, error_msg |
| any → FAILED | `CONTAINER_FAILED` | state = FAILED, error_msg |
| any → REMOVING | — (internal) | state = REMOVING |
| REMOVING → REMOVED | `CONTAINER_REMOVED` | state = REMOVED, removed_at |
| RUNNING health fail | `CONTAINER_HEALTH_CHANGED` {status: unhealthy} | state = UNHEALTHY |

All Redis events use channel `dcms.container.events` with schema_version "1" as defined in CTR-007.

---

## 5. CQRS Pattern for Container State

### 5.1 Rationale

Container state is read far more frequently than it is written. The management dashboard polls or subscribes to status for hundreds of containers simultaneously. Writing through the same PostgreSQL row on every read would create lock contention and unnecessary load on the primary database. CQRS separates the write path (mutation through commands) from the read path (queries served from a Redis projection).

### 5.2 Write Path

```
HTTP Request (POST /containers/{id}/start)
    │
    ▼
container-service (HTTP handler)
    │  Validate JWT claims (X-User-Roles header)
    │  Check idempotency key (Redis dcms:container:idem:{key})
    │
    ▼
PostgreSQL WRITE (primary)
    │  UPDATE container_svc.containers SET state='STARTING' WHERE id=?
    │  (ACID transaction — guarantees durability before agent call)
    │
    ▼
agent gRPC call: StartContainer(ContainerSpec)  [mTLS, 30s deadline]
    │
    ▼
Docker Engine executes
    │
    ▼
agent returns ContainerResponse{status: RUNNING, container_id, started_at}
    │
    ▼
container-service
    │  UPDATE containers SET state='RUNNING', started_at=? (PostgreSQL WRITE)
    │  PUBLISH to Redis dcms.container.events: {CONTAINER_STARTED, ...}
    │
    ▼
Redis pub/sub fan-out
    ├── api-gateway: SSE frame to subscribed browser clients
    └── monitor-service: update CQRS read projection
```

Idempotency enforcement: container-service checks for a Redis key `dcms:container:idem:{idempotency_key}` (TTL 24h) before dispatching to the agent. If the key exists, the previous result is returned immediately without replaying the operation.

### 5.3 Read Path

```
HTTP Request (GET /containers or GET /containers/{id})
    │
    ▼
container-service (HTTP handler)
    │
    ├── [Cache HIT] Redis GET dcms:container:status:{org_id}:{id}
    │       │ TTL 30s; returns projected state JSON
    │       └── Return 200 with cached projection (< 2ms p99)
    │
    └── [Cache MISS] PostgreSQL READ (replica preferred)
            │  SELECT * FROM container_svc.containers WHERE id=? AND org_id=?
            └── Write result to Redis (TTL 30s)
                Return 200
```

List endpoint `GET /containers` uses a Redis hash `dcms:container:list:{org_id}` (set by monitor-service after each container event) for O(1) list retrieval. The hash stores a compact container summary JSON per container_id field. Cache is invalidated and rebuilt by monitor-service whenever a `CONTAINER_*` event arrives on `dcms.container.events`.

### 5.4 CQRS Read Model Structure in Redis

| Key Pattern | Type | TTL | Owner (Writer) | Consumers |
|---|---|---|---|---|
| `dcms:container:status:{org_id}:{id}` | String (JSON) | 30s | monitor-service, container-service | container-service read path |
| `dcms:container:list:{org_id}` | Hash (field=container_id, value=summary JSON) | 60s | monitor-service | container-service GET /containers |
| `dcms:host:status:{host_id}` | String (JSON) | 30s | cluster-service | cluster-service, api-gateway |
| `dcms:image:available:{image_id}` | String (JSON) | 300s | image-service | container-service (CTR-008) |
| `dcms:auth:rbac:{sub}:{resource}` | String (decision) | 60s | auth-service | api-gateway introspection fast-path |

### 5.5 PostgreSQL CQRS Event Log

For audit and replay purposes, every state transition is written to `container_svc.container_events` table before the Redis publish:

```sql
CREATE TABLE container_svc.container_events (
    id            BIGSERIAL PRIMARY KEY,
    container_id  UUID NOT NULL,
    org_id        UUID NOT NULL,
    event_type    VARCHAR(64) NOT NULL,
    from_state    VARCHAR(32),
    to_state      VARCHAR(32) NOT NULL,
    payload       JSONB,
    actor_id      UUID,          -- user or system that triggered the transition
    host          VARCHAR(253),
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    schema_version SMALLINT NOT NULL DEFAULT 1
);
CREATE INDEX idx_container_events_container_id ON container_svc.container_events(container_id, occurred_at DESC);
CREATE INDEX idx_container_events_org_id       ON container_svc.container_events(org_id, occurred_at DESC);
```

On monitor-service startup (or after Redis flush), read projections are rebuilt by replaying the event log for each container since last known good state.

---

## 6. Agent Architecture

### 6.1 Overview

The agent is a single statically compiled Go binary (`dcms-agent`) deployed on every Docker host. It bridges DCMS services and the local Docker Engine, acting as an authenticated proxy and metrics/log emitter.

```
container-service (gRPC client, mTLS) ───────────────────────────────────────────────────┐
log-service       (gRPC client, mTLS) ──────────────┐                                    │
monitor-service   (gRPC client, mTLS) ──────────────┤                                    │
cluster-service   (heartbeat caller)  ──────────────┤                                    │
                                                     │                                    │
                                            ┌────────▼────────────────────────────────┐  │
                                            │  dcms-agent  :9090  (gRPC server)       │  │
                                            │                                          │  │
                                            │  ┌─────────────────────────────────┐   │  │
                                            │  │  gRPC Handler Layer              │   │  │
                                            │  │  AgentService implementation     │   │  │
                                            │  └───────────┬─────────────────────┘   │  │
                                            │              │                           │  │
                                            │  ┌───────────▼─────────────────────┐   │  │
                                            │  │  Command Executor                │   │  │
                                            │  │  Translates ContainerSpec →      │   │  │
                                            │  │  docker.ContainerCreate config   │   │  │
                                            │  └───────────┬─────────────────────┘   │  │
                                            │              │                           │  │
                                            │  ┌───────────▼─────────────────────┐   │  │
                                            │  │  Moby SDK Client                 │   │  │
                                            │  │  (Unix socket /var/run/docker.sock│  │  │
                                            │  │   or TCP :2376 with TLS)         │   │  │
                                            │  └───────────┬─────────────────────┘   │  │
                                            │              │                           │  │
                                            │  ┌───────────▼─────────────────────┐   │  │
                                            │  │  Local Log Buffer                │   │  │
                                            │  │  (ring buffer, up to 1 hour)     │   │  │
                                            │  │  Flush on log-service reconnect  │   │  │
                                            │  └─────────────────────────────────┘   │  │
                                            │                                          │  │
                                            │  ┌─────────────────────────────────┐   │  │
                                            │  │  Heartbeat Goroutine             │   │  │
                                            │  │  Tick: 30s                       │   │  │
                                            │  │  Calls cluster-service gRPC      │   │  │
                                            │  │  Heartbeat(host_id, container_ct)│   │  │
                                            │  └─────────────────────────────────┘   │  │
                                            └─────────────────────────────────────────┘  │
                                                         │                                │
                                            ┌────────────▼────────────────────────────┐  │
                                            │  Docker Engine (dockerd)                 │  │
                                            │  Unix socket /var/run/docker.sock        │  │
                                            └─────────────────────────────────────────┘  │
                                                                                          │
                                            ┌─────────────────────────────────────────┐  │
                                            │  Vault Agent Sidecar                    │◄─┘
                                            │  Renews mTLS cert/key every 30 days     │
                                            │  Writes to /etc/dcms-agent/tls/         │
                                            │  Signals agent to reload cert (SIGHUP)  │
                                            └─────────────────────────────────────────┘
```

### 6.2 gRPC Server Configuration

```go
// TLS configuration for agent gRPC server
tlsConfig := &tls.Config{
    ClientAuth:   tls.RequireAndVerifyClientCert,
    ClientCAs:    vaultIssuedCACertPool,
    Certificates: []tls.Certificate{agentCert},
    MinVersion:   tls.VersionTLS13,
}

grpcServer := grpc.NewServer(
    grpc.Creds(credentials.NewTLS(tlsConfig)),
    grpc.KeepaliveParams(keepalive.ServerParameters{
        MaxConnectionIdle:     5 * time.Minute,
        MaxConnectionAge:      30 * time.Minute,
        MaxConnectionAgeGrace: 5 * time.Second,
        Time:                  60 * time.Second,
        Timeout:               10 * time.Second,
    }),
    grpc.MaxRecvMsgSize(4 * 1024 * 1024),  // 4 MB max incoming message
    grpc.ChainUnaryInterceptor(
        loggingInterceptor,
        recoveryInterceptor,
        metricsInterceptor,
    ),
    grpc.ChainStreamInterceptor(
        streamLoggingInterceptor,
        streamRecoveryInterceptor,
    ),
)
```

### 6.3 Heartbeat Protocol

The agent sends a `Heartbeat` gRPC call to cluster-service every 30 seconds:

```protobuf
message HeartbeatRequest {
  string host_id          = 1;
  string agent_version    = 2;
  int32  container_count  = 3;
  double cpu_percent      = 4;
  uint64 memory_available = 5;
  google.protobuf.Timestamp agent_time = 6;
}

message HeartbeatResponse {
  bool   accepted     = 1;
  string instructions = 2;  // e.g., "drain", "normal"
}
```

cluster-service writes the heartbeat timestamp to Redis (`dcms:agent:heartbeat:{host_id}`, TTL 45s). If the key expires (3 missed heartbeats at 30s interval = 90s, but sentinel TTL is set to 45s to account for clock drift), cluster-service marks the host as `UNREACHABLE` in PostgreSQL and publishes `HOST_OFFLINE` to `dcms.host.events`.

### 6.4 mTLS Certificate Lifecycle

- Vault PKI engine issues certificates with `ttl=30d` and `max_ttl=31d`.
- Vault Agent sidecar runs on the host and renews the cert when `ttl_remaining < 7d`.
- On renewal, Vault Agent writes new `cert.pem` and `key.pem` to `/etc/dcms-agent/tls/`.
- Vault Agent sends `SIGHUP` to the agent process; agent hot-reloads TLS credentials without dropping existing gRPC connections.
- container-service (gRPC client) also rotates its client cert via Vault Agent on the same schedule.
- Both parties maintain old cert validity for 7 days (Vault `early_renewal_hours=168`) to allow staggered rotation with zero-downtime.

### 6.5 Agent Resource Constraints

- Max CPU: 200m (target < 2% of host CPU at 500 containers)
- Max memory: 128 MiB RSS
- Log buffer: ring buffer of 100,000 log lines (~50 MB worst case at 500 bytes/line); oldest lines evicted when full
- gRPC server: max 100 concurrent RPCs (configurable via `DCMS_AGENT_MAX_CONCURRENT_RPCS`)
- Docker socket read timeout: 30s for blocking calls, 5s for non-blocking inspection calls

---

## 7. Error Handling Patterns

### 7.1 Circuit Breaker (Agent gRPC Calls)

container-service uses a per-host circuit breaker for gRPC calls to each agent. Implementation: `gobreaker` library wrapping each gRPC dial-per-host.

```
States:   CLOSED → (5 consecutive failures in 30s) → OPEN
          OPEN → (60s cooldown) → HALF-OPEN
          HALF-OPEN → (1 success probe) → CLOSED
          HALF-OPEN → (1 failure) → OPEN

On OPEN state:
  - container-service returns HTTP 503 immediately (no gRPC call attempted)
  - container state is set to FAILED in PostgreSQL
  - CONTAINER_FAILED event published to Redis
  - monitor-service alert fires: "Agent unreachable on host {host_id}"
  - Ops team is notified via notification-service

On CLOSED state recovery:
  - Pending container operations replay from PostgreSQL PENDING queue
  - State reconciliation: agent is queried for actual container states via ListContainers RPC
```

### 7.2 Retry with Exponential Backoff

Applied to: internal REST calls between services, PostgreSQL connection acquisition after failover, Redis connection re-establishment.

Policy:

```
MaxAttempts : 3
BaseDelay   : 100ms
MaxDelay    : 5s
Multiplier  : 2.0
Jitter      : ±25% random jitter on each backoff duration
RetryOn     : network errors, HTTP 502/503/504, gRPC UNAVAILABLE/DEADLINE_EXCEEDED
DoNotRetry  : HTTP 400/401/403/404/409/422, gRPC INVALID_ARGUMENT/NOT_FOUND/PERMISSION_DENIED
```

Retry budget: each service limits concurrent retry goroutines to prevent retry storms. Budget = min(10, 20% of current RPS).

### 7.3 Dead Letter Queue (Notifications)

notification-service writes failed notification attempts to the `notification_svc.notification_dlq` table when all 5 retry attempts are exhausted:

```sql
CREATE TABLE notification_svc.notification_dlq (
    id              BIGSERIAL PRIMARY KEY,
    alert_event     JSONB NOT NULL,
    channel_id      UUID NOT NULL,
    channel_type    VARCHAR(32) NOT NULL,  -- slack, email, webhook
    last_error      TEXT,
    attempt_count   SMALLINT NOT NULL,
    first_failed_at TIMESTAMPTZ NOT NULL,
    last_failed_at  TIMESTAMPTZ NOT NULL
);
```

A daily background job (notification-service goroutine, runs at 02:00 UTC) scans the DLQ for entries older than 7 days and archives them to `notification_svc.notification_dlq_archive`. Alerts are raised if DLQ size > 100 entries.

### 7.4 Graceful Degradation

| Dependency | Degraded Mode | Impact |
|---|---|---|
| Redis unavailable | Container operations continue via PostgreSQL direct reads; SSE updates stop; rate limiting bypassed with warning log | Dashboard shows stale data; real-time updates paused |
| Loki unavailable | agent buffers logs locally (ring buffer); log-service holds push queue in memory (max 10,000 lines); flush on reconnect | Log tail in UI shows "Log service degraded" |
| image-service unavailable (CTR-008) | container-service allows deployment with `scan_status=unknown` and warning annotation; no deployment block | Images deployed without scan confirmation |
| monitor-service unavailable | Container operations proceed; alert evaluation pauses; CQRS projections stale | Dashboard metrics stale; no new alerts fired |
| auth-service unavailable (JWKS endpoint) | api-gateway serves cached JWKS for up to 5 minutes; after TTL expiry, new token validations fail with 503 | No new logins; existing valid tokens honored up to JWKS cache expiry |

### 7.5 Panic Recovery

All Gin HTTP handlers are wrapped with `gin.Recovery()` middleware, which converts panics to HTTP 500 responses and logs the stack trace via the structured logger. gRPC handlers are wrapped with `grpc_recovery` interceptor using the same log-and-return-INTERNAL pattern.

Panics are counted as Prometheus metrics (`dcms_panic_total{service,handler}`) and alert if count > 0 in any 5-minute window.

---

## 8. Middleware Chain

### 8.1 Kong (External Layer, Applies to All Inbound Traffic)

Order of plugin execution per Kong route:

```
1. ip-restriction         (allowlist for admin routes; bypass for public /health)
2. rate-limiting          (1000 req/min per org_id claim; 100 req/min per sub claim; counters in Redis)
3. jwt                    (RS256 signature verification via cached JWKS; rejects expired/invalid tokens)
4. key-auth               (API key alternative to JWT; checked after jwt plugin; mutual exclusive)
5. request-transformer    (inject X-User-ID, X-Org-ID, X-User-Roles from decoded JWT claims)
6. request-id             (inject X-Request-ID: ULID if absent)
7. response-transformer   (inject security headers: HSTS, X-Frame-Options, CSP, X-Content-Type-Options)
8. proxy                  (route to upstream Go service)
```

### 8.2 Go Gin Middleware Chain (Applies Inside Each Service)

Registered globally on the Gin engine, in execution order:

```go
engine.Use(
    middleware.RequestID(),          // propagate X-Request-ID or generate if absent
    middleware.StructuredLogger(),   // JSON log: method, path, status, latency, request_id, user_id, org_id
    middleware.Recovery(),           // panic → 500 + stack trace log
    middleware.OtelTracing(),        // OpenTelemetry trace context extraction + span creation
    middleware.Prometheus(),         // per-route request count, latency histogram (dcms_http_request_duration_seconds)
    middleware.ResponseTime(),       // inject X-Response-Time header
    middleware.Timeout(30*time.Second), // abort request if handler exceeds 30s
)
```

Route-group-level middleware (applied per resource group):

```go
containers := engine.Group("/containers")
containers.Use(
    middleware.RequireAuth(),              // validate X-User-ID, X-Org-ID presence (set by Kong)
    middleware.RequirePermission("containers:read"),  // applied to GET routes
)
// Write routes additionally apply:
containers.Use(middleware.RequirePermission("containers:write"))  // POST, PUT, PATCH
```

### 8.3 Structured Log Format

All services emit JSON logs to stdout (NFR-O-005):

```json
{
  "timestamp": "2026-06-05T14:32:00.123Z",
  "level": "INFO",
  "service": "container-service",
  "trace_id": "01J4XYZQ0000000000000000",
  "span_id":  "abcdef1234567890",
  "request_id": "01J4XYZQ0000000000000001",
  "method": "POST",
  "path": "/containers",
  "status": 201,
  "latency_ms": 87,
  "user_id": "usr_01J4XYZQ0000000000000000",
  "org_id": "org_01J4XYZQ0000000000000002",
  "msg": "container created"
}
```

Log levels controlled by `LOG_LEVEL` environment variable (DEBUG, INFO, WARN, ERROR). Defaults to INFO in production. All WARN/ERROR logs also increment the `dcms_log_total{level="error"}` Prometheus counter, enabling alert-on-error-rate.

---

## 9. Configuration Management

### 9.1 Environment Variable Conventions

All services follow 12-factor app principles (NFR-M-010). Every configuration value is sourced from environment variables. No hardcoded config in application code.

Naming convention: `DCMS_{SERVICE}_{PARAMETER}` in SCREAMING_SNAKE_CASE.

Common variables across all services:

| Variable | Example Value | Description |
|---|---|---|
| `DCMS_ENV` | `production` | Environment name (development/staging/production) |
| `DCMS_LOG_LEVEL` | `INFO` | Log verbosity |
| `DCMS_PORT` | `8082` | HTTP listen port |
| `DCMS_DB_DSN` | `postgres://user:${PG_PASS}@pgbouncer:5432/dcms?sslmode=require` | PostgreSQL DSN (password from Vault) |
| `DCMS_REDIS_ADDR` | `redis-sentinel:26379` | Redis Sentinel address |
| `DCMS_REDIS_MASTER_NAME` | `dcms-master` | Redis Sentinel master name |
| `DCMS_OTEL_ENDPOINT` | `http://jaeger:4317` | OpenTelemetry OTLP gRPC endpoint |
| `DCMS_VAULT_ADDR` | `https://vault:8200` | HashiCorp Vault address |
| `DCMS_VAULT_ROLE` | `container-service` | Vault AppRole role name |

Service-specific variables (examples):

```bash
# container-service
DCMS_CONTAINER_AGENT_DIAL_TIMEOUT=10s
DCMS_CONTAINER_GRPC_DEADLINE=30s
DCMS_CONTAINER_CIRCUIT_BREAKER_THRESHOLD=5
DCMS_CONTAINER_CIRCUIT_BREAKER_TIMEOUT=60s

# auth-service
DCMS_AUTH_JWT_ISSUER=https://auth.dcms.example.com
DCMS_AUTH_JWT_ACCESS_TTL=3600s
DCMS_AUTH_JWT_REFRESH_TTL=86400s
DCMS_AUTH_LOCKOUT_THRESHOLD=5
DCMS_AUTH_LOCKOUT_DURATION=1800s

# agent
DCMS_AGENT_HOST_ID=worker-node-03
DCMS_AGENT_DOCKER_SOCKET=/var/run/docker.sock
DCMS_AGENT_TLS_CERT_PATH=/etc/dcms-agent/tls/cert.pem
DCMS_AGENT_TLS_KEY_PATH=/etc/dcms-agent/tls/key.pem
DCMS_AGENT_TLS_CA_PATH=/etc/dcms-agent/tls/ca.pem
DCMS_AGENT_HEARTBEAT_INTERVAL=30s
DCMS_AGENT_LOG_BUFFER_SIZE=100000
```

### 9.2 Vault Secrets Integration

Secrets are never stored in environment variables directly. Instead, Vault Agent injects secrets into environment at container start time or writes them to a tmpfs-mounted file.

Vault paths used by DCMS:

| Service | Vault Path | Secret Type |
|---|---|---|
| All services | `secret/dcms/{env}/{service}/db-password` | Dynamic PostgreSQL credential (TTL 1h) |
| auth-service | `pki/issue/auth-service` | JWT signing RSA key pair |
| container-service | `pki/issue/container-service-grpc` | mTLS client cert/key for agent gRPC |
| agent | `pki/issue/agent/{host_id}` | mTLS server cert/key |
| image-service | `secret/dcms/{env}/registry-credentials` | Docker registry passwords (AES-256 encrypted) |
| notification-service | `secret/dcms/{env}/notification/slack-webhook-url` | Slack API webhook URL |
| notification-service | `secret/dcms/{env}/notification/smtp-password` | SMTP relay password |

Vault authentication: all services use the AppRole auth method. The `role_id` is baked into the Docker image at build time (non-secret); the `secret_id` is injected by the Swarm secrets mechanism at runtime.

### 9.3 Per-Environment Configuration

Docker Swarm uses separate Docker configs and secrets per stack:

```
dcms-dev/    → .env.dev    → DCMS_ENV=development, DCMS_LOG_LEVEL=DEBUG
dcms-staging/→ .env.staging→ DCMS_ENV=staging,     DCMS_LOG_LEVEL=INFO
dcms-prod/   → .env.prod   → DCMS_ENV=production,  DCMS_LOG_LEVEL=WARN
```

Feature flags are stored in PostgreSQL `config_svc.feature_flags` table and cached in Redis (TTL 60s). Services read flags via a shared `featureflag` Go package that handles cache population and fallback.

---

## 10. Service Mesh and Internal DNS

### 10.1 Docker Swarm Service Discovery

DCMS relies on Docker Swarm's built-in service DNS for internal service-to-service communication. No external service mesh (Istio, Linkerd) is used in v1; the overhead and complexity are deferred to a future Kubernetes migration.

Each Swarm service is addressable by its service name on the `dcms-internal` overlay network:

| Service Name | Internal DNS FQDN | Protocol |
|---|---|---|
| api-gateway | `api-gateway.dcms-internal` | HTTP |
| auth-service | `auth-service.dcms-internal` | HTTP |
| container-service | `container-service.dcms-internal` | HTTP |
| image-service | `image-service.dcms-internal` | HTTP |
| network-service | `network-service.dcms-internal` | HTTP |
| volume-service | `volume-service.dcms-internal` | HTTP |
| monitor-service | `monitor-service.dcms-internal` | HTTP |
| log-service | `log-service.dcms-internal` | HTTP |
| cluster-service | `cluster-service.dcms-internal` | HTTP |
| notification-service | `notification-service.dcms-internal` | HTTP |
| pgbouncer | `pgbouncer.dcms-internal` | PostgreSQL wire protocol |
| redis-sentinel | `redis-sentinel.dcms-internal` | Redis RESP3 |

Swarm performs round-robin DNS load balancing across replicas of the same service. The `api-gateway` uses the service DNS name as its upstream address, which automatically distributes load to all healthy replicas.

### 10.2 Network Segmentation

Three overlay networks enforce the principle of least privilege:

| Network | Name | Attached Services |
|---|---|---|
| Ingress | `dcms-ingress` | Nginx/Kong, api-gateway, web-ui |
| Internal | `dcms-internal` | All backend services, pgBouncer, Redis Sentinel |
| Data | `dcms-data` | pgBouncer, PostgreSQL primary/replica, Redis master/replicas |

Rules:
- web-ui and Kong have no access to `dcms-internal` or `dcms-data` directly.
- No backend service is attached to `dcms-ingress` except api-gateway.
- No backend service is attached to `dcms-data` except pgBouncer and Redis Sentinel proxy.
- agent runs outside Swarm (on managed hosts) and communicates with container-service via the `dcms-internal` network address exposed through a Swarm ingress port or host networking.

### 10.3 Health Checks

Every service registers a Swarm health check:

```yaml
# Common health check configuration
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:${PORT}/health"]
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 30s
```

Kong uses its own active health checks against upstream service instances and removes instances from the upstream pool within 5s of a failed check. Swarm also removes failed task replicas from DNS within 5s.

### 10.4 Observability Integration Points

All services expose:
- `GET /health` — liveness probe (returns 200 `{"status":"ok"}` if process is healthy)
- `GET /ready` — readiness probe (returns 200 if DB connection pool and Redis client are connected; 503 otherwise)
- `GET /metrics` — Prometheus text format metrics (scrape interval 15s)

OpenTelemetry trace context is propagated via W3C Trace Context headers (`traceparent`, `tracestate`) on all outbound HTTP calls and gRPC metadata. All spans are exported to Jaeger via OTLP gRPC (`http://jaeger:4317`).

Traces, metrics, and logs are correlated via `trace_id` which appears in structured log entries, Prometheus exemplars, and Jaeger spans simultaneously.

---

*Document produced by backend_architect_agent. Reviewed against solution_architecture.md v1.0, cross_domain_contracts.md v1.0, technology_stack.md v1.0, and nfr.md v1.0. Handoff target: backend_developer_agent.*
