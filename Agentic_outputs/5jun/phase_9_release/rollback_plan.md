# DCMS v1.0.0 Rollback Runbook

**Release:** Generic Docker Container Management System v1.0.0  
**Runbook Version:** 1.0  
**Owner:** release_manager_agent  
**Last Updated:** 2026-09-30  
**Classification:** Operations — Critical Path  

---

## Rollback Decision Authority

**tech_lead_agent has sole authority to initiate a rollback at any point during the deployment or monitoring window.**

In the absence of tech_lead_agent (no response within 5 minutes during a P1 incident), authority escalates in the following order:

1. tech_lead_agent (primary authority)
2. release_manager_agent (secondary)
3. On-call senior engineer (tertiary, for emergency stabilization only)

No rollback may be initiated by devops_developer_agent or qa_lead_agent without explicit authorization from one of the above. Automatic rollbacks (triggered by the canary controller) do not require human authorization — they are pre-approved by this document.

---

## Rollback Triggers

The following conditions **mandate** immediate escalation to the rollback decision authority. When two or more triggers fire simultaneously, rollback is the presumed course of action unless tech_lead_agent actively decides otherwise with documented rationale.

| # | Trigger | Threshold | Measurement Window |
|---|---------|-----------|-------------------|
| 1 | API error rate | > 2% | 5 consecutive minutes |
| 2 | API p99 latency | > 2000ms | 5 consecutive minutes |
| 3 | Data corruption detected | Any confirmed instance | Immediate |
| 4 | Security vulnerability discovered | CVSS >= 7.0 in deployed image | Immediate |
| 5 | Critical service alerts firing simultaneously | >= 3 distinct services | Any 5-minute window |
| 6 | Authentication subsystem failure | Auth service returning 5xx on > 5% of requests | 2 consecutive minutes |
| 7 | Database connection pool exhaustion | > 95% pool utilization across all services | 3 consecutive minutes |
| 8 | Container start failure rate | > 10% of container start operations failing | 5-minute window |

### Automatic vs. Manual Rollback

| Trigger Source | Type | Authority Required |
|---------------|------|-------------------|
| Canary controller (error_rate > 1% for 2 min OR p99 > 1000ms) | Automatic | None — pre-authorized |
| Manual observation by on-call or release team | Manual | tech_lead_agent |
| PagerDuty automated alert crossing threshold | Decision required | tech_lead_agent |
| Security scan result (post-deploy) | Immediate | release_manager_agent or tech_lead_agent |

---

## Rollback Scenarios

---

### Scenario A: Service-Level Rollback (Most Common)

**Use when:** A single service is misbehaving but the rest of the stack is healthy. Canary traffic has already been reverted to stable.

**RTO target:** < 5 minutes

**Decision criteria:** Isolated 5xx errors or high latency attributable to one service, with other services nominal.

```bash
# Identify the affected service
docker service ps dcms_<service-name> \
  --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}\t{{.Error}}"

# Roll back a single service to its previous image
# Docker Swarm retains the previous task spec — --rollback uses it
docker service update --rollback dcms_<service-name>

# Monitor rollback progress (tasks should converge within 60s)
watch -n 3 'docker service ps dcms_<service-name> \
  --format "table {{.Name}}\t{{.CurrentState}}\t{{.Image}}" \
  --filter desired-state=running'

# Verify the rollback completed
docker service inspect dcms_<service-name> \
  --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
# Should show the previous v0.9.x image tag

# Confirm health endpoint is healthy
curl -sf https://dcms.example.com/v1/<service-path>/health | jq .
# Expected: {"status":"healthy"}

# Verify system-level health
curl -sf https://dcms.example.com/v1/health | jq .
```

**Service rollback commands (copy-paste ready):**

```bash
# api-gateway
docker service update --rollback dcms_api-gateway

# auth-service
docker service update --rollback dcms_auth-service

# container-service
docker service update --rollback dcms_container-service

# image-service
docker service update --rollback dcms_image-service

# network-service
docker service update --rollback dcms_network-service

# volume-service
docker service update --rollback dcms_volume-service

# monitor-service
docker service update --rollback dcms_monitor-service

# log-service
docker service update --rollback dcms_log-service

# notification-service
docker service update --rollback dcms_notification-service

# cluster-service
docker service update --rollback dcms_cluster-service

# frontend
docker service update --rollback dcms_frontend

# agent
docker service update --rollback dcms_agent
```

**Post-rollback verification:**
```bash
# Confirm all services now show pre-v1.0.0 image
docker stack ps dcms --format "table {{.Name}}\t{{.Image}}" | grep -v "Shutdown"

# Check error rate normalizes within 2 minutes
curl -sf "http://prometheus:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_requests_total{status=~"5.."}[2m])) / sum(rate(http_requests_total[2m]))' \
  | jq '.data.result[0].value[1]'
# Expected: < 0.001
```

---

### Scenario B: Full Stack Rollback

**Use when:** Multiple services are failing, the problem cannot be isolated to a single service, or a systemic defect is suspected (e.g., new cross-service protocol incompatibility, Vault secret issue affecting all services).

