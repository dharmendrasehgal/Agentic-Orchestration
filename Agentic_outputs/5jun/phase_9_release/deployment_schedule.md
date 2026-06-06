# DCMS v1.0.0 GA Deployment Schedule

**Release:** Generic Docker Container Management System v1.0.0  
**Type:** General Availability (GA)  
**Target Date:** 2026-09-30  
**Release Manager:** release_manager_agent  
**Go/No-Go Authority:** tech_lead_agent  

---

## Release Team

| Role | Agent / Person | Responsibility |
|------|---------------|----------------|
| Release Orchestrator | release_manager_agent | Coordinates all steps, owns timeline |
| Deployment Engineer | devops_developer_agent | Executes Docker Swarm commands, monitors deploy logs |
| QA Verification | qa_lead_agent | Runs smoke tests and acceptance checks post-deploy |
| Go/No-Go Authority | tech_lead_agent | Final authority to advance or abort at each gate |
| On-Call Engineer | ops-oncall (paged via PagerDuty) | Available during release window for escalation |
| Customer Communications | product_manager_agent | Drafts and sends customer-facing status updates |

---

## Pre-Release Window: 2026-09-28 (Monday)

All tasks must be completed and signed off by 17:00 UTC Monday before the Wednesday release window opens.

### 09:00 UTC — Staging Environment Final Smoke Test

1. Deploy `v1.0.0-rc.1` image set to the staging environment.
2. Execute the full E2E smoke test suite (`pnpm test:e2e --suite smoke`).
3. Required pass rate: 100% of critical-path tests (9/9).
4. Verify all 12 service health endpoints return `{"status":"healthy"}`.
5. Sign off: qa_lead_agent.

### 11:00 UTC — Vault Secret Rotation

1. Rotate all production secrets in HashiCorp Vault:
   - `dcms/prod/db/password` — PostgreSQL application user
   - `dcms/prod/jwt/signing_key` — JWT RS256 private key
   - `dcms/prod/oauth2/client_secret` — OAuth2 provider secret
   - `dcms/prod/registry/pull_secret` — GHCR pull token
   - `dcms/prod/encryption/aes_key` — at-rest encryption key
2. Verify secret lease renewal across all services in staging after rotation.
3. Confirm zero auth errors in staging logs for 15 minutes post-rotation.
4. Sign off: devops_developer_agent.

### 13:00 UTC — Production Database Backup

```bash
# Full pg_dump backup — label with release version
pg_dump \
  --host=$PROD_DB_HOST \
  --port=5432 \
  --username=dcms_admin \
  --format=custom \
  --compress=9 \
  --file=/backups/dcms-prod-pre-v1.0.0-$(date +%Y%m%d%H%M%S).pgdump \
  dcms_production

# Verify backup integrity
pg_restore --list /backups/dcms-prod-pre-v1.0.0-*.pgdump | head -20

# Record backup location and checksum
sha256sum /backups/dcms-prod-pre-v1.0.0-*.pgdump > /backups/dcms-prod-pre-v1.0.0.sha256
```

Expected backup size: ~2–4 GB. Store in: `s3://dcms-backups/releases/v1.0.0/pre-release/`.

### 15:00 UTC — Change Freeze Confirmation

1. Confirm no infrastructure changes are scheduled for 2026-09-28 18:00 UTC through 2026-10-01 10:00 UTC.
2. Notify all engineering teams: code freeze in effect.
3. Confirm PagerDuty on-call schedule covers the full release window.
4. Final checklist sign-off: release_manager_agent.

---

## Release Window: 2026-09-30 (Wednesday) 10:00–14:00 UTC

**Low-traffic window** — based on 90-day traffic analysis, Wednesday 10:00–14:00 UTC represents the system's global traffic nadir (~12% of peak load).

**Hard deadline:** If deployment sequence is not completed by 14:00 UTC, initiate full rollback and reschedule to 2026-10-07.

---

## Deployment Sequence

### Pre-Deployment System State Verification (09:45–10:00 UTC)

Before the first deployment command is issued, verify:

```bash
# All production services healthy on v0.9.x baseline
docker stack ps dcms --format "table {{.Name}}\t{{.CurrentState}}\t{{.Image}}"

# Database connectivity
psql $DATABASE_URL -c "SELECT version();"

# Disk space — require >= 20% free on all nodes
df -h /var/lib/docker

# Registry access
docker pull ghcr.io/dcms/dcms/api-gateway:v1.0.0 --quiet && echo "REGISTRY OK"
```

---

