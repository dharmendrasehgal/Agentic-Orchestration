# DCMS v1.0.0 — Release Notes

**Release Date:** 2026-09-30
**Release Type:** General Availability (GA)
**Minimum Docker Version:** 26.0
**Minimum PostgreSQL Version:** 16.0
**GitHub:** https://github.com/dcms/dcms/releases/tag/v1.0.0

---

## Highlights

- **Unified multi-host control plane** — manage containers, images, networks, and volumes across an entire Docker Swarm cluster from a single web dashboard, eliminating the need to SSH into individual hosts.
- **Security-first from day one** — every agent connection is mTLS-authenticated, every image push triggers a Trivy CVE scan with automatic CRITICAL-block policy, and every user action is written to a tamper-evident append-only audit log.
- **Production-grade observability out of the box** — a fully pre-configured Prometheus/Grafana/Loki/Jaeger stack ships with 15 alerting rules and zero manual dashboard configuration required.
- **No Kubernetes required** — DCMS deploys on vanilla Docker Swarm, removing the operational overhead of a Kubernetes control plane for teams whose workloads fit within a Swarm-scale deployment.

---

## New Features

### Container Management

**Full container lifecycle management**
Create, start, stop, restart, pause, unpause, and remove containers from the dashboard or the REST API. All state transitions are executed via the per-host agent using mTLS, never through an exposed Docker socket.

**Bulk operations**
Select multiple containers within a namespace and apply start, stop, restart, or remove operations in a single action. Each operation is executed concurrently and per-container results are reported individually.

**Real-time container status feed**
Container state changes (running, stopped, exited, OOM-killed) are pushed to the dashboard within 200ms via Server-Sent Events, with no polling required on the client side.

**Resource quota enforcement**
Namespaces can be configured with maximum container count, aggregate CPU millicores, and aggregate memory limits. The API rejects container-create requests that would exceed the namespace quota with a `429 Quota Exceeded` response.

**Container inspection panel**
The dashboard exposes the full `docker inspect` output for any container in a structured, searchable JSON viewer, including mount points, network settings, environment variables (redacted by default), and health check history.

**Exec session support**
Interactive command execution inside a running container via the dashboard terminal, proxied through the agent over the gRPC connection. Sessions are limited to 30 minutes to prevent resource leakage.

**Container event history**
Every lifecycle event (created, started, died, OOM-killed, health-status change) is recorded in PostgreSQL and browsable per container with timestamps and exit codes.

**Auto-restart policy configuration**
Set Docker restart policies (no, always, on-failure, unless-stopped) and configure the maximum restart attempt count directly from the container settings panel.

---

### Image Registry & Security

**Multi-registry image pull**
Pull images from Docker Hub, GitHub Container Registry (GHCR), AWS ECR, GCP Artifact Registry, or any private registry by configuring registry credentials under Settings → Registries. Pull progress is streamed in real time.

**Automated CVE scanning with Trivy**
Every image pull or push triggers a Trivy vulnerability scan. Results are stored in PostgreSQL and displayed in a per-image security tab showing CVEs grouped by severity (CRITICAL, HIGH, MEDIUM, LOW). Images with CRITICAL-severity CVEs are blocked from deployment by default (configurable policy).

**Image tag and digest management**
The image catalogue displays all pulled images with their tags, digests, compressed size, creation date, and last-used timestamp. Unused images can be bulk-removed from the UI.

**Vulnerability scan history**
Scan results are retained for 90 days and are accessible via the API (`GET /api/v1/images/{id}/scans`), enabling compliance reporting workflows.

**Registry credential vault integration**
Registry credentials are never stored in PostgreSQL. They are written to Vault at registration time and retrieved at pull time, ensuring credentials are not exposed in database backups.

---

### Networking & Storage

**Docker network lifecycle management**
Create and remove bridge, overlay, and macvlan networks from the dashboard. Network details (driver, subnet, gateway, connected containers) are displayed in a dedicated panel.

**Overlay network inspection**
For Swarm overlay networks, the dashboard shows which containers on which nodes are connected to the network, giving a cross-host topology view.

