# DCMS Monitoring and Observability Design

**Version:** 1.0.0
**Status:** Approved
**Owner:** Platform Engineering / SRE Team
**Last Updated:** 2026-06-05

---

## 1. Metrics Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Hosts                                     │
│                                                                         │
│  ┌──────────────┐   ┌────────────────┐   ┌─────────────────────────┐  │
│  │  cAdvisor    │   │  node-exporter │   │  DCMS Agent (Go)        │  │
│  │ (per host)   │   │  (per host)    │   │  OpenTelemetry SDK      │  │
│  │              │   │                │   │  custom dcms_* metrics  │  │
│  └──────┬───────┘   └───────┬────────┘   └───────────┬─────────────┘  │
└─────────┼───────────────────┼────────────────────────┼────────────────┘
          │  /metrics (HTTP)  │  /metrics (HTTP)        │  /metrics (HTTP)
          │                   │                         │
┌─────────▼───────────────────▼─────────────────────────▼────────────────┐
│                         Prometheus                                       │
│   (scrape interval: 15s  |  retention: 15d  |  remote_write → Thanos)  │
└─────────────────────────────────────────────────────────────────────────┘
          │                         │                         │
          │  PromQL queries         │  alert evaluation       │  remote_write
          │                         │                         │
┌─────────▼──────────┐   ┌──────────▼──────────┐   ┌────────▼──────────┐
│     Grafana         │   │  Alertmanager        │   │  Thanos           │
│  (dashboards)      │   │  (routing, silences, │   │  (long-term store │
│                    │   │   deduplication)     │   │   S3 backend)     │
└────────────────────┘   └──────────┬───────────┘   └───────────────────┘
                                     │
                         ┌───────────▼───────────┐
                         │  Notification Service  │
                         │  (email, Slack, PD)   │
                         └───────────────────────┘
```

### 1.1 Component Responsibilities

| Component | Role | Deployment |
|-----------|------|------------|
| **cAdvisor** | Exports container CPU, memory, network, and block I/O metrics from the Docker daemon's cgroups | DaemonSet on every managed host; port 8080 |
| **node-exporter** | Exports host-level OS metrics (CPU, memory, disk, network, filesystem) | DaemonSet on every managed host; port 9100 |
| **DCMS Agent** | Lightweight Go binary on each host that relays Docker events to the backend and exposes custom DCMS application metrics via OpenTelemetry SDK | Systemd service on each host; port 9200 |
| **Prometheus** | Central scrape and evaluation engine; evaluates alerting rules; stores 15 days of raw metrics | Single replica (HA pair in production) in DCMS management cluster; port 9090 |
| **Thanos** | Long-term storage using remote_write to S3; enables global query view across multiple Prometheus instances | Sidecar on Prometheus pod + Querier; compactor runs nightly |
| **Alertmanager** | Receives alerts from Prometheus; deduplicates, groups, routes, and silences; forwards to notification-service | Single replica (3-node HA cluster in production); port 9093 |
| **Grafana** | Dashboards and ad-hoc PromQL exploration; data sources: Prometheus, Thanos, Loki, Jaeger | Single replica; port 3000 |

### 1.2 OpenTelemetry Integration

Each DCMS microservice initialises the OpenTelemetry Go SDK at startup:

```go
// Metrics provider (Prometheus exporter)
exporter, _ := prometheus.New()
provider := metric.NewMeterProvider(metric.WithReader(exporter))
otel.SetMeterProvider(provider)

