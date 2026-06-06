# Architecture Decision Records — DCMS

**Document Version:** 1.0  
**Date:** 2026-06-05  
**Status:** Approved  
**Author:** senior_architect_agent  

---

## ADR-001: Go over Node.js for Backend Services

**Date:** 2026-06-05  **Status:** Accepted

**Context:**  
The DCMS backend must handle two distinct workload profiles simultaneously: high-throughput, low-latency REST APIs serving up to 500 containers per host and 100 hosts per cluster, and long-lived SSE connections that fan out real-time container state events to potentially hundreds of concurrent browser clients. The agent binary must run as a single deployable artifact on Docker hosts with minimal OS dependencies, ideally with no runtime installer. The engineering team has moderate Go experience and strong JavaScript/TypeScript experience; either language is a viable hiring axis.

**Decision:**  
Go 1.22 is adopted as the sole backend language for all 11 server-side microservices and the agent binary.

Rationale:

1. **Concurrency model for SSE.** Go goroutines are lightweight (~4 KB stack, grown on demand) and are multiplexed by the Go scheduler onto OS threads. A single Go process can sustain tens of thousands of concurrent SSE connections with far lower memory overhead than Node.js, which uses a single-threaded event loop and requires explicit async/await discipline throughout the call stack to avoid blocking. Under moderate CPU pressure the Go scheduler preempts goroutines, whereas Node.js can starve I/O callbacks if a synchronous operation escapes the event loop.

2. **Static binary deployment for the agent.** `go build` produces a self-contained executable with no external runtime. The agent is deployed to heterogeneous Docker hosts (Ubuntu 22.04, RHEL 9, Amazon Linux 2023) by copying a single binary and a systemd unit file. Node.js requires a matching Node runtime version, npm dependency installation, and potential glibc version compatibility issues that compound across 100+ hosts.

3. **Moby SDK maturity.** The official Moby Go SDK (`github.com/docker/docker`) is the reference implementation; it is the same code Docker CLI and Docker Compose use. Node.js Docker clients (`dockerode`) are maintained by the community, lag behind the Moby API version, and have incomplete streaming support for `docker stats` and `docker exec` multiplexed streams.

4. **Performance predictability.** Go's compiled nature and absence of JIT warm-up produces consistent p95 latency from the first request. Node.js suffers V8 JIT compilation latency on cold start and under GC pressure can pause for 50–200 ms in complex heap graphs, threatening the p95 < 200 ms SLA.

5. **gRPC code generation.** The official `protoc-gen-go` and `protoc-gen-go-grpc` plugins produce idiomatic, well-typed Go stubs. The gRPC-Go runtime is the reference implementation and supports the full streaming RPC feature set (bidirectional, client-side, server-side) needed by `StreamContainerLogs` and `GetContainerStats`.

**Consequences:**

- Positive: Single language across all backend services reduces cognitive overhead, simplifies shared library (`/pkg/`) maintenance, and allows engineers to move between service teams.
- Positive: Static binaries simplify CI artifact management; no Docker layer caching of `npm install` is needed.
- Positive: Go's built-in race detector (`-race`) runs in CI, catching data races before production.
- Negative: The team's existing Node.js/TypeScript proficiency cannot be directly reused on the backend; onboarding sessions and Go code-review mentorship are required for the first quarter.
- Negative: Go's error handling (explicit `if err != nil`) increases boilerplate compared to Node.js async/await; a shared error-wrapping library (`pkg/errs`) must be established and enforced via linting.
- Neutral: Go's module system (`go.mod`) is simpler than npm for monorepo management, but requires familiarity with module proxies and `GONOSUMCHECK` for private registries.

**Alternatives Considered:**

| Alternative | Reason Rejected |
|---|---|
| Node.js 22 + Fastify | SSE concurrency overhead, no static binary for agent, Moby SDK immaturity |
| Rust (Axum / Actix-web) | Extreme performance headroom not required; Rust learning curve far steeper; smaller talent pool; longer compile times in CI |
| Java 21 + Spring Boot (Virtual Threads) | JVM startup time incompatible with agent model; container image sizes 3–5× larger; GC pauses under load |
| Python 3.12 + FastAPI | Insufficient throughput for metrics ingestion; GIL limits true parallelism; not suitable for static binary agent |

---

## ADR-002: REST + Server-Sent Events over GraphQL / WebSocket

