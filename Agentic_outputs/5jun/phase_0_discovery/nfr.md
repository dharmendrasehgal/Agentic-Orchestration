# Non-Functional Requirements (NFR)
## Generic Docker Container Management System

| Field         | Value                                     |
|---------------|-------------------------------------------|
| Document ID   | NFR-DCMS-001                              |
| Version       | 1.0.0                                     |
| Status        | Approved                                  |
| Date          | 2026-06-05                                |
| Author        | Requirement Agent                         |
| Parent BRD    | BRD-DCMS-001                              |
| Parent FRD    | FRD-DCMS-001                              |

---

## Table of Contents

1. [Performance](#1-performance)
2. [Scalability](#2-scalability)
3. [Availability](#3-availability)
4. [Security](#4-security)
5. [Reliability](#5-reliability)
6. [Observability](#6-observability)
7. [Maintainability](#7-maintainability)
8. [Accessibility](#8-accessibility)
9. [Compliance](#9-compliance)
10. [Portability](#10-portability)

---

## 1. Performance

### 1.1 API Response Latency

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Measurement Method                              |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-P-001 | REST API read endpoints (GET list, GET detail) response time under normal load               | p50 ≤ 80ms, p95 ≤ 300ms, p99 ≤ 800ms | APM trace percentile over any 5-minute window |
| NFR-P-002 | REST API write endpoints (POST/PUT/DELETE for container operations) response time            | p50 ≤ 150ms, p95 ≤ 500ms, p99 ≤ 1500ms | APM trace percentile over any 5-minute window |
| NFR-P-003 | Container lifecycle command execution time (start, stop, restart) — API call to Docker Engine acknowledgment | p50 ≤ 500ms, p95 ≤ 2000ms | End-to-end trace timing |
| NFR-P-004 | Audit log write latency — time from API call receipt to audit entry persisted in DB          | ≤ 1000ms (p99)                 | DB insert timestamp vs. request timestamp       |

### 1.2 Dashboard UI Performance

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Measurement Method                              |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-P-005 | Dashboard initial page load (Largest Contentful Paint) on a standard broadband connection   | LCP ≤ 2.5 seconds              | Lighthouse CI test; WebPageTest                 |
| NFR-P-006 | Dashboard First Input Delay (FID) / Interaction to Next Paint (INP)                         | INP ≤ 200ms                    | Core Web Vitals measurement in CI               |
| NFR-P-007 | Cumulative Layout Shift (CLS) on all dashboard pages                                         | CLS ≤ 0.1                      | Lighthouse CI                                   |
| NFR-P-008 | Real-time metrics charts data refresh cycle (container/host metrics update)                  | ≤ 10 seconds per refresh       | End-to-end latency from agent report to chart update |
| NFR-P-009 | Log search query response time in the UI                                                     | ≤ 5 seconds for queries spanning ≤ 30 days of data | Query timing instrumentation |

### 1.3 Concurrent Users and Throughput

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Measurement Method                              |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-P-010 | Sustained concurrent dashboard users (active WebSocket + API polling sessions)              | 200 concurrent users without latency degradation beyond p95 targets | Load test (k6 / Locust) |
| NFR-P-011 | API throughput for CI/CD pipeline scenarios                                                  | ≥ 500 requests/second aggregate sustained on a 3-node API cluster | Load test |
| NFR-P-012 | WebSocket log-tail connections per API server instance                                       | ≥ 500 concurrent WebSocket connections without degradation | Load test |

---

## 2. Scalability

### 2.1 Container and Host Scale

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-S-001 | Maximum containers managed per single host                                                   | 500 containers per host         | Limited by Docker Engine and host hardware; DCMS agent must not exceed 2% host CPU at this scale |
| NFR-S-002 | Maximum hosts registered in a single DCMS cluster                                            | 100 hosts                      | API and DB queries must remain within latency SLAs at 100 hosts |
| NFR-S-003 | Maximum total containers across all registered hosts                                         | 10,000 containers               | Paginated list responses must remain under p95 latency SLAs |
| NFR-S-004 | Maximum Docker Swarm services managed                                                        | 500 services per cluster        | Service list and detail operations within p95 latency |
| NFR-S-005 | Maximum Kubernetes pods visible in DCMS (optional Kubernetes integration)                   | 5,000 pods per connected cluster | List operations paginated; metrics aggregated at Deployment level |

### 2.2 Horizontal Scaling

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-S-006 | DCMS API server must be horizontally scalable behind a load balancer                         | Linear throughput scaling up to 10 API server instances | Stateless API design; session state in Redis |
| NFR-S-007 | DCMS API server instances must be addable without downtime (zero-downtime horizontal scale)  | Scale-out operation < 60 seconds | New instance health-checked before receiving traffic |
| NFR-S-008 | PostgreSQL read traffic must be distributable via read replicas                              | ≥ 1 read replica supported in production | Read replica lag ≤ 500ms under normal write load |
| NFR-S-009 | Redis cache and pub/sub must support clustered or sentinel mode for HA                       | Redis Sentinel with 1 primary + 2 replicas minimum | Automatic failover in < 30 seconds |

### 2.3 Data Volume Scaling

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-S-010 | Audit log table must remain performant at 100 million rows                                   | Audit log search p95 ≤ 5 seconds at 100M rows | Partition by month; archive after 12 months    |
| NFR-S-011 | Log store (Loki / OpenSearch) must support 1 TB of compressed log data                       | Query latency ≤ 5 seconds over 30 days at 1 TB | Log store cluster sized accordingly             |
| NFR-S-012 | Metrics retention store must support 30-day history for 10,000 containers                   | Prometheus / Victoria Metrics sized at 30-day retention | TSDB compaction configured                     |

---

## 3. Availability

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Measurement Method                              |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-A-001 | Production DCMS API and UI availability (uptime SLA)                                        | 99.9% per rolling 30-day window (≤ 43.8 minutes downtime/month) | External uptime monitoring (UptimeRobot / Pingdom) |
| NFR-A-002 | Planned maintenance window (upgrades, DB migrations)                                        | ≤ 4 hours per quarter; pre-announced ≥ 72 hours in advance | Change management records |
| NFR-A-003 | Recovery Time Objective (RTO) — time to restore full service after a critical failure       | RTO ≤ 30 minutes               | Disaster recovery drill results                 |
| NFR-A-004 | Recovery Point Objective (RPO) — maximum acceptable data loss after a failure               | RPO ≤ 5 minutes                | DB WAL archiving interval; Redis persistence config |
| NFR-A-005 | DCMS agent on individual hosts must reconnect automatically after API server restart        | Agent reconnects within 60 seconds of API server availability | Agent reconnection test in CI |
| NFR-A-006 | Loss of connectivity between DCMS API server and a managed host must not affect containers on that host | Containers continue running; host marked "unreachable" in DCMS UI | Chaos test: network partition |
| NFR-A-007 | Database high availability — automatic failover from primary to replica                     | Failover ≤ 30 seconds; API returns 503 during failover window | DB HA failover test |
| NFR-A-008 | Load balancer health check removes unhealthy API server instances from rotation             | Unhealthy instance removed from LB within 15 seconds of health check failure | LB health check test |

---

## 4. Security

### 4.1 Authentication and Authorization

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-SEC-001 | All API requests must be authenticated via JWT (session token) or named API key           | Zero unauthenticated state-changing requests; enforced by middleware | JWT expiry: 1 hour; refresh token: 24 hours |
| NFR-SEC-002 | RBAC enforced at the API layer for every endpoint; role checked on every request          | 100% of endpoints have authorization middleware; verified by automated policy tests | No endpoint bypass permitted |
| NFR-SEC-003 | Passwords for local accounts must meet complexity requirements                             | Min 12 characters; mixed case + digit + special character; bcrypt hash (cost ≥ 12) | Password validator applied at account creation and change |
| NFR-SEC-004 | Account lockout after repeated failed authentication attempts                             | Account locked after 5 failures within 10 minutes; 30-minute lockout | Configurable by Admin |
| NFR-SEC-005 | JWT tokens must be invalidated immediately upon logout or API key revocation             | Token blacklist or short-lived tokens + Redis session store | Session invalidation verified in integration tests |
| NFR-SEC-006 | OIDC/SAML SSO integration with IdP; local account fallback disabled by configuration     | Standard OIDC 1.0 / SAML 2.0 compliance; verified by integration test with test IdP | |
| NFR-SEC-007 | Multi-factor authentication (TOTP / FIDO2) enforced for Admin-role accounts (configurable) | MFA challenge required before Admin session grants elevated operations | Compliant with NIST SP 800-63B AAL2 |

### 4.2 Encryption

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-SEC-008 | All API traffic (browser, CLI, agent) encrypted in transit                                | TLS 1.2 minimum; TLS 1.3 preferred; no TLS 1.0 or 1.1 | Enforced at load balancer and API server |
| NFR-SEC-009 | PostgreSQL data at rest encrypted                                                         | AES-256 at storage layer (cloud managed disk encryption or pgcrypto for sensitive columns) | Registry credentials, API key hashes, user PII encrypted at column level |
| NFR-SEC-010 | Redis data in transit encrypted                                                           | TLS on Redis client-server connection; AUTH password required | |
| NFR-SEC-011 | Container registry credentials stored encrypted in DB                                    | AES-256 column encryption; key managed via KMS | Decrypted only in memory at runtime; never logged |
| NFR-SEC-012 | TLS certificates must be rotated before expiry; automated certificate management         | Auto-renew via Let's Encrypt / cert-manager ≥ 30 days before expiry | Certificate expiry alert 45 days before expiry |

### 4.3 Audit Logging and CVE Scanning

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-SEC-013 | All state-changing operations written to an immutable audit log                          | 100% of FR-047 operations captured; no delete or update permitted on audit records | Append-only table; row-level security prevents Admin deletion |
| NFR-SEC-014 | Audit log entries must never contain secret values                                       | Passwords, tokens, and API key values never appear in audit log entries — only key names/IDs | Verified by security unit tests |
| NFR-SEC-015 | Container image vulnerability scanning with CRITICAL CVE block policy                   | Trivy scan on every image pull/push; CRITICAL CVE → block production deployment | Scan database updated weekly minimum |
| NFR-SEC-016 | Security headers on all HTTP responses                                                   | HSTS (max-age ≥ 31536000), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, CSP header | Verified by OWASP ZAP baseline scan |
| NFR-SEC-017 | OWASP Top 10 mitigations implemented and verified                                        | No OWASP Top 10 critical findings in quarterly DAST scan | Addressed: injection, broken auth, IDOR, SSRF, misconfig |

### 4.4 Network Security

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-SEC-018 | DCMS API server must not be directly accessible from the public internet without WAF       | WAF (AWS WAF, Cloudflare, or nginx ModSecurity) in front of production endpoint | IP allowlist for admin console |
| NFR-SEC-019 | DCMS agent communication to API server over mutual TLS (mTLS)                             | Agent client certificate verified by API server on every connection | Certificate rotation automated |
| NFR-SEC-020 | Docker socket access on managed hosts restricted to DCMS agent process only              | Docker socket group limited to dcms-agent system user; no other process access | Verified by host configuration audit |

---

## 5. Reliability

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-R-001 | Mean Time Between Failures (MTBF) for the DCMS API server                                 | MTBF ≥ 720 hours (30 days)     | Measured over any 6-month operational window    |
| NFR-R-002 | Mean Time to Recovery (MTTR) for DCMS API server failure                                  | MTTR ≤ 15 minutes              | Automated restart via container orchestrator health check |
| NFR-R-003 | Container health check polling interval for DCMS-managed containers                       | Health check evaluated every 30 seconds; configurable 10–300 seconds | Default interval; overridable per container |
| NFR-R-004 | DCMS agent heartbeat interval to API server                                               | Agent reports heartbeat every 15 seconds; host marked unreachable after 3 missed heartbeats (45 seconds) | Redis-backed heartbeat store |
| NFR-R-005 | API server circuit breaker for downstream dependencies (Docker API, DB, Redis)            | Circuit opens after 5 consecutive failures within 30 seconds; half-open probe after 60 seconds | Hystrix / resilience4j pattern |
| NFR-R-006 | All database writes use transactions; partial writes do not leave inconsistent state     | ACID compliance for all PostgreSQL operations; verified by chaos tests | Idempotency keys on container operation APIs |
| NFR-R-007 | Webhook event delivery retried on failure with exponential backoff                       | Up to 5 retries; backoff: 30s, 1m, 5m, 15m, 30m; failure recorded in notification log | Dead-letter queue for undeliverable events |
| NFR-R-008 | DCMS must degrade gracefully if Redis is unavailable                                     | Core container operations remain functional; real-time dashboard updates and session cache degrade | Redis unavailability logged; alert fired |
| NFR-R-009 | Metrics and log collection must degrade gracefully if log store is unavailable           | Container operations unaffected; logs buffered locally on agent for up to 1 hour | Local buffer flush on store reconnect |

---

## 6. Observability

### 6.1 Metrics (Prometheus / OpenTelemetry)

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-O-001 | All DCMS API server instances expose a `/metrics` endpoint in Prometheus format           | Scraped every 15 seconds; 30-day retention | Metrics: request rate, error rate, latency histograms, DB pool usage, Redis latency |
| NFR-O-002 | DCMS agent exposes host and container metrics in Prometheus format                        | Scraped every 15 seconds per host | Metrics: CPU %, memory %, disk I/O, net I/O, container restart count, health check status |
| NFR-O-003 | OpenTelemetry distributed tracing instrumented for all API request paths                  | 100% trace sampling in dev/staging; 10% sampling in production (configurable) | Trace correlation IDs propagated to agent and DB query spans |
| NFR-O-004 | Pre-built Grafana dashboards shipped with the platform for API, host, and container metrics | At least 3 dashboards: API Health, Cluster Overview, Container Detail | Dashboards version-controlled and deployed via Helm/Terraform |

### 6.2 Logging (Platform Internal Logs)

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-O-005 | DCMS API server and agent emit structured JSON logs to stdout                             | All log lines are valid JSON; parseable by Fluent Bit / Loki without custom parser | Log levels: DEBUG, INFO, WARN, ERROR; configurable at runtime |
| NFR-O-006 | Every log line includes a correlation ID matching the request's trace ID                 | 100% of request-initiated log lines carry `trace_id` field | Enables log-to-trace correlation in Grafana Tempo or Jaeger |
| NFR-O-007 | DCMS internal logs retain for 90 days in production                                      | Automated rotation and archive; storage budget defined per environment | Cold storage archive beyond 90 days |

### 6.3 Alerting (Platform Health Alerts)

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-O-008 | Alertmanager (or equivalent) configured with paging rules for API error rate > 1% or p99 > 2x SLA | Alert fires within 60 seconds of condition | On-call notification via PagerDuty or equivalent |
| NFR-O-009 | Dead man's switch alert: if no heartbeat from DCMS platform for 5 minutes, alert fires   | Alert fires within 5 minutes of total platform silence | Prevents silent failure scenarios              |

---

## 7. Maintainability

### 7.1 Deployment and Upgrades

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-M-001 | New DCMS version deployment time (API server rolling update in production)                | ≤ 15 minutes for a 3-node API cluster rolling update with zero downtime | Kubernetes RollingUpdate or Swarm service update |
| NFR-M-002 | Rollback time to previous version on deployment failure                                   | ≤ 5 minutes to rollback to previous stable image | Automated rollback triggered by health check failures post-deployment |
| NFR-M-003 | Database schema migrations must be backward-compatible for one version                   | Zero-downtime migration; old API version runs against new schema during rollout | Expand-contract migration pattern             |
| NFR-M-004 | DCMS agent upgrade across all hosts                                                       | Agent updated on all hosts within 30 minutes via platform-initiated rolling push | Agent version visible per host in DCMS dashboard |

### 7.2 Code Quality and Testability

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-M-005 | Unit test coverage for API server business logic                                          | ≥ 80% line coverage            | Enforced in CI gate; coverage report published per build |
| NFR-M-006 | Integration tests for all functional domains                                              | All FR-001 through FR-070 have at least one integration test | Test results published in CI pipeline           |
| NFR-M-007 | End-to-end (E2E) tests for critical user journeys                                         | Deploy container, scale service, view logs, and RBAC enforcement E2E tests pass in every CI build | Playwright or Cypress for UI E2E |
| NFR-M-008 | API contract tests (consumer-driven) to prevent breaking changes                         | Pact or equivalent contract tests run on every PR | API breaking-change check blocks merge if contracts fail |
| NFR-M-009 | Technical debt tracked; no P1 SonarQube/ESLint findings merged to main branch           | Zero critical static analysis findings merged | SonarQube or equivalent in CI gate              |

### 7.3 Configuration Management

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-M-010 | All configuration managed via environment variables or Kubernetes ConfigMaps/Secrets      | No hardcoded configuration in application code | 12-factor app compliance                        |
| NFR-M-011 | Helm chart or Docker Compose file provided for one-command DCMS installation             | `helm install dcms ./chart` or `docker compose up` deploys full stack in ≤ 10 minutes on a clean host | Tested in CI with kind cluster |
| NFR-M-012 | All secrets injected at runtime; no secrets in container images or SCM history           | Trivy secret scanning on all built images in CI; zero secrets in image layers | Git history scan via gitleaks in CI |

---

## 8. Accessibility

| NFR-ID   | Requirement                                                                                   | SLA Target / Standard          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-ACC-001 | All DCMS Web UI pages must conform to WCAG 2.1 Level AA                                 | Zero WCAG 2.1 AA violations in automated scan; manual testing of keyboard navigation | Axe-core automated scan in CI |
| NFR-ACC-002 | Full keyboard navigation support for all interactive UI elements                         | All buttons, forms, tables, and modals operable via keyboard only (no mouse required) | Tab order logical and visible |
| NFR-ACC-003 | All images and icons must have descriptive alt text or aria-label                        | Zero missing alt text findings in accessibility audit | Enforced via eslint-plugin-jsx-a11y in CI |
| NFR-ACC-004 | Color contrast ratio for text must meet WCAG AA thresholds                               | Normal text ≥ 4.5:1 contrast ratio; large text ≥ 3:1 | Verified by automated color contrast checker |
| NFR-ACC-005 | Screen reader compatibility (NVDA + Chrome; VoiceOver + Safari)                          | All primary dashboard workflows operable with a screen reader without workarounds | Manual QA test protocol on major releases |
| NFR-ACC-006 | Focus management in modals and dialogs                                                   | Focus trapped in open modals; focus returned to trigger element on close | Verified by keyboard navigation test protocol |
| NFR-ACC-007 | All form validation errors announced to screen reader users                              | ARIA live regions used for dynamic error announcements | ARIA `role="alert"` for error containers |

---

## 9. Compliance

### 9.1 SOC 2 Type II Readiness

| NFR-ID   | Requirement                                                                                   | SOC 2 Trust Service Criteria   | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-C-001 | Logical access controls enforced via RBAC; access reviews documented quarterly           | CC6.1, CC6.2, CC6.3            | Quarterly RBAC review report from Admin console |
| NFR-C-002 | Immutable audit log of all privileged operations retained for ≥ 12 months                | CC7.2, CC7.3                   | Append-only audit table; archive to cold storage at 12 months |
| NFR-C-003 | Change management: all DCMS code changes go through pull request review + CI gate       | CC8.1                          | Branch protection rules; required reviewers     |
| NFR-C-004 | Incident response runbooks documented and tested annually                                | CC7.4                          | Runbooks in internal wiki; tabletop exercise annually |
| NFR-C-005 | Vendor/dependency vulnerability management: CVE scanning on DCMS own images            | CC9.2                          | Trivy scan on every DCMS build; critical findings block release |
| NFR-C-006 | Data encryption at rest and in transit as documented in NFR-SEC-008 through NFR-SEC-011 | CC6.7                          | Encryption configuration evidence collected for audit |

### 9.2 GDPR Considerations

| NFR-ID   | Requirement                                                                                   | GDPR Article                   | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-C-007 | User personal data (name, email) stored only for platform operational purposes; no data shared with third parties | Art. 5, Art. 6       | Privacy notice must be displayed at first login |
| NFR-C-008 | User accounts deletable by Admin; deletion removes PII from operational DB within 30 days; audit log entries anonymized (user ID replaced with "deleted_user") | Art. 17 | Soft-delete workflow; async PII scrub job |
| NFR-C-009 | DCMS must not store container payload data (application data processed by containerized apps) | Art. 5(1)(c) — data minimization | Only metadata (container name, image, status, resource usage) stored |
| NFR-C-010 | Data Processing Agreement (DPA) must be in place with all sub-processors (cloud provider, monitoring SaaS) | Art. 28 | Legal team to confirm DPAs before production |

### 9.3 General Compliance

| NFR-ID   | Requirement                                                                                   | Standard / Regulation          | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-C-011 | All dependencies are open-source or commercially licensed; no license violations             | Organization IP policy         | FOSSA or similar license scan in CI             |
| NFR-C-012 | SBOM (Software Bill of Materials) generated for each DCMS release                           | NIST SSDF, EO 14028             | CycloneDX or SPDX format; published per release |

---

## 10. Portability

| NFR-ID   | Requirement                                                                                   | SLA Target                     | Notes                                           |
|----------|-----------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------|
| NFR-PORT-001 | DCMS platform components must run on any Linux host with Docker Engine 24.x+ or Kubernetes 1.28+ | Full feature parity on Ubuntu 22.04, RHEL 8+, Debian 11+; verified in CI | Linux-only for v1; Windows out of scope |
| NFR-PORT-002 | DCMS must deploy on AWS, Azure, and GCP without code changes                            | Deployment scripts and Helm charts tested on at least 2 cloud providers before GA | Provider-specific values via Helm `values.yaml` |
| NFR-PORT-003 | DCMS must deploy on bare-metal Linux infrastructure without cloud provider dependencies | All cloud-specific features (e.g., managed DB) replaceable with self-hosted equivalents; documented in deployment guide | Tested on bare-metal lab environment |
| NFR-PORT-004 | No cloud-vendor-specific SDK calls in DCMS core application code                       | Core application code uses vendor-neutral libraries; cloud-specific adapters isolated in infrastructure layer | Verified by architecture review |
| NFR-PORT-005 | All DCMS data exportable in open standard formats for migration                         | Container metadata, audit logs, user accounts, and alert rules exportable as JSON or CSV | Export tooling included in CLI |
| NFR-PORT-006 | DCMS components packaged as OCI-compliant container images                              | Published to standard OCI registry; no proprietary image format | Available on Docker Hub and optionally self-hosted registry |
| NFR-PORT-007 | Kubernetes deployment uses standard Helm chart; no Operator required for basic installation | Helm 3.x chart; optional Operator for advanced lifecycle management | Operator development deferred to v2 |
