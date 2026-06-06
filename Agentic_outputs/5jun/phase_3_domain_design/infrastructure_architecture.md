# Infrastructure Architecture
## Generic Docker Container Management System (DCMS)

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Document ID   | INFRA-ARCH-DCMS-001                            |
| Version       | 1.0.0                                          |
| Status        | Approved                                       |
| Date          | 2026-06-05                                     |
| Author        | DevOps Architect Agent                         |
| Parent BRD    | BRD-DCMS-001                                   |
| Parent NFR    | NFR-DCMS-001                                   |
| NFRs Covered  | NFR-A-001 through NFR-A-008, NFR-SEC-018 through NFR-SEC-020 |

---

## Table of Contents

1. [Environment Topology](#1-environment-topology)
2. [Dev Environment](#2-dev-environment)
3. [Staging Environment](#3-staging-environment)
4. [Production Environment](#4-production-environment)
5. [Network Architecture](#5-network-architecture)
6. [Storage Design](#6-storage-design)
7. [Load Balancer](#7-load-balancer)
8. [TLS and Certificate Management](#8-tls-and-certificate-management)
9. [Firewall Rules](#9-firewall-rules)
10. [Disaster Recovery](#10-disaster-recovery)
11. [Capacity Planning](#11-capacity-planning)
12. [Health Checks](#12-health-checks)

---

## 1. Environment Topology

### 1.1 Summary Table

| Attribute                | Dev                        | Staging                        | Production                          |
|--------------------------|----------------------------|--------------------------------|-------------------------------------|
| Runtime                  | Docker Compose             | Docker Swarm 3-node            | Docker Swarm 5+ nodes               |
| Node count               | 1 (developer workstation)  | 3 (1 manager + 2 workers)      | 5+ (3 managers + 2+ workers)        |
| Manager nodes            | N/A                        | 1                              | 3 (raft quorum)                     |
| Worker nodes             | N/A                        | 2                              | 2 minimum; scale horizontally       |
| PostgreSQL               | Single container           | Shared managed instance        | Primary + 1 replica + pgBouncer     |
| Redis                    | Single container           | Redis Sentinel (1+2)           | Redis Sentinel (1+2)                |
| Kong Gateway             | Single container           | 1 replica                      | 2 replicas (HA)                     |
| Observability stack      | Full stack (compose)       | Prometheus + Grafana + Loki    | Prometheus + Grafana + Loki         |
| Domain                   | localhost                  | staging.dcms.internal          | dcms.example.com                    |
| TLS                      | Self-signed (mkcert)       | Let's Encrypt staging CA       | Let's Encrypt production CA         |
| Backup                   | None                       | Daily snapshot                 | Continuous WAL + hourly snapshot    |

### 1.2 Service Placement by Environment

| Service                   | Dev         | Staging           | Prod (Swarm)              |
|---------------------------|-------------|-------------------|---------------------------|
| api-server                | compose     | 2 replicas/worker | 3 replicas/worker         |
| web-ui                    | compose     | 1 replica/worker  | 2 replicas/worker         |
| agent                     | compose     | 1/node (global)   | 1/node (global mode)      |
| auth-service              | compose     | 1 replica/worker  | 2 replicas/worker         |
| notification-svc          | compose     | 1 replica/worker  | 2 replicas/worker         |
| image-scanner             | compose     | 1 replica/worker  | 2 replicas/worker         |
| log-aggregator            | compose     | 1 replica/worker  | 2 replicas/worker         |
| metrics-collector         | compose     | 1 replica/manager | 1 replica/manager         |
| cluster-controller        | compose     | 1 replica/manager | 1 replica/manager         |
| registry-proxy            | compose     | 1 replica/worker  | 2 replicas/worker         |
| audit-service             | compose     | 1 replica/worker  | 2 replicas/worker         |
| migration-runner          | compose     | manual trigger    | manual trigger (scale 0→1)|
| PostgreSQL                | compose     | external managed  | primary/replica + pgBouncer |
| Redis                     | compose     | Sentinel 3-node   | Sentinel 3-node           |
| Kong Gateway              | compose     | 1 replica/worker  | 2 replicas/worker         |
| Prometheus                | compose     | 1 replica/manager | 1 replica/manager         |
| Grafana                   | compose     | 1 replica/manager | 1 replica/manager         |
| Loki                      | compose     | 1 replica/manager | 1 replica/manager         |
| cAdvisor                  | compose     | 1/node (global)   | 1/node (global mode)      |
| Promtail                  | compose     | 1/node (global)   | 1/node (global mode)      |
| Jaeger                    | compose     | 1 replica/manager | 1 replica/manager         |
| HAProxy                   | N/A         | 1 (external)      | 2 (HA pair)               |

---

## 2. Dev Environment

### 2.1 Overview

The dev environment runs entirely on a single developer machine or a shared dev VM. `docker compose up` brings up all services, databases, and the observability stack for a self-contained development loop.

### 2.2 Host Specification (Minimum)

| Resource     | Minimum         | Recommended      |
|--------------|-----------------|------------------|
| CPU          | 4 cores         | 8 cores          |
| RAM          | 8 GB            | 16 GB            |
| Disk         | 40 GB SSD       | 80 GB SSD        |
| OS           | Ubuntu 22.04+, macOS 13+, Windows WSL2 | Same |
| Docker       | Engine 24.x+    | Engine 26.x+     |

### 2.3 Docker Compose File Structure

```
docker-compose.yml               — all services, core config
docker-compose.override.yml      — developer-local overrides (volume mounts, debug ports)
docker-compose.test.yml          — minimal stack for contract/integration tests in CI
docker-compose.observability.yml — Prometheus, Grafana, Loki (optional, included via --profile observe)

Usage:
  docker compose up                       # core services
  docker compose --profile observe up     # + observability stack
  docker compose -f docker-compose.yml \
    -f docker-compose.test.yml up         # CI test stack
```

### 2.4 Dev Environment Networks (Compose)

```
networks:
  dcms-backend:           # API server ↔ PostgreSQL, Redis, services
    driver: bridge
  dcms-observability:     # Prometheus ↔ exporters ↔ Grafana
    driver: bridge
  dcms-frontend:          # Kong ↔ web-ui ↔ api-server
    driver: bridge
```

### 2.5 Dev Data Seeding

- `make dev-seed` runs the migration-runner + a seed script populating demo containers, users, and RBAC roles
- Volume `dcms-dev-pgdata` persists PostgreSQL data across restarts; `make dev-reset` wipes it

---

## 3. Staging Environment

### 3.1 Node Specifications

| Node           | Role              | CPU    | RAM   | Disk (OS+Docker) | Disk (Data) | Hostname               |
|----------------|-------------------|--------|-------|------------------|-------------|------------------------|
| stg-manager-01 | Swarm Manager     | 4 vCPU | 8 GB  | 50 GB SSD        | —           | stg-manager-01.internal |
| stg-worker-01  | Swarm Worker      | 4 vCPU | 8 GB  | 50 GB SSD        | 100 GB SSD  | stg-worker-01.internal  |
| stg-worker-02  | Swarm Worker      | 4 vCPU | 8 GB  | 50 GB SSD        | 100 GB SSD  | stg-worker-02.internal  |
| stg-pg-01      | PostgreSQL        | 4 vCPU | 8 GB  | 50 GB SSD        | 200 GB SSD  | stg-pg-01.internal      |
| stg-redis-01   | Redis Primary     | 2 vCPU | 4 GB  | 30 GB SSD        | 20 GB SSD   | stg-redis-01.internal   |
| stg-redis-02   | Redis Replica     | 2 vCPU | 4 GB  | 30 GB SSD        | 20 GB SSD   | stg-redis-02.internal   |
| stg-redis-03   | Redis Replica     | 2 vCPU | 4 GB  | 30 GB SSD        | 20 GB SSD   | stg-redis-03.internal   |
| stg-haproxy-01 | HAProxy / LB      | 2 vCPU | 4 GB  | 30 GB SSD        | —           | stg-haproxy-01.internal |
| stg-nfs-01     | NFS / Log Storage | 2 vCPU | 4 GB  | 30 GB SSD        | 500 GB HDD  | stg-nfs-01.internal     |

### 3.2 Swarm Initialization

```bash
# On stg-manager-01:
docker swarm init --advertise-addr <stg-manager-01-ip>

# On stg-worker-01 and stg-worker-02:
docker swarm join --token <worker-token> <stg-manager-01-ip>:2377

# Node labels for placement constraints:
docker node update --label-add role=manager stg-manager-01
docker node update --label-add role=worker  stg-worker-01
docker node update --label-add role=worker  stg-worker-02
```

### 3.3 PostgreSQL (Staging)

- Single PostgreSQL 16 instance (`stg-pg-01`)
- Shared across all DCMS staging services
- WAL archiving to NFS (`stg-nfs-01:/backups/staging/pg-wal/`)
- Daily `pg_dump` backup to NFS; retained 7 days
- Connection via pgBouncer (transaction pooling) from Swarm services
- Database: `dcms_staging`; dedicated user `dcms_app` with `CONNECT, CRUD` on `dcms` schema

### 3.4 Redis Sentinel (Staging)

```
Architecture:
  stg-redis-01: Redis primary (port 6379)
  stg-redis-02: Redis replica (port 6379)
  stg-redis-03: Redis replica (port 6379)
  All three: Redis Sentinel (port 26379)

Sentinel config:
  sentinel monitor dcms-staging <stg-redis-01-ip> 6379 2
  sentinel down-after-milliseconds dcms-staging 5000
  sentinel failover-timeout dcms-staging 60000
  sentinel parallel-syncs dcms-staging 1

Application connection:
  Use redis-sentinel://stg-redis-01.internal:26379,stg-redis-02.internal:26379,stg-redis-03.internal:26379/dcms-staging
```

---

## 4. Production Environment

### 4.1 Node Specifications

| Node           | Role               | CPU    | RAM   | Disk (OS+Docker) | Disk (Data) | Hostname               |
|----------------|--------------------|--------|-------|------------------|-------------|------------------------|
| prod-mgr-01    | Swarm Manager      | 4 vCPU | 8 GB  | 50 GB SSD        | —           | prod-mgr-01.internal   |
| prod-mgr-02    | Swarm Manager      | 4 vCPU | 8 GB  | 50 GB SSD        | —           | prod-mgr-02.internal   |
| prod-mgr-03    | Swarm Manager      | 4 vCPU | 8 GB  | 50 GB SSD        | —           | prod-mgr-03.internal   |
| prod-wrk-01    | Swarm Worker       | 8 vCPU | 16 GB | 50 GB SSD        | 200 GB SSD  | prod-wrk-01.internal   |
| prod-wrk-02    | Swarm Worker       | 8 vCPU | 16 GB | 50 GB SSD        | 200 GB SSD  | prod-wrk-02.internal   |
| prod-pg-01     | PostgreSQL Primary | 8 vCPU | 32 GB | 50 GB SSD        | 500 GB SSD  | prod-pg-01.internal    |
| prod-pg-02     | PostgreSQL Replica | 8 vCPU | 32 GB | 50 GB SSD        | 500 GB SSD  | prod-pg-02.internal    |
| prod-pgbouncer | pgBouncer          | 2 vCPU | 4 GB  | 30 GB SSD        | —           | prod-pgbouncer.internal|
| prod-redis-01  | Redis Primary      | 4 vCPU | 8 GB  | 30 GB SSD        | 50 GB SSD   | prod-redis-01.internal |
| prod-redis-02  | Redis Replica      | 4 vCPU | 8 GB  | 30 GB SSD        | 50 GB SSD   | prod-redis-02.internal |
| prod-redis-03  | Redis Replica      | 4 vCPU | 8 GB  | 30 GB SSD        | 50 GB SSD   | prod-redis-03.internal |
| prod-haproxy-01| HAProxy Primary    | 4 vCPU | 8 GB  | 30 GB SSD        | —           | prod-haproxy-01.internal|
| prod-haproxy-02| HAProxy Standby    | 4 vCPU | 8 GB  | 30 GB SSD        | —           | prod-haproxy-02.internal|
| prod-nfs-01    | NFS / Log Storage  | 4 vCPU | 8 GB  | 50 GB SSD        | 2 TB HDD    | prod-nfs-01.internal   |
| prod-vault-01  | HashiCorp Vault    | 4 vCPU | 8 GB  | 50 GB SSD        | 100 GB SSD  | prod-vault-01.internal |

Scale-out: additional `prod-wrk-N` nodes can be added at any time; see Section 11 for capacity triggers.

### 4.2 Swarm Manager Quorum

Three manager nodes ensure raft consensus tolerates 1 manager failure:
- Raft quorum: 2 of 3 required
- Swarm API only accessible on manager nodes; workers only receive task assignments
- Manager nodes do NOT run application workloads (placement constraint `node.role == worker`)
- Manager nodes run only: Prometheus, Grafana, Loki, Jaeger, cluster-controller, metrics-collector

### 4.3 PostgreSQL High Availability (Production)

```
Architecture:
  prod-pg-01: Primary (read-write; port 5432)
  prod-pg-02: Streaming replica (read-only; port 5432)
  prod-pgbouncer: pgBouncer (transaction pool; port 5432 for app, 5433 for readonly pool)

PostgreSQL config (prod-pg-01):
  max_connections = 200
  wal_level = replica
  max_wal_senders = 5
  wal_keep_size = 1GB
  archive_mode = on
  archive_command = 'rsync -a %p prod-nfs-01.internal:/backups/prod/pg-wal/%f'
  synchronous_commit = on
  synchronous_standby_names = 'prod-pg-02'

pgBouncer config:
  [databases]
  dcms = host=prod-pg-01.internal port=5432 dbname=dcms pool_size=50
  dcms_ro = host=prod-pg-02.internal port=5432 dbname=dcms pool_size=20
  [pgbouncer]
  pool_mode = transaction
  max_client_conn = 500
  default_pool_size = 50
  server_idle_timeout = 600
  server_lifetime = 3600
  log_connections = 1
  log_disconnections = 1

Failover:
  Manual (v1): DBA promotes prod-pg-02 to primary using `pg_promote()`
  pgBouncer reconfigured via config reload (SIGHUP) to point to new primary
  Automation (v2): Patroni HA cluster
```

### 4.4 Redis Sentinel (Production)

Identical structure to staging but with increased resource allocation:
- Primary: prod-redis-01 (8 GB RAM for large dataset)
- Replicas: prod-redis-02, prod-redis-03
- Sentinel: runs on all three nodes (port 26379)
- Failover quorum: 2 of 3 sentinels agree
- `maxmemory 4gb`, `maxmemory-policy allkeys-lru`
- AOF persistence: `appendonly yes`, `appendfsync everysec`
- RDB snapshots: `save 900 1`, `save 300 10`, `save 60 10000`

### 4.5 Kong API Gateway (Production HA)

```
Deployment:
  2 Kong replicas on Swarm workers (behind HAProxy)
  Kong database mode: PostgreSQL (dcms-kong schema)
  Kong admin API: NOT exposed externally; accessible only on management network

Kong services and routes:
  /api/v1/*       → dcms_api-server upstream (3 targets)
  /auth/*         → dcms_auth-service upstream (2 targets)
  /ws/*           → dcms_api-server (WebSocket proxying enabled)

Kong plugins enabled:
  - rate-limiting (100 req/s per API key, 1000 req/s aggregate)
  - cors (allow: dcms.example.com)
  - jwt (validate JWT on protected routes)
  - prometheus (expose Kong metrics at :8001/metrics)
  - request-termination (maintenance mode toggle)
  - response-ratelimiting
  - bot-detection
  - ip-restriction (block non-allowlisted IPs on /admin paths)
```

---

## 5. Network Architecture

### 5.1 Network Segments

| Network Name          | Subnet              | Segment Purpose                                  | Accessible From          |
|-----------------------|---------------------|--------------------------------------------------|--------------------------|
| `dcms-mgmt`           | 10.10.0.0/24        | Swarm management, Raft, node heartbeats          | Swarm nodes only         |
| `dcms-overlay`        | 10.20.0.0/16        | Container-to-container traffic (overlay)          | DCMS services in Swarm   |
| `dcms-data`           | 10.30.0.0/24        | App → DB, App → Redis, App → Vault               | App services + DB nodes  |
| `dcms-monitoring`     | 10.40.0.0/24        | Prometheus scrape, Grafana, Loki ingestion        | Observability stack only |
| `dcms-external`       | Public / DMZ        | HAProxy → Kong → users                           | Internet / corporate VPN |
| `dcms-nfs`            | 10.50.0.0/24        | NFS mounts for log and backup storage            | Swarm nodes + NFS server |

### 5.2 Overlay Network Design (Docker Swarm)

```yaml
# Defined in stack files:
networks:
  dcms-overlay:
    driver: overlay
    attachable: false
    driver_opts:
      encrypted: "true"          # VXLAN encryption (AES-128-GCM)
    ipam:
      config:
        - subnet: 10.20.0.0/16

  dcms-monitoring:
    driver: overlay
    attachable: false
    driver_opts:
      encrypted: "true"
    ipam:
      config:
        - subnet: 10.40.0.0/24
```

Encryption is enabled on all overlay networks so inter-container traffic on the VXLAN is encrypted at the network layer.

### 5.3 Service Network Attachment

| Service              | Networks Attached                          |
|----------------------|--------------------------------------------|
| api-server           | dcms-overlay, dcms-data                    |
| auth-service         | dcms-overlay, dcms-data                    |
| web-ui               | dcms-overlay                               |
| agent                | dcms-overlay, dcms-monitoring              |
| Kong Gateway         | dcms-overlay, dcms-external (via port publish) |
| PostgreSQL           | dcms-data                                  |
| Redis                | dcms-data                                  |
| Prometheus           | dcms-monitoring, dcms-overlay              |
| Grafana              | dcms-monitoring                            |
| Loki                 | dcms-monitoring                            |
| cAdvisor             | dcms-monitoring                            |
| Vault                | dcms-data                                  |
| HAProxy              | dcms-external                              |

### 5.4 DNS Resolution

Docker Swarm provides built-in DNS for service discovery within overlay networks. Service DNS names:
- Within Swarm: `<service-name>.<stack-name>.dcms-overlay` resolves to VIP (virtual IP)
- Load balancing: Swarm DNS VIP distributes across healthy replicas
- External: Kong Gateway DNS: `api.dcms.example.com` → HAProxy → Kong

### 5.5 mTLS (Agent to API Server)

DCMS Agent communicates with the API Server over mutual TLS using DCMS's internal CA:
- Internal CA: HashiCorp Vault PKI secrets engine (`dcms-internal-ca`)
- API Server presents: `cert CN=api-server.dcms.internal`, issued by DCMS CA
- Agent presents: `cert CN=agent-<host-id>.dcms.internal`, issued by DCMS CA at agent registration
- Certificate TTL: 30 days; auto-renewed by Vault Agent sidecar 7 days before expiry
- Cipher suites: TLS 1.3 only (TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384)

---

## 6. Storage Design

### 6.1 Named Docker Volumes

| Volume Name                   | Service            | Mount Path             | Type            | Notes                              |
|-------------------------------|--------------------|------------------------|-----------------|------------------------------------|
| `dcms-pg-data`                | PostgreSQL         | `/var/lib/postgresql/data` | Local SSD   | Primary; bind to dedicated disk    |
| `dcms-pg-wal`                 | PostgreSQL         | `/var/lib/postgresql/wal`  | Local SSD   | WAL archiving                      |
| `dcms-redis-data`             | Redis primary      | `/data`                | Local SSD       | RDB snapshots + AOF                |
| `dcms-vault-data`             | Vault              | `/vault/data`          | Local SSD       | Vault raft storage                 |
| `dcms-prometheus-data`        | Prometheus         | `/prometheus`          | Local SSD       | 30-day TSDB retention; ~50 GB      |
| `dcms-grafana-data`           | Grafana            | `/var/lib/grafana`     | Local SSD       | Dashboards + plugins               |
| `dcms-jaeger-data`            | Jaeger             | `/badger`              | Local SSD       | Trace storage; 7-day retention     |

### 6.2 NFS Mounts (Shared Log Storage)

| NFS Export Path                     | Consumer         | Mount Point on Node   | Purpose                         |
|-------------------------------------|------------------|-----------------------|---------------------------------|
| `prod-nfs-01:/loki/chunks`          | Loki             | `/loki/chunks`        | Log chunk storage               |
| `prod-nfs-01:/loki/index`           | Loki             | `/loki/index`         | Log index storage               |
| `prod-nfs-01:/backups/prod/pg-wal`  | PostgreSQL WAL   | Archive target        | Continuous WAL archiving        |
| `prod-nfs-01:/backups/prod/pg-dump` | Backup script    | Backup destination    | Daily pg_dump backups           |

NFS mount options: `rw,sync,hard,intr,rsize=131072,wsize=131072,timeo=14`

NFS server: exports defined in `/etc/exports` with `root_squash`, accessible only from Swarm node IPs.

### 6.3 Storage Capacity Estimates

| Storage Use                   | Staging Est.  | Production Est. | Growth Rate          |
|-------------------------------|---------------|-----------------|----------------------|
| PostgreSQL data               | 20 GB         | 200 GB          | ~5 GB/month          |
| PostgreSQL WAL archive        | 5 GB (7-day)  | 50 GB (30-day)  | Depends on write load|
| Redis AOF + RDB               | 2 GB          | 20 GB           | Stable (LRU policy)  |
| Prometheus TSDB (30 days)     | 10 GB         | 50 GB           | ~1.5 GB/month/service|
| Loki log chunks (30 days)     | 30 GB         | 200 GB          | ~6 GB/month          |
| Jaeger traces (7 days)        | 5 GB          | 10 GB           | Stable (sampling)    |
| Container image layers (local)| 20 GB         | 30 GB           | Pruned nightly       |

---

## 7. Load Balancer

### 7.1 HAProxy Configuration

HAProxy runs as an active/standby pair in production (prod-haproxy-01 primary, prod-haproxy-02 standby), managed by Keepalived with a shared Virtual IP (VIP).

```
HAProxy frontend: https_frontend
  bind *:443 ssl crt /etc/ssl/dcms/full-chain.pem
  mode http
  option httplog
  option forwardfor
  http-request add-header X-Forwarded-Proto https
  http-request set-header X-Real-IP %[src]
  default_backend kong_backend

HAProxy backend: kong_backend
  balance roundrobin
  option httpchk GET /status HTTP/1.1\r\nHost:\ kong.internal
  http-check expect status 200
  timeout connect 5s
  timeout server 60s
  timeout client 60s
  server kong-1 10.20.10.1:8000 check inter 10s rise 2 fall 3 weight 100
  server kong-2 10.20.10.2:8000 check inter 10s rise 2 fall 3 weight 100

HAProxy frontend: http_redirect
  bind *:80
  mode http
  http-request redirect scheme https code 301

HAProxy stats:
  listen stats
    bind 127.0.0.1:8404
    stats enable
    stats uri /haproxy-stats
    stats auth haproxy:${HAPROXY_STATS_PASS}
    stats refresh 10s
```

### 7.2 Keepalived (VIP Failover)

```
# prod-haproxy-01 (MASTER):
vrrp_instance DCMS_VIP {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 200
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass <secret>
    }
    virtual_ipaddress {
        <VIP-ADDRESS>/24
    }
    track_script {
        check_haproxy
    }
}
```

VIP failover time: ~2 seconds (Keepalived advertisement interval: 1s). Kong upstream health-check re-routes within 30s of a Kong replica failure.

---

## 8. TLS and Certificate Management

### 8.1 External TLS (Let's Encrypt)

| Domain                         | Certificate             | Renewal Method                       |
|--------------------------------|-------------------------|--------------------------------------|
| `dcms.example.com`             | Let's Encrypt ACME v2   | Certbot auto-renew (cron, 30d before expiry) |
| `api.dcms.example.com`         | Same wildcard cert      | Certbot DNS-01 challenge             |
| `staging.dcms.internal`        | Let's Encrypt Staging CA | Certbot staging (non-trusted)        |

Let's Encrypt certificates:
- Stored on HAProxy nodes at `/etc/ssl/dcms/full-chain.pem`
- Certificate includes full chain (end-entity + intermediate + root)
- Certbot renewal hook: `systemctl reload haproxy`
- Alerting: Prometheus rule fires 45 days before cert expiry (see `monitoring_design.md`)

### 8.2 Internal TLS (DCMS CA via Vault PKI)

```
Vault PKI Path: pki/dcms-internal-ca

Root CA:
  CN: DCMS Internal Root CA
  TTL: 10 years
  Offline (exported to cold storage; Vault uses intermediate only for issuance)

Intermediate CA:
  CN: DCMS Internal Intermediate CA v1
  TTL: 3 years
  Used for: agent certs, service-to-service mTLS, PostgreSQL client certs

Issued Certificate Profiles:
  api-server-cert:
    CN: api-server.dcms.internal
    SANs: api-server.dcms.internal, api-server.dcms-prod.dcms-overlay
    TTL: 30 days
    Roles: server
  agent-cert:
    CN: agent-<host-id>.dcms.internal
    SAN: <host-id>.dcms.internal
    TTL: 30 days
    Roles: client
```

### 8.3 TLS for PostgreSQL and Redis

- PostgreSQL: server certificate issued by DCMS CA; client certificate required for `dcms_app` user (mutual TLS mode `verify-full`)
- Redis: TLS enabled on port 6380 (plain 6379 disabled in production); certificate issued by DCMS CA
- pgBouncer: `client_tls_sslmode=require`, `server_tls_sslmode=require`

---

## 9. Firewall Rules

### 9.1 Production Firewall Rules

| Source              | Destination         | Port(s)        | Protocol | Purpose                            | Action |
|---------------------|---------------------|----------------|----------|------------------------------------|--------|
| Internet            | HAProxy VIP         | 443, 80        | TCP      | HTTPS, HTTP redirect               | ALLOW  |
| Corporate VPN       | HAProxy VIP         | 443            | TCP      | Operator access                    | ALLOW  |
| Internet            | Any DCMS node       | All            | TCP/UDP  | Direct access (non-HAProxy)        | DENY   |
| HAProxy             | Kong (Swarm)        | 8000           | TCP      | HAProxy → Kong HTTP proxy          | ALLOW  |
| Kong                | api-server          | 8080           | TCP      | Kong upstream                      | ALLOW  |
| Kong                | auth-service        | 8082           | TCP      | Kong upstream                      | ALLOW  |
| Swarm nodes (any)   | Swarm Manager:2377  | 2377           | TCP      | Swarm cluster management           | ALLOW  |
| Swarm nodes (any)   | Swarm nodes         | 7946           | TCP/UDP  | Swarm node communication (gossip)  | ALLOW  |
| Swarm nodes (any)   | Swarm nodes         | 4789           | UDP      | VXLAN overlay traffic              | ALLOW  |
| App services        | prod-pgbouncer      | 5432, 5433     | TCP      | PostgreSQL connections             | ALLOW  |
| App services        | prod-redis-01/02/03 | 6380           | TCP      | Redis TLS connections              | ALLOW  |
| App services        | prod-redis-01/02/03 | 26379          | TCP      | Redis Sentinel                     | ALLOW  |
| App services        | prod-vault-01       | 8200           | TCP      | Vault API                          | ALLOW  |
| Prometheus          | All DCMS services   | 9090-9099      | TCP      | Metrics scrape (service-specific)  | ALLOW  |
| Prometheus          | cAdvisor            | 8080           | TCP      | Container metrics scrape           | ALLOW  |
| Promtail (any node) | Loki                | 3100           | TCP      | Log push                           | ALLOW  |
| Swarm nodes         | prod-nfs-01         | 2049           | TCP/UDP  | NFS mounts                         | ALLOW  |
| Swarm nodes         | prod-nfs-01         | 111            | TCP/UDP  | NFS portmapper                     | ALLOW  |
| CI runners          | Swarm manager API   | 2376           | TCP      | Docker TLS socket (deploy runner)  | ALLOW (CI IPs only) |
| Admin bastion       | All prod nodes      | 22             | TCP      | SSH management (admin bastion only)| ALLOW (bastion IP) |
| All prod nodes      | Internet (egress)   | 443            | TCP      | Image pulls, Certbot, Vault        | ALLOW  |
| All prod nodes      | Internet (egress)   | 80             | TCP      | ACME HTTP challenge                | ALLOW  |
| All others          | All prod nodes      | Any            | Any      | Default deny                       | DENY   |

### 9.2 Staging Firewall Rules

Same structure as production with these differences:
- CI runner IPs additionally allowed on port 2376 to staging Swarm manager
- Integration test runner allowed on port 443 to staging Kong
- Grafana and Prometheus accessible on port 3000/9090 from developer VPN

---

## 10. Disaster Recovery

### 10.1 RTO and RPO Targets (from NFR-DCMS-001)

| Target | Value    | Source NFR |
|--------|----------|------------|
| RTO    | ≤ 30 min | NFR-A-003  |
| RPO    | ≤ 5 min  | NFR-A-004  |

### 10.2 Backup Strategy

| Component     | Backup Method                     | Frequency         | Retention        | Storage Location              |
|---------------|-----------------------------------|-------------------|------------------|-------------------------------|
| PostgreSQL    | Continuous WAL archiving          | Continuous (~30s) | 5 minutes RPO    | prod-nfs-01:/backups/prod/pg-wal |
| PostgreSQL    | `pg_basebackup` full snapshot     | Hourly            | 7 days           | prod-nfs-01:/backups/prod/pg-base |
| PostgreSQL    | `pg_dump` logical backup          | Daily 03:00 UTC   | 30 days          | prod-nfs-01:/backups/prod/pg-dump |
| Redis         | RDB snapshot (AOF + RDB)          | Every 5 min (RDB) | Last 3 snapshots | /data volume (local disk)     |
| Redis         | Daily cold backup of /data volume | Daily 04:00 UTC   | 7 days           | prod-nfs-01:/backups/prod/redis |
| Vault         | Raft snapshot                     | Hourly            | 7 days           | prod-nfs-01:/backups/prod/vault |
| Swarm configs | Git repository (stack files, configs) | On change    | Git history      | GitHub (org/dcms-infra)       |
| Grafana       | Dashboard JSON export             | Daily             | 30 days          | Git (org/dcms-infra/dashboards)|

### 10.3 PostgreSQL Failover Procedure (v1 Manual)

**Trigger:** Primary (prod-pg-01) becomes unreachable; replica (prod-pg-02) is healthy.

**RTO target:** 15 minutes manual execution + 15 minutes app recovery = 30 minutes total.

```
Step 1 (0:00): Confirm prod-pg-01 is unreachable (3 consecutive health check failures)
  Alert fired in PagerDuty; on-call DBA engaged.

Step 2 (0:05): Check replica replication lag
  On prod-pg-02: SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();
  Confirm replica is within 5-minute RPO.

Step 3 (0:08): Promote replica to primary
  On prod-pg-02: pg_ctl promote -D /var/lib/postgresql/data
  Verify: SELECT pg_is_in_recovery(); -- must return false

Step 4 (0:10): Update pgBouncer connection targets
  On prod-pgbouncer: Edit /etc/pgbouncer/pgbouncer.ini
    [databases] dcms = host=prod-pg-02.internal port=5432 dbname=dcms pool_size=50
  Reload: kill -SIGHUP $(cat /var/run/pgbouncer/pgbouncer.pid)

Step 5 (0:12): Verify application connectivity
  curl -f https://dcms.example.com/health
  Check API error rate in Grafana (should return to normal within 2 minutes)

Step 6 (0:15): Update Prometheus targets
  Edit prometheus/targets/postgresql.yml to point to prod-pg-02

Step 7 (Post-recovery): Restore prod-pg-01 as new replica
  Rebuild prod-pg-01 from base backup, configure as streaming replica of prod-pg-02.
  Update pgBouncer dcms_ro pool to point to restored prod-pg-01.
```

### 10.4 Redis Sentinel Automatic Failover

Redis Sentinel handles automatic promotion without manual intervention:
- Sentinel monitors primary every 5 seconds
- After 5000ms of no response, subjectively marks down
- Quorum of 2/3 sentinels must agree for objective down state
- Failover completes in ~10-30 seconds
- Application uses Sentinel-aware Redis client; reconnects automatically

Monitoring: Prometheus alert `RedisFailoverInProgress` fires and resolves automatically.

### 10.5 Swarm Manager Node Loss

Docker Swarm tolerates loss of 1 manager node (3-node raft, quorum = 2):
- Containers on affected manager node are rescheduled to workers by Swarm scheduler within 30 seconds
- Manager-scheduled services (Prometheus, Grafana) are rescheduled to remaining managers
- Procedure: Remove failed manager from swarm, provision replacement node, join as manager

### 10.6 Full Site Disaster Recovery

**Scenario:** Complete data centre loss.

**Recovery steps:**
1. Provision new nodes on alternative provider (bare-metal or cloud)
2. Install Docker Engine, join Swarm
3. Restore PostgreSQL from most recent pg_basebackup + WAL replay (RPO ≤ 5 min)
4. Restore Redis from most recent RDB snapshot (RPO ≤ 5 min)
5. Restore Vault from raft snapshot; unseal
6. Deploy stack from git (org/dcms-infra) using last known-good image SHAs
7. Verify health checks pass; update DNS to new HAProxy VIP

**Runbook reference:** `docs/runbooks/dr-full-site-recovery.md` (in org/dcms-infra repository)

---

## 11. Capacity Planning

### 11.1 Resource Estimates Per Service

| Service               | CPU (request/limit)  | Memory (request/limit) | Replicas (prod) | Total CPU | Total RAM |
|-----------------------|----------------------|------------------------|-----------------|-----------|-----------|
| api-server            | 250m / 1000m         | 256Mi / 512Mi          | 3               | 3000m     | 1536Mi    |
| web-ui                | 100m / 500m          | 128Mi / 256Mi          | 2               | 1000m     | 512Mi     |
| agent (per node)      | 50m / 200m           | 64Mi / 128Mi           | 5 (global)      | 1000m     | 640Mi     |
| auth-service          | 200m / 800m          | 128Mi / 256Mi          | 2               | 1600m     | 512Mi     |
| notification-svc      | 100m / 400m          | 128Mi / 256Mi          | 2               | 800m      | 512Mi     |
| image-scanner         | 500m / 2000m         | 512Mi / 1024Mi         | 2               | 4000m     | 2048Mi    |
| log-aggregator        | 200m / 800m          | 256Mi / 512Mi          | 2               | 1600m     | 1024Mi    |
| metrics-collector     | 100m / 400m          | 128Mi / 256Mi          | 1               | 400m      | 256Mi     |
| cluster-controller    | 200m / 800m          | 256Mi / 512Mi          | 1               | 800m      | 512Mi     |
| registry-proxy        | 100m / 500m          | 256Mi / 512Mi          | 2               | 1000m     | 1024Mi    |
| audit-service         | 100m / 400m          | 128Mi / 256Mi          | 2               | 800m      | 512Mi     |
| Kong Gateway          | 500m / 2000m         | 512Mi / 1024Mi         | 2               | 4000m     | 2048Mi    |
| **Total (services)**  |                      |                        |                 | **20000m (20 cores)** | **11.1 GB** |

Worker node capacity: 2x prod-wrk with 8 vCPU / 16 GB each = 16 vCPU / 32 GB total available.
Headroom: ~6 vCPU / 21 GB available for spikes and additional workloads.

### 11.2 Scale-Out Triggers

Add a new Swarm worker node when ANY of the following thresholds are sustained for 10+ minutes:

| Metric                           | Threshold          | Alert Name                   |
|----------------------------------|--------------------|------------------------------|
| Aggregate worker CPU usage       | > 75%              | `SwarmWorkerCPUHigh`         |
| Aggregate worker memory usage    | > 80%              | `SwarmWorkerMemoryHigh`      |
| Services with desired ≠ running  | > 0 for 5 minutes  | `SwarmServiceReplicaDeficit` |
| API p95 latency (sustained)      | > 400ms for 5 min  | `APILatencyDegraded`         |

New worker provisioning time: ~15 minutes (IaC via Ansible playbook `playbooks/add-swarm-worker.yml`).

### 11.3 v2 Kubernetes Migration Planning

When Swarm total node count exceeds 15 or when managed containers exceed 5000:
- Evaluate Kubernetes (EKS/GKE/bare-metal k3s) migration
- Helm chart is v2-ready (see `ci_cd_architecture.md`, Section 3)
- Agent supports both Swarm and Kubernetes API via adapter pattern

---

## 12. Health Checks

### 12.1 Docker HEALTHCHECK per Service

All services expose a `/health` HTTP endpoint returning HTTP 200 with JSON body:
```json
{
  "status": "ok",
  "version": "1.4.2",
  "checks": {
    "db": "ok",
    "redis": "ok",
    "vault": "ok"
  }
}
```

Docker HEALTHCHECK configuration (standard, applies to all services unless noted):
```dockerfile
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1
```

| Service               | Port | Endpoint         | Health Dependencies Checked         |
|-----------------------|------|------------------|-------------------------------------|
| api-server            | 8080 | GET /health      | PostgreSQL, Redis, Vault            |
| auth-service          | 8082 | GET /health      | PostgreSQL, Redis, OIDC endpoint    |
| notification-svc      | 8083 | GET /health      | PostgreSQL, SMTP connectivity       |
| image-scanner         | 8084 | GET /health      | Trivy DB (up-to-date check)         |
| log-aggregator        | 8085 | GET /health      | Loki write path                     |
| metrics-collector     | 8086 | GET /health      | Prometheus remote write endpoint    |
| cluster-controller    | 8087 | GET /health      | Docker/Swarm API connectivity       |
| registry-proxy        | 8088 | GET /health      | Upstream registry connectivity      |
| audit-service         | 8089 | GET /health      | PostgreSQL                          |
| Kong Gateway          | 8001 | GET /status      | Kong data plane status              |

### 12.2 Monitoring Thresholds (Prometheus Alert Triggers)

| Health Indicator                 | Warning Threshold      | Critical Threshold        | Alert Name                    |
|----------------------------------|------------------------|---------------------------|-------------------------------|
| API server HTTP error rate       | > 1% for 1m            | > 5% for 2m               | `APIErrorRateHigh`            |
| API p95 latency                  | > 300ms for 5m         | > 800ms for 5m            | `APILatencyHigh`              |
| Service health check failure     | 1 replica unhealthy    | > 50% replicas unhealthy  | `ServiceHealthCheckFailing`   |
| Container restart count          | > 2 in 10m             | > 5 in 10m                | `ContainerRestartingFrequently`|
| Agent heartbeat miss             | 1 miss (45s gap)       | > 3 misses (2 min gap)    | `AgentDisconnected`           |
| PostgreSQL connections           | > 70% pool capacity    | > 80% for 3m              | `PostgreSQLConnectionsHigh`   |
| Disk space remaining             | < 20%                  | < 10%                     | `DiskSpaceLow`                |
| Host CPU usage                   | > 75% for 5m           | > 85% for 5m              | `HostCPUHigh`                 |
| Host memory usage                | > 80% for 5m           | > 90% for 5m              | `HostMemoryHigh`              |
| TLS certificate expiry           | < 45 days              | < 15 days                 | `TLSCertExpiryWarning`        |

Full alerting rules with PromQL are defined in `monitoring_design.md`.

---

## Appendix A: IaC Repository Structure

```
org/dcms-infra (GitHub repository)
├── ansible/
│   ├── inventory/
│   │   ├── staging.yml
│   │   └── production.yml
│   ├── playbooks/
│   │   ├── bootstrap-node.yml        # OS hardening, Docker install, NFS client
│   │   ├── init-swarm.yml            # Swarm init and join
│   │   ├── add-swarm-worker.yml      # Scale-out playbook
│   │   ├── setup-haproxy.yml         # HAProxy + Keepalived config
│   │   ├── setup-postgresql.yml      # PostgreSQL + pgBouncer config
│   │   └── setup-redis-sentinel.yml  # Redis + Sentinel config
│   └── roles/
├── stacks/
│   ├── stack-staging.yml             # Swarm stack file for staging
│   ├── stack-prod.yml                # Swarm stack file for production
│   └── docker-compose.yml            # Dev compose file
├── scripts/
│   ├── wait-stack-healthy.sh
│   ├── run-migration.sh
│   ├── trigger-backup.sh
│   └── verify-backup.sh
├── dashboards/                       # Grafana dashboard JSON exports
├── prometheus/
│   ├── prometheus.yml
│   ├── rules/
│   └── targets/
└── docs/
    └── runbooks/
```

## Appendix B: Node OS Hardening Baseline

Applied by `ansible/playbooks/bootstrap-node.yml` on all nodes:
- Ubuntu 22.04 LTS; automatic security updates enabled (unattended-upgrades)
- `ufw` firewall enabled; only required ports open (see Section 9)
- SSH: key-based only; root login disabled; `MaxAuthTries 3`
- Docker socket: group `docker` limited to `dcms-agent` system user
- sysctl tuning: `net.core.somaxconn=65535`, `vm.overcommit_memory=1` (Redis requirement)
- Log rotation: `/var/log/syslog` and `/var/log/docker.log` rotated daily, retained 30 days
- auditd: enabled with rules for `/etc/passwd`, Docker socket access, and privileged exec events
- CIS Docker Benchmark Level 1 applied via `dev-sec.io/ansible-collection-hardening`