// Tracer provider (Jaeger OTLP exporter)
traceExporter, _ := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpoint("jaeger-collector.monitoring.svc:4318"),
)
tracerProvider := sdktrace.NewTracerProvider(
    sdktrace.WithBatcher(traceExporter),
    sdktrace.WithSampler(sdktrace.TraceIDRatioBased(samplingRate)),
    sdktrace.WithResource(resource.NewWithAttributes(
        semconv.SchemaURL,
        semconv.ServiceNameKey.String(serviceName),
        semconv.ServiceVersionKey.String(version),
    )),
)
otel.SetTracerProvider(tracerProvider)
otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
    propagation.TraceContext{},
    propagation.Baggage{},
))
```

---

## 2. Custom Metrics per Service

### 2.1 container-service

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `dcms_containers_total` | Gauge | `status`, `namespace`, `host_id` | Current number of containers grouped by status and namespace |
| `dcms_container_start_duration_seconds` | Histogram | `namespace`, `host_id`, `result` (success/failure) | Time from POST /containers/{id}/start received to container status=running; buckets: 0.1, 0.5, 1, 2, 5, 10, 30s |
| `dcms_container_stop_duration_seconds` | Histogram | `namespace`, `host_id`, `result` | Time from stop request to status=exited |
| `dcms_container_create_duration_seconds` | Histogram | `host_id`, `result` | End-to-end container creation time including image resolution |
| `dcms_agent_connections_active` | Gauge | `host_id`, `host_name` | Number of active gRPC connections from managed host agents to container-service; 0 means agent is disconnected |
| `dcms_container_restarts_total` | Counter | `container_id`, `namespace`, `host_id` | Cumulative container restart count (incremented on each Docker restart event) |
| `dcms_exec_sessions_active` | Gauge | `host_id` | Currently open exec sessions |
| `dcms_sse_connections_active` | Gauge | `stream_type` (logs/stats) | Currently open SSE streaming connections |

### 2.2 image-service

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `dcms_image_pulls_total` | Counter | `registry`, `result` (success/failure/cancelled) | Total number of image pull operations |
| `dcms_image_pull_bytes_total` | Counter | `registry`, `image` | Total bytes transferred during image pulls |
| `dcms_scan_duration_seconds` | Histogram | `scanner`, `result` | Time taken to complete a vulnerability scan; buckets: 5, 15, 30, 60, 120, 300s |
| `dcms_scan_queue_depth` | Gauge | — | Number of image scans currently queued or in progress |
| `dcms_vulnerabilities_found_total` | Gauge | `severity` (CRITICAL/HIGH/MEDIUM/LOW/UNKNOWN), `scanner` | Current count of vulnerabilities across all scanned images, grouped by severity; updated after each scan completes |
| `dcms_images_total` | Gauge | `host_id`, `scan_status` | Total images tracked per host and scan status |
| `dcms_image_delete_total` | Counter | `result`, `host_id` | Image deletion operations |

### 2.3 api-gateway

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `dcms_http_requests_total` | Counter | `method`, `route` (normalised path), `status_code`, `service` | Total HTTP requests received by the gateway |
| `dcms_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency from first byte received to last byte sent; buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5s |
| `dcms_http_request_size_bytes` | Histogram | `method`, `route` | Size of incoming request bodies |
| `dcms_http_response_size_bytes` | Histogram | `method`, `route` | Size of outgoing response bodies |
| `dcms_gateway_upstream_errors_total` | Counter | `upstream_service`, `error_type` | Errors returned by upstream microservices |
| `dcms_rate_limit_hits_total` | Counter | `route`, `client_id` | Requests rejected by rate limiter |
| `dcms_active_connections` | Gauge | — | Currently open HTTP/2 connections to the gateway |

### 2.4 auth-service

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `dcms_auth_attempts_total` | Counter | `result` (success/failure/locked), `method` (password/refresh/mfa) | Total authentication attempts, broken down by outcome and method |
| `dcms_active_sessions` | Gauge | `org_id` | Number of currently valid (non-expired) sessions per organisation |
| `dcms_token_refresh_total` | Counter | `result` | Token refresh attempts and outcomes |
| `dcms_login_duration_seconds` | Histogram | `result` | End-to-end login request latency |
| `dcms_brute_force_lockouts_total` | Counter | `org_id` | Number of accounts locked due to brute-force detection |
| `dcms_jwt_issue_total` | Counter | `role`, `org_id` | JWTs issued by role and organisation |

### 2.5 monitor-service

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `dcms_alert_rules_total` | Gauge | `severity`, `org_id` | Total number of configured alert rules, grouped by severity |
| `dcms_alerts_firing_total` | Gauge | `severity`, `alert_name` | Currently firing alerts grouped by severity and rule name |
| `dcms_alert_notifications_sent_total` | Counter | `channel` (email/slack/pagerduty), `result` | Alert notifications dispatched |
| `dcms_alert_evaluation_duration_seconds` | Histogram | `rule_group` | Time to evaluate an alert rule group |
| `dcms_alertmanager_silences_active` | Gauge | — | Number of active Alertmanager silences |
| `dcms_notification_delivery_errors_total` | Counter | `channel`, `error_type` | Failed notification delivery attempts |

### 2.6 log-service

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `dcms_log_ingestion_rate` | Gauge | `host_id` | Current log lines per second being ingested from each host |
| `dcms_log_query_duration_seconds` | Histogram | `query_type` (search/stream/export) | Time to execute a log query against Loki; buckets: 0.1, 0.5, 1, 2, 5, 10, 30s |
| `dcms_log_ingestion_errors_total` | Counter | `error_type`, `host_id` | Failed log ingestion attempts (parse errors, network failures) |
| `dcms_loki_push_latency_seconds` | Histogram | — | Latency of pushing log batches to Loki |
| `dcms_log_entries_ingested_total` | Counter | `host_id`, `stream` (stdout/stderr) | Total log lines ingested since process start |
| `dcms_log_query_results_total` | Counter | — | Total log lines returned across all search queries |

---

## 3. Grafana Dashboards

