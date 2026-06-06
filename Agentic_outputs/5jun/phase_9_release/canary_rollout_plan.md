# DCMS v1.0.0 Canary Rollout Plan

**Release:** Generic Docker Container Management System v1.0.0  
**Strategy:** Progressive traffic shifting via Kong traffic-splitting plugin  
**Total canary duration:** 4 hours (180 minutes active stages + gate hold times)  
**Canary start:** 2026-09-30 10:38 UTC (immediately after all services deployed to v1.0.0)  
**Canary completion target:** 2026-09-30 15:00 UTC  

---

## Overview

All 12 DCMS services are deployed to v1.0.0 before the canary begins. The canary strategy uses Kong's traffic-splitting plugin to route a percentage of inbound API and frontend traffic to the v1.0.0 upstream group, while the remaining traffic continues to the stable v0.9.x upstream group. Both versions run simultaneously during stages 1–3. Stage 4 completes the cutover to 100% v1.0.0 and retires the v0.9.x replicas.

---

## Canary Stages

| Stage | Traffic to v1.0.0 | Duration | Auto-Advance Condition | Manual Gate |
|-------|------------------|----------|------------------------|-------------|
| Stage 1 | 5% | 30 min | error_rate < 0.1% AND p95_latency < 200ms | No — automatic |
| Stage 2 | 25% | 60 min | error_rate < 0.1% AND p95_latency < 200ms | No — automatic |
| Stage 3 | 50% | 90 min | error_rate < 0.5% AND p95_latency < 300ms | Yes — tech_lead_agent sign-off required |
| Stage 4 | 100% | Permanent | — | Yes — release_manager_agent sign-off required |

**Stage transition logic:** At the end of each duration window, the Prometheus-based canary controller evaluates the auto-advance conditions over the last 5-minute window. If conditions are met and no manual gate is required, the next stage begins immediately. If conditions are not met, the stage holds and an alert fires for tech_lead_agent to make a decision.

---

## Canary Metrics Monitored

All metrics are evaluated on the `upstream="dcms-v1-canary"` label to isolate canary traffic from stable traffic.

| Metric | Prometheus Query | Alert Threshold | Rollback Threshold |
|--------|-----------------|-----------------|-------------------|
| API Error Rate | `sum(rate(http_requests_total{upstream="dcms-v1-canary",status=~"5.."}[5m])) / sum(rate(http_requests_total{upstream="dcms-v1-canary"}[5m]))` | > 0.1% | > 1% for 2 consecutive minutes |
| API p95 Latency (read) | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{upstream="dcms-v1-canary",method=~"GET"}[5m]))` | > 200ms | > 1000ms p99 |
| Container Start Success Rate | `sum(rate(container_start_total{upstream="dcms-v1-canary",result="success"}[5m])) / sum(rate(container_start_total{upstream="dcms-v1-canary"}[5m]))` | < 99% | < 95% |
| Auth Failure Rate | `sum(rate(auth_requests_total{upstream="dcms-v1-canary",result="failure"}[5m])) / sum(rate(auth_requests_total{upstream="dcms-v1-canary"}[5m]))` | > 0.5% | > 2% |
| SSE Connection Drop Rate | `rate(sse_connections_dropped_total{upstream="dcms-v1-canary"}[5m])` | > 5/min | > 20/min |
| API p99 Latency (all) | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{upstream="dcms-v1-canary"}[5m]))` | > 500ms | > 1000ms |

### Grafana Canary Dashboard

Real-time canary comparison dashboard: `https://grafana.dcms.internal/d/dcms-canary-watch`

Displays side-by-side panels for v0.9.x stable vs v1.0.0 canary across all six metrics above, with automatic threshold annotations.

---

## Automatic Rollback Trigger

**Rollback is triggered automatically without human intervention if either condition is true:**

1. API error rate > 1% for **2 consecutive 1-minute evaluation windows**
2. API p99 latency > 1000ms for **2 consecutive 1-minute evaluation windows**