**RTO target:** < 30 minutes (matches NFR-RTO-001: system recovery within 30 minutes)

**Decision criteria:** Three or more critical service alerts firing, or error rate > 5% system-wide.

#### Step 1: Stop All v1.0.0 Services (0–5 minutes)

```bash
# Scale all v1.0.0 services to 0 replicas to stop serving traffic
# Do NOT remove the stack — retain config for forensics
for svc in api-gateway auth-service container-service image-service \
           network-service volume-service monitor-service log-service \
           notification-service cluster-service frontend agent; do
  docker service scale dcms_${svc}=0 &
done
wait
echo "All services scaled to 0"

# Immediately revert Kong to point at v0.9.x upstreams (if canary was active)
CANARY_WEIGHT=0 envsubst < kong-canary.yaml | deck sync --state -
```

#### Step 2: Restore PostgreSQL from Pre-Release Snapshot (5–20 minutes)

```bash
# Retrieve the pre-release backup (recorded during 2026-09-28 pre-release window)
aws s3 cp \
  s3://dcms-backups/releases/v1.0.0/pre-release/dcms-prod-pre-v1.0.0-*.pgdump \
  /restore/dcms-prod-pre-v1.0.0.pgdump

# Verify backup checksum
sha256sum -c /backups/dcms-prod-pre-v1.0.0.sha256

# Connect to PostgreSQL and restore
# NOTE: This drops and recreates the dcms_production database
psql $POSTGRES_ADMIN_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='dcms_production' AND pid <> pg_backend_pid();"
psql $POSTGRES_ADMIN_URL -c "DROP DATABASE IF EXISTS dcms_production_rollback_save;"
psql $POSTGRES_ADMIN_URL -c "ALTER DATABASE dcms_production RENAME TO dcms_production_rollback_save;"
psql $POSTGRES_ADMIN_URL -c "CREATE DATABASE dcms_production OWNER dcms_app;"

pg_restore \
  --host=$PROD_DB_HOST \
  --username=dcms_admin \
  --dbname=dcms_production \
  --jobs=4 \
  --verbose \
  /restore/dcms-prod-pre-v1.0.0.pgdump

# Alternatively: use PITR to T-1h if managed PostgreSQL (RDS/Cloud SQL)
# gcloud sql instances restore-backup dcms-prod \
#   --backup-id=auto-$(date -u -d "1 hour ago" +%Y%m%d%H%M) \
#   --restore-instance=dcms-prod
```

#### Step 3: Redeploy Previous Stack Version (20–28 minutes)

```bash
# Deploy v0.9.x stack from stored compose file
docker stack deploy \
  --compose-file docker-stack-v0.9.x.yaml \
  --with-registry-auth \
  dcms

# Wait for all services to converge
docker stack ps dcms --filter desired-state=running | grep -v "Shutdown"
```

#### Step 4: Verify Data Integrity (28–30 minutes)

```bash
# Check row counts match expected baseline (recorded pre-migration)
psql $DATABASE_URL -c "
  SELECT
    'containers' as table_name, COUNT(*) FROM containers
  UNION ALL SELECT 'images', COUNT(*) FROM images
  UNION ALL SELECT 'networks', COUNT(*) FROM networks
  UNION ALL SELECT 'volumes', COUNT(*) FROM volumes
  UNION ALL SELECT 'users', COUNT(*) FROM users;
"

# Verify schema version matches v0.9.x baseline
psql $DATABASE_URL -c "SELECT version, description FROM schema_migrations ORDER BY version DESC LIMIT 3;"
# Expected: latest migration = 000012_xxx (pre-v1.0.0 migrations only)

# Run data integrity checks
psql $DATABASE_URL -c "
  SELECT COUNT(*) as orphaned_containers
  FROM containers c
  LEFT JOIN users u ON c.owner_id = u.id
  WHERE u.id IS NULL;
"
# Expected: 0
```

---

### Scenario C: Database Migration Rollback

**Use when:** A specific database migration introduced a regression (constraint violation, performance degradation, schema incompatibility) but services are otherwise functional.

**RTO target:** < 10 minutes for single-migration rollback

**Pre-condition:** Migration rollback is only safe if no application data has been written to new columns/tables introduced in the migrations being reversed. Verify this before proceeding.

#### Step 1: Check Which Migrations Need Reversal

```bash
# View current applied migrations
psql $DATABASE_URL -c "
  SELECT version, description, applied_at
  FROM schema_migrations
  ORDER BY version DESC
  LIMIT 5;
"
```

#### Step 2: Run Down Migrations

```bash
# Revert one migration at a time — confirm after each step
docker run --rm \
  --network dcms_backend \
  --env DATABASE_URL=$DATABASE_URL \
  ghcr.io/dcms/dcms/migrate:v1.0.0 \
  -database $DATABASE_URL \
  -path /migrations \
  down 1

# Verify the migration was reverted
psql $DATABASE_URL -c "SELECT version, description FROM schema_migrations ORDER BY version DESC LIMIT 3;"
```