### Dashboard 1: DCMS Platform Overview

**Purpose:** Single-pane view for on-call engineers to assess overall platform health at a glance.

**Panels:**

| Panel | Type | Query Summary |
|-------|------|---------------|
| Containers by Status | Pie chart | `sum by (status) (dcms_containers_total)` — shows running/stopped/restarting distribution |
| API Request Rate | Time series | `sum(rate(dcms_http_requests_total[2m]))` — total RPS across all routes |
| API Error Rate (%) | Stat + threshold colouring | `100 * sum(rate(dcms_http_requests_total{status_code=~"5.."}[2m])) / sum(rate(dcms_http_requests_total[2m]))` |
| API p95 Latency | Stat | `histogram_quantile(0.95, sum(rate(dcms_http_request_duration_seconds_bucket[5m])) by (le))` |
| Top 5 Containers by CPU | Table | Join cAdvisor `container_cpu_usage_seconds_total` with container name labels, sorted descending; shows container name, namespace, host, CPU% |
| Active Alerts by Severity | Bar gauge | `sum by (severity) (dcms_alerts_firing_total)` |
| Agent Connectivity | Table | `dcms_agent_connections_active` per host — highlights disconnected agents |
| Active SSE Connections | Stat | `sum(dcms_sse_connections_active)` |
| Recent Audit Events | Logs panel | Loki query `{job="dcms-audit"} | json | severity="CRITICAL"` |

**Variables:** `$namespace`, `$host_id`, `$time_range`

---

### Dashboard 2: Host Performance

**Purpose:** Drill into per-node resource utilisation to identify capacity issues and support capacity planning.

**Panels:**

| Panel | Type | Query Summary |
|-------|------|---------------|
| CPU Utilisation per Node | Time series (multi-line) | `1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m]))` |
| Memory Utilisation per Node | Time series | `1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)` by instance |
| Disk Usage per Node | Bar gauge | `1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})` |
| Network Receive Rate | Time series | `rate(node_network_receive_bytes_total{device!="lo"}[2m])` by instance |
| Network Transmit Rate | Time series | `rate(node_network_transmit_bytes_total{device!="lo"}[2m])` by instance |
| Disk I/O Read | Time series | `rate(node_disk_read_bytes_total[2m])` by instance |
| Disk I/O Write | Time series | `rate(node_disk_written_bytes_total[2m])` by instance |
| Swarm Node Status Table | Table | `dcms_agent_connections_active` joined with node metadata; columns: hostname, role, availability, status, agent_connected, docker_version |
| Container Count per Host | Bar chart | `sum by (host_id) (dcms_containers_total{status="running"})` |
| Load Average (1m / 5m / 15m) | Time series | `node_load1`, `node_load5`, `node_load15` by instance |

**Variables:** `$instance` (multi-select from node-exporter targets)

---

### Dashboard 3: Container Deep Dive

**Purpose:** Detailed per-container resource analysis for debugging performance issues.

**Panels:**

| Panel | Type | Query Summary |
|-------|------|---------------|
| CPU Usage Over Time | Time series | `rate(container_cpu_usage_seconds_total{id=~"$container_id"}[30s]) * 100` — percentage |
| Memory Usage vs Limit | Time series (dual axis) | `container_memory_usage_bytes` and `container_spec_memory_limit_bytes` for selected container |
| Memory Working Set | Time series | `container_memory_working_set_bytes{id=~"$container_id"}` |
| Network Received | Time series | `rate(container_network_receive_bytes_total{id=~"$container_id"}[1m])` |
| Network Transmitted | Time series | `rate(container_network_transmit_bytes_total{id=~"$container_id"}[1m])` |
| Block I/O Read | Time series | `rate(container_fs_reads_bytes_total{id=~"$container_id"}[1m])` |
| Block I/O Write | Time series | `rate(container_fs_writes_bytes_total{id=~"$container_id"}[1m])` |
| Restart Timeline | Annotations / Event log | Loki query `{job="dcms-audit"} | json | event_type="container_started" | container_id="$container_id"` shown as vertical markers on all panels |
| Restart Count | Stat | `dcms_container_restarts_total{container_id="$container_id"}` |
| Open File Descriptors | Time series | `container_file_descriptors{id=~"$container_id"}` |
| Process Count | Time series | `container_tasks_state{id=~"$container_id", state="running"}` |

**Variables:** `$container_id` (searchable dropdown populated from `dcms_containers_total` label values), `$time_range`

---

### Dashboard 4: API Performance

**Purpose:** SLO monitoring and endpoint-level performance analysis for the API gateway.

**Panels:**