The canary controller (running as `dcms_canary-controller` Docker service) evaluates these conditions every 60 seconds. On trigger, it:

1. Sets Kong traffic split to 0% v1.0.0 / 100% v0.9.x immediately.
2. Posts alert to Slack #releases and #incidents.
3. Pages on-call engineer and tech_lead_agent via PagerDuty.
4. Logs rollback event to `dcms_canary_events` table with timestamp, trigger metric, and measured value.

---

## Kong Traffic-Splitting Configuration

The following declarative Kong configuration implements the traffic-splitting plugin. Apply with `deck sync` at each stage transition.

```yaml
# kong-canary.yaml — applied at each stage transition with deck sync
# Replace CANARY_WEIGHT with the target percentage (5, 25, 50, or 100)

_format_version: "3.0"
_transform: true

upstreams:
  - name: dcms-api-stable
    algorithm: round-robin
    targets:
      - target: api-gateway-stable:8080
        weight: 100

  - name: dcms-api-canary
    algorithm: round-robin
    targets:
      - target: api-gateway-canary:8080
        weight: 100

services:
  - name: dcms-api
    host: dcms-api-stable
    port: 8080
    protocol: http
    path: /
    plugins:
      - name: traffic-splitting
        config:
          rules:
            - upstream:
                name: dcms-api-canary
              # weight is out of 100; set to 5, 25, 50, or 100 per stage
              weight: 5

routes:
  - name: dcms-api-route
    service: dcms-api
    paths:
      - /v1
    protocols:
      - https
    strip_path: false

  - name: dcms-frontend-route
    service: dcms-frontend
    paths:
      - /
    protocols:
      - https
    strip_path: false
```

### Stage Transition Commands

```bash
# Stage 1: 5% canary
CANARY_WEIGHT=5 envsubst < kong-canary.yaml | deck sync --state -

# Stage 2: 25% canary
CANARY_WEIGHT=25 envsubst < kong-canary.yaml | deck sync --state -

# Stage 3: 50% canary (requires tech_lead manual gate)
CANARY_WEIGHT=50 envsubst < kong-canary.yaml | deck sync --state -

# Stage 4: 100% cutover (requires release_manager manual gate)
CANARY_WEIGHT=100 envsubst < kong-canary.yaml | deck sync --state -

# Rollback: 0% canary (immediate revert to stable)
CANARY_WEIGHT=0 envsubst < kong-canary.yaml | deck sync --state -
```

### Verify Current Split

```bash
curl -sf http://kong-admin:8001/upstreams/dcms-api-canary/targets \
  | jq '[.data[] | {target:.target, weight:.weight}]'
```

---

## Canary-Specific Health Checks

After each stage transition, verify canary pods are serving correctly before starting the stage timer.

### Pod Readiness Check

```bash
# Verify canary replicas are running and ready
docker service ps dcms_api-gateway-canary \
  --filter desired-state=running \
  --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}"

# All replicas should show "Running N seconds ago" — none in "Starting" or "Failed"
```

### Canary Traffic Verification

```bash
# Send 20 requests and verify a portion is served by canary (check x-served-by header)
for i in $(seq 1 20); do
  curl -sI https://dcms.example.com/v1/health | grep "x-served-by"
done | sort | uniq -c
# At 5%: expect ~1/20 requests showing "x-served-by: dcms-api-gateway-canary"
# At 25%: expect ~5/20 requests
# At 50%: expect ~10/20 requests
```

### Canary-Specific Smoke Test

```bash
# Run canary smoke suite against canary upstream directly
pnpm test:e2e --suite canary-smoke \
  --base-url https://canary.dcms.example.com \
  --report canary-smoke-stage-$STAGE.json

# Minimum pass rate: 100% of tests in suite
```

### Database Compatibility Check

During stages 1–3 (dual-version operation), verify the database schema is compatible with both v0.9.x and v1.0.0 service versions:

```bash
# Check for any schema-breaking locks or deadlocks during canary period
psql $DATABASE_URL -c "
  SELECT pid, wait_event_type, wait_event, state, query
  FROM pg_stat_activity
  WHERE wait_event_type = 'Lock'
  AND application_name LIKE 'dcms-%';
"
# Expected: 0 rows
```