**Volume lifecycle management**
Create, inspect, and remove named Docker volumes. Volume details include driver, mountpoint, labels, and the list of containers currently using the volume. Volumes in use cannot be removed without explicit force override.

**Volume backup tagging**
Attach backup policy labels to volumes from the UI. The backup cron script reads these labels to determine which volumes to snapshot, enabling selective backup without manual configuration file edits.

---

### Monitoring & Alerting

**Pre-configured Grafana dashboards**
Six dashboards are provisioned on first startup: Cluster Overview, Per-Host Resources, Container Resource Usage, PostgreSQL Performance, Redis Performance, and DCMS API Latency. No manual JSON import is required.

**15 pre-built alerting rules**
Alert rules covering container restart storms, high CPU (>90% for 5 min), memory pressure (>85%), disk fill (>80% and >95%), PostgreSQL connection saturation, Redis memory limit approach, API error-rate spike, and Swarm node loss are loaded into Prometheus on deployment.

**cAdvisor container metrics**
cAdvisor runs as a global Swarm service on every node, collecting per-container CPU, memory, network I/O, and block I/O metrics with 15-second resolution and 15-day retention in Prometheus.

**Slack and email notification channels**
Alert notifications are dispatched via Alertmanager to configured Slack webhooks or SMTP channels. Channels are configured in the dashboard under Settings → Notifications.

**Custom alert rule editor**
Operators with Admin role can create custom PromQL-based alerting rules from the dashboard. Rules are validated server-side before being written to Prometheus.

---

### Logging

**Centralized log aggregation with Loki**
Promtail runs as a Swarm global service and ships container logs to Loki. All logs are indexed by `service`, `node`, `container_name`, `namespace`, and `stream` labels.

**Log streaming in the dashboard**
The container log viewer streams live log output from Loki using the Loki tail API. Historical logs are searchable with LogQL in the advanced search panel.

**Log retention policy**
Default retention is 30 days. Retention can be configured per namespace label in `infra/loki/loki-config.yml`. Logs are stored on the Loki host's attached data volume; S3 export is planned for v1.5.

---

### Access Control & Security

**Role-Based Access Control (RBAC)**
Three built-in roles — Admin, Operator, Viewer — with per-resource permission enforcement at the API gateway layer (Kong) and the service layer. Every API handler checks the caller's role before executing any operation.

**JWT RS256 authentication**
Access tokens are RS256-signed JWTs with a 15-minute lifetime. Refresh tokens have a 7-day rotating lifetime and are stored server-side in Redis; rotation invalidates the previous refresh token on use. Token revocation takes effect within the access token TTL.

**OIDC SSO integration**
Connect DCMS to any OIDC-compliant identity provider (Okta, Azure AD, Keycloak, Google Workspace). IdP group claims are mapped to DCMS roles via a configurable mapping table. Local password authentication remains available as a fallback.

**Append-only audit log**
Every user action (login, logout, container create/stop/remove, image pull, settings change) is written to a PostgreSQL append-only partitioned table. Each row contains a HMAC-SHA256 chained integrity tag, making undetected row deletion or modification computationally infeasible. The audit log is exportable as CSV via the Admin panel.

---

### Dashboard & UX

**React 18 single-page application**
The dashboard is built with React 18, React Query for server-state management, and Tailwind CSS. First Contentful Paint is under 1.2s on a standard broadband connection.

**Real-time updates via SSE**
Container status, service health indicators, and metric summaries update in real time without page refresh. The SSE connection is automatically re-established after a network interruption with exponential back-off.

**Dark mode**
A system-preference-respecting dark mode is available and can be toggled manually from the user menu.

**WCAG 2.1 AA accessibility**
All interactive components meet WCAG 2.1 Level AA criteria including keyboard navigation, screen-reader ARIA labels, and sufficient colour contrast ratios.

---

### REST API & Integrations

**Versioned REST API**
All endpoints are versioned under `/api/v1/`. The OpenAPI 3.1 specification is served at `/api/v1/openapi.json` and browsable at `/api/v1/docs`.

**Full API parity with dashboard**
Every operation available in the dashboard is also available through the API. The dashboard itself consumes only public API endpoints.

