# Functional Requirements Document (FRD)
## Generic Docker Container Management System

| Field         | Value                                     |
|---------------|-------------------------------------------|
| Document ID   | FRD-DCMS-001                              |
| Version       | 1.0.0                                     |
| Status        | Approved                                  |
| Date          | 2026-06-05                                |
| Author        | Requirement Agent                         |
| Parent BRD    | BRD-DCMS-001                              |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Context Diagram](#2-context-diagram)
3. [Functional Domains](#3-functional-domains)
   - 3.1 Container Lifecycle Management
   - 3.2 Image Management
   - 3.3 Networking
   - 3.4 Storage
   - 3.5 Health Monitoring and Alerting
   - 3.6 Centralized Logging
   - 3.7 Access Control and Security
   - 3.8 Dashboard UI
   - 3.9 REST API
   - 3.10 Cluster Management
4. [Key Data Flow Descriptions](#4-key-data-flow-descriptions)

---

## 1. System Overview

The Docker Container Management System (DCMS) is a centralized control plane for containerized workloads. It consists of:

- **DCMS API Server** — stateless Go or Node.js service exposing a versioned REST API
- **DCMS Web UI** — React single-page application communicating exclusively with the API server
- **DCMS Agent** — lightweight per-host daemon collecting metrics and executing container commands via the Docker socket
- **PostgreSQL Database** — persistent metadata store for all platform entities
- **Redis Cache** — session cache, short-lived state, and pub/sub for real-time events
- **Log Aggregation Pipeline** — Fluent Bit sidecars forwarding container logs to a searchable store (Loki or OpenSearch)
- **Metrics Pipeline** — Prometheus scrape targets on each host agent; Grafana or built-in charting in the UI
- **Image Registry Proxy** — optional pull-through cache; vulnerability scan integration point

---

## 2. Context Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL ACTORS                                      │
│                                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │  Platform    │  │  DevOps      │  │   Developer      │  │  CI/CD       │  │
│  │  Admin       │  │  Engineer    │  │   (Self-service) │  │  Pipeline    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  └──────┬───────┘  │
└─────────┼─────────────────┼───────────────────┼─────────────────┼───────────┘
          │  HTTPS          │  HTTPS            │  HTTPS          │  REST API
          ▼                 ▼                   ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DCMS WEB UI (React SPA)                                 │
│            Dashboard | Containers | Images | Networks | Volumes             │
│            Logs | Monitoring | Users & RBAC | Cluster | Settings            │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │ REST / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DCMS API SERVER (Go / Node.js)                          │
│  Auth | Container Ctrl | Image Mgmt | Net Mgmt | Volume Mgmt               │
│  Health | Log Query | RBAC | Cluster Ctrl | Audit Log                       │
└───┬──────────┬───────────────┬────────────────┬────────────────┬────────────┘
    │          │               │                │                │
    ▼          ▼               ▼                ▼                ▼
┌───────┐ ┌───────────┐ ┌──────────────┐ ┌──────────┐  ┌──────────────────┐
│Postgres│ │  Redis    │ │ DCMS Agent   │ │  Log     │  │  Image Registry  │
│(Meta  │ │ (Cache/   │ │ (per host)   │ │  Store   │  │  (Docker Hub /   │
│store) │ │  PubSub)  │ │  Docker API  │ │  (Loki / │  │  ECR / Harbor)   │
└───────┘ └───────────┘ └──────┬───────┘ │  OpenSrch│  └──────────────────┘
                               │         └──────────┘
                ┌──────────────┼─────────────────────┐
                ▼              ▼                     ▼
         ┌────────────┐ ┌────────────┐       ┌────────────┐
         │  Host A    │ │  Host B    │  ...  │  Host N    │
         │  Docker    │ │  Docker    │       │  Docker    │
         │  Engine    │ │  Engine    │       │  Engine    │
         └────────────┘ └────────────┘       └────────────┘
                    Docker Swarm / Kubernetes Cluster
```

---

## 3. Functional Domains

---

### 3.1 Container Lifecycle Management

**Domain Description:** Manages the full lifecycle of individual containers — from creation through termination — across all registered hosts.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                    |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|-------------------------------------------------------------------|
| FR-001 | Create Container          | User specifies image, name, environment variables, resource limits (CPU/memory), port bindings, and volume mounts to create a new container. | Must     | Admin, Operator           | Host registered; image available locally or pullable | Container created in STOPPED state; metadata persisted to DB    |
| FR-002 | Start Container           | Start a stopped or newly created container on a specified host.                                                           | Must     | Admin, Operator           | Container exists in STOPPED/CREATED state   | Container transitions to RUNNING; start event logged             |
| FR-003 | Stop Container            | Gracefully stop a running container with configurable stop timeout (SIGTERM → SIGKILL after timeout).                     | Must     | Admin, Operator           | Container in RUNNING or PAUSED state        | Container transitions to STOPPED; stop event logged              |
| FR-004 | Restart Container         | Stop and immediately restart a running container; optionally with a delay.                                                | Must     | Admin, Operator           | Container in RUNNING state                  | Container returns to RUNNING; restart event logged               |
| FR-005 | Pause Container           | Suspend all processes in a container using cgroups freeze without stopping it.                                            | Should   | Admin, Operator           | Container in RUNNING state                  | Container in PAUSED state; pause event logged                    |
| FR-006 | Kill Container            | Send a specified signal (default SIGKILL) to forcibly terminate a container.                                              | Must     | Admin, Operator           | Container in RUNNING or PAUSED state        | Container transitions to STOPPED; kill event logged              |
| FR-007 | Remove Container          | Delete a stopped container and optionally its associated anonymous volumes.                                               | Must     | Admin, Operator           | Container in STOPPED state                  | Container removed from host and metadata DB; removal logged      |
| FR-008 | View Container Details    | Display container metadata: ID, name, image, status, created timestamp, resource usage, ports, volumes, and network.    | Must     | Admin, Operator, Viewer   | Container exists                            | Detail view rendered with live-refreshed stats                   |
| FR-009 | List Containers           | List all containers across all registered hosts with filtering by status, host, label, and namespace.                    | Must     | Admin, Operator, Viewer   | At least one host registered                | Paginated list returned with current status                      |
| FR-010 | Execute Command in Container | Open an interactive or non-interactive exec session into a running container for debugging.                            | Should   | Admin, Operator           | Container in RUNNING state                  | Exec session opened; command output streamed to UI/API caller; exec event logged |
| FR-011 | View Container Logs (Inline) | Stream live stdout/stderr from a running container in the dashboard UI (tail -f behavior).                             | Must     | Admin, Operator, Viewer   | Container in RUNNING state                  | Log stream displayed in real time; max 1000 lines buffered in UI |
| FR-012 | Set Resource Limits       | Update CPU shares, memory limit, and swap limit on a running or stopped container without recreation.                    | Should   | Admin, Operator           | Container exists; host supports live update | Resource limits updated; change event logged                     |

---

### 3.2 Image Management

**Domain Description:** Manages container images including pulling from registries, tagging, pushing to the internal registry, vulnerability scanning, and deletion.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-013 | Pull Image                | Pull a container image from a configured registry (Docker Hub, ECR, GCR, Harbor, etc.) to one or more registered hosts. | Must     | Admin, Operator           | Registry credentials configured; network connectivity | Image available on target host(s); pull event logged           |
| FR-014 | Push Image                | Push a locally built or tagged image to a configured private registry.                                                    | Should   | Admin, Operator           | Image exists locally; registry credentials configured | Image pushed to registry; push event logged                    |
| FR-015 | Tag Image                 | Create a new tag for an existing local image without duplicating image layers.                                            | Should   | Admin, Operator           | Source image exists on host                 | New tag created; tag event logged                                  |
| FR-016 | List Images               | List all images on all registered hosts with metadata (ID, tags, size, created date, vulnerability scan status).         | Must     | Admin, Operator, Viewer   | At least one host registered                | Paginated list with filter by host, tag, and scan status           |
| FR-017 | Delete Image              | Remove an image from a specified host; prevent deletion if running containers reference the image.                       | Must     | Admin, Operator           | Image not in use by running containers      | Image removed from host; deletion event logged                     |
| FR-018 | Vulnerability Scan        | Automatically scan images for CVEs using an integrated scanner (Trivy); block promotion to production on critical findings. | Must   | System (automated), Admin | Image pulled or pushed to host/registry     | Scan results stored in DB; findings visible in UI; CRITICAL CVEs generate alert |
| FR-019 | Registry Credentials Mgmt | Add, update, and revoke registry credentials (username/password or token) for each configured registry.                 | Must     | Admin                     | Admin role                                  | Credentials encrypted at rest in DB; available to pull/push operations |
| FR-020 | Image Build History       | Track image build provenance metadata (build source, builder, timestamp) when images are built via the platform.         | Could    | Admin, Operator, Viewer   | Images built via DCMS                       | Build metadata displayed in image detail view                      |

---

### 3.3 Networking

**Domain Description:** Manages container networks, DNS resolution, port mapping, and network policy across hosts.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-021 | Create Network            | Create a Docker network with configurable driver (bridge, overlay, macvlan, host, none), subnet, and gateway.            | Must     | Admin, Operator           | Host registered; valid CIDR provided        | Network created; metadata persisted; creation logged               |
| FR-022 | Delete Network             | Remove an unused network; prevent deletion if active containers are attached.                                            | Must     | Admin, Operator           | Network has no attached running containers  | Network deleted; deletion logged                                   |
| FR-023 | Connect Container to Network | Attach a running or stopped container to a network with optional IP assignment and network alias.                     | Must     | Admin, Operator           | Container and network both exist on same host | Container connected; connection logged                           |
| FR-024 | Disconnect Container from Network | Detach a container from a network; force option available for running containers.                                | Must     | Admin, Operator           | Container attached to target network        | Container disconnected; disconnection logged                       |
| FR-025 | List Networks             | List all networks across registered hosts with driver, scope, attached containers, and CIDR.                             | Must     | Admin, Operator, Viewer   | At least one host registered                | Paginated network list with live attachment count                  |
| FR-026 | Port Mapping Management   | View all active port mappings (host port → container port) across all containers with conflict detection.                | Must     | Admin, Operator, Viewer   | Running containers with port bindings       | Port mapping list; conflict alerts for duplicate host port bindings |
| FR-027 | DNS Configuration         | Configure custom DNS servers and search domains for new containers and networks at the host or per-container level.      | Should   | Admin                     | Admin role; host registered                 | DNS config applied; changes logged                                 |

---

### 3.4 Storage (Volumes and Persistent Storage)

**Domain Description:** Manages Docker volumes and bind mounts for persistent data across container restarts and migrations.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-028 | Create Volume             | Create a named Docker volume on a specified host with optional driver options (local, NFS, cloud block).                  | Must     | Admin, Operator           | Host registered                             | Volume created; metadata persisted; creation logged                |
| FR-029 | Delete Volume             | Remove a named volume; prevent deletion if any containers reference the volume (running or stopped).                     | Must     | Admin, Operator           | Volume not referenced by any container      | Volume deleted; deletion logged                                    |
| FR-030 | Attach Volume to Container | Mount a volume into a container at container creation time with read-write or read-only mode.                           | Must     | Admin, Operator           | Volume and container exist on same host     | Volume mounted; mount event logged                                 |
| FR-031 | List Volumes              | List all volumes across registered hosts with driver, size estimate, mount path, and attached container count.           | Must     | Admin, Operator, Viewer   | At least one host registered                | Paginated volume list with usage metadata                          |
| FR-032 | Volume Usage Reporting    | Display storage consumption per volume and per host; alert when volume usage exceeds configurable threshold.             | Should   | Admin, Operator           | Volume exists; metrics agent running        | Usage report displayed; threshold alerts triggered                 |

---

### 3.5 Health Monitoring and Alerting

**Domain Description:** Monitors container and host health, evaluates configurable alert rules, and dispatches notifications.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-033 | Container Health Checks   | Display Docker HEALTHCHECK status (healthy/unhealthy/starting) for each container and surface history of last N checks.  | Must     | Admin, Operator, Viewer   | Container with HEALTHCHECK instruction      | Health status visible in container list and detail view            |
| FR-034 | Host Resource Metrics     | Continuously collect and display CPU %, memory %, disk I/O, and network I/O per host via the DCMS agent.                 | Must     | Admin, Operator, Viewer   | DCMS agent running on host                  | Metrics available in dashboard; stored for 30-day history          |
| FR-035 | Alert Rule Configuration  | Allow admins to define threshold-based alert rules (e.g., CPU > 90% for 5 min; container restart count > 3 in 10 min).  | Must     | Admin                     | Admin role                                  | Alert rules persisted; evaluated on each metrics scrape cycle      |
| FR-036 | Alert Notifications       | Dispatch notifications to configured channels (email, Slack, webhook) when alert rules fire.                             | Must     | System (automated)        | Alert rule configured; notification channel configured | Notification sent within 60 seconds of rule trigger; notification logged |
| FR-037 | Alert History & Silencing | View historical alert events; silence specific alerts for a configurable duration.                                        | Should   | Admin, Operator           | Alerts have fired                           | Alert history stored 90 days; silenced alerts suppressed           |

---

### 3.6 Centralized Logging

**Domain Description:** Aggregates, indexes, and provides search access to container stdout/stderr logs from all hosts.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-038 | Log Aggregation           | Automatically collect stdout/stderr from all running containers on all hosts via Fluent Bit or equivalent and forward to the central log store. | Must | System (automated) | DCMS agent deployed on host              | Container logs indexed and queryable within 10 seconds of emission |
| FR-039 | Log Search and Filter     | Full-text search across all container logs with filters for container name, host, time range, log level (if structured), and keyword. | Must | Admin, Operator, Viewer | Log data exists in store         | Search results returned within 5 seconds; pagination supported     |
| FR-040 | Log Retention Policy      | Configure per-namespace or global log retention periods (7 days, 30 days, 90 days, custom). Automatic purge of expired logs. | Should | Admin           | Admin role                                  | Retention policy enforced nightly; storage usage reduced accordingly |
| FR-041 | Log Export                | Export log records for a container or namespace in a specified time range to JSON or plain text for download or external archival. | Should | Admin, Operator, Viewer | Log data exists for requested time range | Log file generated and available for download                    |
| FR-042 | Structured Log Parsing    | Detect and parse JSON-formatted container log lines to enable field-level filtering in search queries.                   | Could    | System (automated)        | Container emits JSON log lines              | Structured fields indexed; queryable in log search UI              |

---

### 3.7 Access Control and Security

**Domain Description:** Manages user identities, roles, permissions, and the immutable audit trail of all platform actions.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-043 | User Account Management   | Create, update, deactivate, and delete local user accounts; enforce password complexity policy.                          | Must     | Admin                     | Admin role                                  | Account created/updated/deactivated; action logged                 |
| FR-044 | Role Assignment           | Assign one of three roles (Admin, Operator, Viewer) to each user; role is scoped to a namespace or global.               | Must     | Admin                     | User account exists                         | Role assigned; RBAC enforced on next API call                      |
| FR-045 | SSO / OIDC Integration    | Authenticate users via an external OIDC or SAML 2.0 identity provider; map IdP groups to DCMS roles.                    | Must     | Admin, System             | IdP OIDC/SAML endpoint configured          | User authenticated via IdP; session issued; login event logged     |
| FR-046 | API Key Management        | Generate, list, and revoke named API keys for programmatic access; keys scoped to role and namespace.                    | Must     | Admin, Operator           | User account exists                         | API key created/revoked; all API key operations logged             |
| FR-047 | Audit Log                 | Record every state-changing operation (create/update/delete/start/stop/kill/exec) with actor, timestamp, source IP, resource, and outcome. | Must | System (automated) | Any state-changing API call made | Audit entry written to append-only audit log table within 1 second; never deletable via UI |
| FR-048 | Audit Log Search and Export | Search the audit log by actor, resource type, action, time range; export to CSV.                                      | Must     | Admin, Security Auditor   | Audit log entries exist                     | Search results returned; export available for compliance reporting  |
| FR-049 | Namespace Management      | Create and manage namespaces (logical environments: dev, staging, prod) that scope container, network, and volume visibility. | Must | Admin           | Admin role                                  | Namespace created; resources assigned to namespace                 |
| FR-050 | MFA Enforcement           | Optionally enforce multi-factor authentication for Admin role accounts or all users.                                     | Should   | Admin                     | Admin role; MFA provider configured         | MFA required on login; sessions without MFA rejected for admin ops |

---

### 3.8 Dashboard UI

**Domain Description:** The React SPA providing visual management of all platform capabilities.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-051 | Cluster Overview Dashboard | Landing page showing total hosts, running/stopped container counts, resource utilization gauges, and active alert count. | Must   | All authenticated users   | At least one host registered                | Dashboard loads in under 3 seconds; data refreshes every 10 seconds |
| FR-052 | Container Management UI   | Table/card view with sort, filter, and bulk-action support for all container operations (start, stop, restart, remove).  | Must     | Admin, Operator           | Containers exist                            | Actions executed via API; results reflected in UI within 5 seconds  |
| FR-053 | Real-time Metrics Charts  | Line charts for CPU %, memory %, network I/O, and disk I/O per container and per host with adjustable time windows.     | Must     | Admin, Operator, Viewer   | Metrics data available                      | Charts rendered with up to 30-day history; time range selector     |
| FR-054 | Log Viewer UI             | Integrated log viewer with search, filter, and live-tail modes; syntax highlighting for JSON logs.                       | Must     | Admin, Operator, Viewer   | Log data available                          | Log viewer loads; live-tail subscribes via WebSocket               |
| FR-055 | Image Registry UI         | Browse images, view scan results, manage tags, trigger pull/push operations from the UI.                                 | Must     | Admin, Operator           | Images exist or registries configured       | Image operations triggered; scan results displayed with severity   |
| FR-056 | User & RBAC Management UI | Admin panel for user creation, role assignment, API key management, and SSO configuration.                               | Must     | Admin                     | Admin session                               | Admin operations executed; changes reflected immediately           |
| FR-057 | Responsive Design         | The dashboard UI is fully usable on desktop (1280px+) and tablet (768px+) screen sizes.                                  | Should   | All authenticated users   | N/A                                         | All UI elements accessible and functional at target breakpoints    |
| FR-058 | Dark Mode / Light Mode    | User-selectable UI theme; preference persisted to user profile.                                                          | Could    | All authenticated users   | Authenticated session                       | Theme applied immediately; persisted across sessions               |

---

### 3.9 REST API

**Domain Description:** The versioned REST API enabling programmatic and CI/CD pipeline access to all platform features.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-059 | API Versioning            | All API endpoints are prefixed with `/api/v1`; breaking changes increment the major version; old versions maintained for 6 months. | Must | API consumers   | N/A                                         | Version header returned in all responses; deprecation notices in headers |
| FR-060 | OpenAPI Specification     | The full API is documented with an OpenAPI 3.1 spec; Swagger UI available at `/api/docs`.                                | Must     | Developers, DevOps        | API server running                          | OpenAPI spec auto-generated from code annotations; always current  |
| FR-061 | Pagination and Filtering  | All list endpoints support cursor-based pagination (`limit`, `cursor` params) and field-level filtering.                 | Must     | API consumers             | N/A                                         | All list responses include pagination metadata (`next_cursor`, `total`) |
| FR-062 | Webhook Event Delivery    | Users can register webhook endpoints to receive real-time event payloads for container lifecycle, alert, and audit events. | Should | Admin, Operator        | Webhook endpoint URL configured             | Events delivered via HTTP POST within 30 seconds; retry on failure with exponential backoff |
| FR-063 | Rate Limiting             | API requests are rate-limited per API key/token: 1000 requests/minute for Operators, 100 for Viewers; configurable by Admin. | Must | System (automated)   | API key / JWT present in request            | 429 response returned with Retry-After header when limit exceeded  |
| FR-064 | API Health Endpoint       | `/api/v1/health` returns service health status (healthy/degraded/unhealthy) with dependency checks (DB, Redis, agents). | Must     | CI/CD, monitoring systems | API server running                          | Health status returned within 500ms; used by load balancer probes  |

---

### 3.10 Cluster Management

**Domain Description:** Manages multi-host clusters using Docker Swarm or Kubernetes, including node management and service scaling.

| FR-ID  | Feature Name              | Description                                                                                                               | Priority | Actors                    | Preconditions                               | Postconditions                                                     |
|--------|---------------------------|---------------------------------------------------------------------------------------------------------------------------|----------|---------------------------|---------------------------------------------|--------------------------------------------------------------------|
| FR-065 | Register Host             | Add a new Docker host to the DCMS by providing its connection endpoint; DCMS deploys the agent automatically or via manual instruction. | Must | Admin       | DCMS agent installable on target host       | Host registered; agent connected; host visible in dashboard        |
| FR-066 | Remove Host               | Deregister a host from DCMS; drain running containers if host is part of a Swarm cluster.                                 | Must     | Admin                     | Host registered; no exclusive production workloads | Host removed from DCMS; agent decommissioned; event logged    |
| FR-067 | Docker Swarm Integration  | View and manage Docker Swarm services, stacks, secrets, and configs from the DCMS UI and API.                            | Must     | Admin, Operator           | Docker Swarm initialized on cluster         | Swarm resources visible; service scale operations functional       |
| FR-068 | Scale Service             | Scale a Docker Swarm service or Kubernetes Deployment replica count up or down via UI or API.                            | Must     | Admin, Operator           | Service/Deployment exists; cluster operational | Replica count updated; scale event logged; rollout progress visible |
| FR-069 | Kubernetes Integration    | Optionally connect the DCMS to an existing Kubernetes cluster via kubeconfig; manage Deployments, Pods, Services, ConfigMaps. | Should | Admin          | Kubernetes cluster API reachable; kubeconfig provided | Kubernetes resources visible alongside Docker resources         |
| FR-070 | Node Drain and Maintenance | Mark a cluster node as maintenance mode; automatically reschedule workloads to other nodes.                              | Should   | Admin                     | Cluster has at least 2 nodes                | Node drained; workloads rescheduled; maintenance event logged      |

---

## 4. Key Data Flow Descriptions

### 4.1 Data Flow: Deploy a Container

```
Actor (Operator)
    │
    ▼
[1] POST /api/v1/containers
    { image, name, host_id, env_vars, resource_limits, port_bindings, volumes }
    │
    ▼
[2] DCMS API Server
    ├── Authenticate request (JWT / API key)
    ├── Authorize: operator role on target namespace
    ├── Validate payload (schema validation)
    ├── Check image availability on host or trigger pull (→ Step 3)
    └── Forward CREATE command to DCMS Agent on target host
    │
    ▼
[3] (If image not local) DCMS Agent → Docker Engine
    ├── docker pull <image>:<tag>
    ├── Trigger vulnerability scan via Trivy
    │   ├── If CRITICAL CVEs found AND target is prod → REJECT, return 400
    │   └── Scan results written to PostgreSQL
    └── Image available locally
    │
    ▼
[4] DCMS Agent → Docker Engine
    ├── docker create / docker start
    └── Container ID returned to DCMS Agent
    │
    ▼
[5] DCMS Agent → DCMS API Server
    ├── Container metadata (ID, status, IP, ports) returned
    ├── API Server writes container record to PostgreSQL
    ├── Audit log entry written
    └── Event published to Redis pub/sub
    │
    ▼
[6] DCMS API Server → Actor
    └── 201 Created { container_id, status: "running", ... }

[7] DCMS Web UI (if used)
    └── Subscribes to Redis event stream via WebSocket → updates container list in real time
```

---

### 4.2 Data Flow: Scale a Docker Swarm Service

```
Actor (Operator)
    │
    ▼
[1] PUT /api/v1/clusters/{cluster_id}/services/{service_id}/scale
    { replicas: 5 }
    │
    ▼
[2] DCMS API Server
    ├── Authenticate and authorize (operator role on cluster namespace)
    ├── Retrieve current service state from Docker Swarm manager via DCMS Agent
    └── Issue scale command to Swarm manager agent
    │
    ▼
[3] DCMS Agent (on Swarm manager node)
    ├── docker service scale <service>=5
    └── Swarm schedules new tasks across worker nodes
    │
    ▼
[4] Swarm Scheduler → Worker Nodes
    ├── Pull image if not cached (per FR-013)
    ├── Start new container replicas
    └── Report task status back to Swarm manager
    │
    ▼
[5] DCMS Agent → DCMS API Server (polling or event stream)
    ├── Reports task convergence (running/failed/pending counts)
    ├── Scale event written to PostgreSQL (audit log)
    └── Metrics pipeline captures new replica count
    │
    ▼
[6] DCMS API Server → Actor
    └── 200 OK { service_id, desired_replicas: 5, running_replicas: 5, status: "converged" }

[7] DCMS Web UI
    └── Rollout progress bar updated in real time via WebSocket event
```

---

### 4.3 Data Flow: Pull Image and Vulnerability Scan

```
Actor (Operator)
    │
    ▼
[1] POST /api/v1/images/pull
    { registry, image, tag, host_ids: ["host-a", "host-b"] }
    │
    ▼
[2] DCMS API Server
    ├── Authenticate and authorize
    ├── Retrieve registry credentials from encrypted store (PostgreSQL)
    └── Dispatch pull task to DCMS Agent on each target host
    │
    ▼
[3] DCMS Agent → Docker Engine (parallel on each host)
    └── docker pull <registry>/<image>:<tag> (authenticated)
    │
    ▼
[4] DCMS Agent → Trivy Scanner (on-host or API call to scan service)
    ├── trivy image <image>:<tag> --format json
    └── Scan results (CVE list, severity breakdown) returned
    │
    ▼
[5] DCMS Agent → DCMS API Server
    ├── Image metadata (digest, size, layers) returned
    ├── Scan results posted to API Server
    └── API Server writes image + scan records to PostgreSQL
    │
    ▼
[6] DCMS API Server
    ├── If CRITICAL CVEs found:
    │   ├── Tag image as "policy:blocked-production"
    │   ├── Generate CRITICAL alert (→ FR-036 notification)
    │   └── Block deployment to production namespace
    └── Return pull + scan summary to Actor
    │
    ▼
[7] Actor receives response:
    { image_id, digest, scan_status: "passed|blocked", critical_cves: N, high_cves: N }
```
