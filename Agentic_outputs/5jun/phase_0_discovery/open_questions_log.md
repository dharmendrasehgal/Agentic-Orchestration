# Open Questions Log
## Generic Docker Container Management System

| Field         | Value                                     |
|---------------|-------------------------------------------|
| Document ID   | OQL-DCMS-001                              |
| Version       | 1.0.0                                     |
| Status        | Approved                                  |
| Date          | 2026-06-05                                |
| Author        | Requirement Agent / Business Analyst Agent|
| Parent BRD    | BRD-DCMS-001                              |

---

## Summary

| Total Questions | Resolved | Deferred | Open |
|-----------------|----------|----------|------|
| 14              | 7        | 5        | 2    |

---

## Open Questions

---

### OQ-001

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-001                                                                                           |
| **Question**  | Should the DCMS use Docker Swarm, Kubernetes, or both as the primary cluster orchestrator for v1? The BRD lists both as target technologies, but architectural decisions and UI complexity differ significantly between them. |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Decision by CTO (recorded in ADR-001, 2026-06-10): DCMS v1 will implement **Docker Swarm as the primary cluster orchestrator** (FR-067, FR-068). Kubernetes integration is a Should-priority feature (FR-069) implemented as an optional read-write connection via kubeconfig. Full Kubernetes-native management (Operators, CRDs) is deferred to v2. This decision unblocks the backend architect to finalize the cluster management module design. |

---

### OQ-002

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-002                                                                                           |
| **Question**  | What is the preferred log aggregation backend for centralized container logging — Grafana Loki or OpenSearch (formerly Elasticsearch)? Each has different operational complexity, query language, and cost profile. |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Decision by DevOps Lead and Platform Architect (2026-06-08): **Grafana Loki** selected as the primary log store for v1. Rationale: lower operational overhead vs. OpenSearch, native integration with Grafana stack already in use, and label-based indexing is sufficient for DCMS log query patterns. Fluent Bit selected as the log shipper. OpenSearch remains a pluggable alternative documented in the deployment guide for organizations requiring full-text search at high log cardinality. |

---

### OQ-003

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-003                                                                                           |
| **Question**  | Should the DCMS REST API backend be implemented in Node.js (TypeScript) or Go? Both are in the approved tech stack. The choice impacts team velocity, performance characteristics, and ecosystem maturity for Docker SDK integration. |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Decision by Engineering Lead (2026-06-09): **Go** selected for the DCMS API server and DCMS agent. Rationale: the Go Docker SDK (`docker/docker/client`) is the most complete and actively maintained; Go's concurrency model (goroutines) is well-suited for managing many concurrent agent connections and WebSocket streams; the existing platform team has Go expertise. Node.js/TypeScript is retained for lightweight tooling scripts and the UI build pipeline only. |

---

### OQ-004

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-004                                                                                           |
| **Question**  | What is the required log retention period, and is there a separate cold storage / archival requirement for logs beyond the hot retention window? |
| **Raised By** | Business Analyst Agent                                                                           |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Resolved with Operations Manager and Compliance Lead (2026-06-07): Hot log retention (Loki) is **30 days** for all environments. Audit logs are retained in hot storage for **90 days**, then archived to cold storage (S3 / Azure Blob) for **12 months**. Container stdout/stderr logs beyond 30 days are not required for production operations; Security Auditor confirmed audit log retention covers compliance needs. FR-040 and NFR-S-011 updated accordingly. |

---

### OQ-005

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-005                                                                                           |
| **Question**  | Is the vulnerability scanner (Trivy) approved by the security team for use in production pipelines? Are there any restrictions on the CVE database update frequency or air-gapped scanning requirements? |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Security team approval confirmed (2026-06-11): **Trivy 0.50+ approved** for DCMS image scanning pipeline. CVE database must be updated at minimum **weekly** via a scheduled sync job; for air-gapped environments, a local Trivy DB mirror is required and documented in the deployment guide. Assumption A-007 in BRD confirmed. |

---

### OQ-006

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-006                                                                                           |
| **Question**  | Should the DCMS include a built-in private container image registry (e.g., Harbor or Docker Distribution), or should it only manage connections to external registries? |
| **Raised By** | Business Analyst Agent                                                                           |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Deferred**                                                                                     |
| **Resolution / Notes** | Deferred to v2 roadmap planning (2026-06-10). Rationale: the organization already operates AWS ECR and a Harbor instance. Running a DCMS-managed registry would duplicate existing infrastructure. v1 will focus on registry credential management and pull-through proxy for vulnerability scanning. A first-class built-in registry is flagged for v2 evaluation. Out-of-scope noted in BRD Section 5.2. |

---

