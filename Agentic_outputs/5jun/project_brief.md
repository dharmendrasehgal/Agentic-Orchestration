# Project Brief — Generic Docker Container Management System (DCMS)

| Field | Value |
|-------|-------|
| Document ID | DCMS-BRIEF-001 |
| Version | 1.0.0 |
| Created | 2026-06-06 |
| Prepared By | software_factory_orchestrator |
| Status | Approved — handed to requirement_agent (Phase 0) |

---

## Raw Requirements (Input)

> Generic Docker container management systems require a balance of host hardware, foundational software,
> and management features to successfully deploy and scale containerized applications. The system must handle:
> - Host hardware resource management (CPU, memory, disk, network)
> - Foundational software stack (Docker Engine, container runtime, orchestration)
> - Container lifecycle management, image registry, networking, volumes, health monitoring, logging,
>   user access control, and a web-based dashboard UI

**Technology preferences:** React frontend, Node.js/Go backend, PostgreSQL for metadata, Redis for caching,
Docker/Kubernetes for orchestration.

**Target environments:** dev / staging / production.

---

## Normalized Requirements (Orchestrator Output)

### System Name
Generic Docker Container Management System (DCMS)

### Core Mission
Provide a unified web-based platform for deploying, monitoring, scaling, and managing containerized
applications across single hosts and multi-host Docker Swarm clusters.

### Functional Domains

| Domain | Scope |
|--------|-------|
| Container Lifecycle | Create, start, stop, pause, restart, remove; live logs; exec; stats |
| Image Management | Pull, push, tag, delete; CVE vulnerability scanning (Trivy) |
| Networking | Bridge/overlay/macvlan networks; DNS; port mapping |
| Storage | Named volumes, bind mounts; usage tracking |
| Monitoring | CPU/memory/disk/network metrics; Prometheus + Grafana; alerting |
| Logging | Centralized stdout/stderr aggregation (Loki); search; real-time stream |
| Access Control | RBAC: admin/operator/viewer; JWT auth; OIDC SSO; API keys; audit log |
| Dashboard UI | React SPA; real-time SSE updates; WCAG 2.1 AA |
| REST API | OpenAPI 3.0; 29 endpoints; Server-Sent Events for streaming |
| Cluster Management | Multi-host Docker Swarm; node lifecycle; drain/promote |

### Approved Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5.4, Vite 5, TailwindCSS 3, React Query 5, Zustand 4 |
| Backend | Go 1.22, Gin 1.9, GORM 2.0, Moby SDK 26, gRPC + protobuf |
| Database | PostgreSQL 16 (metadata), Redis 7 (cache + pub/sub) |
| Orchestration | Docker Swarm v1 (Kubernetes planned for v2) |
| Observability | Prometheus, Grafana, Loki, cAdvisor, OpenTelemetry, Jaeger |
| Security | Trivy (CVE scanning), HashiCorp Vault (secrets), Let's Encrypt |
| CI/CD | GitHub Actions, Docker BuildKit, cosign (image signing) |

### Key NFRs

| Category | Target |
|----------|--------|
| Availability | 99.9% uptime; RTO 30 min; RPO 5 min |
| Performance | API read p95 < 200ms; Dashboard LCP < 2.5s; 200 concurrent users |
| Scale | 500 containers/host; 100 hosts/cluster |
| Security | AES-256 at rest; TLS 1.3 in transit; mTLS for agent comms |
| Accessibility | WCAG 2.1 AA |
| Compliance | SOC 2 Type II readiness; GDPR Art. 17 erasure support |

### Delivery Target
- **v1.0.0 GA:** 2026-09-30
- **v1.5 Enhanced:** 2027-03-31
- **v2.0 Enterprise (Kubernetes):** 2027-09-30