---

## Emergency Rollback Procedure

### Automatic Rollback (triggered by canary controller)

No manual intervention required. The canary controller reverts Kong split to 0% canary immediately. Monitor #releases and #incidents for confirmation.

### Manual Rollback (initiated by tech_lead_agent or on-call)

```bash
# Step 1: Immediately revert Kong split to 0% canary
CANARY_WEIGHT=0 envsubst < kong-canary.yaml | deck sync --state -

# Step 2: Verify traffic is back on stable
curl -sf http://kong-admin:8001/services/dcms-api/plugins \
  | jq '.data[] | select(.name=="traffic-splitting") | .config.rules[].weight'
# Expected: 0

# Step 3: Roll back each canary service to previous version
docker service update --rollback dcms_api-gateway-canary
docker service update --rollback dcms_auth-service-canary
docker service update --rollback dcms_container-service-canary
docker service update --rollback dcms_image-service-canary
docker service update --rollback dcms_network-service-canary
docker service update --rollback dcms_volume-service-canary
docker service update --rollback dcms_monitor-service-canary
docker service update --rollback dcms_log-service-canary
docker service update --rollback dcms_notification-service-canary
docker service update --rollback dcms_cluster-service-canary
docker service update --rollback dcms_frontend-canary
docker service update --rollback dcms_agent-canary

# Step 4: Verify all services back on v0.9.x
docker stack ps dcms --format "table {{.Name}}\t{{.Image}}" | grep -v "v1.0.0"

# Step 5: Confirm health
curl -sf https://dcms.example.com/v1/health | jq .version
# Expected: "0.9.x"
```

**RTO for canary rollback:** < 3 minutes (Kong split revert is < 10 seconds; service rollback is 2–3 minutes per service but all run in parallel).

---

## Communication Plan

All canary stage transitions and decisions are communicated in Slack **#releases** channel. The devops_developer_agent posts updates; the release_manager_agent owns the canary coordination channel.

### Stage Transition Messages

| Event | Message Template |
|-------|-----------------|
| Canary start | `[10:38 UTC] Canary Stage 1 starting — 5% traffic to v1.0.0. Monitoring for 30 min. Dashboard: <link>` |
| Stage 1 → 2 | `[11:08 UTC] Stage 1 PASSED (error_rate=0.04%, p95=112ms). Advancing to Stage 2 — 25% traffic. Next gate: 12:08 UTC.` |
| Stage 2 → 3 | `[12:08 UTC] Stage 2 PASSED (error_rate=0.03%, p95=118ms). Advancing to Stage 3 — 50% traffic. Manual gate required @tech_lead. Duration: 90 min.` |
| Stage 3 manual gate | `[13:38 UTC] Stage 3 complete. Metrics: error_rate=0.05%, p95=124ms. Requesting @tech_lead sign-off to advance to 100% cutover.` |
| Stage 4 manual gate | `[13:45 UTC] tech_lead signed off. Requesting @release_manager sign-off for 100% cutover.` |
| Stage 4 complete | `[13:50 UTC] CANARY COMPLETE — 100% traffic on DCMS v1.0.0. All metrics green. v0.9.x replicas will be decommissioned in 30 min. Release window closed successfully.` |
| Rollback triggered | `[TIME] CANARY ROLLBACK triggered. Cause: [metric] exceeded threshold ([value]). Traffic reverted to 100% v0.9.x. Incident: #INC-[n]. @tech_lead @oncall paged.` |

### PagerDuty Alerts

| Condition | Severity | Responders |
|-----------|----------|-----------|
| Auto-advance conditions not met at stage end | P3 | On-call engineer |
| Automatic rollback triggered | P1 | On-call + tech_lead_agent + release_manager_agent |
| Manual gate no response after 15 min | P2 | On-call + relevant authority |
| Any SLO breach during canary | P1 | On-call + tech_lead_agent |
