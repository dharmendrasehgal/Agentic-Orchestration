# DCMS Architecture Overview

**Version:** 1.0.0
**Audience:** Senior engineers evaluating DCMS for adoption or contribution
**Last Updated:** 2026-06-06

---

## 1. The Problem

Running containers on a single Docker host is straightforward. `docker run`, `docker ps`, `docker logs` — the CLI is good. The problem begins when your infrastructure grows beyond one machine.

Once you have a small Swarm of five, ten, or twenty nodes, the friction compounds quickly. You are SSH-ing into individual hosts to inspect containers, copy-pasting `docker stats` output across terminals to correlate a slowdown, and running `docker service logs` with `--filter` flags in separate windows to trace a request that touched three services. Access control is a blunt instrument: either someone has SSH access to a node (and therefore root-equivalent Docker socket access) or they have nothing. Audit trails are shell history entries.

Docker's built-in tooling is designed for CLI-first, single-operator workflows. `docker stack deploy` and `docker service` work well for the deploy path, but there is no unified web interface for the full operational lifecycle — no multi-host container inspection, no centralised log view, no role-based access, no image security scanning. Teams typically assemble this from a half-dozen disparate tools: Portainer for a basic UI, a custom Grafana stack bolted on manually, per-host SSH for debugging, and a spreadsheet tracking who has access to what.

DCMS is a purpose-built control plane that replaces this patchwork. The goal is a single operational surface for everything the container layer touches, deployed without adding Kubernetes to your stack.

---

## 2. Design Goals

These principles shaped every significant decision in the system:

**Simplicity over features.** It is more valuable to do fewer things well than to attempt broad feature parity with mature platforms like Rancher or Portainer EE. v1.0.0 focuses on the daily operational loop: deploy, inspect, debug, scale, secure.

**Observable by default.** Metrics, logs, and traces should work out of the box without configuration by the deploying team. The Prometheus/Grafana/Loki/Jaeger stack is bundled and pre-configured, not optional add-ons.

**Secure by design.** Security constraints are architectural, not policy. The Docker socket is never exposed over TCP. Every agent connection requires a mutual TLS client certificate. JWT tokens use RS256. The audit log is written to an append-only table with a chained HMAC — it is not possible to silently delete an audit record.

**Horizontally scalable.** Every DCMS service is stateless (state lives in PostgreSQL or Redis) and can be scaled to multiple replicas by adjusting a Swarm service replica count. The design should sustain 100 managed nodes and 10,000 containers on commodity hardware.

**Deployable without Kubernetes.** Kubernetes solves real problems but introduces substantial operational complexity. DCMS deploys on Docker Swarm, which ships with every Docker Engine installation and requires zero additional tooling to operate. Teams can run DCMS on hardware they already have, using knowledge they already possess.

---

## 3. System Architecture at a Glance

```
                         ┌──────────────────────────────────────────────────┐
                         │                   External Users                  │
                         │          (Browser, CI pipelines, scripts)         │
                         └────────────────────┬─────────────────────────────┘
                                              │ HTTPS / SSE
                         ┌────────────────────▼─────────────────────────────┐
                         │              Kong API Gateway                     │
                         │  (rate-limiting, JWT validation, RBAC routing)    │
                         └───┬────────┬────────┬────────┬────────┬──────────┘
                             │        │        │        │        │
              ┌──────────────▼─┐  ┌───▼────┐  │  ┌─────▼───┐  ┌▼────────────┐
              │  auth-service  │  │ image  │  │  │ network │  │  volume     │
              │  (JWT, OIDC,   │  │ service│  │  │ service │  │  service    │
              │   RBAC, LDAP)  │  │ +Trivy │  │  └─────────┘  └─────────────┘
              └───────────────-┘  └────────┘  │
                                              │
                         ┌────────────────────▼─────────────────────────────┐
                         │             container-service                     │
                         │  (lifecycle, CQRS read cache, SSE publisher)      │
                         └──────┬───────────────────────────────────────────┘
                                │ gRPC / mTLS
              ┌─────────────────┴──────────────────────────────┐
              │                                                  │
 ┌────────────▼───────────┐                       ┌────────────▼──────────┐
 │  dcms-agent (host-01)  │      . . .            │  dcms-agent (host-N)  │
 │  systemd + Go binary   │                       │  systemd + Go binary  │
 │  Docker socket (local) │                       │  Docker socket (local)│
 └────────────────────────┘                       └───────────────────────┘

                         ┌──────────────────────────────────────────────────┐
                         │              Data & Messaging Layer               │
                         │  PostgreSQL 16 (metadata, audit, CQRS snapshot)  │
                         │  Redis 7       (pub/sub event bus, token store)   │
                         └──────────────────────────────────────────────────┘

                         ┌──────────────────────────────────────────────────┐
                         │              Observability Stack                  │
                         │  cAdvisor → Prometheus → Grafana  (metrics)      │
                         │  Promtail → Loki                  (logs)          │
                         │  OTel Collector → Jaeger          (traces)        │
                         └──────────────────────────────────────────────────┘
```

