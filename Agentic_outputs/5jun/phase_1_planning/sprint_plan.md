# Sprint Plan
## Generic Docker Container Management System (DCMS) — v1.0 MVP

| Field         | Value                                      |
|---------------|--------------------------------------------|
| Document ID   | PM-SPRINTS-DCMS-001                        |
| Version       | 1.0.0                                      |
| Status        | Approved                                   |
| Date          | 2026-06-05                                 |
| Author        | Product Manager Agent                      |
| Parent MVP    | PM-MVP-DCMS-001                            |
| Sprint Duration | 2 weeks (except Sprint 0)               |
| Team Capacity | 50 story points per sprint (Sprints 1–10) |
| Sprint 0 Duration | 2 weeks (setup, no story points)      |
| Total Duration | Sprint 0 (Jul 1) → Sprint 10 GA (Sep 30, 2026) |

---

## Table of Contents

1. [Sprint Capacity and Conventions](#1-sprint-capacity-and-conventions)
2. [Sprint 0 — Foundation Setup](#2-sprint-0--foundation-setup)
3. [Sprint 1 — Authentication and RBAC Core](#3-sprint-1--authentication-and-rbac-core)
4. [Sprint 2 — Container Lifecycle and Agent](#4-sprint-2--container-lifecycle-and-agent)
5. [Sprint 3 — Image Management and CVE Scanning](#5-sprint-3--image-management-and-cve-scanning)
6. [Sprint 4 — Networking](#6-sprint-4--networking)
7. [Sprint 5 — Storage and Volumes](#7-sprint-5--storage-and-volumes)
8. [Sprint 6 — Monitoring, Metrics, and Alerting](#8-sprint-6--monitoring-metrics-and-alerting)
9. [Sprint 7 — Centralized Logging and Log Viewer](#9-sprint-7--centralized-logging-and-log-viewer)
10. [Sprint 8 — Dashboard Polish, RBAC UI, and Audit Logs](#10-sprint-8--dashboard-polish-rbac-ui-and-audit-logs)
11. [Sprint 9 — Integration Testing and Performance Tuning](#11-sprint-9--integration-testing-and-performance-tuning)
12. [Sprint 10 — UAT, Documentation, and Release Prep](#12-sprint-10--uat-documentation-and-release-prep)
13. [Sprint Summary Table](#13-sprint-summary-table)

---

## 1. Sprint Capacity and Conventions

### Team Composition (assumed stable)

| Role                  | Count | Sprint Capacity Notes                              |
|-----------------------|-------|----------------------------------------------------|
| Go Backend Engineers  | 3     | Primary owners of API server and DCMS agent        |
| Frontend Engineers    | 2     | React SPA; Playwright E2E tests                    |
| DevOps / Platform Engineer | 1 | Infra, CI/CD, Loki pipeline, Trivy integration    |
| QA Engineer           | 1     | Integration tests, load tests, E2E validation      |
| Product Manager       | 0.5   | Story refinement; sprint reviews                   |

### Story Point Scale

| Points | Complexity Description                                 |
|--------|--------------------------------------------------------|
| 1      | Trivial change (config, copy, minor UI tweak)          |
| 2      | Simple CRUD with one dependency                        |
| 3      | Standard feature with clear requirements               |
| 5      | Multi-layer feature (API + agent + UI)                 |
| 8      | Complex feature (new pipeline, external integration)   |
| 13     | Epic-level; must be split before committing to sprint  |

### Sprint DoD (applies to every sprint)

- All committed stories meet the engineering and frontend DoD defined in PM-MVP-DCMS-001, section 5.
- CI pipeline green on `main` branch at sprint end.
- No P1 (blocking) bugs open for sprint-committed stories.
- Sprint demo delivered to stakeholders.
- Sprint retrospective notes recorded.

### FR-to-Sprint Traceability Convention

Each sprint lists the FR-IDs completed in that sprint. The full FR scope across all sprints maps to the 35 in-scope FRs in PM-MVP-DCMS-001, section 2.

---

## 2. Sprint 0 — Foundation Setup

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 0                                       |
| Date Range    | 2026-07-01 — 2026-07-14                 |
| Duration      | 2 weeks                                 |
| Story Points  | N/A (setup sprint; no story deliverables) |
| Theme         | Infrastructure, environments, skeleton  |

### Goals

1. All development environments provisioned and reachable by every engineer.
2. CI/CD pipeline operational with lint, unit test, build, and Docker image publish stages.
3. Repository structure established: `dcms-api`, `dcms-agent`, `dcms-ui`, `dcms-infra` repos (or monorepo with workspaces).
4. Docker Compose `dev` stack running locally: PostgreSQL 16, Redis 7, a test Docker-in-Docker host, Loki, Prometheus, and Grafana.
5. Helm chart skeleton committed for staging and production deployment targets.
6. Go module initialized with `go 1.22`; React app scaffolded with Vite + TypeScript; `eslint-plugin-jsx-a11y` configured.
7. Database schema v0.0.1 applied via migration tool (golang-migrate or dbmate): tables for `users`, `sessions`, `namespaces`, `audit_log`, `hosts`.
8. Branch protection rules, PR templates, and required code review policy enabled on all repos.
9. Secrets management strategy documented and Vault or AWS Secrets Manager path structure defined.

### Deliverables

- `docker-compose.dev.yml` — full local stack with hot-reload for API and UI
- `Dockerfile` for `dcms-api` and `dcms-agent` (multi-stage Go build; distroless final image)
- `Dockerfile` for `dcms-ui` (Node build stage → nginx:alpine serving stage)
- GitHub Actions (or equivalent) CI pipeline: lint → test → build → image push to registry
- Helm chart: `charts/dcms/` with `values.yaml`, `templates/deployment.yaml`, `templates/service.yaml`
- Database migration: schema v0.0.1 (users, sessions, namespaces, audit_log, hosts tables)
- ADR-001: Go for backend (rationale documented); ADR-002: Loki for log aggregation; ADR-003: Trivy for CVE scanning
- Onboarding runbook: clone → `docker compose up` → running in ≤ 10 minutes

### Definition of Done

- Every engineer has run `docker compose up` and reached the UI scaffold at `http://localhost:3000`.
- CI pipeline passes on a Hello-World Go handler and a React app render test.
- Database schema migrations run cleanly on a fresh PostgreSQL instance.
- Helm `helm install dcms ./charts/dcms --dry-run` completes without error.

---

## 3. Sprint 1 — Authentication and RBAC Core

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 1                                       |
| Date Range    | 2026-07-15 — 2026-07-28                 |
| Duration      | 2 weeks                                 |
| Story Points  | 47 committed / 50 capacity              |
| Theme         | Auth, RBAC, Namespace, SSO              |

### Goals

1. Users can log in with local credentials and receive a JWT (1-hour expiry with 24-hour refresh token).
2. OIDC/SAML SSO integration operational with a test IdP (Keycloak); IdP group → DCMS role mapping working.
3. Platform Admin can create user accounts, assign roles scoped to namespaces, and deactivate accounts.
4. Namespace CRUD API and management UI panel complete.
5. RBAC middleware enforces role checks on every API endpoint (not just auth); automated policy test suite passing.
6. API Key creation, listing, and revocation live; keys scoped to role and namespace.
7. Audit log writes for all auth and user management operations.

### User Stories

| US-ID  | Story                                | Story Points | FR-IDs Covered         |
|--------|--------------------------------------|--------------|------------------------|
| US-001 | Platform Admin — User Management     | 3            | FR-043, FR-044, FR-047 |
| US-003 | Platform Admin — Namespace Management | 3           | FR-049, FR-047         |
| US-024 | Platform Admin — Configure SSO/OIDC  | 8            | FR-045, FR-047         |
| US-012 | DevOps Engineer — Register Registry Credentials | 3 | FR-019, FR-047      |
| US-021 | Security Auditor — API Key Usage Report | 3         | FR-046, FR-047         |
| US-020 | Security Auditor — RBAC Compliance View | 3         | FR-048                 |
| US-030 | Platform Admin — OpenAPI Docs Access  | 2            | FR-059, FR-060         |

**Sprint 1 Story Point Total:** 25 + 22 (API Key management, RBAC middleware, JWT infra, rate limiting scaffold) = **47**

### Key Technical Deliverables

- `POST /api/v1/auth/login` — local login; JWT + refresh token returned
- `POST /api/v1/auth/oidc/callback` — OIDC authorization code flow handler
- `GET/POST/PUT/DELETE /api/v1/users` — user account CRUD (Admin only)
- `POST /api/v1/users/{id}/roles` — role assignment with namespace scope
- `GET/POST/DELETE /api/v1/namespaces` — namespace CRUD
- `GET/POST/DELETE /api/v1/api-keys` — API key lifecycle
- `GET /api/v1/audit` — audit log search with actor, action, time-range filters; CSV export
- `GET /api/v1/health` — dependency health check endpoint (FR-064)
- RBAC middleware: `AuthN` and `AuthZ` middleware chain applied to all routes
- Rate limiting middleware: 1000 req/min (Operator), 100 req/min (Viewer), enforced via Redis sliding window
- `/api/docs` Swagger UI served from embedded OpenAPI spec

### Definition of Done

- OIDC login tested against Keycloak sandbox with Admin, Operator, Viewer group mappings; all 3 pass automated integration tests.
- RBAC policy tests: 30+ assertions confirming Viewer mutation block, Operator namespace scoping, Admin full access — all green in CI.
- Audit log integration test: `user.create`, `user.role_assign`, `namespace.create`, `apikey.create`, `apikey.revoke`, `sso.config.update` entries verified.
- OpenAPI spec at `/api/docs` passes `openapi-schema-validator` with zero errors.

---

## 4. Sprint 2 — Container Lifecycle and Agent

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 2                                       |
| Date Range    | 2026-07-29 — 2026-08-11                 |
| Duration      | 2 weeks                                 |
| Story Points  | 49 committed / 50 capacity              |
| Theme         | Host registration, DCMS Agent, container CRUD |

### Goals

1. Platform Admin can register a Docker host; DCMS agent deploys and establishes heartbeat within 60 seconds.
2. Full container lifecycle API operational: create, start, stop, kill, restart, remove, list, detail.
3. Container list UI shows all containers across registered hosts with status, image, host, and resource quick-stats.
4. Container detail page renders live-refreshed metadata (status, ports, volumes, env vars, resource usage).
5. Inline log tail (FR-011) delivers live stdout via WebSocket with ≤ 2-second latency.
6. Developer can deploy to dev namespace and restart containers via self-service (US-013, US-014).
7. Audit log writes for all container lifecycle operations.

### User Stories

| US-ID  | Story                                        | Story Points | FR-IDs Covered                      |
|--------|----------------------------------------------|--------------|-------------------------------------|
| US-002 | Platform Admin — Host Registration           | 5            | FR-065, FR-066, FR-047              |
| US-004 | DevOps Engineer — Deploy Container           | 5            | FR-001, FR-002, FR-008, FR-047      |
| US-005 | DevOps Engineer — Stop and Remove Container  | 3            | FR-003, FR-006, FR-007, FR-047      |
| US-013 | Developer — Self-Service Deployment (dev NS) | 3            | FR-001, FR-002, FR-049              |
| US-014 | Developer — Restart a Container              | 2            | FR-004, FR-047                      |
| US-015 | Developer — Live Log Tail                    | 3            | FR-011                              |
| US-016 | Developer — View Container Resource Usage    | 3            | FR-008, FR-034                      |
| US-022 | Read-only Viewer — Cluster Overview          | 2            | FR-051, FR-052                      |
| US-029 | Developer — View Container Health Check Status | 2          | FR-033                              |

**Sprint 2 Story Point Total:** 28 + 21 (agent mTLS, WebSocket infrastructure, container list UI, host list UI) = **49**

### Key Technical Deliverables

- DCMS Agent (`dcms-agent`): Go binary with Docker Engine API client; heartbeat via Redis; mTLS client cert to API server
- `POST /api/v1/hosts` — host registration; agent deployment instructions
- `GET/DELETE /api/v1/hosts/{id}` — host detail and deregistration
- `POST /api/v1/containers` — create container (image, name, host_id, env_vars, resource_limits, port_bindings, volumes)
- `POST /api/v1/containers/{id}/start|stop|restart|kill` — lifecycle commands
- `DELETE /api/v1/containers/{id}` — remove stopped container
- `GET /api/v1/containers` — paginated list with filter by status, host, namespace, label (FR-009, FR-061)
- `GET /api/v1/containers/{id}` — container detail with live stats
- `GET /api/v1/containers/{id}/logs` (WebSocket) — live-tail stdout/stderr (FR-011)
- Container List React component: sortable table, status badges, bulk-select, start/stop/restart/remove actions
- Container Detail React page: metadata panel, resource quick-stats, health check status badge, inline log tail tab
- Cluster Overview dashboard: host count, running/stopped counts, aggregate CPU/memory, active alert count (FR-051)

### Definition of Done

- Host registration test: register a Docker-in-Docker host in CI; agent heartbeat received within 60 seconds.
- Container lifecycle integration test: create → start → view detail → restart → stop → remove; all 6 steps pass; audit log entries verified.
- Live-log WebSocket test: 500 log lines emitted by container; all 500 received by test client within 10 seconds; connection terminates cleanly on client disconnect.
- Viewer role: action buttons absent in rendered container list and detail pages (Playwright assertion).

---

## 5. Sprint 3 — Image Management and CVE Scanning

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 3                                       |
| Date Range    | 2026-08-12 — 2026-08-25                 |
| Duration      | 2 weeks                                 |
| Story Points  | 48 committed / 50 capacity              |
| Theme         | Image pull, Trivy CVE scan, registry UI |

### Goals

1. Image pull from Docker Hub, ECR, GCR, and Harbor using stored registry credentials.
2. Trivy scan triggered automatically on every pull; scan results stored in PostgreSQL.
3. CRITICAL CVE images are automatically blocked from deployment to the `prod` namespace.
4. Image list UI shows scan status badges (Scan Passed, Blocked, Scanning, Not Scanned).
5. Security Auditor can browse production image scan history and drill into per-CVE detail.
6. Image delete prevents removal of images in use by running containers.

### User Stories

| US-ID  | Story                                       | Story Points | FR-IDs Covered            |
|--------|---------------------------------------------|--------------|---------------------------|
| US-011 | DevOps Engineer — Pull Image with CVE Scan  | 5            | FR-013, FR-018, FR-047    |
| US-012 | DevOps Engineer — Register Registry Credentials (carried from Sprint 1; full UI) | 3 | FR-019 |
| US-019 | Security Auditor — Review Image Scan Results | 3           | FR-016, FR-017, FR-018    |
| US-004 | DevOps Engineer — Deploy Container (CVE block path) | 3     | FR-001, FR-018            |

**Sprint 3 Story Point Total:** 14 + 34 (Trivy integration, image store schema, registry credentials encryption, image list UI, scan results UI, CVE block middleware) = **48**

### Key Technical Deliverables

- `POST /api/v1/images/pull` — async pull + scan; returns job ID for polling
- `GET /api/v1/images/pull/{job_id}` — pull and scan job status
- `GET /api/v1/images` — paginated image list with host, tag, scan_status filters (FR-016)
- `GET /api/v1/images/{id}` — image detail with full CVE list (CVE-ID, severity, CVSS, affected pkg, fix version)
- `DELETE /api/v1/images/{id}` — delete with in-use guard (FR-017)
- Trivy integration: on-agent scan via `trivy image --format json`; results POSTed to API server; stored in `image_scan_results` table
- CVE enforcement middleware: `POST /api/v1/containers` checks scan status for `prod` namespace; returns `400` with CVE summary if CRITICAL found
- Registry credentials: stored with AES-256 column encryption; decrypted in-memory only at pull time; never logged
- Image Registry UI: list view with scan badge, pull modal, delete confirmation, drill-in scan results panel (FR-055)

### Definition of Done

- Pull + scan integration test: pull `nginx:latest` from Docker Hub; scan completes within 5 minutes; results visible via API.
- CVE block integration test: tag a test image with a known CRITICAL CVE fixture; attempt `POST /api/v1/containers` to `prod` namespace; assert HTTP 400 with CVE IDs in response body.
- Registry credential test: pull from a mock private registry with stored credentials; assert pull succeeds; verify credential value never appears in audit log or application log.
- Scan history: Security Auditor role can list and filter images by `critical` severity; Playwright E2E test passes.

---

## 6. Sprint 4 — Networking

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 4                                       |
| Date Range    | 2026-08-26 — 2026-09-08                 |
| Duration      | 2 weeks                                 |
| Story Points  | 44 committed / 50 capacity              |
| Theme         | Docker networks, port mapping, connect/disconnect |

### Goals

1. Full Docker network lifecycle API: create (bridge/overlay/macvlan/host/none), list, delete with in-use guard.
2. Attach and detach containers to/from networks with optional IP and alias.
3. Port mapping inventory: list all active host → container port bindings across all hosts with conflict detection.
4. Overlay network creation on a Swarm cluster spans multiple hosts; inter-container DNS resolution verified.
5. Network management UI provides list view, network detail (attached containers, CIDR, driver), and create/delete actions.

### User Stories

| US-ID  | Story                                       | Story Points | FR-IDs Covered                              |
|--------|---------------------------------------------|--------------|---------------------------------------------|
| US-009 | DevOps Engineer — Manage Docker Networks    | 5            | FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-047 |

**Sprint 4 Story Point Total:** 5 + 39 (network API handlers, agent network commands, UI components, port conflict detection, integration tests) = **44**

### Key Technical Deliverables

- `POST /api/v1/networks` — create network (driver, subnet, gateway, scope)
- `GET /api/v1/networks` — paginated network list with driver, scope, host, attached container count (FR-025)
- `GET /api/v1/networks/{id}` — network detail with attached container IPs and aliases
- `DELETE /api/v1/networks/{id}` — delete with attached-container guard (FR-022)
- `POST /api/v1/networks/{id}/connect` — attach container with optional IP and alias (FR-023)
- `POST /api/v1/networks/{id}/disconnect` — detach container (FR-024)
- `GET /api/v1/port-mappings` — aggregated port mapping list across all hosts; `conflict: true` flag on duplicate host ports (FR-026)
- Network Management UI: network list table, create-network modal (driver selector, CIDR input), network detail slide-over, connect/disconnect actions
- Conflict detection: real-time conflict badge in port mapping list; alert rule hook for future use

### Definition of Done

- Network lifecycle integration test: create overlay on Swarm (DinD), attach 2 containers on different simulated hosts, assert cross-container DNS resolution, disconnect, delete.
- Port conflict test: deploy two containers with the same host port; assert `conflict: true` in port mappings API response.
- In-use guard test: attempt to delete a network with an attached container; assert HTTP 409 with correct error message.
- Network UI: create-network → attach container → view detail flow passes Playwright E2E test.

---

## 7. Sprint 5 — Storage and Volumes

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 5                                       |
| Date Range    | 2026-09-09 — 2026-09-22 (runs in parallel with Sprint 6 frontend work; see note) |
| Duration      | 2 weeks                                 |
| Story Points  | 40 committed / 50 capacity              |
| Theme         | Docker volumes, persistent storage, volume management UI |

> **Note:** Sprint 5 and Sprint 6 run concurrently in the schedule (both end 2026-09-22) because they cover independent backend domains. Backend engineers split: 2 on storage (Sprint 5 scope), 1 on monitoring agent pipeline (Sprint 6 scope). Frontend engineers finish networking UI carried from Sprint 4 in the first week, then begin volume UI and monitoring UI in week 2.

### Goals

1. Full Docker volume lifecycle API: create (local, NFS, cloud-block drivers), list, delete with in-use guard.
2. Volume attach to container at creation time (read-write and read-only modes).
3. Volume list UI with driver, size estimate, mount path, and attached container count.
4. Volume deletion blocked when any container (running or stopped) references the volume.
5. Volume usage alert hook integrated with the alert rule engine (Sprint 6 will complete the alert dispatch).

### User Stories

| US-ID  | Story                                    | Story Points | FR-IDs Covered                    |
|--------|------------------------------------------|--------------|-----------------------------------|
| US-010 | DevOps Engineer — Manage Volumes         | 3            | FR-028, FR-029, FR-030, FR-031, FR-047 |

**Sprint 5 Story Point Total:** 3 + 37 (volume API handlers, agent volume commands, volume UI, in-use guard logic, NFS driver options, integration tests) = **40**

### Key Technical Deliverables

- `POST /api/v1/volumes` — create volume (name, driver, driver_opts: NFS share, cloud block device options)
- `GET /api/v1/volumes` — paginated volume list with filter by host, driver; size estimate from Docker Engine (FR-031)
- `GET /api/v1/volumes/{id}` — volume detail: mount path, attached containers, size, created date
- `DELETE /api/v1/volumes/{id}` — delete with referenced-container guard (FR-029)
- Volume attachment at container create: `POST /api/v1/containers` accepts `volumes[]` array with `name`, `mount_path`, `mode` (rw/ro) (FR-030)
- Volume Management UI: list table, create-volume modal (driver, driver options), volume detail panel, delete confirmation
- Volume usage metric: agent polls Docker volume size via `docker system df -v`; result stored in `volume_usage` metrics table every 60 seconds

### Definition of Done

- Volume lifecycle integration test: create → attach to container at deploy → restart container → verify data persists → stop container → delete volume attempt blocked → remove container → delete volume succeeds.
- NFS driver test: create volume with `driver: local`, `o: addr=<nfs-server>,type=nfs` — verify volume created via Docker Engine; driver options stored in DB.
- In-use guard test: volume referenced by stopped container; DELETE returns HTTP 409 with container name in message.
- Volume UI: create → view detail → delete flow passes Playwright E2E test.

---

## 8. Sprint 6 — Monitoring, Metrics, and Alerting

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 6                                       |
| Date Range    | 2026-09-09 — 2026-09-22                 |
| Duration      | 2 weeks                                 |
| Story Points  | 46 committed / 50 capacity              |
| Theme         | Host/container metrics, Prometheus, alert rules, notifications |

### Goals

1. DCMS agent exports host and container metrics (CPU %, memory %, disk I/O, network I/O, container restart count, HEALTHCHECK status) to a Prometheus endpoint scraped every 15 seconds.
2. Metrics stored with 30-day retention in Victoria Metrics or Prometheus with remote-write.
3. Alert rule engine: Admin can define threshold-based rules; rules evaluated on every metrics scrape cycle.
4. Alert notification dispatch: Slack webhook and SMTP email channels; notifications delivered within 60 seconds of rule trigger; exponential backoff retry.
5. Real-time metrics charts in dashboard: line charts for CPU, memory, network I/O, disk I/O; 30-day history; time-range selector (FR-053).

### User Stories

| US-ID  | Story                                      | Story Points | FR-IDs Covered                  |
|--------|--------------------------------------------|--------------|----------------------------------|
| US-007 | DevOps Engineer — Configure Alert Rules    | 5            | FR-035, FR-036, FR-047           |
| US-016 | Developer — View Container Resource Usage  | 3            | FR-034, FR-053                   |
| US-025 | Platform Admin — Alert Notification Channels | 3          | FR-036, FR-047                   |
| US-032 | Platform Admin — Resource Usage Dashboard  | 3            | FR-034, FR-051, FR-053           |

**Sprint 6 Story Point Total:** 14 + 32 (Prometheus exporter in agent, Victoria Metrics setup, alert rule evaluator, notification dispatcher, metrics charts React components) = **46**

### Key Technical Deliverables

- DCMS Agent: `/metrics` endpoint (Prometheus format); container stats via Docker API `stats` stream; HEALTHCHECK status from `inspect`
- `GET/POST/PUT/DELETE /api/v1/alert-rules` — alert rule CRUD (metric, operator, threshold, window, namespace scope)
- `GET /api/v1/alert-rules/{id}/history` — alert fire history (90-day retention)
- Alert evaluator: Go goroutine that evaluates all active rules against latest metrics on each scrape cycle; writes `alert_events` table
- Notification dispatcher: sends Slack HTTP webhook and SMTP email; retries with backoff (30s, 1m, 5m, 15m, 30m); dead-letter log on exhaustion
- `GET/POST/DELETE /api/v1/notification-channels` — Slack and email channel management with test-message send on save
- `GET /api/v1/metrics/hosts/{host_id}` — time-series query for host metrics (PromQL proxy or Victoria Metrics query API)
- `GET /api/v1/metrics/containers/{id}` — time-series query for container metrics
- Metrics Charts React component: Recharts line chart; time-range selector (1h, 6h, 24h, 7d, 30d); auto-refresh every 10 seconds (FR-053)
- Resource Usage dashboard section in Cluster Overview (FR-051): per-host CPU/memory/disk gauges; amber highlight at 85% memory

### Definition of Done

- Alert rule integration test: create rule `CPU > 90% for 5 min`; simulate CPU spike via test container; assert `alert_events` row created within 60 seconds; Slack mock receives webhook payload.
- Notification retry test: Slack endpoint returns 500; assert 5 retry attempts with correct backoff intervals; delivery failure recorded in notification log.
- Metrics chart E2E test: open container detail → metrics tab; verify chart renders with at least 1 data point; Playwright assertion passes.
- Victoria Metrics 30-day retention verified by storing synthetic metrics and querying at t-30d.

---

## 9. Sprint 7 — Centralized Logging and Log Viewer

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 7                                       |
| Date Range    | 2026-09-09 — 2026-09-22                 |
| Duration      | 2 weeks                                 |
| Story Points  | 44 committed / 50 capacity              |
| Theme         | Loki log pipeline, log search API, Log Viewer UI |

> **Note:** Sprint 7 runs concurrently with Sprints 5 and 6 (all ending 2026-09-22). It is owned by the Platform Engineer and one Backend Engineer working on the logging pipeline, while other engineers complete Sprint 5 and Sprint 6 in parallel.

### Goals

1. Fluent Bit sidecar (or DCMS agent plugin) forwards container stdout/stderr to Loki on every registered host.
2. Log aggregation pipeline delivers logs to Loki within 10 seconds of container emission (FR-038).
3. Log search API supports full-text keyword search, container name filter, host filter, time-range filter, and log level filter (FR-039).
4. Log Viewer UI with live-tail (WebSocket) and search mode; pagination; results returned within 5 seconds for ≤ 30 days of data.
5. Viewer role scoped to a namespace cannot access logs from other namespaces.

### User Stories

| US-ID  | Story                                 | Story Points | FR-IDs Covered     |
|--------|---------------------------------------|--------------|---------------------|
| US-008 | DevOps Engineer — View Container Logs | 5            | FR-038, FR-039, FR-054 |
| US-015 | Developer — Live Log Tail             | 3            | FR-011, FR-038, FR-054 |
| US-023 | Read-only Viewer — View Logs          | 2            | FR-039, FR-054      |

**Sprint 7 Story Point Total:** 10 + 34 (Fluent Bit config, Loki stack deployment, LogQL query service, log search API, namespace-scoped RBAC for logs, Log Viewer React component, WebSocket log-tail service) = **44**

### Key Technical Deliverables

- Fluent Bit ConfigMap / config file: Docker input plugin; Loki output with container labels (`container_name`, `host_id`, `namespace`)
- Loki deployment in Helm chart: single-binary mode for staging; scalable mode config for production
- `GET /api/v1/logs` — log search endpoint: `container_id`, `host_id`, `namespace`, `start_time`, `end_time`, `keyword`, `level`, `limit`, `cursor` params; LogQL query proxied to Loki
- Log search namespace RBAC: query filtered by calling user's namespace scope; no cross-namespace leakage
- `GET /api/v1/logs/stream` (WebSocket) — live-tail for a given `container_id`; 1000-line rolling buffer; graceful close on client disconnect
- Log Viewer React component: search bar, time-range picker, filter pills (container, host, level), paginated results table, "Live" toggle switching to WebSocket mode
- Syntax highlighting: JSON log lines formatted with key/value coloring in the viewer (FR-054)

### Definition of Done

- Log aggregation integration test: start a container that emits 1000 log lines over 10 seconds; assert all 1000 lines queryable via `/api/v1/logs` within 15 seconds.
- Namespace isolation test: user with Viewer role scoped to `dev`; search for logs from `prod` namespace container; assert empty results with "No access" message.
- Live-tail WebSocket test: open stream; emit 200 log lines; assert all received with latency ≤ 2 seconds per batch; close client; assert server-side connection terminated.
- Log Viewer E2E: Playwright test opens Log Viewer, searches for keyword in a known test container's logs, verifies ≥ 1 result row; switches to live-tail mode; pauses and resumes stream.

---

## 10. Sprint 8 — Dashboard Polish, RBAC UI, and Audit Logs

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 8                                       |
| Date Range    | 2026-09-09 — 2026-09-22                 |
| Duration      | 2 weeks                                 |
| Story Points  | 42 committed / 50 capacity              |
| Theme         | UI hardening, Swarm management, audit log UI, Docker Swarm service scale |

> **Note:** Sprint 8 also runs in the same date window (2026-09-09 – 2026-09-22) as Sprints 5, 6, and 7, handled by remaining frontend capacity. The two frontend engineers divide: one on logging UI (Sprint 7), one on Swarm UI and audit log UI (Sprint 8). This four-sprint parallel execution converges at 2026-09-22 for Sprint 9 integration and performance work.

### Goals

1. Docker Swarm service list, detail, and scale UI fully operational (FR-067, FR-068).
2. User and RBAC Management UI panel complete: user table, create/edit/deactivate, role assignment, SSO configuration form (FR-056).
3. Audit Log search UI integrated into Admin panel: search by actor, action type, time range; CSV export (FR-048).
4. Cluster Overview dashboard polished: all metrics wired, active alert count, health badges live (FR-051).
5. Responsive design at 1280px desktop verified; keyboard navigation audit passed (FR-057, NFR-ACC-001, NFR-ACC-002).

### User Stories

| US-ID  | Story                                             | Story Points | FR-IDs Covered              |
|--------|---------------------------------------------------|--------------|-----------------------------|
| US-006 | DevOps Engineer — Scale a Swarm Service           | 5            | FR-067, FR-068, FR-047      |
| US-018 | Security Auditor — Search Audit Logs              | 5            | FR-048                      |
| US-028 | DevOps Engineer — Drain a Cluster Node            | 5            | FR-066, FR-047              |
| US-002 | Platform Admin — Host Registration (UI polish)    | 2            | FR-065                      |

**Sprint 8 Story Point Total:** 17 + 25 (Swarm API integration, service list/detail/scale UI, audit log UI, RBAC management UI, host registration UI, Axe-core accessibility audit sweep, cluster overview wiring) = **42**

### Key Technical Deliverables

- `GET /api/v1/clusters/{id}/services` — Swarm service list with replica counts (FR-067)
- `GET /api/v1/clusters/{id}/services/{svc_id}` — service detail: image, desired/running replicas, task status
- `PUT /api/v1/clusters/{id}/services/{svc_id}/scale` — scale service replicas (FR-068)
- `POST /api/v1/hosts/{id}/drain` — drain host (reschedule Swarm tasks); `POST /api/v1/hosts/{id}/resume` — return to schedulable
- Swarm Services UI: service table with replica progress bar, scale modal with cluster headroom warning, rollout progress WebSocket subscription
- User Management UI: paginated user table, create/edit/deactivate modal, role-assignment dropdown with namespace scope selector, SSO config panel
- Audit Log UI: search form (actor email, action type, start/end date), results table (actor, action, resource, timestamp, source IP), "Export CSV" button
- Cluster Overview: wire all metrics panels; active alert badge from `alert_events`; host status (connected/unreachable) indicator
- Axe-core sweep: run `@axe-core/playwright` on all 8 primary pages; fix all AA violations before sprint end

### Definition of Done

- Scale service integration test: scale Swarm service from 2 → 5; assert 5 running tasks within 5 minutes; rollout progress events received via WebSocket; audit log entry verified.
- Audit log search integration test: search by actor email and action `container.start` over 30-day range; assert correct results returned within 5 seconds; CSV export contains all matching rows.
- Axe-core: zero WCAG 2.1 AA violations on all 8 primary pages (Playwright + axe assertion).
- Node drain test: drain a DinD node with 3 running containers; assert tasks rescheduled to second DinD node within 5 minutes.

---

## 11. Sprint 9 — Integration Testing and Performance Tuning

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 9                                       |
| Date Range    | 2026-09-23 — 2026-09-27 (5 days — condensed sprint) |
| Duration      | 1 week (convergence and hardening sprint) |
| Story Points  | 25 committed / 30 capacity (reduced for testing focus) |
| Theme         | Full system integration, k6 load test, bug fixes, OpenAPI validation |

> **Note:** Sprint 9 is a condensed one-week sprint (5 business days) focused entirely on integration, performance, and hardening. No new feature development. All parallel Sprint 5–8 work converges here.

### Goals

1. Full end-to-end integration test suite running against the complete staging stack (API server + agent + PostgreSQL + Redis + Loki + Victoria Metrics).
2. k6 load test: 200 virtual users, 10-minute mixed-workload run; API p95 ≤ 300ms (read) and ≤ 500ms (write) confirmed.
3. All 5 critical user journeys pass Playwright E2E tests against staging.
4. Zero P1 (blocking) bugs open at sprint end.
5. OpenAPI spec validated; all 35 in-scope FR-IDs have at least one integration test green in CI.
6. OWASP ZAP baseline scan: zero high or critical findings.
7. Trivy scan on DCMS images: zero CRITICAL CVEs.

### User Stories / Tasks

| Task-ID | Task Description                                       | Effort (pts) | Owner                |
|---------|--------------------------------------------------------|--------------|----------------------|
| T-901   | Run full integration test suite; triage and fix failures | 8          | Backend + QA         |
| T-902   | k6 load test (200 VUs, 10 min); fix any latency regressions | 5        | QA + Backend         |
| T-903   | Playwright E2E: all 5 critical user journeys on staging | 5           | QA + Frontend        |
| T-904   | OWASP ZAP baseline scan; fix high/critical findings    | 5            | Backend + Security   |
| T-905   | Trivy scan all DCMS images; remediate CRITICAL CVEs    | 2            | DevOps               |

**Sprint 9 Total:** 25 points

### Definition of Done

- CI pipeline on `main` branch: all integration tests, E2E tests, and contract tests green.
- k6 summary report: p95 read latency ≤ 300ms; p95 write latency ≤ 500ms; error rate ≤ 0.1%; report committed to repo.
- ZAP scan report: zero high or critical findings; report committed to repo.
- Trivy scan output: zero CRITICAL CVEs in `dcms-api`, `dcms-agent`, `dcms-ui` images; output committed to repo.
- P1 bug count: 0 open.

---

## 12. Sprint 10 — UAT, Documentation, and Release Prep

| Field         | Value                                   |
|---------------|-----------------------------------------|
| Sprint Number | 10                                      |
| Date Range    | 2026-09-28 — 2026-09-30 (3 days — release sprint) |
| Duration      | 3 days                                  |
| Story Points  | N/A (release activities)                |
| Theme         | User Acceptance Testing, documentation, GA release |

> **Note:** Sprint 10 is a 3-day release sprint (Monday–Wednesday). No new code. Bug fixes only if P1 (blocking) found during UAT.

### Goals

1. UAT sign-off from designated stakeholders (DevOps Lead, Security Lead, Product Manager).
2. Deployment runbook validated on a clean environment by a team member who did not author it.
3. Release notes published covering all 35 in-scope FRs, known limitations, and breaking API changes.
4. Helm chart `values.yaml` documented for all configurable parameters.
5. v1.0 GA tag cut on `main`; Docker images published to registry with `v1.0.0` tag.
6. All release criteria checklist items (PM-MVP-DCMS-001, section 6) signed off.

### User Stories / Tasks

| Task-ID | Task Description                                          | Effort   | Owner                |
|---------|-----------------------------------------------------------|----------|----------------------|
| T-1001  | UAT sessions: 3 stakeholder groups run 5 critical user journeys | 1 day | Product Manager + QA |
| T-1002  | Validate deployment runbook on a clean VM (by independent team member) | 0.5 day | DevOps         |
| T-1003  | Author release notes v1.0.0; include known limitations and upgrade path | 0.5 day | Product Manager |
| T-1004  | Cut v1.0.0 git tag; publish Docker images; update Helm chart version to 1.0.0 | 0.5 day | DevOps          |
| T-1005  | Complete release criteria checklist sign-off; archive to project wiki | 0.5 day | QA Lead + PM     |

### Definition of Done (Release)

- UAT sign-off received from DevOps Lead, Security Lead, and Product Manager (written confirmation).
- Deployment runbook executed successfully by team member who did not write it; no undocumented steps encountered.
- Release notes PR merged to `main`; known-limitations section present.
- `git tag v1.0.0` created; Docker Hub (or internal registry) shows images `dcms-api:v1.0.0`, `dcms-agent:v1.0.0`, `dcms-ui:v1.0.0`.
- All 15 release criteria checklist items in PM-MVP-DCMS-001, section 6 are checked and signed off.
- **GA date: 2026-09-30.**

---

## 13. Sprint Summary Table

| Sprint | Date Range               | Duration    | Theme                                     | Story Points | FR-IDs Covered                                                            | Key Deliverables                                    |
|--------|--------------------------|-------------|-------------------------------------------|--------------|---------------------------------------------------------------------------|-----------------------------------------------------|
| 0      | 2026-07-01 – 2026-07-14  | 2 weeks     | Foundation, CI/CD, skeleton               | N/A          | —                                                                         | Repo setup, CI pipeline, Docker Compose dev stack, DB schema v0.0.1, Helm skeleton |
| 1      | 2026-07-15 – 2026-07-28  | 2 weeks     | Auth, RBAC, Namespaces, SSO               | 47           | FR-043, FR-044, FR-045, FR-046, FR-047 (partial), FR-048, FR-049, FR-059, FR-060, FR-063, FR-064 | JWT auth, OIDC SSO, user CRUD, namespace CRUD, API keys, rate limiting, Swagger UI |
| 2      | 2026-07-29 – 2026-08-11  | 2 weeks     | Container lifecycle, host registration, agent | 49        | FR-001, FR-002, FR-003, FR-004, FR-006, FR-007, FR-008, FR-009, FR-011, FR-033, FR-051, FR-052, FR-061, FR-065, FR-066 | DCMS agent, host reg API, container CRUD API, container list/detail UI, live-tail WebSocket, cluster overview |
| 3      | 2026-08-12 – 2026-08-25  | 2 weeks     | Image management, CVE scanning            | 48           | FR-013, FR-016, FR-017, FR-018, FR-019                                    | Image pull API, Trivy integration, CVE block middleware, registry credentials encryption, image registry UI |
| 4      | 2026-08-26 – 2026-09-08  | 2 weeks     | Networking                                | 44           | FR-021, FR-022, FR-023, FR-024, FR-025, FR-026                            | Network CRUD API, connect/disconnect API, port mapping API, network management UI |
| 5      | 2026-09-09 – 2026-09-22  | 2 weeks     | Storage and volumes                       | 40           | FR-028, FR-029, FR-030, FR-031                                            | Volume CRUD API, volume attach at container create, volume management UI |
| 6      | 2026-09-09 – 2026-09-22  | 2 weeks     | Monitoring, metrics, alerting             | 46           | FR-033, FR-034, FR-035, FR-036, FR-051, FR-053                            | Prometheus exporter in agent, Victoria Metrics, alert rule engine, notification dispatcher, metrics charts UI |
| 7      | 2026-09-09 – 2026-09-22  | 2 weeks     | Centralized logging, log viewer           | 44           | FR-038, FR-039, FR-054                                                    | Fluent Bit → Loki pipeline, log search API, log viewer React component, live-tail WebSocket |
| 8      | 2026-09-09 – 2026-09-22  | 2 weeks     | Dashboard polish, RBAC UI, Swarm, audit log UI | 42      | FR-047 (complete), FR-048, FR-051 (wired), FR-056, FR-067, FR-068         | Swarm service scale UI, user/RBAC management UI, audit log search UI, cluster overview wired, accessibility audit |
| 9      | 2026-09-23 – 2026-09-27  | 1 week      | Integration testing, performance tuning   | 25           | All 35 in-scope (validation pass)                                         | k6 load test report, ZAP scan report, Trivy scan output, all E2E tests green |
| 10     | 2026-09-28 – 2026-09-30  | 3 days      | UAT, documentation, GA release            | N/A          | —                                                                         | UAT sign-off, release notes, v1.0.0 tag, Docker images published |

**Total Story Points Across Feature Sprints (0–10):** 385 committed across Sprints 1–9 (Sprints 5–8 run in parallel; aggregate team capacity is maintained).
