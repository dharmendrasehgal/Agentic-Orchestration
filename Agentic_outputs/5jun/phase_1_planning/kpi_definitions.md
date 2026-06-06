# KPI Definitions
## Generic Docker Container Management System (DCMS)

| Field         | Value                                      |
|---------------|--------------------------------------------|
| Document ID   | PM-KPI-DCMS-001                            |
| Version       | 1.0.0                                      |
| Status        | Approved                                   |
| Date          | 2026-06-05                                 |
| Author        | Product Manager Agent                      |
| Parent BRD    | BRD-DCMS-001                               |
| Parent NFR    | NFR-DCMS-001                               |
| Review Cycle  | Monthly (operational KPIs); Quarterly (business KPIs) |

---

## Table of Contents

1. [KPI Framework Overview](#1-kpi-framework-overview)
2. [Product Adoption KPIs](#2-product-adoption-kpis-kpi-001--kpi-004)
3. [Performance KPIs](#3-performance-kpis-kpi-005--kpi-008)
4. [Reliability KPIs](#4-reliability-kpis-kpi-009--kpi-011)
5. [Security KPIs](#5-security-kpis-kpi-012--kpi-014)
6. [Developer Experience KPIs](#6-developer-experience-kpis-kpi-015--kpi-016)
7. [Business KPIs](#7-business-kpis-kpi-017--kpi-018)
8. [KPI Quick Reference Table](#8-kpi-quick-reference-table)

---

## 1. KPI Framework Overview

### Purpose

This document defines the 18 KPIs used to measure the DCMS platform's success across six dimensions: product adoption, technical performance, reliability, security posture, developer experience, and business impact. Each KPI is owned by a specific function, reviewed at a defined cadence, and linked to the business objectives (BO-001 through BO-006) established in BRD-DCMS-001.

### KPI Categories and Count

| Category              | KPI Count | KPI-IDs            | Primary Business Objective |
|-----------------------|-----------|--------------------|---------------------------|
| Product Adoption      | 4         | KPI-001 – KPI-004  | BO-001, BO-003, BO-005    |
| Performance           | 4         | KPI-005 – KPI-008  | BO-001, NFR-P-001, NFR-P-010 |
| Reliability           | 3         | KPI-009 – KPI-011  | BO-002, NFR-A-001          |
| Security              | 3         | KPI-012 – KPI-014  | BO-004, BO-006, NFR-C-002  |
| Developer Experience  | 2         | KPI-015 – KPI-016  | BO-001, BO-005             |
| Business              | 2         | KPI-017 – KPI-018  | BO-002, BO-005             |

### Baseline Measurement Start Date

All KPIs begin baseline collection on the v1.0 GA date: **2026-09-30**. Pre-GA staging data may be used for target calibration but not for official reporting.

### Data Sources Glossary

| Source              | Description                                                              |
|---------------------|--------------------------------------------------------------------------|
| API Telemetry       | Prometheus metrics from DCMS API server (`/metrics` endpoint)            |
| DB Query            | Direct SQL queries against PostgreSQL operational database               |
| Audit Log           | Append-only `audit_log` table in PostgreSQL                              |
| Victoria Metrics    | Time-series metrics store for host/container metrics; queried via PromQL |
| Loki                | Log aggregation store; queried via LogQL                                 |
| Uptime Monitor      | External uptime monitoring (UptimeRobot or Pingdom)                      |
| User Feedback       | Quarterly NPS survey delivered via in-app prompt                         |
| Ticketing System    | JIRA or equivalent issue tracker for DevOps ticket volume                |

---

## 2. Product Adoption KPIs (KPI-001 – KPI-004)

---

### KPI-001 — Weekly Active Users (WAU)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-001                                                                             |
| Name               | Weekly Active Users                                                                 |
| Category           | Product Adoption                                                                    |
| Description        | The count of distinct authenticated users who performed at least one action (API call or UI interaction that generated an API call) in a rolling 7-day window. Measures platform stickiness and user engagement across all personas (Admin, Operator, Developer, Viewer, Security Auditor). |
| Formula / Measurement | `COUNT(DISTINCT actor_id) FROM audit_log WHERE created_at >= NOW() - INTERVAL '7 days'` — executed as a daily snapshot and stored in a `kpi_snapshots` reporting table. |
| Target             | v1.0 launch (Week 4 post-GA): ≥ 20 WAU; v1.0 steady state (Month 3 post-GA): ≥ 50 WAU |
| Data Source        | Audit Log (PostgreSQL)                                                              |
| Review Frequency   | Weekly — reviewed every Monday in the platform operations stand-up                  |
| Owner              | Product Manager                                                                     |
| Business Objective | BO-003 (centralize visibility), BO-005 (self-service adoption)                      |
| Alert Threshold    | Week-over-week WAU decline ≥ 20% triggers a product adoption review               |

---

### KPI-002 — Container Deployment Volume (Weekly)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-002                                                                             |
| Name               | Weekly Container Deployments via DCMS                                               |
| Category           | Product Adoption                                                                    |
| Description        | The total count of `container.create` + `container.start` pairs recorded in the audit log within a rolling 7-day window. Each successful container deployment (create followed by start within 5 minutes) counts as 1 deployment. Tracks whether teams are shifting from manual CLI-based workflows to DCMS for their container operations. |
| Formula / Measurement | `COUNT(*) FROM audit_log WHERE action = 'container.start' AND created_at >= NOW() - INTERVAL '7 days'` — weekly snapshot. Cross-referenced against estimated total container deployments from the organization's CI/CD pipeline event log to derive the DCMS adoption share. |
| Target             | Month 1 post-GA: ≥ 50 deployments/week; Month 6 post-GA: ≥ 200 deployments/week; DCMS share of all container deployments ≥ 70% by Month 6 |
| Data Source        | Audit Log (PostgreSQL), CI/CD pipeline event log (for total denominator)            |
| Review Frequency   | Weekly                                                                              |
| Owner              | Product Manager                                                                     |
| Business Objective | BO-001 (deployment velocity), BO-003 (centralization)                               |
| Alert Threshold    | Week-over-week volume decline ≥ 30% triggers investigation                         |

---

### KPI-003 — Namespace Self-Service Adoption Rate

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-003                                                                             |
| Name               | Developer Self-Service Deployment Rate                                              |
| Category           | Product Adoption                                                                    |
| Description        | The percentage of container deployments in the `dev` and `staging` namespaces that are initiated by a user with the Developer or Operator role (scoped to that namespace), without a corresponding DevOps-escalation ticket in the ticketing system. This KPI directly measures BO-005: reducing DevOps ticket volume for container management. |
| Formula / Measurement | `Self-service deployments = COUNT(container.start events in dev/staging NS where actor_role IN ('operator', 'admin') and actor scoped to that NS) / COUNT(total container.start events in dev/staging NS) × 100`. DevOps escalation rate cross-referenced monthly against ticketing system query for tickets tagged "container-management". |
| Target             | Month 3 post-GA: ≥ 60% self-service rate; Month 6 post-GA: ≥ 80% self-service rate |
| Data Source        | Audit Log (actor role + namespace from audit entry), Ticketing System               |
| Review Frequency   | Monthly                                                                             |
| Owner              | Product Manager / DevOps Lead                                                       |
| Business Objective | BO-005 (self-service enablement)                                                    |
| Alert Threshold    | Self-service rate drops below 50% for two consecutive months → process review       |

---

### KPI-004 — API Integration Adoption (Active API Keys)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-004                                                                             |
| Name               | Active API Key Integrations (30-day active)                                         |
| Category           | Product Adoption                                                                    |
| Description        | The count of distinct named API keys that have made at least one successful API call within the past 30 days. Measures CI/CD pipeline and tooling integration adoption — a proxy for how deeply DCMS is embedded in automation workflows beyond direct human use. A key is considered "active" if it appears in the audit log with outcome = `success` in the window. |
| Formula / Measurement | `COUNT(DISTINCT api_key_id) FROM audit_log WHERE auth_method = 'api_key' AND created_at >= NOW() - INTERVAL '30 days' AND outcome = 'success'` |
| Target             | Month 1 post-GA: ≥ 5 active integrations; Month 6 post-GA: ≥ 20 active integrations |
| Data Source        | Audit Log (PostgreSQL)                                                              |
| Review Frequency   | Monthly                                                                             |
| Owner              | Product Manager / DevOps Lead                                                       |
| Business Objective | BO-001 (pipeline automation), BO-003                                                |
| Alert Threshold    | More than 30% of previously active keys go dormant in a single month → outreach to integration owners |

---

## 3. Performance KPIs (KPI-005 – KPI-008)

---

### KPI-005 — API Read Endpoint Latency (p95)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-005                                                                             |
| Name               | API Read Endpoint p95 Latency                                                       |
| Category           | Performance                                                                         |
| Description        | The 95th percentile response time (wall-clock time from request receipt to response sent) for all GET (read) API endpoints, measured as a rolling 5-minute window during production operating hours. Covers endpoints including container list, container detail, image list, log search, metrics query, and audit log search. Excludes health check (`/api/v1/health`) from the percentile calculation. |
| Formula / Measurement | PromQL: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{method="GET", status!~"5.."}[5m])) by (le))` evaluated on the DCMS API server Prometheus metrics. Stored as a time series in Victoria Metrics. |
| Target             | p95 ≤ 300ms under normal load (≤ 200 concurrent users); p95 ≤ 500ms under peak load (up to 400 concurrent users) |
| Data Source        | API Telemetry (Prometheus histogram via Victoria Metrics)                           |
| Review Frequency   | Continuous (real-time dashboard); formal review Weekly                              |
| Owner              | Engineering Lead                                                                    |
| Business Objective | BO-001 (fast deployment experience), NFR-P-001                                      |
| Alert Threshold    | p95 > 300ms for any continuous 5-minute window → page on-call engineer              |

---

### KPI-006 — API Write Endpoint Latency (p95)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-006                                                                             |
| Name               | API Write Endpoint p95 Latency                                                      |
| Category           | Performance                                                                         |
| Description        | The 95th percentile response time for all state-changing (POST, PUT, PATCH, DELETE) API endpoints, measured as a rolling 5-minute window. This includes container create, start, stop, kill, remove; image pull; network create/delete; volume create/delete; user create; role assignment; and service scale. This metric is distinct from KPI-005 because write operations involve Docker Engine round-trips via the DCMS agent, making their latency profile fundamentally different from database reads. |
| Formula / Measurement | PromQL: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{method=~"POST|PUT|PATCH|DELETE", status!~"5.."}[5m])) by (le))` |
| Target             | p95 ≤ 500ms for synchronous write operations (API acknowledgment to Docker Engine); p95 ≤ 2000ms for operations that include Docker Engine execution (start, stop, restart) |
| Data Source        | API Telemetry (Prometheus histogram via Victoria Metrics)                           |
| Review Frequency   | Continuous (real-time dashboard); formal review Weekly                              |
| Owner              | Engineering Lead                                                                    |
| Business Objective | BO-001 (fast deployment), NFR-P-002                                                 |
| Alert Threshold    | p95 > 500ms for synchronous writes for any continuous 5-minute window → page on-call |

---

### KPI-007 — Dashboard Initial Page Load (LCP)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-007                                                                             |
| Name               | Dashboard Largest Contentful Paint (LCP)                                            |
| Category           | Performance                                                                         |
| Description        | The Largest Contentful Paint time for the primary cluster overview dashboard page (`/dashboard`), measured from a simulated standard broadband connection (20 Mbps download, 5 ms RTT) in a headless Chromium browser. LCP is the Core Web Vitals metric that best reflects the user's perception of when the page becomes useful. A slow dashboard undermines confidence in the platform, especially during incident response. |
| Formula / Measurement | Lighthouse CI test run on every deployment to staging: `lighthouse https://staging.dcms.internal/dashboard --output json`. LCP value extracted from `audits['largest-contentful-paint'].numericValue` (milliseconds). Also measured in production via Chrome User Experience Report (CrUX) if traffic is sufficient. |
| Target             | LCP ≤ 2500ms (Lighthouse CI on every deployment); production p75 LCP ≤ 2000ms     |
| Data Source        | Lighthouse CI (CI pipeline); CrUX data (production sampling)                        |
| Review Frequency   | Per-deployment (CI gate); weekly review of production trend                         |
| Owner              | Frontend Lead                                                                       |
| Business Objective | BO-001 (operator efficiency), NFR-P-005                                             |
| Alert Threshold    | LCP > 2500ms on a Lighthouse CI run blocks deployment to production                 |

---

### KPI-008 — Log Search Query Response Time (p95)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-008                                                                             |
| Name               | Log Search p95 Response Time                                                        |
| Category           | Performance                                                                         |
| Description        | The 95th percentile end-to-end response time for `GET /api/v1/logs` search queries, measured from the time the API server receives the request to the time the first page of results is returned to the client. Queries spanning ≤ 30 days of log data are the primary target. This KPI reflects the usability of the log search feature during incident diagnosis — the use case where performance matters most. |
| Formula / Measurement | Instrumented via OpenTelemetry span: `dcms.log_search.duration_ms` histogram. PromQL: `histogram_quantile(0.95, sum(rate(dcms_log_search_duration_ms_bucket[5m])) by (le))`. Measured only for queries with `time_range_days ≤ 30`. |
| Target             | p95 ≤ 5000ms for queries spanning ≤ 30 days of data; p95 ≤ 10000ms for queries spanning 31–90 days |
| Data Source        | API Telemetry (OpenTelemetry → Prometheus → Victoria Metrics)                       |
| Review Frequency   | Weekly; reviewed after each Loki upgrade or log volume milestone                   |
| Owner              | Platform Engineer / Engineering Lead                                                |
| Business Objective | BO-002 (faster incident diagnosis), NFR-P-009                                       |
| Alert Threshold    | p95 > 5000ms sustained for 15 minutes → investigate Loki query performance          |

---

## 4. Reliability KPIs (KPI-009 – KPI-011)

---

### KPI-009 — Platform Uptime (Rolling 30-Day)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-009                                                                             |
| Name               | DCMS API and UI Availability (Uptime)                                               |
| Category           | Reliability                                                                         |
| Description        | The percentage of time the DCMS API server and web UI are available and returning non-5xx responses to synthetic health checks, measured over a rolling 30-day window. Availability is measured by an external uptime monitor that probes `GET /api/v1/health` from outside the production network every 60 seconds. Downtime is counted from the first failed probe until the first successful probe after recovery. Planned maintenance windows (pre-announced ≥ 72 hours in advance) are excluded from downtime calculation after Admin confirmation in the change management system. |
| Formula / Measurement | `Uptime % = (Total minutes in window - Downtime minutes) / Total minutes in window × 100`. Reported by UptimeRobot or Pingdom external monitor. Monthly report generated from monitor dashboard export. |
| Target             | ≥ 99.9% per rolling 30-day window (≤ 43.8 minutes of unplanned downtime per month) |
| Data Source        | Uptime Monitor (UptimeRobot / Pingdom)                                              |
| Review Frequency   | Monthly (formal SLA review); real-time alerting on downtime event                  |
| Owner              | Engineering Lead / DevOps Lead                                                      |
| Business Objective | BO-002 (reduce incidents), BO-003 (always-on visibility), NFR-A-001               |
| Alert Threshold    | Any downtime event > 5 minutes → immediate page; monthly target breached → incident post-mortem required |

---

### KPI-010 — Mean Time to Recovery (MTTR)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-010                                                                             |
| Name               | Mean Time to Recovery (MTTR)                                                        |
| Category           | Reliability                                                                         |
| Description        | The average time elapsed between the first detection of a DCMS platform failure (P1 or P2 severity, as defined in the incident response runbook) and the confirmation of full service restoration. Detection time is the timestamp of the first alert fired by the uptime monitor or the Alertmanager. Resolution time is the timestamp of the "all clear" update posted to the incident channel. Calculated as the arithmetic mean of all incidents in the measurement period. |
| Formula / Measurement | `MTTR = SUM(resolution_time - detection_time for all P1/P2 incidents) / COUNT(P1/P2 incidents)`. Incident duration recorded in the incident tracking log (PagerDuty timeline or equivalent). Monthly report generated from incident tracker. |
| Target             | MTTR ≤ 15 minutes for P1 incidents (complete API/UI outage); MTTR ≤ 30 minutes for P2 incidents (significant feature degradation) |
| Data Source        | Incident tracking log (PagerDuty / Opsgenie), Alertmanager timestamps               |
| Review Frequency   | Monthly; reviewed in monthly reliability review meeting                             |
| Owner              | Engineering Lead / On-Call Rotation Lead                                            |
| Business Objective | BO-002 (reduce production impact), NFR-R-002                                        |
| Alert Threshold    | Single P1 incident MTTR > 30 minutes → blameless post-mortem required within 5 business days |

---

### KPI-011 — Container Incident Prevention Rate

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-011                                                                             |
| Name               | Container-Related Production Incident Prevention Rate                               |
| Category           | Reliability                                                                         |
| Description        | The percentage reduction in the number of production incidents whose root cause is attributed to container resource exhaustion, crash loops, undetected unhealthy containers, or misconfiguration — compared to the 12-month pre-DCMS baseline. This is the primary business-level measurement of BO-002. An incident is "container-related" if the post-mortem root cause analysis tag includes any of: `container-oom`, `crash-loop`, `resource-limit`, `image-config`, `port-conflict`, `unhealthy-container`. |
| Formula / Measurement | `Prevention Rate = (1 - (container_incidents_post_launch / container_incidents_baseline_annualized)) × 100`. Baseline: container-related incident count for the 12 months prior to DCMS GA (sourced from the ticketing system pre-launch). Post-launch count: rolling 12-month count from incident tracker, tagged by root cause. |
| Target             | 40% reduction in container-related production incidents within 12 months of GA (by 2027-09-30); 25% reduction within 6 months of GA |
| Data Source        | Incident tracker (JIRA / ServiceNow) with root cause tags                            |
| Review Frequency   | Quarterly                                                                           |
| Owner              | DevOps Lead / Product Manager                                                       |
| Business Objective | BO-002 (reduce unplanned incidents)                                                 |
| Alert Threshold    | Quarter-over-quarter increase in container-related incidents → alert rule review and gap analysis |

---

## 5. Security KPIs (KPI-012 – KPI-014)

---

### KPI-012 — Audit Log Coverage Rate

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-012                                                                             |
| Name               | State-Changing Operation Audit Log Coverage                                         |
| Category           | Security                                                                            |
| Description        | The percentage of state-changing API operations (POST, PUT, PATCH, DELETE that result in HTTP 2xx or 4xx with side effects) for which a corresponding audit log entry exists in the `audit_log` table. 100% coverage is a SOC 2 CC7.2 requirement. This KPI is measured by comparing the count of state-changing API requests recorded in the API access log (Nginx / Envoy access log) against the count of audit log entries for the same time window. |
| Formula / Measurement | `Coverage = COUNT(audit_log entries in window) / COUNT(state-changing API responses 2xx/4xx with body in access log in same window) × 100`. Reconciliation job runs nightly; discrepancies logged as security findings. |
| Target             | 100.0% at all times (zero tolerance for gaps); any discrepancy ≥ 1 triggers a P1 security alert |
| Data Source        | Audit Log (PostgreSQL), API server access log (Nginx / Envoy)                       |
| Review Frequency   | Daily (automated reconciliation job); monthly audit by Security Lead                |
| Owner              | Security Lead / Engineering Lead                                                    |
| Business Objective | BO-004 (audit compliance), NFR-SEC-013, NFR-C-002                                  |
| Alert Threshold    | Any audit coverage < 100% for a 1-hour window → P1 security incident; root cause investigation within 4 hours |

---

### KPI-013 — CRITICAL CVE Production Deployment Block Rate

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-013                                                                             |
| Name               | Critical CVE Production Deployment Block Rate                                       |
| Category           | Security                                                                            |
| Description        | The percentage of container deployment attempts to the `prod` namespace that are correctly blocked by the CVE enforcement middleware when the target image contains at least one CRITICAL severity CVE. Measures the effectiveness and reliability of the Trivy-based image security gate. A "block" is recorded in the audit log as `container.create outcome=rejected reason=cve_policy`. A "miss" would be a container running in `prod` with a CRITICAL CVE — detectable by cross-referencing running container image digests against scan results. |
| Formula / Measurement | `Block Rate = COUNT(audit_log.action='container.create' AND outcome='rejected' AND reason='cve_policy' AND namespace='prod') / COUNT(container.create attempts to prod namespace with image having CRITICAL CVEs) × 100`. Miss detection: nightly job queries running containers in `prod` and cross-checks their image digest against `image_scan_results` table for CRITICAL findings. |
| Target             | 100% block rate (zero CRITICAL CVE containers permitted in `prod` namespace); zero misses |
| Data Source        | Audit Log (PostgreSQL), `image_scan_results` table, Docker Engine container list     |
| Review Frequency   | Daily (automated miss detection job); monthly security review                       |
| Owner              | Security Lead / Platform Engineer                                                   |
| Business Objective | BO-006 (image security), NFR-SEC-015                                               |
| Alert Threshold    | Any miss detected (CRITICAL CVE container running in `prod`) → P0 security incident; immediate quarantine |

---

### KPI-014 — SOC 2 Control Evidence Completeness

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-014                                                                             |
| Name               | SOC 2 Type II Control Evidence Completeness                                         |
| Category           | Security                                                                            |
| Description        | The percentage of SOC 2 Trust Service Criteria (TSC) controls mapped to the DCMS platform that have at least 12 months of continuous evidence collected (audit log exports, access review records, scan reports, change management records). This KPI tracks the organization's readiness for the SOC 2 Type II external audit. It is assessed quarterly against the control list defined in NFR-C-001 through NFR-C-006. |
| Formula / Measurement | Control list: 12 SOC 2 controls mapped to DCMS (CC6.1–CC6.3, CC7.2–CC7.4, CC8.1, CC9.2, CC6.7 from NFR-C-001 to NFR-C-006). Each control scored: 0 = no evidence; 1 = partial evidence (< 12 months); 2 = complete evidence (≥ 12 months continuous). `Completeness % = SUM(scores) / (12 controls × 2) × 100`. |
| Target             | Q2 2027 (6 months post-GA): ≥ 50% completeness (6 months of evidence); Q1 2028 (after 12-month evidence period): 100% completeness |
| Data Source        | Compliance tracker (spreadsheet or GRC tool), Audit Log exports, RBAC review records, CI/CD scan reports |
| Review Frequency   | Quarterly                                                                           |
| Owner              | Compliance Lead / Security Lead                                                     |
| Business Objective | BO-004 (SOC 2 readiness), NFR-C-001 through NFR-C-006                              |
| Alert Threshold    | Completeness score drops or a previously collected control loses evidence continuity → compliance remediation sprint |

---

## 6. Developer Experience KPIs (KPI-015 – KPI-016)

---

### KPI-015 — Container Deployment Lead Time (p95)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-015                                                                             |
| Name               | Container Deployment Lead Time (Image Pull to Running State, p95)                  |
| Category           | Developer Experience                                                                |
| Description        | The 95th percentile wall-clock time from the moment an operator initiates an image pull (or confirms the image is already local) to the moment the container transitions to `running` state as reported by the DCMS API. This is the primary measurement of BO-001 (reduce MTTD from 18 minutes to 3 minutes). Measured end-to-end including: image pull time (if required), Trivy scan time, container create, and container start. Excludes time the operator spends filling in the deployment form (UI interaction time). |
| Formula / Measurement | Measured via audit log timestamps: `container_running_at - image_pull_started_at` for each deployment event. Pull start time: `audit_log.created_at WHERE action='image.pull' AND status='started'`. Running time: `audit_log.created_at WHERE action='container.start' AND outcome='success'`. PromQL for p95: `histogram_quantile(0.95, sum(rate(dcms_deployment_lead_time_seconds_bucket[24h])) by (le))`. Image pre-cached deployments (no pull required) tracked separately as a sub-metric. |
| Target             | p95 ≤ 180 seconds (3 minutes) for images already cached on the target host; p95 ≤ 300 seconds (5 minutes) for images requiring a pull of ≤ 1 GB |
| Data Source        | Audit Log (PostgreSQL), API Telemetry (OpenTelemetry histogram)                     |
| Review Frequency   | Weekly                                                                              |
| Owner              | Product Manager / Engineering Lead                                                  |
| Business Objective | BO-001 (3-minute deployment target)                                                 |
| Alert Threshold    | Weekly p95 lead time exceeds 300 seconds for two consecutive weeks → performance investigation |

---

### KPI-016 — Net Promoter Score (NPS) — Platform Users

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-016                                                                             |
| Name               | Net Promoter Score (In-App Survey)                                                  |
| Category           | Developer Experience                                                                |
| Description        | The Net Promoter Score derived from an in-app quarterly survey presented to active users (WAU ≥ 2 in the 30 days before survey) asking: "On a scale of 0–10, how likely are you to recommend DCMS to a colleague managing containerized workloads?" NPS = % Promoters (9–10) − % Detractors (0–6). A minimum of 20 valid responses is required for a reportable NPS in any quarter. Open-text follow-up collected for scores ≤ 6 to identify improvement areas. |
| Formula / Measurement | `NPS = (COUNT(score >= 9) / COUNT(total responses) - COUNT(score <= 6) / COUNT(total responses)) × 100`. Survey distributed via in-app modal triggered after a user's 5th login in a quarter. Results stored in `nps_responses` table. |
| Target             | Q1 post-GA (Month 3): NPS ≥ +20; Month 12 post-GA: NPS ≥ +40                       |
| Data Source        | In-app survey responses (`nps_responses` table in PostgreSQL)                       |
| Review Frequency   | Quarterly                                                                           |
| Owner              | Product Manager                                                                     |
| Business Objective | BO-001 (operator satisfaction), BO-005 (developer self-service satisfaction)        |
| Alert Threshold    | NPS < 0 in any quarter → user research interviews scheduled within 2 weeks; product backlog re-prioritization meeting convened |

---

## 7. Business KPIs (KPI-017 – KPI-018)

---

### KPI-017 — DevOps Ticket Volume Reduction (Container Management)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-017                                                                             |
| Name               | DevOps Container Management Ticket Volume Reduction                                 |
| Category           | Business                                                                            |
| Description        | The percentage reduction in the number of tickets filed in the organization's ticketing system (JIRA / ServiceNow) that request a DevOps engineer to perform a container management action on behalf of a developer or other team member. These tickets are identifiable by component tag "container-management" or equivalent. The pre-DCMS 12-month baseline count is established before GA and used as the denominator. This KPI directly measures BO-005: "Reduce DevOps ticket volume related to container management by 50% within 6 months of launch." |
| Formula / Measurement | `Reduction % = (1 - (post_launch_tickets_per_month_rolling_avg / pre_launch_baseline_monthly_avg)) × 100`. Baseline: average monthly ticket count tagged "container-management" for the 12 months prior to GA (sourced from ticketing system). Post-launch: monthly count from ticketing system query filtered by same tag. Rolling 3-month average used to smooth variance. |
| Target             | Month 3 post-GA: ≥ 30% reduction; Month 6 post-GA: ≥ 50% reduction; Month 12 post-GA: ≥ 60% reduction |
| Data Source        | Ticketing System (JIRA / ServiceNow) query filtered by "container-management" tag    |
| Review Frequency   | Monthly                                                                             |
| Owner              | DevOps Lead / Product Manager                                                       |
| Business Objective | BO-005 (self-service, reduced toil), BO-001 (velocity)                              |
| Alert Threshold    | Month-over-month ticket volume increases ≥ 20% for two consecutive months → root cause analysis (new team onboarding? missing self-service workflow?) |

---

### KPI-018 — Time Saved Per Deployment (Baseline vs. DCMS)

| Field              | Value                                                                               |
|--------------------|-------------------------------------------------------------------------------------|
| KPI-ID             | KPI-018                                                                             |
| Name               | Average Time Saved Per Container Deployment vs. Pre-DCMS Baseline                  |
| Category           | Business                                                                            |
| Description        | The average time saved per container deployment when using DCMS compared to the pre-DCMS manual CLI workflow. The pre-DCMS baseline is 18 minutes per deployment (BRD-DCMS-001, BO-001 baseline estimate), validated by a time-and-motion study conducted before GA. Post-GA, DCMS deployment lead time is measured by KPI-015. The delta (baseline − KPI-015 actual p50 lead time) represents time saved per deployment. Annualized savings (in engineering-hours) is computed by multiplying time-saved × weekly deployment volume (KPI-002) × 52 weeks. |
| Formula / Measurement | `Time saved per deployment (minutes) = Baseline p50 lead time (minutes) - KPI-015 p50 lead time (minutes)`. Annualized engineering-hours saved: `Time saved (hours) × KPI-002 weekly deployments × 52`. Reported in a quarterly business value report to engineering leadership. |
| Target             | ≥ 15 minutes saved per deployment (from 18-minute baseline to ≤ 3-minute DCMS p50); annualized saving ≥ 650 engineering-hours at 50 deployments/week by Month 6 |
| Data Source        | KPI-015 (deployment lead time), KPI-002 (weekly deployment volume), Pre-GA time-and-motion study records |
| Review Frequency   | Quarterly                                                                           |
| Owner              | Product Manager / Engineering Leadership                                            |
| Business Objective | BO-001 (deployment velocity ROI)                                                    |
| Alert Threshold    | p50 DCMS lead time exceeds 8 minutes for any rolling 4-week period → performance and UX review |

---

## 8. KPI Quick Reference Table

| KPI-ID  | Name                                          | Category             | Target                                      | Data Source            | Review Frequency | Owner               |
|---------|-----------------------------------------------|----------------------|---------------------------------------------|------------------------|-----------------|---------------------|
| KPI-001 | Weekly Active Users                           | Product Adoption     | ≥ 50 WAU by Month 3 post-GA                | Audit Log              | Weekly           | Product Manager     |
| KPI-002 | Weekly Container Deployments via DCMS         | Product Adoption     | ≥ 200/week by Month 6; ≥ 70% share         | Audit Log, CI/CD log   | Weekly           | Product Manager     |
| KPI-003 | Developer Self-Service Deployment Rate        | Product Adoption     | ≥ 80% self-service in dev/staging by Month 6 | Audit Log, Ticketing | Monthly          | PM / DevOps Lead    |
| KPI-004 | Active API Key Integrations (30-day)          | Product Adoption     | ≥ 20 active integrations by Month 6         | Audit Log              | Monthly          | PM / DevOps Lead    |
| KPI-005 | API Read Endpoint p95 Latency                 | Performance          | p95 ≤ 300ms (normal load)                  | API Telemetry          | Continuous / Weekly | Engineering Lead |
| KPI-006 | API Write Endpoint p95 Latency                | Performance          | p95 ≤ 500ms (synchronous writes)           | API Telemetry          | Continuous / Weekly | Engineering Lead |
| KPI-007 | Dashboard LCP (Largest Contentful Paint)      | Performance          | LCP ≤ 2500ms (Lighthouse CI)               | Lighthouse CI, CrUX    | Per-deploy / Weekly | Frontend Lead    |
| KPI-008 | Log Search p95 Response Time                  | Performance          | p95 ≤ 5000ms (≤ 30 days query range)       | API Telemetry (OTel)   | Weekly           | Platform Engineer   |
| KPI-009 | Platform Uptime (Rolling 30-Day)              | Reliability          | ≥ 99.9% per rolling 30-day window          | Uptime Monitor         | Monthly          | Engineering Lead    |
| KPI-010 | Mean Time to Recovery (MTTR)                  | Reliability          | MTTR ≤ 15 min (P1); ≤ 30 min (P2)         | Incident Tracker       | Monthly          | Engineering Lead    |
| KPI-011 | Container Incident Prevention Rate            | Reliability          | 40% reduction in 12 months post-GA         | Incident Tracker       | Quarterly        | DevOps Lead / PM    |
| KPI-012 | Audit Log Coverage Rate                       | Security             | 100% at all times                           | Audit Log, Access Log  | Daily / Monthly  | Security Lead       |
| KPI-013 | Critical CVE Production Deployment Block Rate | Security             | 100% block rate; zero misses                | Audit Log, Scan Results | Daily / Monthly | Security Lead       |
| KPI-014 | SOC 2 Control Evidence Completeness           | Security             | 100% by Q1 2028 (12-month evidence period)  | Compliance Tracker     | Quarterly        | Compliance Lead     |
| KPI-015 | Container Deployment Lead Time (p95)          | Developer Experience | p95 ≤ 180s (cached); ≤ 300s (pull + scan)  | Audit Log, OTel        | Weekly           | PM / Engineering Lead |
| KPI-016 | Net Promoter Score (In-App Survey)            | Developer Experience | NPS ≥ +20 (Month 3); ≥ +40 (Month 12)     | In-App Survey DB       | Quarterly        | Product Manager     |
| KPI-017 | DevOps Ticket Volume Reduction                | Business             | ≥ 50% reduction by Month 6 post-GA         | Ticketing System       | Monthly          | DevOps Lead / PM    |
| KPI-018 | Time Saved Per Deployment vs. Baseline        | Business             | ≥ 15 min saved/deployment; ≥ 650 eng-hrs/year annualized | KPI-015, KPI-002, Baseline study | Quarterly | Product Manager |