The system is composed of twelve services arranged in two tiers. The **API tier** — kong, auth-service, container-service, image-service, network-service, volume-service, cluster-service, notification-service, monitor-service, and log-service — runs as replicated Swarm services on manager nodes. The **agent tier** — dcms-agent — runs as a single systemd process on every managed Docker host, including worker nodes and hosts outside the Swarm.

All user traffic enters through Kong, which validates JWT signatures and enforces coarse-grained route-level RBAC before forwarding to the appropriate service. Each service then applies fine-grained, resource-level permission checks using the claims embedded in the validated token. Services communicate with each other via internal HTTP calls routed through the Swarm overlay network; they are not exposed on the public network. The sole exception is the agent, which is accessed by the container-service over a gRPC/mTLS channel on port 8080 of each managed host.

The data layer is intentionally minimal: PostgreSQL for all durable state (container metadata, user records, image catalogue, audit log, CQRS snapshot tables) and Redis for the pub/sub event bus and ephemeral state (token blacklist, SSE subscription fan-out). There is no message queue, no separate search index, and no eventual-consistency mechanism more complex than a NOTIFY/LISTEN channel in PostgreSQL for local event propagation.

---

## 4. Key Design Decisions

### Go for Backend Services

All ten backend services and the agent binary are written in Go. The decision was not primarily philosophical — it was practical.

The per-host agent model requires a binary that can be deployed with `scp` and a `systemctl enable`, with no container runtime dependency on the managed host itself. A Go binary is a single self-contained executable with no shared library dependencies beyond libc. This means the agent can be installed on a host before Docker is installed (useful for bootstrapping), can be updated atomically by replacing a file, and never has a Python version conflict or a Node.js `node_modules` directory to manage.

For the API-tier services, the goroutine scheduler handles thousands of concurrent SSE connections cheaply. A single DCMS instance in production maintains approximately 200-500 persistent SSE connections (one per open dashboard browser tab). In a Node.js event loop model, each long-lived connection requires careful back-pressure management and adds complexity around blocking operations. In Go, each SSE connection is a goroutine (approximately 8KB of stack, growing on demand) that blocks on a Redis subscribe call — the scheduler handles multiplexing automatically.

### Per-Host Agent Model

The most security-sensitive architectural decision was how the container-service talks to Docker daemons on remote hosts.

The obvious alternative is to expose the Docker socket over TCP (`-H tcp://0.0.0.0:2376`). This is Docker's built-in remote API. It works. It is also essentially a remote root shell. Anyone who can reach port 2376 can start privileged containers with host filesystem mounts. Even with TLS client certificates, the blast radius of a compromised `container-service` is total host compromise for every host it can reach.

The DCMS agent takes a different approach. It is a purpose-built gRPC server that exposes exactly eleven RPC methods: `ContainerList`, `ContainerCreate`, `ContainerStart`, `ContainerStop`, `ContainerRemove`, `ContainerInspect`, `ContainerLogs`, `ContainerExec`, `ImagePull`, `ImageList`, and `EventStream`. Nothing else. The agent connects to the local Docker socket as a client — the socket is never exposed to the network. The gRPC service is secured with mutual TLS: the agent presents a server certificate, and the container-service must present a client certificate signed by the DCMS CA. An attacker who compromises the `container-service` can perform only those eleven operations on the hosts it has valid client certificates for.

```
# Agent mTLS verification on each request (simplified)
# The agent rejects any client not presenting a cert signed by the DCMS CA

func (s *AgentServer) authInterceptor(ctx context.Context, ...) {
    tlsInfo := p.AuthInfo.(credentials.TLSInfo)
    if len(tlsInfo.State.VerifiedChains) == 0 {
        return status.Error(codes.Unauthenticated, "client cert required")
    }
    // Proceed — Docker operations are now scoped to the agent's RPC surface
}
```