| Panel | Type | Query Summary |
|-------|------|---------------|
| p50 Latency per Endpoint | Table | `histogram_quantile(0.50, sum by (route, le) (rate(dcms_http_request_duration_seconds_bucket[5m])))` sorted by latency desc |
| p95 Latency per Endpoint | Table | Same with `0.95`; rows highlighted red if > 200ms |
| p99 Latency per Endpoint | Table | Same with `0.99` |
| Error Rate Heatmap | Heatmap | `sum by (route, status_code) (rate(dcms_http_requests_total{status_code=~"[45].."}[5m]))` — x-axis: time, y-axis: route, colour: error rate |
| Slowest Endpoints Table | Table | Top 10 routes by p95 latency over selected time range |
| Request Rate by Method | Time series | `sum by (method) (rate(dcms_http_requests_total[2m]))` |
| 4xx Error Rate | Time series | `sum(rate(dcms_http_requests_total{status_code=~"4.."}[2m]))` |
| 5xx Error Rate | Time series | `sum(rate(dcms_http_requests_total{status_code=~"5.."}[2m]))` |
| Rate Limit Rejections | Time series | `sum(rate(dcms_rate_limit_hits_total[1m]))` |
| Active HTTP Connections | Stat | `dcms_active_connections` |

**Variables:** `$route` (multi-select), `$method`, `$time_range`

---

### Dashboard 5: Security Events

**Purpose:** Security posture monitoring, RBAC violation tracking, CVE alerting, and audit event review.

**Panels:**

| Panel | Type | Query Summary |
|-------|------|---------------|
| Auth Failure Rate | Time series | `rate(dcms_auth_attempts_total{result="failure"}[1m])` — spike detection |
| Failed Logins (24h) | Stat | `increase(dcms_auth_attempts_total{result="failure"}[24h])` |
| Brute-Force Lockouts (24h) | Stat | `increase(dcms_brute_force_lockouts_total[24h])` |
| RBAC Denial Events | Time series | Loki query `{job="dcms-audit"} | json | event_type="rbac_denial"` — count per 1m |
| RBAC Denials by Role | Bar chart | Same Loki query, aggregated by `actor_role` label |
| CVE Alerts by Severity | Bar gauge | `dcms_vulnerabilities_found_total` grouped by `severity` with colour: critical=red, high=orange, medium=yellow |
| New Critical CVEs (24h) | Alert list | Alerts from Alertmanager where `alertname="ImageScanCriticalCVE"` |
| Audit Events Stream | Logs panel | Loki `{job="dcms-audit"} | json | severity=~"WARNING|CRITICAL"` — live tail |
| Top 10 Alert-Triggering Users | Table | Loki query over `dcms-audit` stream, count by `actor_email` (anonymised) |
| Container Exec Sessions | Time series | `dcms_exec_sessions_active` + `increase(dcms_containers_total{event="exec"}[5m])` from audit logs |
| Certificate Expiry | Table | `ssl_certificate_expiry_seconds` per target; highlights certs expiring < 30 days |

---

### Dashboard 6: SLO Tracking

**Purpose:** Track DCMS service level objectives against targets, display error budgets, and support monthly SLO review.

**Panels:**

| Panel | Type | Query Summary |
|-------|------|---------------|
| API Availability (30d) | Gauge (0–100%) | `100 * (1 - (sum(increase(dcms_http_requests_total{status_code=~"5.."}[30d])) / sum(increase(dcms_http_requests_total[30d]))))` — target line at 99.9% |
| API p95 Latency (7d avg) | Stat vs target | `histogram_quantile(0.95, sum(rate(dcms_http_request_duration_seconds_bucket[7d])) by (le))` — green if < 200ms, red if > 200ms |
| Container Start Reliability (30d) | Stat | `100 * sum(increase(dcms_container_start_duration_seconds_count{result="success"}[30d])) / sum(increase(dcms_container_start_duration_seconds_count[30d]))` — target 99.5% |
| Error Budget Remaining (API Availability) | Gauge | `100 * (error_budget_minutes_remaining / error_budget_minutes_total)` — derived from availability SLO; burns red below 10% |
| Error Budget Burn Rate (1h / 6h / 24h) | Multi-stat | `rate(dcms_http_requests_total{status_code=~"5.."}[1h]) / on() group_left() (1 - 0.999) * rate(dcms_http_requests_total[1h])` — values > 1 mean burning faster than budget allows |
| SLO Compliance History | State timeline | 30-day view showing each day as green (met) or red (breached) based on daily error rate |
| Slowest P99 Routes This Week | Table | Routes breaking the 500ms p99 budget |
| Alert-to-Resolution Time (MTTR) | Stat | Derived from Alertmanager resolved timestamps via Loki; average over 30 days |

---

## 4. Prometheus Alerting Rules