#### Step 3: Revert Affected Services

After down-migration, redeploy only the services that depended on the reverted schema changes.

```bash
# Identify affected services from the migration notes in 000015_add_rls_policies.up.sql
# Typically: auth-service, container-service, and api-gateway

docker service update --rollback dcms_auth-service
docker service update --rollback dcms_container-service
docker service update --rollback dcms_api-gateway

# Verify health
for svc in auth-service container-service api-gateway; do
  docker service inspect dcms_${svc} --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
done
```

#### Step 4: Verify Schema Version

```bash
psql $DATABASE_URL -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"
# Expected: version matching v0.9.x baseline (e.g., 000012)
```

---

## RTO Summary

| Scenario | Target RTO | Typical Actual | NFR Reference |
|----------|-----------|----------------|---------------|
| A — Single service rollback | < 5 minutes | 2–3 minutes | NFR-HA-003 |
| B — Full stack rollback | < 30 minutes | 20–28 minutes | NFR-RTO-001 |
| C — Migration rollback | < 10 minutes | 5–8 minutes | NFR-RTO-001 |
| Canary revert (Kong split) | < 1 minute | < 30 seconds | NFR-HA-003 |

---

## Communication During Rollback

### Immediate Notification (within 2 minutes of rollback decision)

**Channels:** Slack #releases + #incidents + PagerDuty P1

**Message template:**
```
ROLLBACK INITIATED — DCMS v1.0.0
Time: [UTC timestamp]
Trigger: [specific metric and value, e.g., "API error rate 3.2% for 5 min"]
Scenario: [A / B / C]
ETA to restore: [N] minutes
Incident commander: tech_lead_agent
Runbook: https://docs.dcms.internal/ops/rollback-runbook-v1.0.0
Status channel: #incidents thread INC-[n]
```

**Notify:**
- tech_lead_agent (incident commander)
- release_manager_agent
- On-call engineer
- product_manager_agent (for customer communication)
- devops_developer_agent (executing rollback)

### Status Updates

Provide updates every **10 minutes** in the incident thread until rollback is complete and stable.

**Update template:**
```
[TIME UTC] Rollback status: [STEP X / TOTAL] — [description of current action]
Services restored: [N/12]
DB status: [OK / RESTORING]
ETA to completion: [N] minutes
```

### Rollback Complete Notification

**Message template:**
```
ROLLBACK COMPLETE — DCMS v1.0.0 reverted to v0.9.x
Time: [UTC timestamp]
Duration: [N] minutes (RTO: [WITHIN TARGET / EXCEEDED — explain])
System health: ALL SERVICES HEALTHY
Error rate: [value]%
Incident: INC-[n] — remains open for post-mortem
Next steps: Post-mortem scheduled for [date], re-release checklist initiated
```

### Customer Communication

product_manager_agent is responsible for customer-facing communications. Use the following template for Status Page update:

```
Incident: DCMS Platform Degradation
Status: Investigating → Identified → Monitoring → Resolved
Impact: [describe scope — e.g., "Container create operations returning errors for some users"]
Timeline:
  [TIME] — Issue identified
  [TIME] — Rollback initiated
  [TIME] — Service restored to stable version
  [TIME] — All operations normal
Next update: [TIME] or upon resolution
```

---

## Post-Rollback Procedures

### Incident Report (within 24 hours of rollback)

The incident commander (tech_lead_agent) must produce an incident report covering:

1. **Timeline** — exact sequence of events from deployment to rollback completion
2. **Root cause** — identified or suspected cause of the regression
3. **Impact** — user-facing impact, error count, data affected (if any)
4. **Detection** — how the issue was detected (automated alert / user report / manual observation)
5. **Rollback execution** — how long each step took, any complications
6. **Data integrity** — confirm no data loss or corruption

### Root Cause Analysis (within 5 business days)

A blameless post-mortem is required. Attendees: tech_lead_agent, devops_developer_agent, qa_lead_agent, release_manager_agent, and relevant service owners.

Post-mortem document template location: `https://docs.dcms.internal/ops/postmortem-template`

### Re-Release Checklist

Before DCMS v1.0.0 can be re-released after a rollback, all items below must be completed and signed off by tech_lead_agent:

- [ ] Root cause identified and documented
- [ ] Fix implemented and code-reviewed (PR merged to main)
- [ ] Unit tests added covering the regression scenario
- [ ] Integration tests updated
- [ ] E2E test suite passes 100% in staging
- [ ] Performance tests show no regression vs v0.9.x baseline
- [ ] Staging deployment completed without issues
- [ ] 72-hour staging soak test completed
- [ ] qa_lead_agent re-approves release gate
- [ ] tech_lead_agent signs off on re-release
- [ ] Release version bumped (v1.0.1 if patch, v1.1.0 if minor changes required)
- [ ] Deployment schedule updated with lessons learned
- [ ] Canary rollout plan updated if canary metrics were insufficient
- [ ] Customer communication drafted for re-release notification