### REST + Server-Sent Events over WebSocket

The dashboard needs real-time updates: container state changes, metric summaries, log lines. The choice was WebSocket or Server-Sent Events.

SSE won for three reasons. First, SSE is unidirectional — the server pushes events, the browser receives them. The DCMS use case is almost entirely server→client: container state changes, alert triggers, log lines. The browser never needs to push arbitrary binary frames to the server. The exec session (one bidirectional use case) uses a separate HTTP endpoint with chunked transfer encoding, not the SSE stream. Second, SSE is HTTP/1.1. It survives `nginx` reverse proxies, AWS load balancers, and corporate HTTP proxies without special configuration. WebSocket upgrades are blocked or mishandled by a non-trivial fraction of enterprise network infrastructure. Third, the browser's built-in `EventSource` API handles reconnection, including `Last-Event-ID` replay — free reliability without a client-side reconnection library.

The server implementation is straightforward: each SSE connection is a goroutine that subscribes to a Redis pub/sub channel (filtered by namespace and event type), reads events, and writes `data: ...` frames to the HTTP response writer.

```
# SSE endpoint condensed
GET /api/v1/events?namespace=production&types=container.start,container.die

# Event frame format
data: {"type":"container.die","container_id":"a3f9b1","exit_code":137,"timestamp":"..."}

data: {"type":"container.start","container_id":"b7c4e2","name":"nginx","timestamp":"..."}
```

### Docker Swarm Before Kubernetes

Kubernetes handles the 80% case of multi-host container scheduling, service discovery, and rolling updates — but it requires etcd, kube-apiserver, kubelet, kube-proxy, a CNI plugin, and an Ingress controller as mandatory dependencies before deploying a single workload. The operational surface is substantial even with managed offerings like EKS or GKE.

Docker Swarm ships with `dockerd`. A three-manager Swarm cluster requires no software installation beyond Docker itself. Raft consensus is built in. Service discovery via VIP and DNSRR is built in. Overlay networking is built in. Rolling updates and health-check-based rollback are built in. For clusters up to approximately 100 nodes and a few thousand services, Swarm is operationally simpler and failure modes are easier to reason about.

DCMS targets teams who are not yet at Kubernetes scale — or who are running workloads that do not benefit from Kubernetes' complexity overhead. Kubernetes support is on the roadmap for v2.0.

### CQRS for Container State

The container listing endpoint (`GET /api/v1/containers`) is the highest-traffic read in the system. A naive implementation would call the Docker API on every managed host on each request and aggregate the results — a fan-out proportional to cluster size with latency dominated by the slowest host.

