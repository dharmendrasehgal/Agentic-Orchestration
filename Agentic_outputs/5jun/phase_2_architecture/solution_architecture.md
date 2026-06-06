# Solution Architecture — Generic Docker Container Management System (DCMS)

**Document Version:** 1.0  
**Date:** 2026-06-05  
**Status:** Approved  
**Author:** senior_architect_agent  

---

## 1. Architecture Style

DCMS follows a **microservices architecture** anchored by a centralized API Gateway, complemented by an **event-driven real-time layer** using Redis pub/sub and Server-Sent Events (SSE). Each microservice owns its domain data, communicates synchronously over REST for commands/queries and asynchronously over Redis channels for state propagation.

Key architectural decisions:

- **API Gateway pattern** — single ingress point for all external traffic; handles routing, rate limiting, and JWT verification delegation.
- **CQRS for container state** — writes go through container-service which mutates PostgreSQL; reads are served from a Redis cache kept warm by monitor-service, providing sub-millisecond read latency without load on the primary DB.
- **SSE for real-time push** — the API Gateway maintains long-lived SSE connections to browser clients and fans out Redis pub/sub messages. No WebSocket, no GraphQL subscriptions.
- **Agent model** — a single statically compiled Go binary deployed per Docker host. It exposes a gRPC server; container-service is the only caller. mTLS certificates are provisioned by Vault.
- **Stateless services** — all HTTP services carry no in-process session state; affinity is achieved through JWT claims and Redis-backed CQRS projections.
- **Defence-in-depth** — network policies restrict service-to-service traffic; Trivy scans every image build; Vault issues short-lived credentials.

---

## 2. C4 Level 1 — System Context Diagram

```
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │                              External Actors & Systems                               │
 └─────────────────────────────────────────────────────────────────────────────────────┘

         ┌──────────────┐        ┌──────────────┐        ┌─────────────────────┐
         │  Platform     │        │  DevOps /     │        │  Read-Only Observer  │
         │  Admin        │        │  Developer    │        │  (Viewer role)       │
         └──────┬───────┘        └──────┬───────┘        └──────────┬──────────┘
                │                       │                             │
                │   HTTPS (browser)     │   HTTPS (browser / CLI)    │  HTTPS (browser)
                └───────────────────────┴─────────────────────────────┘
                                        │
                             ┌──────────▼──────────┐
                             │                      │
                             │       D C M S        │
                             │  Docker Container    │
                             │  Management System   │
                             │                      │
                             └──┬───────────────┬───┘
                                │               │
          ┌─────────────────────┘               └────────────────────────┐
          │                                                               │
  ┌───────▼──────────┐  ┌────────────────┐  ┌──────────┐  ┌────────────▼──────────┐
  │  Docker Engine   │  │  OIDC Provider │  │  Slack / │  │  Container Registry   │
  │  (per host,      │  │  (Keycloak /   │  │  Email   │  │  (Docker Hub /        │
  │   Docker daemon) │  │   Entra ID)    │  │  SMTP    │  │   Private Registry)   │
  └──────────────────┘  └────────────────┘  └──────────┘  └───────────────────────┘
```

**System relationships:**

| Actor / System | Relationship with DCMS |
|---|---|
| Platform Admin | Manages clusters, nodes, RBAC policies via web UI and REST API |
| DevOps / Developer | Deploys, starts, stops, inspects containers; views logs and metrics |
| Read-Only Observer | Views dashboards and container status; no mutation rights |
| Docker Engine | Receives container lifecycle commands via agent gRPC calls |
| OIDC Provider | Issues and validates JWT tokens; DCMS delegates authentication |
| Slack / Email / SMTP | Receives alert notifications dispatched by notification-service |
| Container Registry | Source of images pulled by image-service; scanned by Trivy |

---

## 3. C4 Level 2 — Container Diagram (All 12 Services)