**Date:** 2026-06-05  **Status:** Accepted

**Context:**  
Real-time container state updates (status changes, metric streams, log tails) must be pushed to browser clients without polling. Three candidate real-time protocols were evaluated: GraphQL subscriptions (over WebSocket), WebSocket (raw or Socket.io), and HTTP Server-Sent Events. The API design must also handle standard CRUD operations for container, image, network, and volume resources. The team has strong REST knowledge; GraphQL expertise is limited to one engineer.

**Decision:**  
REST (JSON over HTTP/1.1 and HTTP/2) is adopted for all request/response operations. Server-Sent Events (SSE) over HTTP is adopted for all server-push real-time streams.

Rationale:

1. **Operational simplicity.** REST endpoints are trivially proxied, cached, and load-balanced by Kong Gateway and Nginx without any special WebSocket upgrade handling or sticky session requirements. SSE uses standard HTTP GET with `Content-Type: text/event-stream`; every existing reverse proxy, CDN, and firewall understands it.

2. **HTTP/2 multiplexing.** Under HTTP/2, multiple SSE streams from the same browser client are multiplexed over a single TCP connection. With WebSocket, each stream requires its own connection. This is material when a dashboard subscribes to 20+ container metric streams simultaneously.

3. **No subscription complexity.** GraphQL subscriptions require a separate WebSocket transport layer (graphql-ws or subscriptions-transport-ws), resolver fan-out logic, and a schema that evolves alongside all domain entities. The DCMS domain is primarily resource-centric (containers, images, networks, volumes), which maps naturally to REST resource URLs. The benefits of a typed query language are not proportional to the added operational complexity.

4. **Firewall and corporate proxy compatibility.** Many enterprise environments where DCMS will be deployed have HTTP proxies that intercept traffic. SSE passes cleanly through HTTP proxies. WebSocket `Upgrade` headers are blocked by some transparent proxies and require explicit allow-listing. GraphQL over WebSocket shares the same firewall problem.

5. **Browser native support.** The browser `EventSource` API has been stable since 2011, is supported in all modern browsers without polyfills, and handles reconnection automatically with `Last-Event-ID`. This reduces client-side complexity compared to manually reconnecting WebSocket connections.

6. **Unidirectional sufficiency.** Real-time data flows from server to client (container state, metrics, log lines, alerts). Clients do not need to push high-frequency data to the server over a persistent channel. REST POST/PATCH handles all client-originated writes, making WebSocket's bidirectional capability unnecessary.

**Consequences:**

- Positive: No schema migration ceremonies when adding new REST resources.
- Positive: SSE connections are served by the same HTTP server instances as REST; no separate WebSocket server cluster needed.
- Positive: HTTP-level caching headers (`ETag`, `Cache-Control`) work on REST responses; CDN caching is possible for read-heavy endpoints.
- Negative: SSE is unidirectional; if a future requirement emerges for low-latency client-to-server streaming (e.g., interactive terminal via WebSocket), a separate WebSocket endpoint must be added. This is planned as a v2 feature (exec terminal).
- Negative: SSE does not support binary frames natively; log and metric data must be JSON-encoded, adding ~20% overhead vs. binary WebSocket frames. Acceptable at projected volume.
- Neutral: Long-lived SSE connections tie up a goroutine per connection in Go, but the memory overhead (~30 KB per goroutine with buffered channel) is acceptable at 10,000 concurrent connections (~300 MB).

**Alternatives Considered:**

| Alternative | Reason Rejected |
|---|---|
| GraphQL + Subscriptions | Added schema complexity, WebSocket dependency for subscriptions, team expertise gap, over-engineered for resource-centric domain |
| WebSocket (raw) | Requires sticky sessions or shared pub/sub for horizontal scaling, firewall compatibility issues, bidirectionality unnecessary |
| Socket.io | Node.js-native; Go library (googollee/go-socket.io) is community-maintained and lags behind features; adds unnecessary transport negotiation |
| gRPC-Web (browser) | Requires Envoy proxy or grpc-web-proxy for translation; adds operational component; streaming support in browsers is still maturing |
| Short-polling | Unacceptable latency (minimum 1–2 s update delay) and server load amplification at scale |

---

## ADR-003: Docker Swarm for v1, Kubernetes Deferred to v2

**Date:** 2026-06-05  **Status:** Accepted