DCMS uses a lightweight CQRS pattern instead. The **write path** flows through the API: create/start/stop commands are sent to the container-service, which calls the appropriate agent gRPC method. The agent executes the operation on Docker and the result is an event. The **read path** queries a PostgreSQL snapshot table (`container_snapshots`) that is maintained by the `container-service` event consumer. When a container state change arrives from the Docker event stream (via the agent's `EventStream` RPC), the event consumer updates the snapshot row for that container within 200ms.

```sql
-- container_snapshots table (simplified)
CREATE TABLE container_snapshots (
    id           UUID PRIMARY KEY,
    container_id VARCHAR(64) NOT NULL,
    host_id      UUID NOT NULL REFERENCES hosts(id),
    namespace    VARCHAR(128) NOT NULL,
    name         VARCHAR(255),
    image        VARCHAR(512),
    status       VARCHAR(32),   -- running, stopped, exited, ...
    exit_code    INT,
    labels       JSONB,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    UNIQUE(container_id, host_id)
);

CREATE INDEX ON container_snapshots (namespace, status);
CREATE INDEX ON container_snapshots (host_id);
```

A listing request for 500 containers across 20 hosts is now a single PostgreSQL index scan taking 3-8ms, regardless of how many hosts are in the cluster. The p95 read latency of 124ms (measured under production-scale load) is dominated by Kong overhead and network round-trip, not the database query.

---

## 5. Data Architecture

### PostgreSQL 16

PostgreSQL is the single source of truth for all durable state. The schema is managed by golang-migrate with 15 versioned migration files, applied automatically on service startup in order. Each migration is a pair of `up` and `down` SQL files, enabling rollback to any prior schema version.

The database design uses a few notable patterns:

- **Append-only audit log** with range partitioning by month. Partitioning keeps the active partition small and allows old partitions to be archived (or dropped for compliance purposes) without affecting query performance on recent records.
- **JSONB labels columns** on container, image, volume, and network records enable flexible filtering without schema changes. Labels are indexed with GIN.
- **Optimistic locking** on mutable entities (container lifecycle state, namespace quotas) using a `version` integer column. Concurrent updates result in a 409 Conflict at the API layer rather than a silent last-write-wins.

### Redis 7

Redis serves two roles. As a **pub/sub bus**, it carries container events from the `container-service` event consumer to the SSE stream goroutines in each replica. The alternative (polling PostgreSQL from each SSE goroutine) would have added unnecessary database load and increased event delivery latency. As an **ephemeral state store**, it holds the JWT refresh token registry (with TTL-based expiry) and the token blacklist (for logout and admin-disable operations).

Redis Sentinel runs in production for automatic failover. DCMS services connect to Redis via the Sentinel discovery address, not a direct Redis address, so failover is transparent to the application.

### golang-migrate

Schema evolution is handled by the [golang-migrate](https://github.com/golang-migrate/migrate) library, called from each service's startup sequence. The library applies all pending migrations in a single transaction where possible (DDL statements prevent full transactional migration in PostgreSQL for some operations, but DML migrations are transactional). If a migration fails, the schema is left at the last successfully applied version and the service exits with a non-zero code — Swarm restarts the task and the migration is retried. This behaviour is safe because each migration is idempotent by design (using `IF NOT EXISTS`, `IF EXISTS`, and `ON CONFLICT DO NOTHING` patterns).

---

## 6. Security Architecture

Security in DCMS is layered so that no single compromised component gives an attacker unbounded access.

### mTLS Agent Communication

Described in detail in Section 4. In brief: every agent presents a server certificate, every container-service instance presents a client certificate, and both are validated against the DCMS-managed CA on every gRPC call. Certificate rotation is handled by `scripts/rotate-agent-cert.sh` without service restart (the gRPC server reloads its TLS configuration from disk on SIGHUP).

### RBAC Enforcement

Permissions are checked at two layers. Kong validates the JWT signature and rejects requests with expired or malformed tokens before they reach any service. Each service handler then calls an `Authorise(ctx, resource, action)` function that reads the role claim from the validated token and checks it against the permission table:

| Action | Admin | Operator | Viewer |
|---|---|---|---|
| Container create/start/stop/remove | Yes | Yes (own namespace) | No |
| Container inspect/list | Yes | Yes (own namespace) | Yes (own namespace) |
| Image pull/remove | Yes | Yes | No |
| Image list/inspect | Yes | Yes | Yes |
| User management | Yes | No | No |
| Settings | Yes | No | No |
| Audit log view | Yes | No | No |

### JWT RS256

Access tokens are signed with a 4096-bit RSA private key stored in Vault. The public key is distributed to Kong and each service via a cached JWKS endpoint (`GET /api/v1/auth/.well-known/jwks.json`). Services validate the token signature locally — there are no synchronous calls to the auth-service on the hot path.

### Audit Log Integrity

Every audit log insert computes a HMAC-SHA256 tag over the concatenation of the row content and the tag of the previous row in the partition, forming a hash chain. A PostgreSQL trigger verifies the chain on any `UPDATE` or `DELETE` attempt and raises an exception, making the append-only constraint enforcement a database-level guarantee rather than an application-level convention.

```sql
-- Audit log trigger (simplified)
CREATE OR REPLACE FUNCTION audit_immutability_check()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_modification
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_immutability_check();
```

### Trivy CVE Scanning Integration

The image-service calls the Trivy binary as a subprocess on image pull completion. The JSON report is parsed, stored in the `image_scan_results` table, and evaluated against the block policy. The policy is configurable per namespace:

- `BLOCK_ON_CRITICAL` (default): prevents container create if any CRITICAL CVE is present in the image
- `WARN_ON_HIGH`: allows deployment but flags the container in the dashboard
- `DISABLED`: scanning still runs but never blocks (not recommended for production)

The Trivy vulnerability database is updated daily via a cron job on the image-service host.

---

## 7. Observability Stack

The observability stack is bundled with DCMS and requires zero configuration by the deploying team.

### Metrics: cAdvisor → Prometheus → Grafana

cAdvisor runs as a Swarm global service — one instance per node. It connects to the local Docker socket and exports per-container resource metrics (CPU, memory, network I/O, block I/O, OOM kill count) in Prometheus format on port 8080.

Prometheus scrapes cAdvisor on every node using Swarm service discovery (the `docker_swarm` scrape config type). It also scrapes each DCMS service's `/metrics` endpoint for application-level metrics (request rate, error rate, latency histograms, PostgreSQL connection pool stats).

Grafana is provisioned at startup with six dashboards and configured data sources (Prometheus and Loki). Dashboards are defined as JSON files in `infra/grafana/dashboards/` and are loaded via Grafana's provisioning API — no manual import needed.

### Logs: Promtail → Loki

Promtail runs as a global Swarm service and tails Docker container log files from the host filesystem (`/var/lib/docker/containers/**/*-json.log`). It attaches labels from Docker container metadata (`container_name`, `service_name`, `namespace`, `node`) before forwarding to Loki.

Loki stores logs as compressed chunks in a local directory (configurable to S3 in v1.5). The Grafana Explore view and the DCMS dashboard log viewer both query Loki via its HTTP API using LogQL.

### Traces: OpenTelemetry → Jaeger

Each DCMS service is instrumented with the OpenTelemetry Go SDK. Spans are exported to the OTel Collector via OTLP gRPC. The collector batches and forwards to Jaeger. Trace context is propagated between services via W3C TraceContext headers on internal HTTP calls and via gRPC metadata on agent calls.

### Alerting: 15 Rules

Alerting rules are defined in `infra/prometheus/rules/dcms-alerts.yml` and cover:

- Container restart rate > 3 in 5 minutes
- Node CPU > 90% for 5 minutes
- Node memory usage > 85%
- Node disk usage > 80% (warning) and > 95% (critical)
- PostgreSQL active connections > 80% of `max_connections`
- Redis memory usage > 80% of `maxmemory`
- DCMS API 5xx error rate > 1% over 5 minutes
- Swarm node leaving the cluster
- Agent heartbeat missed for > 60 seconds
- Certificate expiry < 30 days (warning) and < 7 days (critical)

Alertmanager routes firing alerts to configured channels (Slack webhook, SMTP) with deduplication and grouping.

---

## 8. What We'd Do Differently

Reflecting on the implementation honestly:

**gRPC bidirectional streaming for log forwarding.** The current log forwarding path is: agent tails Docker logs → publishes lines to a Redis pub/sub channel → log-service subscribes → SSE to browser. The Redis relay introduces an additional network hop and Redis memory pressure during log bursts. The gRPC `EventStream` RPC already establishes a server-streaming connection from container-service to agent; we could have added a bidirectional streaming RPC (`LogStream`) that carries log lines back over the same connection without Redis involvement. The Redis relay was faster to implement initially, but the additional complexity and operational dependency are not ideal.

**Buf Schema Registry from the start.** The agent gRPC protocol is defined in `.proto` files in the `proto/` directory. In the first month of development, proto files were edited directly without a schema registry or linting. This led to three breaking changes in the agent protocol before we established a review process. Adopting the Buf CLI for linting and breaking-change detection, and the Buf Schema Registry for versioned proto distribution, would have avoided these breaking changes and made agent versioning cleaner from the beginning.

**Kong declarative config in file mode rather than DB mode.** Kong is configured in DB mode (PostgreSQL-backed), which means Kong's configuration (routes, plugins, upstreams) lives in the DCMS PostgreSQL database and is managed via the Kong Admin API. This added operational complexity: Kong's schema migrations run separately from DCMS migrations, Kong requires its own database connection pool, and Kong state can drift from the declared configuration if an Admin API call fails mid-update. Kong's file-based `kong.yml` declarative configuration with the `decK` sync tool would have made gateway configuration a version-controlled artefact rather than mutable state in a database.

---

## 9. Contributing

DCMS is open source under the Apache 2.0 licence.

**Repository:** https://github.com/dcms/dcms

**Contributing guide:** https://github.com/dcms/dcms/blob/main/CONTRIBUTING.md

The guide covers:

- Development environment setup (`make dev-up`)
- Running the test suite (`make test`)
- Running the linter (`make lint` — uses `golangci-lint` for Go, `eslint` + `tsc` for TypeScript)
- Submitting a pull request (PR template, required checks, code review expectations)
- Architecture decision record (ADR) process for non-trivial design changes

Good first issues are labelled `good-first-issue` on GitHub: https://github.com/dcms/dcms/issues?q=label%3Agood-first-issue

If you are evaluating DCMS for adoption and have questions about the architecture or deployment, open a discussion on GitHub or join the community Slack at https://dcms.io/slack. The engineering team participates actively.
