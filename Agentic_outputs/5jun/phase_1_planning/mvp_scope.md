# MVP Scope Definition
## Generic Docker Container Management System (DCMS) — v1.0

| Field         | Value                                      |
|---------------|--------------------------------------------|
| Document ID   | PM-MVP-DCMS-001                            |
| Version       | 1.0.0                                      |
| Status        | Approved                                   |
| Date          | 2026-06-05                                 |
| Author        | Product Manager Agent                      |
| Parent BRD    | BRD-DCMS-001                               |
| Parent FRD    | FRD-DCMS-001                               |
| Target GA     | 2026-09-30                                 |

---

## Table of Contents

1. [MVP Definition and Rationale](#1-mvp-definition-and-rationale)
2. [In-Scope Feature List](#2-in-scope-feature-list)
3. [Out-of-Scope Features](#3-out-of-scope-features)
4. [Critical User Journeys](#4-critical-user-journeys)
5. [Definition of Done for MVP](#5-definition-of-done-for-mvp)
6. [Release Criteria Checklist](#6-release-criteria-checklist)

---

## 1. MVP Definition and Rationale

### What the MVP Is

The DCMS v1.0 MVP is the **minimum set of platform capabilities that enables an organization to manage its full containerized workload lifecycle end-to-end** — from deploying the first container to operating a Docker Swarm cluster in production — with the security, observability, and access controls required for day-one enterprise adoption.

The MVP is not a prototype or a proof of concept. It is a production-quality, 99.9%-uptime-grade platform that replaces ad-hoc CLI workflows for DevOps engineers, provides self-service deployment for developers, and establishes the audit evidence trail required to begin SOC 2 Type II evidence collection.

### Rationale for Scope Decisions

The MVP scope was selected using three filters applied to all 70 functional requirements:

1. **Business criticality:** Does this feature directly address one of the six business objectives (BO-001 through BO-006) defined in BRD-DCMS-001? Features addressing deployment velocity (BO-001), incident reduction (BO-002), multi-host visibility (BO-003), audit compliance (BO-004), and self-service (BO-005) are in scope.

2. **User journey completeness:** Does excluding this feature break a critical user journey? A journey is critical if the primary persona (DevOps Engineer, Developer, Platform Admin) cannot complete their most frequent weekly task without it. Features that are enhancers, not enablers, are deferred.

3. **Dependency forcing:** Is this feature a prerequisite for other in-scope features? Authentication, RBAC, and the host-agent model are MVP because virtually every other feature depends on them.

Features that are experiential enhancements (dark mode, exec-into-container terminal, alert silencing) or require significant infrastructure investment with low immediate return (Kubernetes, webhooks, MFA) are deferred to v1.5 or v2.0.

### MVP Guiding Constraint

All 35 in-scope FR-IDs must be covered by at least one integration test and at least one end-to-end test for a critical user journey before the release criteria checklist can be considered complete.

---

## 2. In-Scope Feature List

35 functional requirements are in scope for v1.0 MVP, spanning all 10 FRD domains.

### 2.1 Container Lifecycle Management (9 of 12 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-001 | Create Container             | Core of BO-001; no platform value without container creation                  | 8               |
| FR-002 | Start Container              | Required to complete the deploy journey                                        | 3               |
| FR-003 | Stop Container               | Required for safe container teardown; supports BO-002 incident response       | 3               |
| FR-004 | Restart Container             | Highest-frequency developer action (US-014); essential self-service capability | 3               |
| FR-006 | Kill Container               | Safety valve for hung containers; required for production operations          | 2               |
| FR-007 | Remove Container             | Resource reclamation; required to complete US-005 journey                     | 3               |
| FR-008 | View Container Details       | Diagnostic surface; required to verify deployment success                     | 5               |
| FR-009 | List Containers              | Foundation of the dashboard; needed by every role                             | 5               |
| FR-011 | View Container Logs (Inline) | Required for live-tail user journey (US-015); critical developer workflow      | 5               |

### 2.2 Image Management (5 of 8 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-013 | Pull Image                   | Required for container deployment; prerequisite to all container operations    | 5               |
| FR-016 | List Images                  | Inventory view; required for image selection in deployment workflow            | 3               |
| FR-017 | Delete Image                 | Resource management; prevents disk exhaustion on managed hosts                | 3               |
| FR-018 | Vulnerability Scan (Trivy)   | Core of BO-006; CRITICAL CVE blocking is a day-one enterprise requirement      | 8               |
| FR-019 | Registry Credentials Mgmt    | Prerequisite for private registry pulls; blocks FR-013 for enterprise users   | 5               |

### 2.3 Networking (6 of 7 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-021 | Create Network               | Required for multi-container applications; Swarm overlay networks essential   | 5               |
| FR-022 | Delete Network               | Resource cleanup; required to prevent orphaned networks                       | 2               |
| FR-023 | Connect Container to Network | Required for US-009 (overlay network journey)                                 | 3               |
| FR-024 | Disconnect Container from Network | Required to safely reconfigure running container networking                | 3               |
| FR-025 | List Networks                | Operational visibility; required by DevOps and Admin personas                 | 3               |
| FR-026 | Port Mapping Management      | Conflict detection prevents production incidents; BO-002 directly supported   | 3               |

### 2.4 Storage (4 of 5 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-028 | Create Volume                | Required for stateful application deployments (databases, file stores)        | 3               |
| FR-029 | Delete Volume                | Resource cleanup; blocks orphaned volume accumulation                         | 2               |
| FR-030 | Attach Volume to Container   | Required to complete US-010 (persistent data user journey)                    | 3               |
| FR-031 | List Volumes                 | Inventory visibility; required by DevOps persona for storage auditing         | 3               |

### 2.5 Health Monitoring and Alerting (4 of 5 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-033 | Container Health Checks       | BO-002; surface HEALTHCHECK status; US-029 is a must-priority story          | 3               |
| FR-034 | Host Resource Metrics         | Core observability; required for capacity planning and incident detection     | 8               |
| FR-035 | Alert Rule Configuration      | Required for US-007; BO-002 specifically calls out proactive alerting         | 8               |
| FR-036 | Alert Notifications           | Without notifications, alert rules have no operational value                  | 5               |

### 2.6 Centralized Logging (2 of 5 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-038 | Log Aggregation              | Required for US-008 (production log search without SSH); BO-003               | 8               |
| FR-039 | Log Search and Filter        | Required for US-008; the aggregation pipeline has zero value without search   | 8               |

### 2.7 Access Control and Security (7 of 8 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-043 | User Account Management      | Required to onboard users; foundation of all RBAC                             | 5               |
| FR-044 | Role Assignment              | Required for namespace-scoped access control (BO-004, BO-005)                 | 3               |
| FR-045 | SSO / OIDC Integration       | Enterprise requirement; majority of target organizations use OIDC/SAML       | 8               |
| FR-046 | API Key Management           | Required for CI/CD pipeline access (BO-001 automation path)                  | 5               |
| FR-047 | Audit Log                    | SOC 2 CC7.2 requirement; append-only; must be live at GA for evidence period  | 8               |
| FR-048 | Audit Log Search and Export  | Required for US-018 (Security Auditor SOC 2 journey)                          | 5               |
| FR-049 | Namespace Management         | Required for environment isolation (dev / staging / prod); BO-005             | 5               |

### 2.8 Dashboard UI (6 of 8 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-051 | Cluster Overview Dashboard   | Landing page; required for BO-003 (single pane of glass)                     | 8               |
| FR-052 | Container Management UI      | Bulk action support; table view is the primary operator interface              | 8               |
| FR-053 | Real-time Metrics Charts     | Required for US-016 (resource usage visibility)                               | 8               |
| FR-054 | Log Viewer UI                | Required for US-008, US-015 (live-tail and log search)                        | 8               |
| FR-055 | Image Registry UI            | Required for FR-018 scan results surface; pull and delete operations in UI    | 5               |
| FR-056 | User and RBAC Management UI  | Admin panel; required to manage users without direct API calls                | 5               |

### 2.9 REST API (5 of 6 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-059 | API Versioning               | All API design starts with versioning; prerequisite for stable CI/CD integration | 2             |
| FR-060 | OpenAPI Specification        | Required for US-030; enables CI/CD automation adoption                        | 3               |
| FR-061 | Pagination and Filtering     | Required for all list endpoints; without it list operations fail at scale     | 5               |
| FR-063 | Rate Limiting                | Required to protect platform from API abuse; must be live at GA               | 3               |
| FR-064 | API Health Endpoint          | Required by load balancer probes and CI/CD pipelines; zero-cost inclusion     | 2               |

### 2.10 Cluster Management (4 of 6 FRs)

| FR-ID  | Feature Name                 | MVP Justification                                                              | Story Point Est. |
|--------|------------------------------|--------------------------------------------------------------------------------|-----------------|
| FR-065 | Register Host                | Prerequisite for all cluster operations; required to onboard any managed host | 5               |
| FR-066 | Remove Host                  | Operational completeness; prevents orphaned host registrations                | 3               |
| FR-067 | Docker Swarm Integration     | Target cluster orchestrator for v1.0; required for enterprise adoption        | 8               |
| FR-068 | Scale Service                | Critical user journey (US-006); required for production traffic management    | 5               |

**Total MVP Story Points (estimated): 257**

---

## 3. Out-of-Scope Features

The following functional requirements are explicitly excluded from v1.0 MVP. Each is assigned a target release.

| FR-ID  | Feature Name                     | Exclusion Rationale                                                         | Target Release |
|--------|----------------------------------|-----------------------------------------------------------------------------|----------------|
| FR-005 | Pause Container                  | Low usage frequency; adds kernel cgroup freeze complexity without clear MVP value | v1.5       |
| FR-010 | Execute Command in Container     | Requires browser-side terminal emulator (xterm.js); significant frontend complexity | v1.5     |
| FR-012 | Set Resource Limits (live update) | Useful but not blocking; containers can be redeployed with new limits in MVP | v1.5          |
| FR-014 | Push Image                       | Most teams pull from external registries; push flow is less common in MVP usage pattern | v1.5   |
| FR-015 | Tag Image                        | Dependency on FR-014 push workflow; deferred with it                        | v1.5           |
| FR-020 | Image Build History              | Requires build provenance metadata infrastructure; low MVP priority          | v1.5           |
| FR-027 | DNS Configuration                | Advanced networking; bridge/overlay DNS defaults are sufficient for MVP      | v1.5           |
| FR-032 | Volume Usage Reporting           | Metrics-intensive feature; FR-034 (host metrics) covers disk I/O in MVP    | v1.5           |
| FR-037 | Alert History and Silencing      | Alerts fire in MVP; silencing is an operational comfort feature, not MVP-critical | v1.5      |
| FR-040 | Log Retention Policy             | Default 30-day retention sufficient for MVP; configurable policy deferred   | v1.5           |
| FR-041 | Log Export                       | Manual log inspection via search covers MVP needs; async export is enhancement | v1.5         |
| FR-042 | Structured Log Parsing           | JSON field-level filtering is a nice-to-have; keyword search covers MVP     | v1.5           |
| FR-050 | MFA Enforcement                  | OIDC SSO in MVP provides strong external identity; TOTP/FIDO2 adds complexity | v1.5         |
| FR-057 | Responsive Design (tablet)       | Desktop 1280px+ is primary target; tablet optimization deferred             | v1.5           |
| FR-058 | Dark Mode / Light Mode           | UX enhancement; no functional impact on platform operations                 | v1.5           |
| FR-062 | Webhook Event Delivery           | CI/CD polling via REST API covers MVP automation needs                      | v1.5           |
| FR-069 | Kubernetes Integration           | Docker Swarm is v1.0 cluster target; Kubernetes adds 6–8 weeks of complexity | v2.0          |
| FR-070 | Node Drain and Maintenance Mode  | Swarm service reschedule during drain requires careful testing; deferred    | v1.5           |

---

## 4. Critical User Journeys

The five critical user journeys define the scenarios that must work end-to-end at GA. Each journey spans multiple FR-IDs and maps to at least one user story.

---

### Journey 1 — Deploy the First Container

**Persona:** DevOps Engineer  
**User Stories:** US-004, US-011, US-012, US-002  
**Goal:** An authorized DevOps Engineer registers a Docker host, configures private registry credentials, pulls an image (with automatic CVE scan), and deploys a running container — all without SSH access to the host.

**Steps and FR Coverage:**

| Step | Action | FR-ID |
|------|--------|-------|
| 1 | Admin registers the Docker host and deploys DCMS agent | FR-065 |
| 2 | Operator adds private registry credentials | FR-019 |
| 3 | Operator pulls image from registry; Trivy scan runs automatically | FR-013, FR-018 |
| 4 | If no CRITICAL CVEs: image marked scan-passed; deploy proceeds | FR-018 |
| 5 | Operator creates container with image, CPU/memory limits, port bindings, env vars | FR-001 |
| 6 | Container transitions to RUNNING; status visible in dashboard | FR-002, FR-009 |
| 7 | Operator views container detail: resource usage, ports, volumes | FR-008 |
| 8 | All actions appear in audit log | FR-047 |

**Success Criteria:**  
- Time from image pull to container RUNNING ≤ 3 minutes (p95) for images ≤ 1 GB.  
- CVE scan runs automatically; CRITICAL CVEs block production namespace deployment with visible error.  
- Audit log entries for `image.pull`, `container.create`, `container.start` present within 1 second.

---

### Journey 2 — Scale a Swarm Service

**Persona:** DevOps Engineer  
**User Stories:** US-006, US-022  
**Goal:** An Operator scales a Docker Swarm service from 2 to 5 replicas via the dashboard during a traffic spike, monitors the rollout progress, and confirms convergence.

**Steps and FR Coverage:**

| Step | Action | FR-ID |
|------|--------|-------|
| 1 | Operator navigates to the cluster services view | FR-067, FR-051 |
| 2 | Operator selects target service; views current replica count and cluster headroom | FR-067, FR-034 |
| 3 | Operator sets replicas to 5 and confirms | FR-068 |
| 4 | Dashboard shows rollout progress bar; real-time replica count updates via WebSocket | FR-053, FR-051 |
| 5 | Swarm converges; service detail shows 5/5 running replicas | FR-068 |
| 6 | Scale event written to audit log | FR-047 |
| 7 | Read-only Viewer can observe the service status without action buttons | FR-051, FR-052 |

**Success Criteria:**  
- 5 replicas running and visible in dashboard within 5 minutes of scale command.  
- Rollout progress updates in real time (WebSocket latency ≤ 2 seconds).  
- Insufficient-resource warning displayed if cluster headroom is insufficient.

---

### Journey 3 — Pull and Scan an Image

**Persona:** DevOps Engineer / Security Auditor  
**User Stories:** US-011, US-019  
**Goal:** An Operator pulls a new image version; the CVE scan runs automatically; a Security Auditor can review the scan results and confirm no CRITICAL CVEs are deployed to production.

**Steps and FR Coverage:**

| Step | Action | FR-ID |
|------|--------|-------|
| 1 | Operator navigates to Image Registry UI and triggers a pull | FR-013, FR-055 |
| 2 | Pull progress displayed; scan begins automatically on completion | FR-013, FR-018 |
| 3 | Scan results available within 5 minutes (images ≤ 1 GB) | FR-018 |
| 4 | Results display: CVE count by severity (critical, high, medium, low) | FR-055 |
| 5 | If CRITICAL CVEs: image tagged "policy:blocked-production"; alert fired | FR-018, FR-036 |
| 6 | Security Auditor navigates to "Images — Scan History" to review all prod deployments | FR-016, FR-048 |
| 7 | Auditor filters by "CRITICAL severity only" to identify policy violations | FR-016 |

**Success Criteria:**  
- Pull + scan completes within 5 minutes for images ≤ 1 GB.  
- CRITICAL CVE images cannot be deployed to `prod` namespace (API returns 400 with CVE summary).  
- Scan history visible to Security Auditor role with full CVE detail (CVE-ID, severity, CVSS score, fix version).

---

### Journey 4 — View Real-time Logs

**Persona:** Developer / DevOps Engineer  
**User Stories:** US-008, US-015, US-023  
**Goal:** A Developer live-tails stdout logs of a running container in the dashboard during active testing, then searches historical logs for a keyword to diagnose a past error.

**Steps and FR Coverage:**

| Step | Action | FR-ID |
|------|--------|-------|
| 1 | Developer navigates to Container detail → "Live Logs" tab | FR-011, FR-054 |
| 2 | Log lines stream in real time via WebSocket; latency ≤ 2 seconds | FR-011, FR-038 |
| 3 | Developer clicks "Pause" to freeze stream; "Resume" to continue | FR-011 |
| 4 | Developer switches to Log Viewer; enters keyword search with 7-day time range | FR-039, FR-054 |
| 5 | Matching log lines returned within 5 seconds; pagination available | FR-039 |
| 6 | Developer filters by time range "last 1 hour" to narrow results | FR-039 |
| 7 | Read-only Viewer performs same search; production namespace blocked by RBAC | FR-039, FR-049 |

**Success Criteria:**  
- Live-tail WebSocket stream established within 3 seconds of tab open.  
- Historical log search returns results within 5 seconds for queries spanning ≤ 30 days.  
- Viewer scoped to `dev` namespace cannot access `prod` namespace logs; "No access" message shown.

---

### Journey 5 — Manage User Access

**Persona:** Platform Admin / Security Auditor  
**User Stories:** US-001, US-003, US-018, US-020, US-024  
**Goal:** A Platform Admin configures OIDC SSO, creates namespaces, assigns role-scoped access, and then a Security Auditor reviews the RBAC posture and audit log for SOC 2 evidence.

**Steps and FR Coverage:**

| Step | Action | FR-ID |
|------|--------|-------|
| 1 | Admin configures OIDC issuer URL, client ID, client secret | FR-045 |
| 2 | Login page shows "Login with Company SSO"; user authenticates via IdP | FR-045 |
| 3 | Admin creates namespaces: `dev`, `staging`, `prod` | FR-049 |
| 4 | Admin creates a user account for a new DevOps Engineer | FR-043 |
| 5 | Admin assigns Operator role scoped to `staging` namespace | FR-044 |
| 6 | Operator verifies: `prod` namespace actions are permission-denied | FR-044, FR-049 |
| 7 | Security Auditor searches audit log for `user.role_assign` events in the past 90 days | FR-048 |
| 8 | Auditor exports audit log to CSV for SOC 2 evidence package | FR-048 |
| 9 | Auditor views Users & Roles report; confirms inactive accounts are flagged | FR-048 |

**Success Criteria:**  
- OIDC login flow completes without error; IdP group maps correctly to DCMS Admin/Operator/Viewer role.  
- Role-scoped access enforced at API layer (permission-denied returned for out-of-scope namespace requests).  
- Audit log search returns within 5 seconds for a 90-day window; CSV export completes within 30 seconds.  
- Audit log entries are immutable via UI and API (no delete or modify operations permitted).

---

## 5. Definition of Done for MVP

The following criteria apply to every feature (FR-ID) included in the MVP scope before it can be considered done.

### 5.1 Engineering DoD (Per Feature)

1. **Code complete:** All acceptance criteria from the associated user story (US-XXX) are implemented and peer-reviewed via pull request with at least one approving review.
2. **Unit tests pass:** Unit test coverage for the feature's business logic is ≥ 80% (line coverage); all tests pass in CI on the `main` branch.
3. **Integration test exists:** At least one integration test exercises the feature end-to-end through the real API server against a test database and a real (containerized) Docker host.
4. **OpenAPI spec updated:** The `/api/docs` endpoint reflects the new or updated endpoints for this feature without a manual update step.
5. **Audit log verified:** Every state-changing operation introduced by this feature writes an audit log entry; verified by an automated assertion in the integration test.
6. **RBAC enforced:** The feature's API endpoints are covered by authorization middleware; automated policy tests confirm that Viewer cannot mutate state, Operator is scoped to namespace, and Admin has full access.
7. **No critical static analysis findings:** Zero SonarQube P1/P2 or `go vet` critical findings introduced by the feature's code diff.
8. **Error handling correct:** All error paths return the documented HTTP status codes and error response schema defined in the OpenAPI spec.

### 5.2 Frontend DoD (Per UI Feature)

9. **WCAG 2.1 AA:** Axe-core automated scan reports zero new violations on the feature's pages; keyboard navigation works for all interactive elements.
10. **Responsive layout:** Feature UI is functional and non-broken at 1280px desktop width (v1.0 MVP target).
11. **Loading and error states:** All async data fetch operations display a loading skeleton and a retry-able error state.
12. **E2E test exists:** At least one Playwright E2E test covers the feature's primary happy path.

### 5.3 Sprint-Level DoD (Per Sprint)

13. **Demo-able in sprint review:** All sprint-committed stories are demonstrable against a non-production environment.
14. **No P1 bugs open:** Zero severity-1 (blocking) bugs remain open at sprint close for stories committed in the sprint.
15. **Performance baseline met:** API latency p95 for any new endpoints meets the NFR-P-001/NFR-P-002 targets under a 50-user load test run in the CI pipeline.

### 5.4 MVP Release DoD

16. **All 35 in-scope FR-IDs complete:** Every FR in section 2 has met the engineering and frontend DoD above.
17. **All 5 critical user journeys pass E2E:** Each journey in section 4 has a Playwright test suite that passes in CI with zero failures.
18. **Load test validated:** A k6 load test with 200 virtual users sustaining 10 minutes of mixed read/write traffic shows p95 API latency ≤ 300ms and zero 5xx error rate > 0.1%.
19. **Security scan clean:** OWASP ZAP baseline scan on the deployed v1.0 application reports zero high or critical findings.
20. **Trivy scan clean on DCMS own images:** All DCMS service container images (API server, agent, UI server) pass Trivy scan with zero CRITICAL CVEs.
21. **Release criteria checklist complete:** All items in section 6 are checked and signed off.

---

## 6. Release Criteria Checklist

The following checklist must be fully checked and signed off by the QA Lead, Engineering Lead, and Product Manager before the v1.0 GA tag is cut.

| # | Criterion | Verification Method | Sign-off Owner |
|---|-----------|---------------------|----------------|
| 1 | All 35 in-scope FR-IDs pass integration tests in CI (green build on `main`) | CI dashboard: 100% integration test pass rate | Engineering Lead |
| 2 | All 5 critical user journeys have Playwright E2E tests that pass in CI | Playwright test report: 0 failures | QA Lead |
| 3 | API p95 latency ≤ 300ms for read endpoints under 200 concurrent virtual users (k6 load test, 10-minute run) | k6 summary report | QA Lead |
| 4 | API p95 latency ≤ 500ms for write endpoints under 200 concurrent virtual users | k6 summary report | QA Lead |
| 5 | Platform uptime ≥ 99.9% validated over a 7-day pre-GA staging soak test | Uptime monitoring dashboard (UptimeRobot) | Engineering Lead |
| 6 | Zero OWASP ZAP high or critical findings on the deployed staging environment | ZAP HTML scan report | Security Lead |
| 7 | Zero CRITICAL CVEs in DCMS own container images (API server, agent, UI server) | Trivy scan output in CI | Engineering Lead |
| 8 | WCAG 2.1 AA: zero Axe-core violations on all 8 primary dashboard pages | Axe CI report | Frontend Lead |
| 9 | Audit log: 100% of state-changing API operations produce an audit entry (verified by automated assertion across all 35 in-scope FRs) | Audit log integration test suite | Engineering Lead |
| 10 | RBAC enforcement: Viewer cannot execute any mutation; Operator is blocked from out-of-scope namespaces (automated policy test suite: 0 failures) | RBAC policy test CI report | Engineering Lead |
| 11 | OIDC SSO login flow validated against a test IdP (Keycloak or Auth0 sandbox) with Admin, Operator, and Viewer group mappings | Manual QA run + automated SSO integration test | QA Lead |
| 12 | CVE scan enforcement: attempt to deploy a CRITICAL-CVE image to `prod` namespace returns HTTP 400 with CVE summary (automated integration test) | Integration test CI report | Engineering Lead |
| 13 | OpenAPI spec at `/api/docs` is a valid OpenAPI 3.1 document covering all 35 in-scope FRs (validated by `openapi-schema-validator`) | CI validation step | Engineering Lead |
| 14 | Docker Swarm service scale (2 → 5 replicas) completes and converges within 5 minutes on the staging cluster (manual validation) | Sprint 10 demo sign-off record | QA Lead / Product Manager |
| 15 | Release notes drafted; known limitations documented; deployment runbook validated on a clean host using `helm install dcms ./chart` | Release notes PR merged; runbook executed by one team member who did not write it | Product Manager |