```
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  DCMS System Boundary                                                                                   │
 │                                                                                                         │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
 │  │  Ingress Layer                                                                                   │   │
 │  │  ┌──────────────────────────────────────────────────────────────────────────┐                  │   │
 │  │  │  Nginx / Kong Load Balancer  (TLS termination, rate-limit, WAF rules)    │                  │   │
 │  │  └──────────────────────────────┬───────────────────────────────────────────┘                  │   │
 │  │                                  │                                                               │   │
 │  │           ┌──────────────────────┴──────────────────────┐                                       │   │
 │  │           │          api-gateway  :8080                  │                                       │   │
 │  │           │  (Go/Gin, JWT verify, routing, SSE fanout)   │                                       │   │
 │  │           └──┬────────┬────────┬────────┬───────────────┘                                       │   │
 │  └──────────────┼────────┼────────┼────────┼───────────────────────────────────────────────────────┘   │
 │                 │        │        │        │                                                             │
 │  ┌──────────────┼────────┼────────┼────────┼───────────────────────────────────────────────────────┐   │
 │  │  Service Layer│        │        │        │                                                        │   │
 │  │               │        │        │        │                                                        │   │
 │  │  ┌────────────▼──┐ ┌───▼────┐ ┌▼──────┐ └──────────────────────────────┐                        │   │
 │  │  │ auth-service  │ │contain│ │image  │                               │                        │   │
 │  │  │ :8081         │ │-service│ │-service│                               │                        │   │
 │  │  │ JWT / RBAC    │ │:8082  │ │:8083  │                               │                        │   │
 │  │  │ OIDC bridge   │ │Moby   │ │Trivy  │                               │                        │   │
 │  │  └───────────────┘ │SDK    │ │scan   │                               │                        │   │
 │  │                     └───┬───┘ └───────┘                               │                        │   │
 │  │  ┌─────────────────┐    │       ┌────────────────┐  ┌──────────────┐  │                        │   │
 │  │  │ network-service │    │       │ volume-service  │  │cluster-serv  │  │                        │   │
 │  │  │ :8084           │    │       │ :8085           │  │:8089         │  │                        │   │
 │  │  │ overlay nets    │    │       │ bind mounts,    │  │Swarm/K8s     │  │                        │   │
 │  │  │ DNS config      │    │       │ named volumes   │  │node mgmt     │  │                        │   │
 │  │  └─────────────────┘    │       └────────────────┘  └──────────────┘  │                        │   │
 │  │                          │                                               │                        │   │
 │  │  ┌─────────────────┐    │       ┌────────────────┐  ┌──────────────┐  │                        │   │
 │  │  │ monitor-service │    │       │ log-service     │  │notification  │  │                        │   │
 │  │  │ :8086           │    │       │ :8087           │  │-service:8088 │  │                        │   │
 │  │  │ metrics, CQRS   │    │       │ Loki push,      │  │Slack/email   │  │                        │   │
 │  │  │ projections     │    │       │ log tail SSE    │  │webhooks      │  │                        │   │
 │  │  └─────────────────┘    │       └────────────────┘  └──────────────┘  │                        │   │
 │  │                          │                                               │                        │   │
 │  │  ┌────────────────────────────────────────────────────────────────────┐  │                        │   │
 │  │  │  web-ui  :3000   (React 18, Vite, served via Nginx static)        │  │                        │   │
 │  │  └────────────────────────────────────────────────────────────────────┘  │                        │   │
 │  └──────────────────────────┼────────────────────────────────────────────────┘                        │
 │                               │  gRPC / mTLS                                                           │
 │  ┌────────────────────────────▼──────────────────────────────────────────────────────────────────┐     │
 │  │  Per-Host Agent Layer                                                                          │     │
 │  │  ┌────────────────────────────────────────────────────────────────────────────────────────┐   │     │
 │  │  │  agent  :9090  (Go static binary, gRPC server, Moby SDK, mTLS client cert)             │   │     │
 │  │  └─────────────────────────────────────────┬──────────────────────────────────────────────┘   │     │
 │  └─────────────────────────────────────────────┼──────────────────────────────────────────────────┘     │
 │                                                 │  Unix socket / TCP                                      │
 │                    ┌────────────────────────────▼────────────────────────────────────────────────┐       │
 │                    │  Docker Engine  (dockerd, containerd, runc) — one per physical/VM host       │       │
 │                    └────────────────────────────────────────────────────────────────────────────┘       │
 │                                                                                                         │
 │  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐   │
 │  │  Data & Messaging Layer                                                                           │   │
 │  │                                                                                                   │   │
 │  │  ┌────────────────────────┐    ┌─────────────────────────┐    ┌──────────────────────────────┐  │   │
 │  │  │  PostgreSQL 16         │    │  Redis 7.2               │    │  Loki 3.0                    │  │   │
 │  │  │  Primary + 1 Replica   │    │  Sentinel HA (3 nodes)   │    │  Log aggregation backend     │  │   │
 │  │  │  pgBouncer (pooling)   │    │  pub/sub + cache         │    │  queried by Grafana          │  │   │
 │  │  └────────────────────────┘    └─────────────────────────┘    └──────────────────────────────┘  │   │
 │  └──────────────────────────────────────────────────────────────────────────────────────────────────┘   │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Service Inventory

| Service | Responsibility | Technology | Port | Scaling Strategy |
|---|---|---|---|---|
| api-gateway | Single ingress: routing, JWT validation (delegate to auth-service), rate limiting, SSE connection fan-out, request ID injection | Go 1.22 + Gin 1.9 + Kong Gateway 3.7 | 8080 | Horizontal; 2+ replicas behind LB. Stateless. SSE fan-out via Redis pub/sub so any replica can serve any client. |
| auth-service | OIDC token exchange, JWT issuance and introspection, RBAC policy enforcement, API key management | Go 1.22 + Gin 1.9 + GORM + PostgreSQL | 8081 | Horizontal; read-heavy workload. Redis caches RBAC decisions (TTL 60s). Scale by replica count. |
| container-service | Container lifecycle: create, start, stop, pause, restart, remove. Delegates execution to agent over gRPC. Owns container metadata in PostgreSQL. Publishes state events to Redis. | Go 1.22 + Gin 1.9 + GORM + Moby SDK 26 | 8082 | Horizontal; gRPC calls are per-host fan-out. Stateless HTTP layer. Connection pool to agents managed per-instance. |
| image-service | Image pull/push, tag management, CVE scanning via Trivy, image metadata persistence | Go 1.22 + Gin 1.9 + Trivy 0.51 SDK | 8083 | Horizontal; Trivy scans are CPU-bound. Scale scan replicas independently via HPA (CPU threshold 70%). |
| network-service | Docker overlay network CRUD, DNS configuration, IPAM, network inspection | Go 1.22 + Gin 1.9 + Moby SDK | 8084 | Horizontal; low throughput. 2 replicas for HA. |
| volume-service | Named volume and bind-mount management, backup scheduling metadata | Go 1.22 + Gin 1.9 + Moby SDK | 8085 | Horizontal; low throughput. 2 replicas for HA. |
| monitor-service | Scrapes Prometheus metrics, maintains CQRS read projections in Redis, evaluates alert rules | Go 1.22 + Prometheus client + Redis | 8086 | Horizontal; Redis writes are idempotent projections. Scale up during large cluster ingestion. |
| log-service | Collects container stdout/stderr from agents, forwards to Loki, serves log-tail SSE streams | Go 1.22 + Gin 1.9 + Loki push client | 8087 | Horizontal; I/O-bound. Scale with log volume. Each replica independently tails assigned containers. |
| cluster-service | Docker Swarm node join/drain/remove, service deployments, cluster health aggregation | Go 1.22 + Gin 1.9 + Moby SDK | 8089 | Low replica count (2); Swarm manager API calls are not parallelisable across managers. |
| notification-service | Alert fanout to Slack, email (SMTP), webhook endpoints; deduplication and rate limiting | Go 1.22 + Gin 1.9 + Redis | 8088 | Horizontal; Redis dedup store prevents storm amplification. |
| web-ui | React SPA served as static assets behind Nginx; consumes REST and SSE endpoints | React 18 + TypeScript 5.4 + Vite 5 + TailwindCSS 3 | 3000 (dev) / 80 (prod Nginx) | Stateless static. CDN-cacheable. Nginx serves gzip-compressed bundles. |
| agent | Per-host Go binary; gRPC server; proxies commands to local Docker daemon via Moby SDK; streams metrics and logs back to monitor-service / log-service | Go 1.22 + gRPC + Moby SDK + mTLS | 9090 | One instance per Docker host. Not horizontally scaled; vertically sized (500 containers/host target). |

---

## 5. End-to-End Data Flow: "Deploy Container"

The sequence below traces a user clicking "Deploy" in the browser dashboard through to the SSE confirmation event rendered in the UI.

```
 Browser (web-ui)
     │
     │  1. POST /api/v1/containers  {image, name, env, ports, ...}
     │     Authorization: Bearer <JWT>
     ▼
 Nginx / Kong Load Balancer
     │
     │  2. TLS termination, WAF check, forward to api-gateway replica
     ▼
 api-gateway  :8080
     │
     │  3. Validate JWT signature (cached JWKS). Inject X-Request-ID header.
     │  4. POST /internal/auth/introspect  →  auth-service
     ▼
 auth-service  :8081
     │
     │  5. Verify JWT claims: sub, roles[], org_id, exp.
     │     Check RBAC: role must have containers:write permission.
     │  6. Return 200 {sub, roles, org_id}  or 403
     ▼
 api-gateway  :8080  (continued)
     │
     │  7. Route POST /containers to container-service
     ▼
 container-service  :8082
     │
     │  8. Persist ContainerSpec to PostgreSQL (state=PENDING).
     │  9. Resolve target host: query cluster-service for least-loaded node.
     │  10. gRPC call  →  agent on target host
     │      StartContainer(ContainerSpec) — mTLS mutual auth
     ▼
 agent  :9090  (target Docker host)
     │
     │  11. Translate ContainerSpec to Docker API CreateContainerConfig.
     │  12. Moby SDK: docker.ContainerCreate(ctx, config, ...)
     │  13. Moby SDK: docker.ContainerStart(ctx, containerID, ...)
     ▼
 Docker Engine  (dockerd)
     │
     │  14. Pull image layers (if not cached) from registry.
     │  15. Create container namespaces (net, pid, mnt, uts).
     │  16. Execute entrypoint via runc.
     │  17. Return container ID + running state to agent.
     ▼
 agent  :9090
     │
     │  18. Return StartContainerResponse{container_id, status=RUNNING} to container-service.
     ▼
 container-service  :8082
     │
     │  19. Update PostgreSQL row: state=RUNNING, container_id, started_at.
     │  20. PUBLISH to Redis channel dcms.container.events:
     │       {event:"CONTAINER_STARTED", container_id, org_id, host, timestamp}
     ▼
 Redis pub/sub  (dcms.container.events)
     │
     │  21. Fanout to all api-gateway subscribers
     ▼
 api-gateway  :8080
     │
     │  22. api-gateway holds open SSE connection to browser for org_id.
     │      Filter event by org_id / user subscription.
     │  23. Write SSE frame:
     │        data: {"event":"CONTAINER_STARTED","container_id":"abc123",...}\n\n
     ▼
 Browser (web-ui)
     │
     │  24. EventSource.onmessage handler receives frame.
     │  25. React Query cache invalidated for containers list.
     │  26. Dashboard row updated: status pill turns green "Running".