### Step 1 — Database Migrations (10:00–10:05 UTC)

**Estimated duration:** 2 minutes  
**Dependencies:** None — runs before any service upgrade.

```bash
# Apply forward migrations (000013 through 000015)
docker run --rm \
  --network dcms_backend \
  --env DATABASE_URL=$DATABASE_URL \
  ghcr.io/dcms/dcms/migrate:v1.0.0 \
  -database $DATABASE_URL \
  -path /migrations \
  up

# Verify applied migrations
psql $DATABASE_URL -c "SELECT version, description, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5;"
```

**Health check:** Schema version = `1.0.0`, latest migration = `000015_add_rls_policies`.  
**Rollback trigger:** Any migration error — run `migrate down` immediately, abort release.

---

### Step 2 — auth-service (10:05–10:12 UTC)

**Estimated duration:** 5 minutes (includes health verification hold)  
**Criticality:** CRITICAL PATH — all other services depend on auth. Do not advance until fully healthy.

```bash
docker service update \
  --image ghcr.io/dcms/dcms/auth-service:v1.0.0 \
  --update-parallelism 1 \
  --update-delay 10s \
  --update-failure-action rollback \
  dcms_auth-service

# Wait for rollout to complete
docker service ps dcms_auth-service --filter desired-state=running
```

**Health check (must pass before advancing):**
```bash
curl -sf https://dcms.example.com/v1/auth/health | jq .
# Expected: {"status":"healthy","db":"connected","vault":"connected"}

# Verify JWT issuance works
curl -sf -X POST https://dcms.example.com/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username":"smoke-test@dcms.internal","password":"$SMOKE_TEST_PASSWORD"}' \
  | jq '.token_type'
# Expected: "Bearer"
```

**Rollback trigger:** Health check fails after 3 retries (30s interval) OR JWT issuance fails.

---

### Step 3 — api-gateway (10:12–10:15 UTC)

**Estimated duration:** 1 minute (Kong config reload)

```bash
# Update Kong declarative config for v1.0.0 routes
docker service update \
  --image ghcr.io/dcms/dcms/api-gateway:v1.0.0 \
  --update-parallelism 1 \
  --update-failure-action rollback \
  dcms_api-gateway

# Verify Kong admin API
curl -sf http://kong-admin:8001/status | jq '.server.connections_active'
```

**Health check:**
```bash
curl -sf https://dcms.example.com/v1/health | jq .
# Expected: {"status":"healthy","version":"1.0.0","gateway":"kong-3.6"}
```

**Rollback trigger:** Any 5xx responses from gateway health endpoint OR Kong admin API unreachable.

---

### Step 4 — container-service, image-service, network-service, volume-service (10:15–10:18 UTC)

**Estimated duration:** 3 minutes (parallel deployment)  
**Deployment:** All four services updated simultaneously.

```bash
# Deploy in parallel — background each update
docker service update \
  --image ghcr.io/dcms/dcms/container-service:v1.0.0 \
  --update-parallelism 1 --update-failure-action rollback \
  dcms_container-service &

docker service update \
  --image ghcr.io/dcms/dcms/image-service:v1.0.0 \
  --update-parallelism 1 --update-failure-action rollback \
  dcms_image-service &

docker service update \
  --image ghcr.io/dcms/dcms/network-service:v1.0.0 \
  --update-parallelism 1 --update-failure-action rollback \
  dcms_network-service &

docker service update \
  --image ghcr.io/dcms/dcms/volume-service:v1.0.0 \
  --update-parallelism 1 --update-failure-action rollback \
  dcms_volume-service &

wait
```

**Health checks (all four must pass):**
```bash
for svc in container image network volume; do
  curl -sf "https://dcms.example.com/v1/${svc}s/health" | jq --arg s "$svc" '{"service":$s,"status":.status}'
done
```

**Rollback trigger:** Any service health check fails after deployment completes.

---

### Step 5 — monitor-service, log-service, notification-service (10:18–10:22 UTC)

**Estimated duration:** 2 minutes (parallel deployment)

```bash
docker service update \
  --image ghcr.io/dcms/dcms/monitor-service:v1.0.0 \
  --update-failure-action rollback dcms_monitor-service &

docker service update \
  --image ghcr.io/dcms/dcms/log-service:v1.0.0 \
  --update-failure-action rollback dcms_log-service &

docker service update \
  --image ghcr.io/dcms/dcms/notification-service:v1.0.0 \
  --update-failure-action rollback dcms_notification-service &

wait
```