```yaml
groups:
  - name: dcms.infrastructure
    interval: 30s
    rules:

      # Rule 1: HostCpuHigh
      - alert: HostCpuHigh
        expr: |
          avg by (instance) (
            rate(node_cpu_seconds_total{mode!="idle"}[2m])
          ) > 0.85
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High CPU utilisation on {{ $labels.instance }}"
          description: >
            Host {{ $labels.instance }} has sustained CPU utilisation above 85%
            for more than 5 minutes. Current value: {{ $value | humanizePercentage }}.
            Investigate running containers with `dcms containers list --host {{ $labels.instance }} --sort cpu`.
          runbook_url: "https://runbooks.dcms.internal/HostCpuHigh"

      # Rule 2: HostMemoryHigh
      - alert: HostMemoryHigh
        expr: |
          1 - (
            node_memory_MemAvailable_bytes
            / node_memory_MemTotal_bytes
          ) > 0.90
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High memory utilisation on {{ $labels.instance }}"
          description: >
            Host {{ $labels.instance }} memory utilisation has exceeded 90% for over 5 minutes.
            Current: {{ $value | humanizePercentage }} used.
            Consider stopping unused containers or adding memory.
          runbook_url: "https://runbooks.dcms.internal/HostMemoryHigh"

      # Rule 3: HostDiskLow
      - alert: HostDiskLow
        expr: |
          (
            node_filesystem_avail_bytes{mountpoint="/", fstype!="tmpfs"}
            / node_filesystem_size_bytes{mountpoint="/", fstype!="tmpfs"}
          ) < 0.10
        for: 2m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Disk space critically low on {{ $labels.instance }}"
          description: >
            Filesystem {{ $labels.mountpoint }} on {{ $labels.instance }} has less than 10%
            free space remaining. Current free: {{ $value | humanizePercentage }}.
            Run `docker system prune` and investigate large images/volumes immediately.
          runbook_url: "https://runbooks.dcms.internal/HostDiskLow"

      # Rule 4: ContainerRestartLoop
      - alert: ContainerRestartLoop
        expr: |
          increase(dcms_container_restarts_total[10m]) > 5
        for: 0m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Container {{ $labels.container_id }} is in a restart loop"
          description: >
            Container {{ $labels.container_id }} (namespace: {{ $labels.namespace }},
            host: {{ $labels.host_id }}) has restarted more than 5 times in the last
            10 minutes. Check logs: GET /containers/{{ $labels.container_id }}/logs
          runbook_url: "https://runbooks.dcms.internal/ContainerRestartLoop"

  - name: dcms.api
    interval: 15s
    rules:

      # Rule 5: ApiHighErrorRate
      - alert: ApiHighErrorRate
        expr: |
          (
            sum(rate(dcms_http_requests_total{status_code=~"5.."}[2m]))
            /
            sum(rate(dcms_http_requests_total[2m]))
          ) > 0.05
        for: 2m
        labels:
          severity: critical
          team: platform
          slo: api_availability
        annotations:
          summary: "API 5xx error rate exceeds 5%"
          description: >
            The DCMS API gateway 5xx error rate is {{ $value | humanizePercentage }}
            over the last 2 minutes (threshold: 5%). This is burning the error budget.
            Check api-gateway logs and upstream service health immediately.
          runbook_url: "https://runbooks.dcms.internal/ApiHighErrorRate"

      # Rule 14: SloApiLatencyBreach
      - alert: SloApiLatencyBreach
        expr: |
          histogram_quantile(
            0.95,
            sum(rate(dcms_http_request_duration_seconds_bucket[5m])) by (le)
          ) > 0.2
        for: 5m
        labels:
          severity: warning
          team: platform
          slo: api_latency
        annotations:
          summary: "API p95 latency breaches 200ms SLO"
          description: >
            API gateway p95 latency is {{ $value | humanizeDuration }} over the past 5 minutes,
            exceeding the 200ms SLO target. Identify slow routes in the API Performance dashboard.
          runbook_url: "https://runbooks.dcms.internal/SloApiLatencyBreach"

      # Rule 15: HighConcurrentSseConnections
      - alert: HighConcurrentSseConnections
        expr: |
          sum(dcms_sse_connections_active) > 700
        for: 2m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High number of concurrent SSE connections ({{ $value }})"
          description: >
            The total number of active SSE streaming connections (logs + stats) has exceeded 700.
            At this level, the container-service may begin to experience goroutine pressure.
            Consider enabling SSE connection limits or scaling container-service replicas.
          runbook_url: "https://runbooks.dcms.internal/HighConcurrentSseConnections"

  - name: dcms.agents
    interval: 30s
    rules:

      # Rule 6: AgentDisconnected
      - alert: AgentDisconnected
        expr: |
          dcms_agent_connections_active == 0
        for: 2m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "DCMS agent disconnected from host {{ $labels.host_id }}"
          description: >
            The DCMS agent on host {{ $labels.host_name }} (id: {{ $labels.host_id }})
            has had zero active gRPC connections for more than 2 minutes.
            Container management operations will fail for this host until connectivity is restored.
            SSH to {{ $labels.host_name }} and check: systemctl status dcms-agent
          runbook_url: "https://runbooks.dcms.internal/AgentDisconnected"

  - name: dcms.database
    interval: 30s
    rules:

      # Rule 7: DbConnectionPoolHigh
      - alert: DbConnectionPoolHigh
        expr: |
          (
            pgbouncer_pools_server_active_connections
            /
            pgbouncer_pools_server_pool_size
          ) > 0.80
        for: 3m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "pgBouncer connection pool {{ $labels.pool }} utilisation above 80%"
          description: >
            Connection pool {{ $labels.pool }} on {{ $labels.instance }} is at
            {{ $value | humanizePercentage }} utilisation (threshold: 80%).
            Applications may begin queueing. Check for connection leaks and consider
            increasing pool size or scaling the corresponding service.
          runbook_url: "https://runbooks.dcms.internal/DbConnectionPoolHigh"

  - name: dcms.security
    interval: 30s
    rules:

      # Rule 8: AuthFailureSpike
      - alert: AuthFailureSpike
        expr: |
          rate(dcms_auth_attempts_total{result="failure"}[1m]) > 50
        for: 0m
        labels:
          severity: critical
          team: security
        annotations:
          summary: "Authentication failure spike detected ({{ $value | humanize }}/s)"
          description: >
            Authentication failure rate has exceeded 50 per minute.
            This may indicate a brute-force or credential stuffing attack.
            Rate: {{ $value | humanize }} failures/sec. Review source IPs in the
            Security Events dashboard and consider activating the WAF rule set.
          runbook_url: "https://runbooks.dcms.internal/AuthFailureSpike"

      # Rule 9: ImageScanCriticalCVE
      - alert: ImageScanCriticalCVE
        expr: |
          dcms_vulnerabilities_found_total{severity="CRITICAL"} > 0
        for: 0m
        labels:
          severity: critical
          team: security
        annotations:
          summary: "Critical CVE(s) found in scanned image"
          description: >
            {{ $value }} CRITICAL severity CVE(s) detected across tracked images.
            Review scan results in the Security Events dashboard and in
            GET /images/{id}/scan/results. Images with critical CVEs must be patched
            or removed within 24 hours per security policy.
          runbook_url: "https://runbooks.dcms.internal/ImageScanCriticalCVE"

      # Rule 11: CertificateExpiringSoon
      - alert: CertificateExpiringSoon
        expr: |
          ssl_certificate_expiry_seconds{job="blackbox-tls"} < 7 * 86400
        for: 1m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "TLS certificate expiring in less than 7 days for {{ $labels.instance }}"
          description: >
            The TLS certificate for {{ $labels.instance }} expires in
            {{ $value | humanizeDuration }}. Auto-renewal may have failed.
            Check cert-manager CertificateRequest status and Vault PKI engine logs.
          runbook_url: "https://runbooks.dcms.internal/CertificateExpiringSoon"

  - name: dcms.services
    interval: 30s
    rules:

      # Rule 10: LogIngestionLag
      - alert: LogIngestionLag
        expr: |
          sum(dcms_log_ingestion_rate) < 10
        for: 3m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Log ingestion rate critically low ({{ $value | humanize }} lines/s)"
          description: >
            Total log ingestion rate across all hosts has dropped below 10 lines/second
            for more than 3 minutes. This likely indicates that Loki is down, promtail
            is failing, or the log-service has crashed. Logs may be lost.
            Check: kubectl get pods -n monitoring | grep loki
          runbook_url: "https://runbooks.dcms.internal/LogIngestionLag"

      # Rule 12: AlertServiceDown
      - alert: AlertServiceDown
        expr: |
          up{job="notification-service"} == 0
        for: 1m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Notification service is down"
          description: >
            The DCMS notification-service ({{ $labels.instance }}) has been unreachable
            for more than 1 minute. Alert notifications will not be delivered to users
            until this is resolved. Check container status and logs.
          runbook_url: "https://runbooks.dcms.internal/AlertServiceDown"

      # Rule 13: ContainerServiceDown
      - alert: ContainerServiceDown
        expr: |
          up{job="container-service"} == 0
        for: 1m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Container service is down"
          description: >
            The DCMS container-service ({{ $labels.instance }}) has been unreachable
            for more than 1 minute. All container lifecycle operations (start, stop,
            create, delete, exec, streaming) will be unavailable.
            Immediately check container-service pod logs and restart if necessary.
          runbook_url: "https://runbooks.dcms.internal/ContainerServiceDown"
```

