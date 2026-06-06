# Risk Assessment — DCMS Phase 2 Architecture

**Document Version:** 1.0  
**Date:** 2026-06-05  
**Status:** Approved  
**Author:** senior_architect_agent  

---

## 1. Risk Scoring Methodology

**Likelihood (L):** 1 = Rare (< 5% chance per year), 2 = Unlikely (5–15%), 3 = Possible (15–40%), 4 = Likely (40–70%), 5 = Almost certain (> 70%)

**Impact (I):** 1 = Negligible (no user impact), 2 = Minor (degraded experience, < 30 min), 3 = Moderate (partial outage, < 4 h), 4 = Major (full service outage, < 24 h), 5 = Critical (data loss, security breach, extended outage)

**Score = L × I**  
**Risk Level:** Low = 1–4, Medium = 5–9, High = 10–15, Critical = 16–25

---

## 2. Risk Register

| Risk ID | Description | Category | Likelihood (1-5) | Impact (1-5) | Score | Level | Mitigation Strategy | Owner | Residual Risk |
|---|---|---|---|---|---|---|---|---|---|
| RISK-001 | **Docker daemon SPOF.** The Docker daemon (dockerd) is a single process per host. If it crashes or hangs, all containers on that host become unmanageable and new deployments fail. DCMS agent communicates exclusively via the Docker socket. | Availability | 3 | 4 | 12 | High | (1) Enable Docker daemon auto-restart via systemd `Restart=always`. (2) Agent monitors socket connectivity and publishes heartbeat every 5 s; container-service marks host UNREACHABLE after 3 missed beats. (3) Cluster-service reschedules affected Swarm services to healthy nodes when Swarm detects manager unreachability. (4) cAdvisor detects daemon absence and fires `DaemonUnreachable` alert within 15 s. (5) Runbook: `runbooks/docker-daemon-recovery.md` covers daemon restart, orphaned container cleanup, and Swarm re-registration. | Platform Ops | Low (Score 3): Automation limits blast radius to one host; recovery is sub-60 s in majority of cases. |
| RISK-002 | **Agent connectivity loss.** Network partition or firewall change between container-service and an agent causes gRPC calls to time out. In-flight operations cannot be acknowledged; container state becomes uncertain. | Availability / Consistency | 3 | 3 | 9 | Medium | (1) gRPC deadline set to 30 s for lifecycle RPCs; container-service does not hang indefinitely. (2) Agent marks itself DISCONNECTED in Redis after 3 missed heartbeats; container-service skips scheduling to disconnected hosts. (3) Agent implements a local operation journal: queues commands received before partition and replays after reconnect. (4) container-service exposes a `GET /containers/{id}/state` reconciliation endpoint that re-queries the agent on demand. (5) Network policy allows container-service → agent on port 9090 only; firewall changes are gated by IaC PR review. | Backend Team / NetOps | Low (Score 4): Journal + reconciliation prevents permanent state divergence. |
| RISK-003 | **Database connection exhaustion.** Each of the 11 backend service types runs 2+ replicas; each replica holds up to 25 pgBouncer connections. At peak scale, connection count could exceed PostgreSQL's `max_connections` (default 100), causing new connection attempts to fail with `FATAL: sorry, too many clients`. | Availability / Performance | 3 | 4 | 12 | High | (1) pgBouncer in transaction-mode pooling multiplexes up to 300 client connections onto 25 PostgreSQL server connections (configured per service). (2) `max_connections` set to 200 in PostgreSQL; pgBouncer `max_client_conn = 1000`. (3) GORM connection pool: `SetMaxOpenConns(25)`, `SetMaxIdleConns(10)`, `SetConnMaxLifetime(5 * time.Minute)`. (4) Prometheus alert `PGConnectionPoolNearLimit` fires at 80% pgBouncer saturation. (5) Horizontally scaling a service instance adds 25 connections to pgBouncer, not to PostgreSQL directly — Ops must track service replica counts against pgBouncer server pool budget. (6) Quarterly capacity review ensures connection budget is not silently exhausted by new service replicas. | Backend Team / DBA | Low (Score 4): pgBouncer multiplexing eliminates direct exhaustion risk; monitoring catches pool pressure before failure. |
| RISK-004 | **CVE scanner false positives.** Trivy reports a CVE on a package that is not actually vulnerable in the specific build configuration (e.g., CVE affects a code path not compiled in, or a fix has been backported in a distro patch that Trivy's DB does not reflect). This may block legitimate image deployments. | Operations / Quality | 3 | 2 | 6 | Medium | (1) Trivy's `--ignore-unfixed` flag suppresses CVEs with no available fix, reducing noise. (2) A `.trivyignore` file per image repository allows scoped suppression of confirmed false positives with mandatory justification comments and expiry dates. (3) All suppressed CVEs are logged to the audit trail in PostgreSQL; reviewed monthly by the security team. (4) Severity threshold for deploy-blocking: CRITICAL only. HIGH CVEs raise a warning but do not block. (5) Trivy DB freshness is monitored; stale DB (> 6 h) triggers an alert before it causes false negatives. | Security Team | Low (Score 3): Tiered thresholds and suppression workflow prevent scan noise from blocking operations. |
| RISK-005 | **JWT token leakage or replay attack.** If a JWT is intercepted (e.g., via TLS misconfiguration, XSS, or insecure storage in localStorage), an attacker can replay it until expiry to impersonate the user. | Security | 2 | 5 | 10 | High | (1) JWT `exp` set to 15 minutes; refresh tokens (30 days) stored in `HttpOnly; Secure; SameSite=Strict` cookies, not localStorage. (2) Access tokens stored in JavaScript memory only (not localStorage/sessionStorage). (3) HTTPS enforced with HSTS (`max-age=31536000; includeSubDomains`). (4) `jti` (JWT ID) stored in Redis on issue; revocation via `jti` blocklist with TTL matching `exp`. (5) auth-service rate-limits token issuance: 10 tokens/minute per user. (6) All TLS endpoints use TLS 1.3 minimum; TLS 1.2 cipher suites restricted to ECDHE. (7) RBAC actions that are irreversible (delete cluster, remove all containers) require re-authentication (step-up auth). | Auth Team / Security Team | Low (Score 4): Short TTL + HttpOnly cookie + jti revocation limits replay window to < 15 minutes. |
| RISK-006 | **Container escape vulnerabilities.** A crafted workload running inside a container exploits a kernel or container runtime vulnerability (e.g., runc CVE, namespace breakout) to gain access to the host filesystem or Docker daemon socket. | Security | 2 | 5 | 10 | High | (1) Docker daemon configured with seccomp default profile (`--security-opt seccomp:default`). (2) AppArmor profile applied to all DCMS-managed containers. (3) Containers run as non-root by default; `no-new-privileges` flag set. (4) Read-only root filesystem for containers where supported. (5) Docker socket is not mounted into user containers. (6) Host kernel patched on a 30-day cycle; Trivy scans host OS packages (node-level scan in CI). (7) User namespace remapping enabled on agent hosts. (8) Container escape indicators monitored via Falco (v2 security hardening milestone). | Security Team / Platform Ops | Medium (Score 6): Defense-in-depth reduces probability; zero-day exploits remain a residual risk. |
| RISK-007 | **Log volume explosion.** A misbehaving or malicious container writes logs at extreme rate (e.g., tight loop printing to stdout), saturating the log-service ingestion pipeline, overwhelming Loki, and causing disk exhaustion on the host. | Operations | 4 | 3 | 12 | High | (1) Docker log driver configured with `max-size=100m` and `max-file=3` for all DCMS-managed containers; hard cap at 300 MB per container. (2) log-service implements per-container rate limiting: max 10,000 log lines/second per container; excess lines are sampled (1 in 100) and a `LOG_RATE_LIMITED` event is published to `dcms.alerts`. (3) Loki configured with per-tenant ingestion rate limit (100 MB/s per org). (4) Disk usage on log hosts monitored; alert at 70% full. (5) Log retention: 7 days in Loki hot storage, 30 days in object storage (S3/MinIO), auto-delete after 90 days. | Platform Ops / Backend Team | Low (Score 4): Docker log rotation + rate limiting caps worst-case volume. |
| RISK-008 | **Swarm network partition.** A network split causes Swarm manager nodes to lose quorum (requires majority of managers to be reachable). Swarm stops accepting service mutations; container scheduling halts. Running containers continue, but no new deployments or restarts occur. | Availability | 2 | 4 | 8 | Medium | (1) Deploy 3 Swarm manager nodes (quorum = 2); place each on a separate rack/AZ to avoid single-failure partition. (2) Worker nodes continue running existing containers during a partition. (3) cluster-service detects Swarm quorum loss via manager health API within 30 s; publishes alert; DCMS UI displays "Cluster in read-only mode" banner. (4) Runbook `runbooks/swarm-quorum-recovery.md` covers manager promotion and quorum restoration. (5) Swarm manager state is persisted to Docker's Raft log on each manager's volume; no data loss on manager restart. | Platform Ops | Low (Score 4): 3-manager quorum tolerates 1-manager failure; existing workloads are unaffected. |
| RISK-009 | **Base image supply chain attack.** A compromised or malicious base image (e.g., a Docker Hub official image or a private registry image) introduces malware or backdoors into DCMS service images or customer-managed container images scanned by DCMS. | Security | 2 | 5 | 10 | High | (1) All DCMS service Dockerfiles use pinned digest references (`nginx@sha256:...`), not mutable tags. (2) Trivy scans all base images on every CI build; CRITICAL CVEs block the build. (3) SBOM generated for every DCMS service image and stored in the artefact registry. (4) Docker Content Trust (DCT) / Notary v2 enabled; images without a valid signature are rejected by the DCMS registry. (5) Base image updates are automated via Renovate Bot with mandatory PR review. (6) Docker Hub images are mirrored to a private registry after verification; production hosts only pull from the private registry. | Security Team / DevOps | Low (Score 4): Digest pinning + signature verification + Trivy scanning provides layered supply chain protection. |
| RISK-010 | **API breaking changes causing client failures.** A backend service modifies a REST response schema or gRPC proto in a backward-incompatible way without coordinating with consumers, causing web-ui failures, CLI tool breakage, or third-party integration failures. | Delivery / Quality | 3 | 3 | 9 | Medium | (1) OpenAPI 3.1 spec is the source of truth for all REST contracts; auto-generated from Go handler annotations via `swaggo/swag`. (2) `oasdiff` tool runs in CI and fails the build if a breaking change is detected against the previous spec version. (3) Proto changes validated by `buf breaking` in CI against the committed proto lock file. (4) Contract change process (§4 of cross_domain_contracts.md) mandates 2-sprint freeze for breaking changes. (5) API versioning via URL path (`/api/v2/`) allows parallel running of old and new versions during migration. | Backend Team / API Team | Low (Score 3): Automated spec diffing + versioning policy prevents uncoordinated breaking changes. |
| RISK-011 | **Redis cache stampede.** When a popular Redis cache key expires (e.g., a cluster-wide container status summary) or Redis restarts, a thundering herd of service instances simultaneously query PostgreSQL to rebuild the cache, overwhelming the database. | Performance | 3 | 3 | 9 | Medium | (1) Cache keys use probabilistic early expiration (PER algorithm via `go-cache-stampede` library): each cache read has a small probability of proactively refreshing before expiry, spreading the refresh load over time. (2) For high-fanout keys, a single "lock and refresh" pattern using Redlock ensures only one instance rebuilds the cache; others wait with a 500 ms timeout then retry. (3) GORM query results have a maximum execution time of 2 s; slow cache rebuild queries are cancelled and the stale value is served for an additional 5 s. (4) Critical CQRS projections (container status per org) are rebuilt incrementally by monitor-service on every container event, not on cache expiry — the cache is always warm. | Backend Team | Low (Score 3): PER + Redlock eliminates mass simultaneous rebuild; incremental projection keeps hot paths warm. |
| RISK-012 | **PostgreSQL migration failure in production.** A `golang-migrate UP` migration fails partway through (e.g., due to a constraint violation on existing data, lock timeout on a large table, or disk space exhaustion), leaving the database schema in an inconsistent intermediate state. The service fails to start; production is down. | Delivery / Availability | 2 | 5 | 10 | High | (1) Each migration is designed to be idempotent where possible; `IF NOT EXISTS` / `IF EXISTS` guards used. (2) All migrations are tested against a production-sized data clone in a staging environment before production deployment. (3) Long-running migrations (expected > 30 s) use `ALTER TABLE ... ADD COLUMN ... DEFAULT NULL` (non-blocking) followed by a background data fill job; never blocking table rewrites on live tables. (4) Migration advisory lock timeout set to 10 s; if another migration is running, the service startup aborts with a clear error rather than hanging. (5) Automatic `DOWN` migration is never auto-triggered on failure; a DBA manually reviews and applies the rollback. (6) Pre-migration database snapshot (pg_dump) taken automatically by the CI deploy job before running `migrate UP`. | DBA / Backend Team | Low (Score 4): Non-blocking patterns + staging validation + pre-migration snapshot limit blast radius. |
| RISK-013 | **Agent privilege escalation via Docker socket.** The agent binary requires access to the Docker Unix socket (`/var/run/docker.sock`) which grants root-equivalent privileges on the host. A vulnerability in the agent binary or a path-traversal attack could be exploited to gain full host access. | Security | 2 | 5 | 10 | High | (1) Agent binary runs as a dedicated non-root OS user (`dcms-agent`) with no shell and no sudo rights; systemd `DynamicUser=yes`. (2) Docker socket access granted via OS group membership (`docker` group on the dcms-agent user) — the minimum required privilege. (3) Agent binary is statically compiled with no CGO dependencies; attack surface is minimized. (4) mTLS client certificate required for all gRPC calls to the agent; unauthorized callers cannot trigger agent operations. (5) Agent source code undergoes security review (SAST via `govulncheck` + `staticcheck` in CI) on every PR. (6) Agent network access is restricted by host firewall: only container-service CIDR can reach port 9090. (7) Agent binary integrity is verified at startup via embedded SHA-256 hash against a signed manifest from Vault. | Security Team / Backend Team | Medium (Score 6): Docker socket inherently grants elevated access; defense-in-depth reduces exploitation probability but cannot eliminate the risk of a zero-day agent vulnerability. |
| RISK-014 | **Notification storm on mass container failure.** If 500+ containers on a cluster fail simultaneously (e.g., storage failure, kernel panic on multiple hosts), notification-service generates 500+ alert events in seconds, overwhelming Slack webhook rate limits and SMTP relay capacity, and potentially causing secondary failures in the notification pipeline. | Operations | 2 | 3 | 6 | Medium | (1) notification-service implements alert deduplication: identical alert type + org_id within a 60-second window is collapsed into a single notification with a count. (2) Slack webhook rate limiting: max 1 notification per org per 10 seconds per channel; excess notifications are queued with a max queue depth of 100. (3) notification-service uses exponential backoff for Slack API calls; Slack 429 responses are handled gracefully. (4) "Summary mode" automatically activates when > 10 distinct alerts fire for the same org within 30 seconds; a single summary message replaces individual notifications. (5) Redis pub/sub consumer in notification-service processes events serially per org, preventing goroutine explosion. | Platform Ops / Backend Team | Low (Score 3): Deduplication + summary mode caps notification volume in mass-failure scenarios. |
| RISK-015 | **SSE connection exhaustion.** Each browser tab or API client subscribed to SSE holds a persistent HTTP connection to an api-gateway replica. Under high user load (e.g., 10,000 concurrent dashboard users), the api-gateway runs out of available goroutines, file descriptors, or memory, causing new SSE connections to be rejected and existing ones to degrade. | Performance / Availability | 2 | 4 | 8 | Medium | (1) Each Go goroutine serving an SSE connection consumes ~30 KB RAM + 1 file descriptor. At 10,000 connections per replica: ~300 MB RAM + 10,000 FDs. api-gateway instances are sized at 2 GB RAM minimum; `ulimit -n 65536` set in systemd unit. (2) api-gateway enforces per-org SSE connection limit: max 500 concurrent SSE connections per org. Excess connections receive HTTP 429. (3) SSE heartbeat sent every 30 s; dead connections (no ACK/read) are reaped by the server after 60 s. (4) Kong rate limiter caps new SSE connection establishment: max 100 new SSE connections/minute per IP. (5) Horizontal scaling of api-gateway (additional replicas) is triggered when active SSE connection count exceeds 7,000 per replica (Prometheus alert `SSEConnectionsHigh`). (6) SSE reconnection jitter: EventSource `retry` directive set to 3000–7000 ms random to prevent reconnect storms after an api-gateway restart. | Backend Team / Platform Ops | Low (Score 4): Connection caps + auto-scaling + heartbeat reaping prevent saturation under normal and mildly abnormal load. |

---

## 3. Risk Summary Matrix

```
         │   Impact                                                        
         │   1-Negligible  2-Minor    3-Moderate   4-Major    5-Critical   
─────────┼────────────────────────────────────────────────────────────────
L  5     │     5 (Low)    10 (High)  15 (High)    20 (Crit)  25 (Crit)   
i  4     │     4 (Low)     8 (Med)   12 (High)    16 (Crit)  20 (Crit)   
k  3     │     3 (Low)     6 (Med)    9 (Med)     12 (High)  15 (High)   
e  2     │     2 (Low)     4 (Low)    6 (Med)      8 (Med)   10 (High)   
l  1     │     1 (Low)     2 (Low)    3 (Low)      4 (Low)    5 (Low)    
i        │
h        
o        
o        
d        
```

**Risk placement in matrix:**

| Risk ID | Score | Cell (L×I) | Level |
|---|---|---|---|
| RISK-001 | 12 | L3 × I4 | High |
| RISK-002 | 9 | L3 × I3 | Medium |
| RISK-003 | 12 | L3 × I4 | High |
| RISK-004 | 6 | L3 × I2 | Medium |
| RISK-005 | 10 | L2 × I5 | High |
| RISK-006 | 10 | L2 × I5 | High |
| RISK-007 | 12 | L4 × I3 | High |
| RISK-008 | 8 | L2 × I4 | Medium |
| RISK-009 | 10 | L2 × I5 | High |
| RISK-010 | 9 | L3 × I3 | Medium |
| RISK-011 | 9 | L3 × I3 | Medium |
| RISK-012 | 10 | L2 × I5 | High |
| RISK-013 | 10 | L2 × I5 | High |
| RISK-014 | 6 | L2 × I3 | Medium |
| RISK-015 | 8 | L2 × I4 | Medium |

**Risk distribution summary:**

| Level | Count | Risk IDs |
|---|---|---|
| Critical (16–25) | 0 | — |
| High (10–15) | 8 | RISK-001, RISK-003, RISK-005, RISK-006, RISK-007, RISK-009, RISK-012, RISK-013 |
| Medium (5–9) | 7 | RISK-002, RISK-004, RISK-008, RISK-010, RISK-011, RISK-014, RISK-015 |
| Low (1–4) | 0 | — |

---

## 4. Mitigation Tracking

All High-level risks must have a corresponding GitHub Issue tagged `risk-mitigation` and assigned to the named owner before Phase 3 development begins. Mitigation completion is a Phase 4 gate criterion. Medium risks are reviewed at each sprint retrospective. Risk register is reviewed in full at each phase gate by the tech lead and security team.

| Risk ID | GitHub Issue (to be created) | Target Completion Phase | Review Date |
|---|---|---|---|
| RISK-001 | risk/docker-daemon-spof | Phase 3 (Infrastructure) | 2026-07-01 |
| RISK-003 | risk/db-connection-exhaustion | Phase 3 (Infrastructure) | 2026-07-01 |
| RISK-005 | risk/jwt-token-leakage | Phase 3 (Auth Service) | 2026-07-01 |
| RISK-006 | risk/container-escape | Phase 3 (Security Hardening) | 2026-07-01 |
| RISK-007 | risk/log-volume-explosion | Phase 3 (Log Service) | 2026-07-15 |
| RISK-009 | risk/supply-chain-attack | Phase 3 (DevOps/CI) | 2026-07-01 |
| RISK-012 | risk/migration-failure | Phase 3 (Database) | 2026-07-15 |
| RISK-013 | risk/agent-privilege-escalation | Phase 3 (Agent / Security) | 2026-07-01 |