**Health checks:**
```bash
curl -sf https://dcms.example.com/v1/metrics/health | jq .status
curl -sf https://dcms.example.com/v1/logs/health | jq .status
curl -sf https://dcms.example.com/v1/notifications/health | jq .status
# All expected: "healthy"

# Verify Prometheus scrape targets are all UP
curl -sf http://prometheus:9090/api/v1/targets | jq '[.data.activeTargets[] | select(.health!="up")] | length'
# Expected: 0
```

**Rollback trigger:** Any health endpoint returns non-healthy OR Prometheus scrape targets with health != "up" > 0.

---

### Step 6 — cluster-service (10:22–10:25 UTC)

**Estimated duration:** 2 minutes (last backend service)

```bash
docker service update \
  --image ghcr.io/dcms/dcms/cluster-service:v1.0.0 \
  --update-parallelism 1 \
  --update-failure-action rollback \
  dcms_cluster-service
```

**Health check:**
```bash
curl -sf https://dcms.example.com/v1/clusters/health | jq .
# Expected: {"status":"healthy","swarm_api":"connected"}
```

**Rollback trigger:** Service health check fails OR Swarm API connectivity lost.

---

### Step 7 — frontend (10:25–10:28 UTC)

**Estimated duration:** 1 minute (Nginx reload within container)

```bash
docker service update \
  --image ghcr.io/dcms/dcms/frontend:v1.0.0 \
  --update-parallelism 1 \
  --update-failure-action rollback \
  dcms_frontend
```

**Health checks:**
```bash
# Next.js health
curl -sf https://dcms.example.com/api/health | jq .

# Verify bundle version header matches release
curl -sI https://dcms.example.com/ | grep "x-dcms-version"
# Expected: x-dcms-version: 1.0.0

# Synthetic page load — LCP must be < 2500ms
lighthouse https://dcms.example.com/ --only-audits=largest-contentful-paint --output=json \
  | jq '.audits["largest-contentful-paint"].numericValue'
```

**Rollback trigger:** Frontend health endpoint returns non-200 OR version header missing/incorrect.

---

### Step 8 — agent (rolling update, 10:28–10:38 UTC)

**Estimated duration:** 5 minutes total (sequential host-by-host rollout)  
**Strategy:** Rolling update — one host at a time to maintain host coverage.

```bash
# Agent runs as a global service — update with max 1 concurrent task
docker service update \
  --image ghcr.io/dcms/dcms/agent:v1.0.0 \
  --update-parallelism 1 \
  --update-delay 30s \
  --update-failure-action rollback \
  --update-monitor 15s \
  dcms_agent

# Monitor rollout progress
watch -n 5 'docker service ps dcms_agent --format "table {{.Node}}\t{{.CurrentState}}\t{{.Image}}"'
```

**Health check (per host):**
```bash
# gRPC health check on each agent node
for host in $(docker node ls --format "{{.Hostname}}"); do
  grpc_health_probe -addr="${host}:9090" && echo "$host: HEALTHY" || echo "$host: UNHEALTHY"
done
```

**Rollback trigger:** Any agent node fails health check after update.

---

### Post-Deployment Verification (10:38–11:00 UTC)

Full system verification after all services are running v1.0.0.

```bash
# Verify all services report correct version
curl -sf https://dcms.example.com/v1/health | jq .services

# Run post-deploy smoke suite
pnpm test:e2e --suite post-deploy-smoke --base-url https://dcms.example.com

# Verify Grafana dashboards show all services green
# Dashboard: https://grafana.dcms.internal/d/dcms-overview

# Check error budget is not being consumed
curl -sf http://prometheus:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))' \
  | jq '.data.result[0].value[1]'
# Expected: < 0.001 (< 0.1% error rate)
```

---

## Go/No-Go Criteria

The following 8 criteria must ALL pass before each deployment stage advances. The tech_lead_agent has authority to hold or abort at any gate.

| # | Criterion | Pass Condition | Measured By |
|---|-----------|---------------|-------------|
| 1 | Database migration integrity | All 15 migrations applied, schema_version = 1.0.0, zero migration errors | `schema_migrations` table query |
| 2 | Service health endpoints | All 12 services return `{"status":"healthy"}` within 30s | Automated health sweep script |
| 3 | API error rate | HTTP 5xx rate < 0.1% over 5-minute rolling window | Prometheus query |
| 4 | API p95 latency | Read operations p95 < 200ms, write operations p95 < 500ms | Prometheus histogram query |
| 5 | Auth subsystem | JWT issuance and validation succeed in smoke test | E2E smoke test: `auth.smoke.ts` |
| 6 | Container lifecycle | Create/start/stop/remove cycle completes in smoke test | E2E smoke test: `container.smoke.ts` |
| 7 | Frontend availability | Dashboard loads with correct version header, LCP < 2500ms | Synthetic test + header check |
| 8 | Monitoring coverage | All Prometheus targets UP, Grafana dashboards receiving data | Prometheus targets API + Grafana health |