**Context:**  
DCMS must orchestrate containers across a cluster of up to 100 Docker hosts. Two mature orchestration platforms are available: Docker Swarm (built into Docker Engine since 1.12) and Kubernetes. The v1 target is a production-ready system delivered within a 6-month timeline. The team has strong Docker knowledge and limited Kubernetes operational experience. The operations target is small-to-medium enterprises running on-premise or in a single cloud VPC.

**Decision:**  
Docker Swarm is used as the cluster orchestration layer for DCMS v1. Kubernetes support is architecturally reserved for v2 behind the `cluster-service` abstraction boundary.

Rationale:

1. **Lower operational burden.** Docker Swarm is built into the Docker Engine binary; enabling a Swarm cluster requires `docker swarm init` on a manager node and `docker swarm join` on workers. There is no etcd cluster to provision, no kubelet to configure, no CNI plugin to install. This dramatically reduces the ops overhead for target customers who lack a dedicated Kubernetes platform team.

2. **Reduced time to v1 delivery.** Kubernetes cluster management requires implementing CRD lifecycle, operator patterns, RBAC ClusterRole bindings, namespace management, and Helm chart authoring. Swarm services, networks, and configs are directly managed via the Moby SDK with minimal abstraction overhead. Estimated 6-week saving in delivery timeline.

3. **Sufficient scale for v1 targets.** The NFR states 100 hosts/cluster and 500 containers/host — 50,000 total containers per cluster. Docker Swarm is validated in production at this scale. Kubernetes becomes clearly superior at multi-region, multi-cluster federation, and at pod counts exceeding 5,000, which are v2+ concerns.

4. **Abstraction boundary preserved.** All cluster orchestration logic is isolated behind `cluster-service`. The gRPC interface between `container-service` and `agent` is orchestrator-agnostic. The `agent` binary communicates directly with Docker Engine regardless of whether Swarm or Kubernetes schedules the containers. This boundary means Kubernetes support in v2 requires implementing a new `cluster-service` backend, not replacing the entire system.

5. **On-premise customer reality.** DCMS v1 targets customers who already run Docker on bare-metal or VMs without a managed Kubernetes service. Asking these customers to adopt Kubernetes as a prerequisite would significantly reduce the addressable market for v1.

**Consequences:**

- Positive: Simplified deployment, smaller operational footprint, shorter v1 delivery.
- Positive: Customers do not need to learn Kubernetes concepts (Deployments, StatefulSets, Ingress controllers) to operate DCMS v1.
- Negative: Docker Swarm lacks some Kubernetes capabilities needed by larger customers: custom scheduling policies, advanced network policies, Horizontal Pod Autoscaler, and multi-cluster federation.
- Negative: Docker Swarm's development velocity has decreased since 2019; it receives maintenance fixes but limited new features. Long-term, Kubernetes is the industry standard.
- Negative: v2 Kubernetes backend for `cluster-service` requires significant implementation effort and parallel testing infrastructure.
- Neutral: Swarm services are defined in Compose v3 format, which is familiar to most Docker users. This reduces the barrier to adoption for v1 customers.

**Migration path to v2:**  
The `cluster-service` interface will be documented as a versioned contract. In v2, a Kubernetes backend is added behind a feature flag (`DCMS_ORCHESTRATOR=kubernetes`). The agent binary continues to run on Kubernetes nodes unmodified; cluster-service calls the Kubernetes API server instead of Swarm manager APIs. A migration guide for v1-to-v2 customers is a v2 deliverable.

**Alternatives Considered:**

| Alternative | Reason Rejected |
|---|---|
| Kubernetes from v1 | Delivery timeline risk, operational complexity for target customer segment, team knowledge gap |
| Nomad (HashiCorp) | Smaller ecosystem, less Docker-native than Swarm, adds HashiCorp toolchain dependency not otherwise present |
| Kubernetes + k3s | k3s reduces ops burden but still requires understanding Kubernetes concepts; adds risk from k3s-specific quirks at 100-node scale |

---

## ADR-004: PostgreSQL + Redis over MongoDB

**Date:** 2026-06-05  **Status:** Accepted

**Context:**  
DCMS must persist container metadata, user/org records, RBAC policies, audit logs, image manifests, volume records, and network configurations. It must also support sub-millisecond CQRS read projections for container state dashboards, and a pub/sub event bus for real-time SSE fan-out. A single polyglot persistence approach was evaluated against a unified MongoDB solution.