**Server-Sent Events stream endpoint**
`GET /api/v1/events` provides a real-time SSE stream of all container lifecycle events, filterable by namespace and event type. Suitable for CI/CD pipeline integrations that need to watch deployment progress.

**Webhook support**
Configure outbound webhooks for container lifecycle events or CVE scan completions under Settings → Integrations → Webhooks. Payloads are signed with a shared HMAC-SHA256 secret for receiver verification.

---

### Cluster Management

**Multi-host Swarm visibility**
The Cluster panel shows all Swarm nodes with their role (manager/worker), availability, resource utilisation, and connected DCMS agent status in a single view.

**Node drain and maintenance mode**
Set a node to `drain` availability directly from the dashboard to gracefully reschedule its containers before maintenance. The node is restored to `active` with a single click.

**Service replica management**
Scale any Swarm service up or down from the dashboard. The service replica count and rollout progress are reflected in real time via SSE.

---

## Bug Fixes

| ID | Component | Description |
|---|---|---|
| DEF-001 | container-service | Fixed race condition where a container start event could be processed before the container record was committed to PostgreSQL, causing a transient 404 in the dashboard |
| DEF-002 | auth-service | Refresh token rotation now correctly invalidates the previous token when two concurrent requests arrive with the same refresh token (previously both requests succeeded, doubling the active session count) |
| DEF-003 | image-service | Trivy scan results for images with identical digests but different tags were incorrectly merged, causing one image to display the other's CVE list |
| DEF-004 | dashboard | The container log viewer failed to re-connect the SSE stream after the browser tab became active again following a device sleep event |
| DEF-005 | kong | Requests containing a `Content-Type: application/json; charset=utf-8` header were rejected by the body-validation plugin due to strict MIME type matching; now matches the base type only |
| DEF-006 | monitor-service | cAdvisor metrics for containers on non-default overlay networks were attributed to the wrong container ID when two containers shared a common name prefix |
| DEF-007 | volume-service | Volume removal returned HTTP 200 even when the underlying `docker volume rm` call failed because the volume was in use; now returns 409 Conflict with an informative message |
| DEF-008 | cluster-service | Node status polling used the manager's internal Docker socket instead of the agent gRPC connection, causing incorrect status for worker nodes on a different host |
| DEF-009 | auth-service | OIDC callback handler did not validate the `state` parameter against the session cookie, leaving the callback endpoint vulnerable to CSRF; `state` is now validated before any token exchange |
| DEF-010 | log-service | Loki query timeout (default 30s) was not propagated from the HTTP request context, causing log queries to continue consuming Loki resources after the client disconnected |
| DEF-011 | notification-service | Slack notification retry logic used a fixed 1-second delay instead of exponential back-off, causing notification floods against Slack's rate limiter during transient outages |
| DEF-012 | dashboard | The namespace quota usage bar overflowed its container element when the usage percentage exceeded 100%, breaking the layout of the namespace overview card |

---

## Performance Improvements

All figures measured on a 5-node Swarm cluster (3 managers, 2 workers) under a sustained load of 500 concurrent users with 1,000 managed containers, using the k6 load-test suite at `tests/load/`.

| Metric | Result | SLO | Headroom |
|---|---|---|---|
| API read request p95 latency | 124ms | 200ms | 38% |
| Dashboard Largest Contentful Paint (LCP) | 2.34s | 2.5s | 6.4% |
| Container create end-to-end p95 | 389ms | 500ms | 22% |
| SSE event delivery p99 (state change to browser) | 187ms | 250ms | 25% |
| Trivy CVE scan (median image size 350MB) | 8.2s | 15s | 45% |

---

## Security

