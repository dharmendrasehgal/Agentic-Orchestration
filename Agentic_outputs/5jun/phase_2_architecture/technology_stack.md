# Approved Technology Stack — DCMS

**Document Version:** 1.0  
**Date:** 2026-06-05  
**Status:** Approved  
**Author:** senior_architect_agent  

All versions listed are the minimum approved versions. Patch-level upgrades within the same minor version are permitted without re-approval. Minor version upgrades require tech-lead sign-off. Major version upgrades require a new ADR.

---

## Frontend

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| React | 18.3.x | UI component library; virtual DOM rendering; concurrent mode features (Suspense, transitions) for smooth dashboard updates | MIT | senior_architect_agent |
| TypeScript | 5.4.x | Static typing for all frontend source; strict mode enforced; eliminates class of runtime null-reference errors | Apache-2.0 | senior_architect_agent |
| Vite | 5.3.x | Build tool and dev server; ES module-native bundling; HMR for fast developer iteration; production build with Rollup | MIT | senior_architect_agent |
| TailwindCSS | 3.4.x | Utility-first CSS framework; no CSS-in-JS runtime overhead; purges unused classes in production build | MIT | senior_architect_agent |
| React Query (TanStack Query) | 5.45.x | Server-state management; automatic cache invalidation triggered by SSE events; stale-while-revalidate semantics for dashboard data | MIT | senior_architect_agent |
| Zustand | 4.5.x | Lightweight client-state management (UI preferences, auth session, selected resources); replaces Redux for local UI state | MIT | senior_architect_agent |
| Recharts | 2.12.x | Composable charting library built on D3; renders CPU/memory/network time-series from SSE metric streams | MIT | senior_architect_agent |
| Vitest | 1.6.x | Unit and integration test runner; compatible with Vite config; Jest-compatible API; used for component logic and hook tests | MIT | senior_architect_agent |

---

## Backend

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| Go | 1.22.x | Primary backend language for all 11 server-side services and agent binary; selected per ADR-001 | BSD-3-Clause | senior_architect_agent |
| Gin | 1.9.x | HTTP web framework; middleware pipeline (logging, recovery, CORS, request-ID); high performance via `httprouter` | MIT | senior_architect_agent |
| GORM | 2.0.x | ORM for PostgreSQL; struct-tag-based mapping; named queries; hooks for audit timestamps; migration integration via `AutoMigrate` disabled in prod (golang-migrate used instead) | MIT | senior_architect_agent |
| Moby SDK | 26.1.x | Official Docker Engine API client (formerly `docker/docker` client); used by container-service, image-service, network-service, volume-service, cluster-service, and agent | Apache-2.0 | senior_architect_agent |
| gRPC (google.golang.org/grpc) | 1.64.x | RPC framework for container-service ↔ agent communication; bidirectional streaming for log and stats RPCs | Apache-2.0 | senior_architect_agent |
| Protocol Buffers (google.golang.org/protobuf) | 1.34.x | Schema definition for gRPC service contracts; deterministic binary serialization; versioned `.proto` files in `proto/` directory | BSD-3-Clause | senior_architect_agent |

---

## Database

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| PostgreSQL | 16.3 | Primary relational datastore for all domain entities (containers, images, volumes, networks, users, orgs, RBAC, audit log); ACID guarantees; JSONB for flexible metadata; GIN indexes; streaming replication for HA | PostgreSQL License (MIT-like) | senior_architect_agent |
| Redis | 7.2.x | CQRS read projection cache; pub/sub event bus (dcms.container.events, dcms.alerts); API key rate-limit counters; distributed locks via Redlock; session/token cache | BSD-3-Clause | senior_architect_agent |
| golang-migrate | 4.17.x | SQL migration tool; `UP`/`DOWN` SQL files version-controlled in `migrations/`; applied at service startup in dev, via CI job in staging/prod; prevents GORM AutoMigrate in production | MIT | senior_architect_agent |

---

## Infrastructure

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| Docker Engine | 26.1.x | Container runtime on all hosts; the system under management; also used to run DCMS services themselves in Swarm | Apache-2.0 | senior_architect_agent |
| Docker Swarm | Built into Docker 26.1.x | Cluster orchestration for v1 deployment; manager/worker node model; overlay networking; service autorestart; selected per ADR-003 | Apache-2.0 | senior_architect_agent |
| Nginx | 1.25.x | Reverse proxy and static file server for web-ui; TLS termination in single-node deployments; gzip compression; cache headers for SPA assets | BSD-2-Clause | senior_architect_agent |
| Kong Gateway | 3.7.x | API gateway layer (alternative/complement to custom api-gateway for traffic management); rate limiting, JWT plugin, request transformation, health checks | Apache-2.0 | senior_architect_agent |
| pgBouncer | 1.22.x | PostgreSQL connection pooler; transaction-mode pooling; max 25 connections per service instance to pgBouncer; prevents DB connection exhaustion (see RISK-003) | ISC License | senior_architect_agent |