```

**Error paths:**
- Step 5 returns 403 → api-gateway returns HTTP 403 to browser immediately; no write to PostgreSQL.
- Step 10 gRPC fails (agent unreachable) → container-service sets state=FAILED, publishes CONTAINER_FAILED event, SSE notifies browser within 5s (gRPC deadline).
- Step 13 image pull fails → agent returns gRPC error; container-service sets state=IMAGE_PULL_ERROR.

---

## 6. High-Availability Topology

```
 Internet
     │
 ┌───▼──────────────────────────────────────────────────────────────────────────────┐
 │  Nginx / Kong  (active–active pair, anycast VIP or DNS round-robin)              │
 │  TLS termination • WAF • Rate-limit • Health-check-based upstream removal        │
 └───┬─────────────────────────────────────────────────────┬────────────────────────┘
     │                                                       │
 ┌───▼────────────────┐                         ┌───────────▼────────────┐
 │  api-gateway-1     │                         │  api-gateway-2         │
 │  :8080             │                         │  :8080                 │
 │  (stateless)       │                         │  (stateless)           │
 └───┬────────────────┘                         └───────────┬────────────┘
     │  REST                                                  │  REST
 ┌───▼────────────────────────────────────────────────────────▼──────────────────┐
 │  Service Replicas (each service runs 2+ replicas in Docker Swarm)             │
 │                                                                               │
 │  auth×2   container×2   image×2   network×2   volume×2   monitor×2           │
 │  log×2    cluster×2     notification×2                                        │
 └─────────────────────────────┬─────────────────────────────┬──────────────────┘
                               │                               │
 ┌─────────────────────────────▼──────────────────┐  ┌────────▼──────────────────┐
 │  PostgreSQL 16 HA                               │  │  Redis 7.2 Sentinel HA    │
 │                                                 │  │                           │
 │  ┌─────────────────┐   streaming replication    │  │  ┌─────────┐  ┌────────┐  │
 │  │  Primary        ├───────────────────────────►│  │  │ master  │  │replica │  │
 │  │  (read/write)   │                            │  │  └────┬────┘  └───┬────┘  │
 │  └─────────────────┘                            │  │       │            │       │
 │  ┌─────────────────┐                            │  │  ┌────▼────────────▼────┐  │
 │  │  Replica        │  read-only queries         │  │  │  Sentinel ×3         │  │
 │  │  (read-only)    │◄───────────────────────────┤  │  │  (quorum=2 failover) │  │
 │  └─────────────────┘                            │  │  └──────────────────────┘  │
 │  pgBouncer (transaction-mode pooling)           │  └───────────────────────────┘
 └─────────────────────────────────────────────────┘
```

**Failure modes and recovery:**

| Component | Failure Mode | Recovery |
|---|---|---|
| api-gateway replica | Pod crash | LB health-check removes replica within 5s; surviving replica absorbs traffic; Swarm reschedules crashed pod |
| PostgreSQL primary | Host failure | Patroni / Sentinel promotes replica within 30s; pgBouncer reconnects; services retry with exponential back-off |
| Redis master | Host failure | Sentinel promotes replica within 10s; all clients reconnect via Sentinel endpoint |
| Agent | Network partition | container-service marks host UNREACHABLE after 3 missed heartbeats (15s); operations queue locally; auto-retry on reconnect |
| Docker Engine | Daemon crash | Agent detects lost socket; reconnects with back-off; in-flight gRPC calls return UNAVAILABLE |

**RTO / RPO targets:**

| Tier | Target RTO | Target RPO |
|---|---|---|
| API (stateless services) | < 30 s | N/A (stateless) |
| PostgreSQL | < 60 s | < 1 min (replica lag) |
| Redis | < 15 s | 0 (pub/sub is ephemeral) |
| Full cluster | < 5 min | < 5 min |