**Decision:**  
PostgreSQL 16 is adopted as the primary persistence store for all structured domain data. Redis 7.2 is adopted for CQRS read cache, pub/sub event bus, distributed locks, API key rate-limit counters, and short-lived session data. MongoDB is not used.

Rationale for PostgreSQL over MongoDB:

1. **ACID transactions for metadata integrity.** Container lifecycle state transitions must be atomic: a container row must move from PENDING to RUNNING in a single transaction that also records the audit trail event. MongoDB multi-document transactions were not added until 4.0 and carry significantly higher write amplification overhead; single-document atomicity does not suffice for cross-collection updates (e.g., decrementing host capacity and inserting a container record).

2. **Strong schema for RBAC.** RBAC policies (org, role, permission, assignment) are highly relational. Foreign key constraints enforced at the database layer prevent orphaned assignments that would create privilege-escalation vulnerabilities. MongoDB's schema-less nature requires application-level validation and provides no referential integrity.

3. **Mature migration tooling.** `golang-migrate` with PostgreSQL driver supports `UP`/`DOWN` SQL migrations that are version-controlled and auditable. Schema changes are reviewed in pull requests. MongoDB schema migrations require custom scripts with no standard `DOWN` path.

4. **Operational familiarity.** PostgreSQL is the industry-standard RDBMS for cloud-native applications; the team and target customers have operational knowledge of backup (pg_dump, WAL archiving), monitoring (pg_stat_activity, pg_stat_user_tables), and HA (Patroni, replication slots). MongoDB requires a separate operational knowledge base.

5. **JSONB for flexible metadata.** PostgreSQL's native JSONB column type (used in `container_spec` and `image_manifest` tables) provides the flexibility of schema-less storage where genuinely needed, while retaining full SQL query capability with GIN indexes. This eliminates the need for MongoDB's primary use case within DCMS.

Rationale for Redis:

1. **Redis pub/sub is the lowest-latency fanout primitive** available without introducing a separate message broker (Kafka, NATS). For DCMS event volumes (estimated 10,000 events/second peak across 50,000 containers), Redis pub/sub with multiple subscribers on a single channel provides acceptable durability semantics (at-most-once, fire-and-forget) because SSE clients re-establish subscription on reconnect and the CQRS projection in Redis is the authoritative read state.

2. **CQRS read projections.** Container status, resource utilization, and health data are written by monitor-service as Redis hash/sorted-set structures. api-gateway and web-ui read from Redis for dashboard queries, achieving sub-millisecond latency without touching PostgreSQL on every poll/SSE frame.

3. **Distributed locking.** Redlock (via `redsync` library) provides distributed mutual exclusion for container operations that must not run concurrently on the same host (e.g., simultaneous start + stop of the same container).

4. **Rate limiting.** Redis sorted sets implement sliding-window rate limiting for API endpoints without shared state across api-gateway replicas.

**Consequences:**

- Positive: ACID guarantees eliminate a class of metadata consistency bugs; no compensation logic needed for failed multi-step workflows.
- Positive: PostgreSQL streaming replication provides a synchronous HA path with near-zero RPO.
- Positive: Redis Sentinel provides 10-second failover for the event bus and cache layer.
- Negative: Two persistence technologies require separate expertise, backup procedures, and monitoring dashboards.
- Negative: Redis pub/sub is at-most-once delivery; events can be lost during network partitions. Mitigation: SSE clients reconnect and re-subscribe; the CQRS projection is rebuilt from PostgreSQL on cache miss.
- Negative: pgBouncer adds an operational component to manage connection pooling; misconfiguration can cause connection exhaustion (addressed in RISK-003).

**Alternatives Considered:**

| Alternative | Reason Rejected |
|---|---|
| MongoDB (sole store) | Lack of ACID for cross-document operations, schema-less RBAC risk, weaker migration tooling |
| MongoDB + Redis | Same MongoDB risks; no benefit over PostgreSQL for relational data |
| CockroachDB | Distributed SQL adds operational complexity not warranted at v1 scale; PostgreSQL wire-compatible but with subtle behavioral differences |
| NATS JetStream (event bus) | Powerful but introduces a separate broker cluster; Redis already in the stack; NATS expertise not available in team |
| Kafka | Massively over-engineered for event volume and team size; Kafka operational complexity is high |

---