---

## Observability

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| Prometheus | 2.52.x | Metrics collection via scrape; all services expose `/metrics` with standard Go runtime metrics plus custom business metrics; alerting rules for threshold-based alerts | Apache-2.0 | senior_architect_agent |
| Grafana | 10.4.x | Metrics and log visualization; pre-built dashboards for container resource utilization, service health, API latency; connected to Prometheus and Loki data sources | AGPL-3.0 | senior_architect_agent |
| Loki | 3.0.x | Log aggregation backend; receives log streams from log-service via push API; queried by Grafana LogQL; no full-text index (label-based); low storage overhead vs. Elasticsearch | AGPL-3.0 | senior_architect_agent |
| cAdvisor | 0.49.x | Per-host container resource metrics (CPU, memory, network, disk I/O); runs as a privileged container on each Docker host; scraped by Prometheus; source for CQRS projections | Apache-2.0 | senior_architect_agent |
| OpenTelemetry Go SDK | 1.27.x | Distributed tracing instrumentation in all services; trace context propagation via W3C Trace Context headers; exports to Jaeger via OTLP gRPC | Apache-2.0 | senior_architect_agent |
| Jaeger | 1.57.x | Distributed trace backend; all-in-one deployment for v1; traces stored in Badger (embedded) or Elasticsearch for production; Grafana Tempo as v2 alternative | Apache-2.0 | senior_architect_agent |

---

## Security

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| Trivy | 0.51.x | Container image CVE scanning; used in image-service (Go library mode) and CI pipeline (CLI mode); SBOM generation in CycloneDX format; selected per ADR-005 | Apache-2.0 | senior_architect_agent |
| HashiCorp Vault | 1.16.x | Secrets management; issues mTLS certificates for agent ↔ container-service gRPC (PKI secrets engine); dynamic PostgreSQL credentials; AES-256 encryption transit engine for sensitive config values | BSL 1.1 | senior_architect_agent |
| Let's Encrypt (ACME v2) | Protocol standard (certbot 2.x / acme.sh) | Automated TLS certificate issuance and renewal for public-facing DCMS endpoints; 90-day certificates with auto-renewal at 30 days remaining | Apache-2.0 (tooling) | senior_architect_agent |

Note on HashiCorp Vault BSL 1.1 license: Vault is used solely for internal infrastructure (secrets management, PKI). It is not embedded in a product distributed to customers and is not used to build a competing secrets-management product. Usage is compliant with BSL 1.1 terms. Review required if DCMS is offered as a managed SaaS that includes Vault as a component sold to third parties.

---

## CI/CD

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| GitHub Actions | Platform (current) | CI/CD pipeline; build, test, lint, scan, deploy jobs; reusable workflows for service builds; matrix jobs for multi-arch builds (amd64, arm64) | GitHub Terms of Service | senior_architect_agent |
| Docker BuildKit | 0.13.x (built into Docker 26) | Efficient multi-stage image builds; cache mounts for Go module and build caches; `--secret` flag for safe credential injection during build; provenance attestation | Apache-2.0 | senior_architect_agent |
| Renovate Bot | 37.x | Automated dependency version update PRs; grouped updates by ecosystem (Go modules, npm, Docker base images); configurable merge schedules | AGPL-3.0 | senior_architect_agent |
| Helm | 3.15.x | Kubernetes chart management (v2 preparation only); not used in v1 Swarm deployment but charts are authored in parallel to reduce v2 migration effort | Apache-2.0 | senior_architect_agent |

---

## Testing

| Technology | Version | Purpose | License | Approved-By |
|---|---|---|---|---|
| Testify | 1.9.x | Go assertion and mock library; `assert`, `require`, `suite` packages; used in all Go service unit and integration tests | MIT | senior_architect_agent |
| testcontainers-go | 0.31.x | Spin up real PostgreSQL and Redis containers in integration tests; eliminates mock databases; containers are torn down post-test; used in all service integration test suites | MIT | senior_architect_agent |
| Playwright | 1.44.x | End-to-end browser testing for web-ui; tests run against a fully deployed DCMS stack in CI (Docker Compose); covers critical user flows: login, deploy container, view logs, configure alert | Apache-2.0 | senior_architect_agent |
| k6 | 0.51.x | Load and performance testing; scripts exercise container deploy, dashboard polling, and SSE subscription endpoints; p95 < 200 ms gate enforced in performance CI job | AGPL-3.0 | senior_architect_agent |