---

## 5. Log Aggregation

### 5.1 Architecture

```
Docker Container Stdout/Stderr
        │
        │  (Docker logging driver: json-file / loki-driver)
        ▼
  Promtail Agent (per host)
        │
        │  HTTP push  (TLS 1.3)
        ▼
   Loki Distributor
        │
   Loki Ingester  ──►  WAL (local disk)
        │
        ▼
   Loki Storage Backend (S3/MinIO)
        │  Hot tier (SSD): 0–30 days
        │  Cold tier (object store): 30–90 days
        ▼
   Grafana (LogQL queries)  +  DCMS log-service (API facade)
```

### 5.2 Promtail Configuration

```yaml
# /etc/promtail/config.yaml  (deployed by Ansible to each DCMS host)
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: https://loki.monitoring.dcms.internal:3100/loki/api/v1/push
    tls_config:
      ca_file: /etc/dcms/certs/internal-ca.crt
      cert_file: /etc/dcms/certs/promtail.crt
      key_file: /etc/dcms/certs/promtail.key
    tenant_id: dcms-prod
    batchwait: 1s
    batchsize: 1048576  # 1 MiB

scrape_configs:
  - job_name: dcms-containers
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        filters:
          - name: label
            values: ["dcms.managed=true"]
    relabel_configs:
      # Carry Docker labels as Loki stream labels
      - source_labels: [__meta_docker_container_name]
        target_label: container_name
        regex: '/(.*)'
      - source_labels: [__meta_docker_container_id]
        target_label: container_id
      - source_labels: [__meta_docker_container_label_dcms_namespace]
        target_label: namespace
      - source_labels: [__meta_docker_container_label_dcms_org_id]
        target_label: org_id
      - source_labels: [__meta_docker_container_image_name]
        target_label: image
      - source_labels: [__meta_docker_port_private]
        target_label: __address__
      # Assign static job label
      - replacement: dcms-containers
        target_label: job
      # Add host identity
      - replacement: "${HOSTNAME}"
        target_label: host
    pipeline_stages:
      # Try to parse JSON log lines and promote level field
      - json:
          expressions:
            level: level
            msg: msg
            ts: ts
      - labels:
          level:
      # Normalise timestamp from container JSON log
      - timestamp:
          source: ts
          format: RFC3339Nano
      # Drop health check noise
      - drop:
          expression: '.*GET /health.*200.*'

  - job_name: dcms-services
    static_configs:
      - targets: ["localhost"]
        labels:
          job: dcms-audit
          __path__: /var/log/dcms/audit.log
    pipeline_stages:
      - json:
          expressions:
            event_type: event_type
            severity: severity
            org_id: org_id
            actor_id: actor_id
      - labels:
          event_type:
          severity:
          org_id:
```