---

## Stakeholder Communications

### Pre-Release (2026-09-28 08:00 UTC)

**Channel:** Slack #releases + email to engineering-all@dcms.internal  
**Message template:**
> DCMS v1.0.0 GA release is scheduled for Wednesday 2026-09-30 10:00–14:00 UTC. Change freeze begins Monday 18:00 UTC. Release team: please confirm availability in #releases.

**Notify:** Engineering lead, all team leads, on-call rotation.

### Release Start (2026-09-30 09:55 UTC)

**Channel:** Slack #releases + PagerDuty release event  
**Message template:**
> DCMS v1.0.0 deployment beginning at 10:00 UTC. Release window: 10:00–14:00 UTC. On-call: [name]. Go/no-go authority: tech_lead_agent. Status updates every 30 minutes in this channel.

**Notify:** Engineering lead, on-call engineer, product_manager_agent.

### Stage Completion Updates (rolling)

**Channel:** Slack #releases  
**Cadence:** After each deployment step completes or any go/no-go gate is reached.  
**Template:** `[10:18 UTC] Step 4 COMPLETE — container-service, image-service, network-service, volume-service healthy on v1.0.0. Advancing to Step 5.`

### Release Complete (est. 2026-09-30 11:00 UTC)

**Channel:** Slack #releases + #general + email to customers (via product_manager_agent)  
**Message template:**
> DCMS v1.0.0 GA is now live. All services healthy. Release notes: https://docs.dcms.example.com/release-notes/v1.0.0. Post-release monitoring window: 24h (until 2026-10-01 11:00 UTC).

**Notify:** All engineering, product_manager_agent sends customer-facing announcement.

### Rollback Initiated (if triggered)

**Channel:** Slack #releases + #incidents + PagerDuty P1  
**Message template:**
> ROLLBACK INITIATED for DCMS v1.0.0 at [TIME] UTC. Trigger: [reason]. ETA to restore v0.9.x: [N] minutes. Incident commander: tech_lead_agent. Updates every 10 minutes.

---

## Post-Deploy Monitoring Window

**Duration:** 24 hours — 2026-09-30 10:00 UTC to 2026-10-01 10:00 UTC  
**Primary dashboard:** https://grafana.dcms.internal/d/dcms-release-watch  

### SLO Watch Schedule

| Period | On-Call | Escalation Path |
|--------|---------|-----------------|
| 10:00–18:00 UTC (Day 1) | Primary on-call + devops_developer_agent | tech_lead_agent → release_manager_agent |
| 18:00–08:00 UTC (Night) | Primary on-call (PagerDuty) | Senior on-call → tech_lead_agent |
| 08:00–10:00 UTC (Day 2) | Primary on-call | tech_lead_agent → release_manager_agent |

### Escalation Thresholds

| Threshold | Action |
|-----------|--------|
| Error rate > 0.1% for 5 min | Page on-call engineer |
| Error rate > 0.5% for 5 min | Page tech_lead_agent |
| Error rate > 2% for 2 min | Initiate rollback decision — tech_lead_agent authority |
| Any SLO breach | Page release_manager_agent + open P1 incident |
| Data integrity anomaly detected | Immediate rollback — no gate required |

### Error Budget Tracking

Target: Consume less than 10% of monthly error budget in first 24h.  
Monthly error budget (99.9% SLO): 43.8 minutes downtime equivalent.  
24h allowance: 4.38 minutes (10% of monthly).  

Prometheus query for real-time budget consumption:
```promql
1 - (
  sum(rate(http_requests_total{status!~"5.."}[24h]))
  /
  sum(rate(http_requests_total[24h]))
)
```

---

## Release Completion Sign-Off

| Role | Sign-Off | Condition |
|------|----------|-----------|
| devops_developer_agent | Required | All 12 services healthy on v1.0.0 |
| qa_lead_agent | Required | Post-deploy smoke suite 100% pass |
| tech_lead_agent | Required | All go/no-go criteria met |
| release_manager_agent | Final | 24h monitoring window completed, no SLO breaches |

Release is not considered closed until release_manager_agent issues final sign-off after the 24h monitoring window on 2026-10-01 10:00 UTC.
