# DCMS REST API Reference

**API Version:** v1
**Product:** Docker Container Management System (DCMS)
**Release:** 1.0.0
**Base Spec:** OpenAPI 3.1 (available at `GET /api/docs`)
**Last Updated:** 2026-09-30

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Common Patterns](#3-common-patterns)
4. [Rate Limiting](#4-rate-limiting)
5. [Server-Sent Events](#5-server-sent-events)
6. [Endpoint Reference](#6-endpoint-reference)
   - [Auth](#61-auth)
   - [Containers](#62-containers)
   - [Images](#63-images)
   - [Networks](#64-networks)
   - [Volumes](#65-volumes)
   - [Clusters](#66-clusters)
   - [Monitoring](#67-monitoring)
   - [Logs](#68-logs)
   - [Users](#69-users)
7. [Webhooks](#7-webhooks)
8. [SDK Examples](#8-sdk-examples)
9. [Error Codes Reference](#9-error-codes-reference)

---

## 1. Overview

### Base URLs

| Environment | Base URL |
|---|---|
| Development | `http://localhost:8080/api/v1` |
| Staging | `https://dcms-staging.example.com/api/v1` |
| Production | `https://dcms.example.com/api/v1` |

All endpoints are relative to the base URL. Example: the full URL for `GET /containers` in production is `https://dcms.example.com/api/v1/containers`.

### API Versioning Policy

- The API version is encoded in the URL path as `/api/v1/`.
- DCMS commits to backward compatibility within a major version. Adding optional fields, new endpoints, or new enum values is not considered a breaking change.
- Breaking changes (removing fields, changing field types, removing endpoints, changing HTTP status codes) require a new major version (`/api/v2/`).
- When a new major version is introduced, the previous version will remain supported for a minimum of 12 months with a documented deprecation notice.
- The current API version is `v1`. There are no deprecated endpoints in v1.0.

### Content Type

All requests and responses use `application/json` unless otherwise noted. Server-Sent Event streams use `text/event-stream`. File downloads use `application/octet-stream`.

Include the content type header on all requests with a body:

```
Content-Type: application/json
```

---

## 2. Authentication

### JWT Bearer Token

All API endpoints require authentication via a JWT Bearer token, except `POST /auth/login` and `GET /health`.

Include the token in the `Authorization` header on every request:

```
Authorization: Bearer <your-jwt-token>
```

### Obtaining a Token

**POST /auth/login**

Exchange email and password for a JWT access token and a refresh token.

```bash
curl -X POST https://dcms.example.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "devops@example.com",
    "password": "s3cur3P@ssw0rd"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "usr_01HXM3K5BVFP2YTRJZ8DCMS01",
    "email": "devops@example.com",
    "name": "Jane Smith",
    "roles": [
      { "namespace": "staging", "role": "operator" },
      { "namespace": "dev", "role": "admin" }
    ]
  }
}
```

### Token Lifespan

| Token Type | Lifespan | Storage Recommendation |
|---|---|---|
| Access Token | 15 minutes | JavaScript memory only (never localStorage) |
| Refresh Token | 30 days | HttpOnly Secure cookie (handled automatically by browser) |

### Refresh Flow

When the access token expires (or within 60 seconds of expiry), call the refresh endpoint to obtain a new access token without re-authenticating:

```bash
curl -X POST https://dcms.example.com/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response:** Same structure as `/auth/login`. The old refresh token is invalidated on use (rotation).

### API Keys

For programmatic access (CI/CD, scripts) that cannot perform interactive login, use API keys. API keys are long-lived tokens with a configured expiry date.

Include an API key the same way as a JWT Bearer token:

```
Authorization: Bearer dcms_apikey_v1_abc123...
```

API keys are created and managed in the DCMS dashboard under User Settings > API Keys, or via `POST /users/me/api-keys`.

---

## 3. Common Patterns

### Pagination

All list endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | 1 | Page number (1-based). |
| `limit` | integer | 20 | Items per page. Maximum: 100. |
| `sort` | string | endpoint-specific | Sort field. Prefix with `-` for descending (e.g., `sort=-created_at`). |

**Response envelope for list endpoints:**

```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

### Filtering

List endpoints accept filter parameters as query strings. Common filters:

| Parameter | Description | Example |
|---|---|---|
| `namespace` | Filter by namespace | `?namespace=prod` |
| `status` | Filter by resource status | `?status=running` |
| `host` | Filter by host name | `?host=worker-node-02` |
| `label` | Filter by Docker label (key=value) | `?label=team%3Dbackend` |
| `created_after` | ISO 8601 datetime lower bound | `?created_after=2026-09-01T00:00:00Z` |
| `created_before` | ISO 8601 datetime upper bound | `?created_before=2026-09-30T23:59:59Z` |
| `q` | Free-text search (endpoint-specific fields) | `?q=nginx` |

### Error Response Format

All error responses follow this schema:

```json
{
  "error": {
    "code": "DCMS-4003",
    "message": "Insufficient permissions to deploy to namespace 'prod'. Required role: operator. Your role: viewer.",
    "request_id": "req_01HXPQR9ABCDEF123456DCMS",
    "details": {
      "namespace": "prod",
      "required_role": "operator",
      "actual_role": "viewer"
    }
  }
}
```

| Field | Description |
|---|---|
| `code` | DCMS error code (see Section 9). |
| `message` | Human-readable description of the error. |
| `request_id` | Unique request identifier for support and tracing. Include this in bug reports. |
| `details` | Optional object with structured error context. |

---

## 4. Rate Limiting

DCMS enforces per-API-key and per-user rate limits to protect platform stability.

### Rate Limit Tiers

| Tier | Applies To | Requests / Minute | Burst |
|---|---|---|---|
| Standard | All authenticated users | 60 | 20 |
| CI/CD | API keys with `ci` scope | 300 | 50 |
| Admin | Users with admin role | 600 | 100 |
| Unauthenticated | `POST /auth/login` only | 10 | 5 |

### Rate Limit Response Headers

Every API response includes these headers:

| Header | Description | Example |
|---|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window. | `60` |
| `X-RateLimit-Remaining` | Requests remaining in the current window. | `47` |
| `X-RateLimit-Reset` | Unix timestamp when the current window resets. | `1727694600` |
| `X-RateLimit-Policy` | The policy tier that applied to this request. | `standard` |

When the rate limit is exceeded, the API returns HTTP `429 Too Many Requests` with a `Retry-After` header:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 37
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1727694637
Content-Type: application/json

{
  "error": {
    "code": "DCMS-4290",
    "message": "Rate limit exceeded. Retry after 37 seconds.",
    "request_id": "req_01HXPQR9DCMS42900000001"
  }
}
```

---

## 5. Server-Sent Events

DCMS pushes real-time events to clients via Server-Sent Events (SSE). SSE is a standard browser API (`EventSource`) that provides a persistent, unidirectional HTTP connection where the server streams events as they occur.

### Connecting to the SSE Stream

```bash
curl -N -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/events/stream?namespace=prod"
```

**JavaScript (browser):**
```javascript
const es = new EventSource(
  'https://dcms.example.com/api/v1/events/stream?namespace=prod',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event type:', data.event_type);
};
```

### Event Format

Each SSE frame follows the standard format:

```
id: evt_01HXQ2ABCDEF123456\n
event: container.status_changed\n
data: {"event_type":"container.status_changed","container_id":"abc123def456","name":"api-server","namespace":"prod","status":"running","host":"worker-02","timestamp":"2026-09-30T12:34:56.789Z"}\n
retry: 3000\n
\n
```

| Field | Description |
|---|---|
| `id` | Unique event ID. Use as `Last-Event-ID` header for reconnection. |
| `event` | Event type (matches the `event_type` field in the JSON body). |
| `data` | JSON payload for the event. |
| `retry` | Suggested reconnect interval in milliseconds (DCMS sets 3000ms). |

### SSE Event Types

| Event Type | Trigger |
|---|---|
| `container.status_changed` | Container state transitions (pending, starting, running, stopped, error) |
| `container.stats_updated` | CPU/memory/network metrics tick (every 5 seconds per container) |
| `image.pull_completed` | Image pull finished |
| `image.scan_completed` | Trivy CVE scan completed |
| `alert.fired` | Alert rule threshold crossed |
| `alert.resolved` | Alert condition no longer met |
| `node.status_changed` | Cluster node health changed |
| `log.line` | New log line from a followed container (if subscribed to a specific container) |
| `heartbeat` | Keepalive ping sent every 30 seconds |

### Reconnection

If the SSE connection drops, reconnect and include the last received event ID in the `Last-Event-ID` header. DCMS will replay events from that ID for up to 5 minutes:

```bash
curl -N \
  -H "Authorization: Bearer <token>" \
  -H "Last-Event-ID: evt_01HXQ2ABCDEF123456" \
  "https://dcms.example.com/api/v1/events/stream?namespace=prod"
```

### Heartbeat

DCMS sends a `heartbeat` event every 30 seconds. If your client does not receive any event for 60 seconds, assume the connection has dropped and reconnect.

---

## 6. Endpoint Reference

### 6.1 Auth

#### POST /auth/login

Authenticate with email and password. Returns access and refresh tokens.

```bash
curl -X POST https://dcms.example.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "securePassword1!"}'
```

**Response `200 OK`:**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

#### POST /auth/refresh

Exchange a refresh token for a new access token.

```bash
curl -X POST https://dcms.example.com/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "eyJhbGci..."}'
```

#### POST /auth/logout

Revoke the current session tokens (adds JWT ID to blocklist).

```bash
curl -X POST https://dcms.example.com/api/v1/auth/logout \
  -H "Authorization: Bearer <token>"
```

#### GET /health

Unauthenticated health check for load balancer probes.

```bash
curl https://dcms.example.com/api/v1/health
```

**Response `200 OK`:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-09-30T12:00:00Z"
}
```

---

### 6.2 Containers

#### GET /containers

List containers in the current namespace.

**Parameters:**

| Name | In | Type | Description |
|---|---|---|---|
| `namespace` | query | string | **Required.** Filter by namespace. |
| `status` | query | string | Filter by status: `running`, `stopped`, `error`, `paused`. |
| `host` | query | string | Filter by host name. |
| `page` | query | integer | Page number. Default: 1. |
| `limit` | query | integer | Items per page. Default: 20. Max: 100. |
| `sort` | query | string | Sort field. Options: `name`, `created_at`, `-created_at`, `status`. Default: `-created_at`. |

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/containers?namespace=prod&status=running&limit=50"
```

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "ctr_01HXPQ12345ABCDEF",
      "docker_id": "abc123def456789",
      "name": "api-server-v2",
      "image": "myorg/api-server:v2.3.1",
      "status": "running",
      "host": "worker-node-02",
      "namespace": "prod",
      "created_at": "2026-09-28T10:15:30Z",
      "started_at": "2026-09-28T10:15:33Z",
      "ports": [{"host_port": 8080, "container_port": 80, "protocol": "tcp"}],
      "cpu_percent": 12.4,
      "memory_mb": 256,
      "restart_count": 0,
      "labels": {"team": "backend", "version": "v2.3.1"}
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

#### POST /containers

Deploy a new container.

```bash
curl -X POST https://dcms.example.com/api/v1/containers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api-server-v2",
    "image": "myorg/api-server:v2.3.1",
    "namespace": "prod",
    "host": "worker-node-02",
    "env": {
      "NODE_ENV": "production",
      "DB_HOST": "postgres.internal"
    },
    "ports": [{"host_port": 8080, "container_port": 80, "protocol": "tcp"}],
    "volumes": [{"volume": "app-data", "path": "/app/data", "read_only": false}],
    "networks": ["app-overlay"],
    "resources": {
      "cpu_limit": 1.0,
      "memory_limit": "512m"
    },
    "restart_policy": "unless-stopped"
  }'
```

**Response `201 Created`:**
```json
{
  "data": {
    "id": "ctr_01HXPQ12345ABCDEF",
    "docker_id": "abc123def456789",
    "name": "api-server-v2",
    "status": "starting",
    "host": "worker-node-02",
    "namespace": "prod",
    "created_at": "2026-09-30T12:00:00Z"
  }
}
```

#### GET /containers/{id}

Retrieve full details for a single container.

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/containers/ctr_01HXPQ12345ABCDEF"
```

#### POST /containers/{id}/start

Start a stopped container.

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/containers/ctr_01HXPQ12345ABCDEF/start"
```

**Response `200 OK`:**
```json
{"data": {"status": "running", "started_at": "2026-09-30T12:01:00Z"}}
```

#### POST /containers/{id}/stop

Stop a running container (graceful, 10s timeout then SIGKILL).

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -d '{"timeout": 30}' \
  "https://dcms.example.com/api/v1/containers/ctr_01HXPQ12345ABCDEF/stop"
```

#### POST /containers/{id}/restart

Restart a container.

#### POST /containers/{id}/kill

Send SIGKILL immediately (no graceful shutdown).

#### DELETE /containers/{id}

Remove a stopped container. Pass `?force=true` to remove a running container (equivalent to `docker rm -f`).

```bash
curl -X DELETE -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/containers/ctr_01HXPQ12345ABCDEF?force=false"
```

**Response `204 No Content`**

---

### 6.3 Images

#### GET /images

List images available on hosts in the namespace.

**Parameters:**

| Name | In | Type | Description |
|---|---|---|---|
| `namespace` | query | string | **Required.** |
| `host` | query | string | Filter by host. |
| `scan_status` | query | string | Filter by scan status: `clean`, `critical`, `high`, `not_scanned`. |
| `q` | query | string | Search by image name or tag. |

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/images?namespace=prod&scan_status=critical"
```

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "img_01HXAB1234DCMS",
      "name": "myorg/api-server",
      "tag": "v2.3.1",
      "digest": "sha256:abc123...",
      "registry": "registry.example.com",
      "host": "worker-node-02",
      "size_bytes": 145234567,
      "pulled_at": "2026-09-29T08:00:00Z",
      "scan_status": "clean",
      "scan_summary": {
        "critical": 0,
        "high": 2,
        "medium": 7,
        "low": 14,
        "scanned_at": "2026-09-29T08:03:45Z"
      },
      "containers_using": 3
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "total_pages": 1, "has_next": false, "has_prev": false }
}
```

#### POST /images/pull

Pull an image from a registry.

```bash
curl -X POST https://dcms.example.com/api/v1/images/pull \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "registry": "registry.example.com",
    "name": "myorg/api-server",
    "tag": "v2.3.2",
    "host": "worker-node-02",
    "namespace": "prod"
  }'
```

**Response `202 Accepted`:**
```json
{
  "data": {
    "pull_id": "pull_01HXAB9999DCMS",
    "status": "in_progress",
    "message": "Pull started. Monitor progress via SSE stream event image.pull_completed."
  }
}
```

#### GET /images/{id}/scan

Retrieve the full CVE scan report for an image.

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/images/img_01HXAB1234DCMS/scan"
```

**Response `200 OK`:**
```json
{
  "data": {
    "image_id": "img_01HXAB1234DCMS",
    "scanned_at": "2026-09-29T08:03:45Z",
    "trivy_db_version": "2026-09-29",
    "vulnerabilities": [
      {
        "cve_id": "CVE-2024-21626",
        "package": "runc",
        "installed_version": "1.1.11",
        "fixed_version": "1.1.12",
        "severity": "HIGH",
        "cvss_v3": 8.6,
        "description": "Container breakout vulnerability in runc affecting Linux container runtime.",
        "nvd_url": "https://nvd.nist.gov/vuln/detail/CVE-2024-21626"
      }
    ],
    "summary": {
      "critical": 0,
      "high": 1,
      "medium": 3,
      "low": 9,
      "total": 13
    }
  }
}
```

#### POST /images/{id}/scan

Trigger a manual re-scan of an image.

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/images/img_01HXAB1234DCMS/scan"
```

#### DELETE /images/{id}

Delete an image from a host. Blocked if the image is used by running containers.

---

### 6.4 Networks

#### GET /networks

List networks in the namespace.

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/networks?namespace=prod"
```

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "net_01HXCD5678DCMS",
      "docker_id": "1234abcd5678ef",
      "name": "app-overlay",
      "driver": "overlay",
      "scope": "swarm",
      "subnet": "10.10.1.0/24",
      "gateway": "10.10.1.1",
      "namespace": "prod",
      "attachable": true,
      "encrypted": false,
      "containers": 5,
      "created_at": "2026-09-20T09:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "total_pages": 1, "has_next": false, "has_prev": false }
}
```

#### POST /networks

Create a new network.

```bash
curl -X POST https://dcms.example.com/api/v1/networks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-overlay",
    "driver": "overlay",
    "namespace": "prod",
    "subnet": "10.10.1.0/24",
    "gateway": "10.10.1.1",
    "attachable": true,
    "encrypted": false
  }'
```

**Response `201 Created`**

#### POST /networks/{id}/connect

Connect a container to a network.

```bash
curl -X POST https://dcms.example.com/api/v1/networks/net_01HXCD5678DCMS/connect \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"container_id": "ctr_01HXPQ12345ABCDEF", "aliases": ["api"]}'
```

#### POST /networks/{id}/disconnect

Disconnect a container from a network.

#### DELETE /networks/{id}

Delete a network. Blocked if any containers are attached.

---

### 6.5 Volumes

#### GET /volumes

List volumes.

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/volumes?namespace=prod"
```

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "vol_01HXEF9012DCMS",
      "docker_name": "postgres-data",
      "driver": "local",
      "host": "worker-node-01",
      "namespace": "prod",
      "mountpoint": "/var/lib/docker/volumes/postgres-data/_data",
      "size_bytes": 5368709120,
      "containers_using": 1,
      "created_at": "2026-09-15T14:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "total_pages": 1, "has_next": false, "has_prev": false }
}
```

#### POST /volumes

Create a volume.

```bash
curl -X POST https://dcms.example.com/api/v1/volumes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "postgres-data",
    "driver": "local",
    "host": "worker-node-01",
    "namespace": "prod",
    "labels": {"service": "database", "env": "prod"}
  }'
```

#### DELETE /volumes/{id}

Delete a volume. Blocked if mounted to any container.

---

### 6.6 Clusters

#### GET /clusters/{cluster_id}/nodes

List all nodes in a cluster.

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/clusters/cls_01HX123DCMS/nodes"
```

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "node_01HXGH3456DCMS",
      "hostname": "manager-node-01",
      "role": "manager",
      "status": "ready",
      "availability": "active",
      "docker_version": "26.1.4",
      "agent_version": "1.0.0",
      "cpu_percent": 23.1,
      "memory_percent": 41.5,
      "running_containers": 12,
      "joined_at": "2026-09-10T08:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3, "total_pages": 1, "has_next": false, "has_prev": false }
}
```

#### POST /clusters/{cluster_id}/nodes/{node_id}/drain

Drain a node (reschedule all Swarm services to other nodes).

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/clusters/cls_01HX123DCMS/nodes/node_01HXGH3456DCMS/drain"
```

#### POST /clusters/{cluster_id}/nodes/{node_id}/activate

Re-activate a drained node to accept workloads.

#### GET /clusters/{cluster_id}/services

List Swarm services in the cluster.

#### PATCH /clusters/{cluster_id}/services/{service_id}/scale

Scale a Swarm service replica count.

```bash
curl -X PATCH https://dcms.example.com/api/v1/clusters/cls_01HX123DCMS/services/svc_01HX789DCMS/scale \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"replicas": 5}'
```

**Response `200 OK`:**
```json
{
  "data": {
    "service_id": "svc_01HX789DCMS",
    "name": "api-server",
    "desired_replicas": 5,
    "running_replicas": 2,
    "status": "updating",
    "message": "Scaling in progress. Monitor via SSE stream."
  }
}
```

---

### 6.7 Monitoring

#### GET /monitoring/metrics

Query current metrics for containers or hosts.

**Parameters:**

| Name | In | Type | Description |
|---|---|---|---|
| `namespace` | query | string | **Required.** |
| `resource_type` | query | string | `container` or `host`. |
| `resource_id` | query | string | Specific container or host ID. |
| `metric` | query | string | Metric key (e.g., `cpu_percent`, `memory_mb`). Multiple allowed. |

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/monitoring/metrics?namespace=prod&resource_type=container&resource_id=ctr_01HXPQ12345ABCDEF&metric=cpu_percent&metric=memory_mb"
```

**Response `200 OK`:**
```json
{
  "data": {
    "resource_id": "ctr_01HXPQ12345ABCDEF",
    "resource_type": "container",
    "timestamp": "2026-09-30T12:34:56Z",
    "metrics": {
      "cpu_percent": 12.4,
      "memory_mb": 256,
      "memory_percent": 50.0,
      "network_rx_bytes_per_sec": 15360,
      "network_tx_bytes_per_sec": 4096
    }
  }
}
```

#### GET /monitoring/alert-rules

List all alert rules in the namespace.

#### POST /monitoring/alert-rules

Create an alert rule.

```bash
curl -X POST https://dcms.example.com/api/v1/monitoring/alert-rules \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High CPU — API Containers",
    "namespace": "prod",
    "metric": "container.cpu_percent",
    "scope": {"label_selector": "service=api"},
    "condition": "greater_than",
    "threshold": 85,
    "duration": "5m",
    "severity": "warning",
    "notification_channels": ["slack:#ops-alerts"],
    "message_template": "Container {{.ContainerName}} CPU at {{.Value}}%"
  }'
```

**Response `201 Created`**

#### GET /monitoring/alerts

List currently firing alerts.

#### POST /monitoring/alerts/{alert_id}/acknowledge

Acknowledge a firing alert.

#### POST /monitoring/alerts/{alert_id}/silence

Silence a firing alert for a duration.

```bash
curl -X POST https://dcms.example.com/api/v1/monitoring/alerts/alt_01HXIJ7890DCMS/silence \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"duration": "2h", "reason": "Planned maintenance window"}'
```

---

### 6.8 Logs

#### GET /logs

Search historical container logs.

**Parameters:**

| Name | In | Type | Description |
|---|---|---|---|
| `container_id` | query | string | **Required.** Container ID to query logs for. |
| `namespace` | query | string | **Required.** |
| `q` | query | string | Keyword search query. |
| `from` | query | string | ISO 8601 start time. Default: 1 hour ago. |
| `to` | query | string | ISO 8601 end time. Default: now. |
| `limit` | query | integer | Max log lines to return. Default: 100. Max: 1000. |

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/logs?container_id=ctr_01HXPQ12345ABCDEF&namespace=prod&q=ERROR&from=2026-09-30T10:00:00Z&to=2026-09-30T12:00:00Z"
```

**Response `200 OK`:**
```json
{
  "data": {
    "container_id": "ctr_01HXPQ12345ABCDEF",
    "container_name": "api-server-v2",
    "lines": [
      {
        "timestamp": "2026-09-30T11:23:45.123Z",
        "stream": "stderr",
        "message": "ERROR: database connection timeout after 30s"
      }
    ],
    "total_matched": 1,
    "truncated": false
  }
}
```

#### GET /logs/stream

Stream live container logs via SSE.

```bash
curl -N -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/logs/stream?container_id=ctr_01HXPQ12345ABCDEF&namespace=prod"
```

**SSE events on this stream** use event type `log.line` with data:
```json
{"timestamp":"2026-09-30T12:34:56.789Z","stream":"stdout","message":"GET /health 200 OK 1ms"}
```

---

### 6.9 Users

#### GET /users

List users in the organization (Admin only).

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/users?page=1&limit=20"
```

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "usr_01HXM3K5BVFP2YTRJZ8DCMS01",
      "email": "jane@example.com",
      "name": "Jane Smith",
      "auth_provider": "oidc",
      "status": "active",
      "roles": [
        {"namespace": "prod", "role": "operator"},
        {"namespace": "dev", "role": "admin"}
      ],
      "last_login": "2026-09-30T09:00:00Z",
      "created_at": "2026-08-01T00:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 15, "total_pages": 1, "has_next": false, "has_prev": false }
}
```

#### POST /users/invite

Invite a new user by email.

```bash
curl -X POST https://dcms.example.com/api/v1/users/invite \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newengineer@example.com",
    "initial_role": {"namespace": "dev", "role": "operator"}
  }'
```

#### PUT /users/{id}/roles

Update a user's role assignments (Admin only).

```bash
curl -X PUT https://dcms.example.com/api/v1/users/usr_01HXM3K5BVFP2/roles \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "roles": [
      {"namespace": "staging", "role": "operator"},
      {"namespace": "dev", "role": "operator"}
    ]
  }'
```

#### GET /users/me/api-keys

List API keys for the current user.

#### POST /users/me/api-keys

Create an API key.

```bash
curl -X POST https://dcms.example.com/api/v1/users/me/api-keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github-actions-staging",
    "expires_at": "2027-09-30T00:00:00Z"
  }'
```

**Response `201 Created`:**
```json
{
  "data": {
    "id": "key_01HXKL1234DCMS",
    "name": "github-actions-staging",
    "key": "dcms_apikey_v1_abc123xyz789...",
    "expires_at": "2027-09-30T00:00:00Z",
    "created_at": "2026-09-30T12:00:00Z"
  },
  "warning": "This is the only time this key will be shown. Store it securely."
}
```

#### DELETE /users/me/api-keys/{key_id}

Revoke an API key. Takes effect immediately.

#### GET /audit-log

Search the audit log (Admin only).

```bash
curl -H "Authorization: Bearer <token>" \
  "https://dcms.example.com/api/v1/audit-log?namespace=prod&from=2026-09-01T00:00:00Z&q=container.create&limit=50"
```

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "aud_01HXNO9876DCMS",
      "event_type": "container.create",
      "actor_id": "usr_01HXM3K5BVFP2",
      "actor_email": "jane@example.com",
      "namespace": "prod",
      "resource_type": "container",
      "resource_id": "ctr_01HXPQ12345ABCDEF",
      "resource_name": "api-server-v2",
      "outcome": "success",
      "ip_address": "10.0.1.50",
      "timestamp": "2026-09-28T10:15:30Z",
      "metadata": {
        "image": "myorg/api-server:v2.3.1",
        "host": "worker-node-02"
      }
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 234, "total_pages": 5, "has_next": true, "has_prev": false }
}
```

---

## 7. Webhooks

DCMS can send outbound HTTP POST notifications to configured webhook endpoints when specific events occur. Webhooks are configured per namespace by Admins in Settings > Webhooks.

### Webhook Payload Format

```json
{
  "webhook_id": "wh_01HXPQ9876DCMS",
  "event_type": "container.status_changed",
  "namespace": "prod",
  "timestamp": "2026-09-30T12:34:56.789Z",
  "payload": {
    "container_id": "ctr_01HXPQ12345ABCDEF",
    "name": "api-server-v2",
    "status": "running",
    "host": "worker-node-02"
  }
}
```

### Webhook Event Types

| Event Type | Description |
|---|---|
| `container.created` | New container successfully created. |
| `container.status_changed` | Container status transitioned. |
| `container.removed` | Container deleted. |
| `image.pull_completed` | Image pull finished. |
| `image.scan_completed` | CVE scan finished (includes scan summary in payload). |
| `image.scan_policy_violated` | CRITICAL CVE found in image; deployment blocked. |
| `alert.fired` | Alert rule threshold crossed. |
| `alert.resolved` | Alert condition resolved. |
| `node.status_changed` | Cluster node health changed. |
| `user.role_assigned` | A user's role was changed. |

### Signature Verification

Every webhook request includes a signature header to allow your endpoint to verify authenticity:

```
X-DCMS-Signature: sha256=a1b2c3d4e5f6...
X-DCMS-Timestamp: 1727694600
```

The signature is an HMAC-SHA256 of the concatenated string `timestamp.request_body` using your webhook secret as the key.

**Verification example (Go):**
```go
import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
)

func verifySignature(secret, timestamp, body, signature string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(timestamp + "." + body))
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(signature))
}
```

**Verification example (Python):**
```python
import hmac, hashlib

def verify_signature(secret: str, timestamp: str, body: str, signature: str) -> bool:
    message = f"{timestamp}.{body}"
    expected = "sha256=" + hmac.new(
        secret.encode(), message.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

**Timestamp validation:** Reject webhook deliveries where the `X-DCMS-Timestamp` is more than 5 minutes in the past to prevent replay attacks.

DCMS retries failed webhook deliveries (non-2xx responses or timeouts) with exponential backoff: 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours. After 5 failed attempts, delivery is abandoned and logged.

---

## 8. SDK Examples

### Go

**List all running containers in the `prod` namespace:**

```go
package main

import (
    "encoding/json"
    "fmt"
    "io"
    "net/http"
)

func main() {
    req, _ := http.NewRequest("GET",
        "https://dcms.example.com/api/v1/containers?namespace=prod&status=running",
        nil)
    req.Header.Set("Authorization", "Bearer "+getAccessToken())
    req.Header.Set("Content-Type", "application/json")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    var result map[string]interface{}
    json.Unmarshal(body, &result)
    fmt.Printf("Containers: %v\n", result["data"])
}
```

**Deploy a container:**

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

type DeployRequest struct {
    Name          string            `json:"name"`
    Image         string            `json:"image"`
    Namespace     string            `json:"namespace"`
    Host          string            `json:"host"`
    Env           map[string]string `json:"env"`
    RestartPolicy string            `json:"restart_policy"`
}

func deployContainer(token string) {
    payload := DeployRequest{
        Name:          "api-server-v2",
        Image:         "myorg/api-server:v2.3.1",
        Namespace:     "staging",
        Host:          "worker-node-02",
        Env:           map[string]string{"NODE_ENV": "staging"},
        RestartPolicy: "unless-stopped",
    }

    body, _ := json.Marshal(payload)
    req, _ := http.NewRequest("POST",
        "https://dcms.example.com/api/v1/containers",
        bytes.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Content-Type", "application/json")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    fmt.Printf("HTTP %d\n", resp.StatusCode)
}
```

**Watch live logs via SSE:**

```go
package main

import (
    "bufio"
    "fmt"
    "net/http"
    "strings"
)

func watchLogs(token, containerID string) {
    req, _ := http.NewRequest("GET",
        fmt.Sprintf("https://dcms.example.com/api/v1/logs/stream?container_id=%s&namespace=prod", containerID),
        nil)
    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Accept", "text/event-stream")

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    scanner := bufio.NewScanner(resp.Body)
    for scanner.Scan() {
        line := scanner.Text()
        if strings.HasPrefix(line, "data: ") {
            fmt.Println(strings.TrimPrefix(line, "data: "))
        }
    }
}
```

### Python

**List all running containers:**

```python
import requests

DCMS_BASE = "https://dcms.example.com/api/v1"
TOKEN = "your-access-token"

def list_running_containers(namespace: str) -> list:
    resp = requests.get(
        f"{DCMS_BASE}/containers",
        params={"namespace": namespace, "status": "running", "limit": 100},
        headers={"Authorization": f"Bearer {TOKEN}"}
    )
    resp.raise_for_status()
    return resp.json()["data"]

containers = list_running_containers("prod")
for c in containers:
    print(f"{c['name']}: {c['status']} on {c['host']}")
```

**Create a container:**

```python
import requests

def deploy_container(token: str, namespace: str) -> dict:
    resp = requests.post(
        f"{DCMS_BASE}/containers",
        json={
            "name": "api-server-v2",
            "image": "myorg/api-server:v2.3.1",
            "namespace": namespace,
            "env": {"NODE_ENV": "staging"},
            "restart_policy": "unless-stopped"
        },
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    resp.raise_for_status()
    return resp.json()["data"]
```

**Watch live logs via SSE:**

```python
import requests
import sseclient  # pip install sseclient-py

def watch_logs(token: str, container_id: str):
    url = f"{DCMS_BASE}/logs/stream?container_id={container_id}&namespace=prod"
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
        stream=True
    )
    client = sseclient.SSEClient(resp)
    for event in client.events():
        if event.event == "log.line":
            print(event.data)
```

---

## 9. Error Codes Reference

| Code | HTTP Status | Short Name | Description | Remediation |
|---|---|---|---|---|
| DCMS-4001 | 400 | bad_request | The request body is malformed or missing required fields. | Validate request JSON against the OpenAPI spec. Check `details` for specific field errors. |
| DCMS-4002 | 401 | unauthorized | No valid authentication token provided. | Include a valid `Authorization: Bearer <token>` header. Refresh the token if expired. |
| DCMS-4003 | 403 | forbidden | The authenticated user does not have the required role or namespace permission. | Check your role assignment for the target namespace. Contact an Admin to update your role. |
| DCMS-4004 | 404 | not_found | The requested resource does not exist or is not visible to your account. | Verify the resource ID and namespace. The resource may have been deleted. |
| DCMS-4005 | 409 | conflict | A conflict prevents the operation (e.g., a container with the same name already exists, or a host port is already in use). | Check `details` for the conflicting resource. Choose a different name or port. |
| DCMS-4006 | 422 | validation_failed | The request is syntactically valid but semantically invalid (e.g., memory limit below minimum, image tag does not exist). | Check `details` for field-level validation messages. |
| DCMS-4010 | 400 | image_cve_blocked | Deployment blocked because the image has CRITICAL CVEs and the target namespace enforces the CRITICAL CVE policy. | Update the image to a version without CRITICAL CVEs, or request a policy suppression from your security team. |
| DCMS-4011 | 400 | port_conflict | The requested host port is already bound by another container on the target host. | Choose a different host port or a different target host. |
| DCMS-4012 | 400 | volume_in_use | The volume cannot be deleted because it is currently mounted to one or more containers. | Stop and remove all containers using the volume first. |
| DCMS-4013 | 400 | network_in_use | The network cannot be deleted because containers are still attached. | Disconnect all containers from the network first. |
| DCMS-4014 | 400 | image_in_use | The image cannot be deleted because running containers depend on it. | Stop the containers using this image before deletion. |
| DCMS-4015 | 400 | host_unreachable | The target host's DCMS agent is not reachable. | Check the agent status in Cluster > Nodes. Verify network connectivity to the agent on port 9090. |
| DCMS-4016 | 400 | scan_db_stale | The Trivy vulnerability database is older than 6 hours. Scans are paused until the DB is refreshed. | Contact your platform Admin to resolve the Trivy DB update issue. |
| DCMS-4290 | 429 | rate_limit_exceeded | Too many requests. The rate limit for your account tier has been exceeded. | Wait for the `Retry-After` seconds indicated in the response header before retrying. |
| DCMS-5001 | 500 | internal_error | An unexpected internal server error occurred. | Retry the request. If the error persists, contact support with the `request_id`. |
| DCMS-5002 | 502 | upstream_error | An upstream service (Docker Engine, agent gRPC) returned an unexpected response. | Check cluster node health. The Docker daemon on the target host may be temporarily unavailable. |
| DCMS-5003 | 503 | service_unavailable | DCMS is temporarily overloaded or under maintenance. | Retry with exponential backoff. Check the DCMS status page for maintenance windows. |
| DCMS-5004 | 504 | gateway_timeout | The upstream service (agent gRPC, Docker Engine) did not respond within the deadline. | The operation may have partially completed. Check the container status before retrying. |
| DCMS-5005 | 500 | database_error | A database operation failed unexpectedly. | Retry the request. If persistent, contact support with the `request_id`. |
| DCMS-5006 | 500 | agent_grpc_error | The gRPC call to the DCMS agent failed after all retries. | Check agent logs on the host and verify network connectivity between container-service and the agent. |
| DCMS-5007 | 500 | redis_error | A Redis operation failed. Real-time state may be temporarily inconsistent. | Monitor the Redis Sentinel health dashboard. The system will recover automatically when Redis is available. |
| DCMS-5008 | 500 | migration_pending | A database schema migration is currently running. The service is temporarily unavailable. | Wait 1–2 minutes and retry. This typically occurs immediately after a DCMS upgrade. |
| DCMS-5009 | 500 | image_scan_error | The Trivy scanner encountered an internal error and could not complete the scan. | Retry the scan manually. Check image-service logs for the scan job error details. |