### 5.3 Loki Label Schema

Labels are kept minimal to avoid high cardinality. Only the following labels are permitted as Loki stream selectors:

| Label | Source | Cardinality |
|-------|--------|-------------|
| `job` | Promtail static (`dcms-containers`, `dcms-audit`, `dcms-agent`) | Low (< 10) |
| `host` | Host `$HOSTNAME` env var | Medium (number of managed hosts) |
| `namespace` | Docker label `dcms.namespace` | Low (< 100 per deployment) |
| `org_id` | Docker label `dcms.org_id` | Medium (number of organisations) |
| `container_id` | Docker metadata | High — used as a **filter** in LogQL, not a stream label |
| `level` | Parsed from log line (`DEBUG`/`INFO`/`WARN`/`ERROR`) | Low (6 values) |
| `severity` | Audit log field | Low (3 values) |

All other log fields are expected to be accessible via JSON extraction (`| json`) or line filter expressions (`|= "pattern"`) rather than index labels.

### 5.4 Retention Configuration

```yaml
# loki-config.yaml (storage section)
compactor:
  working_directory: /data/loki/compactor
  shared_store: s3

limits_config:
  retention_period: 2160h   # 90 days total
  retention_stream:
    - selector: '{job="dcms-containers"}'
      period: 2160h           # 90 days
    - selector: '{job="dcms-audit"}'
      period: 17520h          # 2 years (audit retention)

storage_config:
  aws:
    s3: s3://dcms-logs-prod/loki/
    region: us-east-1
    sse_encryption: true
  boltdb_shipper:
    active_index_directory: /data/loki/index
    cache_location: /data/loki/cache
    cache_ttl: 24h
    shared_store: s3

# Hot/cold tiering handled by S3 Intelligent-Tiering:
#   0–30 days:  S3 Standard (SSD-backed, low latency)
#   30–90 days: S3 Infrequent Access (automatic transition via lifecycle rule)
#   Audit logs: S3 Standard-IA until 2 years, then Glacier Instant Retrieval
```

---

## 6. Distributed Tracing

### 6.1 OpenTelemetry Go SDK Setup