- **mTLS enforced** for all agent ↔ container-service communication. The Docker socket is never exposed over TCP. Agent certificates are issued from a DCMS-managed CA and are rotatable without service restart.
- **Trivy CVE scanning** runs on every image push and pull. Images with CRITICAL-severity CVEs are blocked from container creation by default. The block policy is configurable per namespace.
- **Full RBAC** with Admin, Operator, and Viewer roles enforced at both the Kong API gateway layer and within each service handler. Role checks are not bypassable by calling internal service endpoints directly (internal endpoints require service-to-service mTLS).
- **JWT RS256** with 15-minute access token lifetime and 7-day rotating refresh tokens stored in Redis. Token revocation (logout, password change, admin disable) takes effect at the next access token expiry.
- **Append-only audit log** with HMAC-SHA256 chained integrity verification. The audit log is stored in a PostgreSQL partitioned table with a `NO DELETE` trigger and a dedicated read-only audit reporting role.
- **WCAG 2.1 AA** accessibility compliance verified with Axe automated scan and manual keyboard navigation testing.
- **No secrets in environment files** for production deployments. All secrets (database passwords, TLS keys, JWT signing keys) are read from HashiCorp Vault via AppRole authentication at service startup.

---

## Known Limitations

The following are known limitations in v1.0.0. These are honest constraints, not bugs. Where applicable, the planned resolution version is noted.

1. **No Kubernetes support.** DCMS manages Docker Swarm clusters only. Kubernetes context switching is planned for v2.0 (target: 2027 Q3). Teams running K8s workloads should continue using Kubernetes-native tooling.

2. **No Windows container support.** Only Linux containers are supported. Windows nodes cannot be added to a DCMS-managed Swarm cluster.

3. **Image build is not supported.** DCMS can pull and manage images from registries but cannot build images from a Dockerfile. Use your CI pipeline (GitHub Actions, GitLab CI, etc.) to build images and push them to a registry; DCMS then manages the resulting images.

4. **No multi-region high availability.** The DCMS control plane (PostgreSQL, Redis) is single-region. A regional cloud provider outage will make the DCMS dashboard unavailable, though running containers on worker nodes are unaffected. Multi-region HA is planned for v1.5.

5. **Exec session maximum 30 minutes.** Interactive exec sessions via the dashboard terminal are automatically terminated after 30 minutes. There is no session extension mechanism in v1.0.0. Long-running interactive sessions should use a direct SSH connection to the host.

6. **No GitOps integration.** There is no native support for reconciling desired container state from a Git repository. GitOps workflows using Flux CD are planned for v1.5. In v1.0.0, container deployments are driven by the dashboard, API, or CI webhook.

7. **Log export to S3 not available.** Loki logs are stored on local attached storage on the Loki host. There is no built-in S3 log export in v1.0.0. S3 export via the Loki S3 ruler is planned for v1.5.

8. **Custom RBAC roles cannot be created.** Only the three built-in roles (Admin, Operator, Viewer) exist in v1.0.0. Custom role creation with fine-grained permission selection is planned for v1.5.

---

## Breaking Changes

None. This is the initial General Availability release. There are no earlier GA versions to break compatibility with.

---

## Upgrade Notes

This is the first GA release of DCMS. Fresh installation is required.

Migration from pre-GA alpha or beta builds is **not supported**. Alpha and beta deployments should be decommissioned. No automated migration path exists for alpha/beta schema versions to the v1.0.0 schema, as the schema changed significantly across pre-release iterations.

Refer to the [Onboarding Guide](./onboarding_guide.md) for full installation instructions.

---

## What's Coming in v1.5 (Q1 2027)

- **Kubernetes support** — Add a Kubernetes cluster context alongside Swarm clusters; switch between Swarm and K8s views from the cluster selector. Applies the same RBAC, audit log, and observability stack to both.
- **Multi-region high availability** — Active-active PostgreSQL (Citus) and Redis Sentinel across two regions; control plane survives a single-region failure.
- **Container log export to S3** — Automatic log archival from Loki to S3-compatible object storage with configurable retention policies per namespace.
- **GitOps integration (Flux CD)** — Declare desired container/service state in a Git repository; DCMS reconciles live state against the declared state and reports drift in the dashboard.
- **Enhanced RBAC with custom role creation** — Create custom roles with fine-grained permissions per resource type (e.g., `containers:read`, `images:pull`, `volumes:create`) and assign them to users or IdP groups.
- **Improved exec sessions** — Session extension, session sharing (read-only spectator link), and configurable session duration limits per namespace.

---

*For questions or issues with this release, open a GitHub issue at https://github.com/dcms/dcms/issues or join the community Slack at https://dcms.io/slack.*