### OQ-007

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-007                                                                                           |
| **Question**  | What is the SSO/OIDC identity provider in use at the organization, and what group-to-role mapping schema should DCMS use? Is SAML 2.0 also required, or OIDC alone sufficient? |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | IT/IAM team confirmed (2026-06-12): The organization uses **Azure Active Directory (Entra ID)** with OIDC. SAML 2.0 is not required for v1 — OIDC is sufficient. AAD group names map to DCMS roles as follows: `dcms-platform-admin` → Admin; `dcms-operators` → Operator; `dcms-viewers` → Viewer. SSO configuration UI (US-024, FR-045) designed around OIDC. SAML 2.0 support deferred to v2 for legacy IdP compatibility. |

---

### OQ-008

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-008                                                                                           |
| **Question**  | Is there a requirement to support Windows containers (Windows Server 2019/2022 hosts) in v1, or is Linux-only acceptable? |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Confirmed by CTO and development team leads (2026-06-07): **Windows container support is out of scope for v1.** The organization's containerized workloads are 100% Linux-based at this time. Windows container support is noted as a v2 consideration pending adoption trends. BRD Section 5.2 and NFR-PORT-001 reflect this decision. |

---

### OQ-009

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-009                                                                                           |
| **Question**  | Should the DCMS agent communicate with the Docker daemon via the Docker socket (Unix socket) or via the Docker REST API over TCP? The choice has security implications (socket requires host-level access) and deployment complexity differences. |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Deferred**                                                                                     |
| **Resolution / Notes** | Deferred to architecture phase (Phase 1). The security team flagged Docker socket mounting as a high-privilege operation requiring careful host isolation. The senior architect will evaluate socket-based access (simpler, lower latency) vs. Docker TCP API with TLS (more secure, configurable). Decision expected in ADR-003 by 2026-07-10. Interim assumption: Unix socket with restricted group access per NFR-SEC-020. |

---

### OQ-010

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-010                                                                                           |
| **Question**  | Is there a requirement to support namespace-level resource quotas (e.g., max containers, max CPU, max memory per namespace) to prevent noisy-neighbour scenarios between dev teams? |
| **Raised By** | Business Analyst Agent                                                                           |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Deferred**                                                                                     |
| **Resolution / Notes** | Deferred to Phase 2 planning. The product manager acknowledged that namespace quotas are desirable for multi-team environments but are not a blocker for MVP. The feature is logged in the backlog as a Should-priority item for v1.1. FR-049 (Namespace Management) documents basic namespace creation; quota enforcement will be a follow-on FR in the next phase. |

---

### OQ-011

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-011                                                                                           |
| **Question**  | What notification channels must be supported at GA? The BRD mentions email, Slack, and webhook. Is PagerDuty direct integration required, or is webhook to PagerDuty Events API sufficient? |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Confirmed with DevOps Lead and on-call team (2026-06-10): v1 must support **email, Slack webhook, and generic HTTP webhook** as notification channels. A generic webhook is sufficient for PagerDuty integration (PagerDuty Events API v2 accepts webhook POSTs). A native PagerDuty integration plugin is a Could-priority item for v1.1. NFR-O-008 and FR-036 document the core alerting requirement. |

---

### OQ-012

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-012                                                                                           |
| **Question**  | Should the DCMS REST API support GraphQL in addition to REST, given that some teams use GraphQL clients? |
| **Raised By** | Development Team Lead                                                                            |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Deferred**                                                                                     |
| **Resolution / Notes** | Deferred to v2 roadmap. The product manager confirmed that all current API consumers (CI/CD pipelines, dashboard UI) are well-served by REST. Adding GraphQL in v1 would increase delivery risk with limited user demand. REST API with cursor pagination (FR-061) covers the known query patterns. GraphQL support is noted in the v2 backlog. |

---

### OQ-013

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-013                                                                                           |
| **Question**  | Is a billing/chargeback module required in v1 to track infrastructure cost per team or namespace? |
| **Raised By** | Finance Representative                                                                           |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Resolved**                                                                                     |
| **Resolution / Notes** | Confirmed out of scope for v1 by Finance and CTO (2026-06-07). The current organization size does not require internal chargeback at this stage. Resource usage reporting per namespace (NFR-P-010 context; US-032) provides sufficient visibility. Billing/chargeback is deferred to v2 and noted in BRD Section 5.2. |

---

### OQ-014

| Field         | Detail                                                                                           |
|---------------|--------------------------------------------------------------------------------------------------|
| **OQ-ID**     | OQ-014                                                                                           |
| **Question**  | What is the expected approach for DCMS high availability in production — active-active or active-passive API server deployment? Is a global load balancer (multi-region failover) required, or is single-region HA sufficient? |
| **Raised By** | Requirement Agent                                                                                |
| **Date**      | 2026-06-05                                                                                       |
| **Status**    | **Open**                                                                                         |
| **Resolution / Notes** | Escalated to Senior Architect and CTO for resolution in Phase 1. The 99.9% uptime SLA (NFR-A-001) can be met with active-active within a single region (3-node API cluster + PostgreSQL primary-replica). Multi-region failover would achieve 99.95%+ but significantly increases infrastructure cost and operational complexity. Decision required before infrastructure architecture is finalized. Target resolution: 2026-07-05 via ADR-004. |