Each DCMS microservice initialises tracing at startup as described in §1.2. The SDK is configured with:

- **Exporter:** OTLP/HTTP to Jaeger Collector endpoint (`jaeger-collector.monitoring.svc.cluster.local:4318`)
- **Propagation:** W3C TraceContext (`traceparent` / `tracestate` headers) — standard across all service boundaries including gRPC (via metadata) and HTTP (via headers)
- **Resource attributes:** `service.name`, `service.version`, `deployment.environment` (`prod`/`staging`/`dev`), `host.name`

### 6.2 Trace Propagation

```
Client Request
    │  traceparent: 00-{trace_id}-{parent_span_id}-01
    ▼
API Gateway  (creates root span or continues incoming trace)
    │  propagates traceparent via HTTP headers (outbound calls)
    │  propagates via gRPC metadata (google.golang.org/grpc/metadata)
    ▼
container-service / auth-service / image-service ...
    │  each service creates child spans for:
    │    - database queries (db.system, db.statement, db.name)
    │    - cache operations (Redis GET/SET)
    │    - external API calls (Docker daemon HTTP)
    │    - Vault secret lookups
    ▼
Jaeger Backend  (collects all spans; reconstructs trace tree)
    │
    ▼
Grafana  (Jaeger data source for trace search and service map)
```

**Span naming convention:** `{http.method} {http.route}` for HTTP handlers; `{db.operation} {db.name}.{db.sql.table}` for database spans; `docker.{operation}` for Docker daemon calls.

**Baggage propagation:** `org_id` and `user_id` are injected as W3C Baggage entries at the API gateway for correlation across all downstream spans without needing to pass them as explicit function arguments.

### 6.3 Jaeger Backend Configuration

| Setting | Value |
|---------|-------|
| Storage backend | Elasticsearch 8.x (hot) + S3 (cold, via Jaeger remote storage plugin) |
| Span retention | 7 days in Elasticsearch; 30 days in S3 cold storage |
| Collector endpoint | `jaeger-collector.monitoring.svc.cluster.local:4318` (OTLP/HTTP) |
| Query UI | `https://traces.dcms.internal` |
| Index prefix | `dcms-traces-{YYYY.MM.DD}` |

### 6.4 Sampling Strategy

| Environment | Sampling Rate | Strategy |
|-------------|---------------|---------|
| **Production** | 1% (0.01) | `TraceIDRatioBased(0.01)` — deterministic; same trace ID always sampled or not |
| **Staging** | 10% (0.10) | `TraceIDRatioBased(0.10)` |
| **Development** | 100% (1.0) | `AlwaysSample()` |
| **Error traces** | 100% | Parent-based sampler overrides ratio: any span with `status.code=ERROR` forces recording via a custom `ErrorForceSampler` wrapper |
| **Slow traces** | 100% | Traces with root span duration > 2s are always recorded via tail-based sampling in the Jaeger collector |

The combination of ratio-based head sampling for normal traffic and forced recording for errors/slow requests ensures production visibility without excessive storage cost.

---

## 7. SLO Definitions

| SLO Name | SLI Description | SLO Target | Error Budget (30-day window) | Measurement Method |
|----------|-----------------|------------|------------------------------|--------------------|
| **API Availability** | Percentage of API requests that return a non-5xx HTTP response, measured at the API gateway | 99.9% | 43.2 minutes downtime / month (0.1% × 43,200 min) | `1 - (sum(increase(dcms_http_requests_total{status_code=~"5.."}[30d])) / sum(increase(dcms_http_requests_total[30d])))` evaluated every 5 minutes; breached if rolling 30d value < 0.999 |
| **API Request Latency** | Percentage of API requests that complete within 200ms, measured end-to-end at the gateway (p95) | 95% of requests ≤ 200ms | 5% of requests may exceed 200ms | `histogram_quantile(0.95, sum(rate(dcms_http_request_duration_seconds_bucket[5m])) by (le))` ≤ 0.200 seconds; tracked as a continuous metric; error budget = total requests × 0.05 that may exceed 200ms |
| **Container Start Reliability** | Percentage of container start operations (POST /containers/{id}/start) that succeed within 30 seconds | 99.5% | 0.5% failures or timeouts per month | `sum(increase(dcms_container_start_duration_seconds_count{result="success"}[30d])) / sum(increase(dcms_container_start_duration_seconds_count[30d]))` ≥ 0.995 |
| **Log Ingestion Completeness** | Percentage of time the log ingestion pipeline is operating above 10 lines/second (indicating healthy flow) | 99.5% uptime | 3.6 hours degraded per month | Derived from `dcms_log_ingestion_rate < 10` alert duration; `1 - (minutes_ingestion_rate_below_threshold / 43200)` ≥ 0.995 over a 30-day window |