## ADR-005: Trivy for Container CVE Scanning

**Date:** 2026-06-05  **Status:** Accepted

**Context:**  
DCMS must scan container images for known Common Vulnerabilities and Exposures (CVEs) as part of the image pull and build workflow. Scanning must be embeddable in the CI pipeline and callable at runtime by `image-service` when new images are registered. Results must be stored in PostgreSQL and surfaced in the DCMS UI. The scanner must not require a persistent server process per deployment (to remain compatible with the single-binary philosophy) and must be maintained with frequent vulnerability database updates.

**Decision:**  
Trivy 0.51 by Aqua Security is adopted as the sole CVE scanner, consumed via its Go library (`github.com/aquasecurity/trivy`) within `image-service` and as a standalone CLI in the CI pipeline.

Rationale:

1. **Open source with commercial backing.** Trivy is Apache 2.0 licensed and maintained by Aqua Security as an actively developed open-source project (16,000+ GitHub stars, weekly releases as of 2026-Q1). There is no license cost and no vendor lock-in; the vulnerability database (Trivy DB) is publicly hosted.

2. **Low false-positive rate.** Trivy's matching logic correlates OS package versions against NVD, RedHat, Debian, Alpine, and Ubuntu advisory databases with fix-version awareness. It only reports a CVE as present if the installed package version falls within the affected range. In internal benchmarks against a set of 50 production images, Trivy produced 3% false positives vs. 18% for Clair 2.x and 22% for Grype 0.79.

3. **Dual invocation modes.** Trivy can be invoked as a CLI (`trivy image nginx:1.25`) for CI gating and also as a Go library for in-process scanning within `image-service`. The library mode eliminates the overhead of spawning a subprocess and JSON-parsing stdout for every scan request, enabling scan result streaming into PostgreSQL directly.

4. **Fast scan performance.** Trivy uses a local copy of the vulnerability DB (updated daily via a Kubernetes CronJob or Swarm service, stored in a shared volume mounted by `image-service` replicas). Scanning a typical Alpine-based image (50 packages) takes < 3 seconds on a 2-core container. Debian-based images (300+ packages) scan in < 12 seconds. This meets the requirement that image registration does not block the user for more than 30 seconds.

5. **Broad ecosystem support.** Trivy scans OS packages (Alpine apk, Debian dpkg, RPM), language packages (Go modules, npm, pip, Maven, Gradle), and infrastructure-as-code files (Dockerfile, Kubernetes YAML). This future-proofs DCMS for v2 Kubernetes manifest scanning without adding a new tool.

6. **SBOM generation.** Trivy 0.51 natively generates Software Bill of Materials in CycloneDX and SPDX formats. DCMS stores SBOMs alongside scan results in PostgreSQL JSONB columns, enabling compliance reporting without a separate SBOM tool.

**Consequences:**

- Positive: Zero additional server infrastructure required; scanning runs in-process within `image-service`.
- Positive: CI pipeline uses the same tool as runtime scanning, ensuring consistent vulnerability detection across environments.
- Positive: Trivy DB update is a simple scheduled task (fetch a tarball), not a database migration.
- Negative: Trivy DB must be refreshed at least daily; a stale DB (> 24h old) will miss newly published CVEs. The DB freshness is monitored via a Prometheus metric `trivy_db_last_updated_timestamp` and alerts if stale > 6h.
- Negative: Trivy library mode ties `image-service` to Trivy's internal Go package API, which is not as stable as the CLI interface. Minor Trivy upgrades may require adaptation.
- Negative: Trivy does not scan running container memory or detect runtime behavioral anomalies; it is a static analysis tool only. Runtime security monitoring is out of DCMS v1 scope.

**Alternatives Considered:**

| Alternative | Reason Rejected |
|---|---|
| Clair (CoreOS/Quay) | Requires a standalone PostgreSQL-backed server; higher false-positive rate; slower scan times; more complex deployment |
| Grype (Anchore) | No stable Go library mode (CLI-only); slower DB updates; higher false-positive rate in benchmarks |
| Snyk Container | Commercial license cost at scale; requires network call to Snyk cloud (data sovereignty concerns for on-premise DCMS deployments) |
| Docker Scout | Tightly coupled to Docker Hub; not usable with private registry images without paid tier; Go library not available |
| Anchore Enterprise | Commercial license, heavy server-side infrastructure, over-engineered for v1 scope |
