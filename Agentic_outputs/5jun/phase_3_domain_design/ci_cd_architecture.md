# CI/CD Architecture
## Generic Docker Container Management System (DCMS)

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Document ID   | CICD-ARCH-DCMS-001                             |
| Version       | 1.0.0                                          |
| Status        | Approved                                       |
| Date          | 2026-06-05                                     |
| Author        | DevOps Architect Agent                         |
| Parent BRD    | BRD-DCMS-001                                   |
| Parent NFR    | NFR-DCMS-001                                   |

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [GitHub Actions Workflow Design](#2-github-actions-workflow-design)
   - 2.1 PR Workflow
   - 2.2 Main Branch Workflow
   - 2.3 Nightly Workflow
3. [Build Strategy](#3-build-strategy)
4. [Image Registry](#4-image-registry)
5. [Deployment Strategy](#5-deployment-strategy)
6. [Environment Promotion](#6-environment-promotion)
7. [Secret Management](#7-secret-management)
8. [Quality Gates](#8-quality-gates)
9. [Rollback Procedure](#9-rollback-procedure)
10. [Artifact Versioning and Retention](#10-artifact-versioning-and-retention)

---

## 1. Pipeline Overview

### 1.1 Flow Diagram

```
Developer Push
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  FEATURE BRANCH                                             │
│  Local: pre-commit hooks (gitleaks, lint-staged)           │
└─────────────────────┬───────────────────────────────────────┘
                      │ git push
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PR WORKFLOW (pr.yml)                                       │
│  lint → unit test → build (no push) → Trivy scan →         │
│  contract tests → Pact verification                        │
│                                                             │
│  GATE: all checks green + ≥1 reviewer approval             │
└─────────────────────┬───────────────────────────────────────┘
                      │ merge to main
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  MAIN BRANCH WORKFLOW (main.yml)                            │
│  build + push images (ghcr.io) → deploy staging →          │
│  integration tests → smoke tests                           │
│                                                             │
│  GATE: integration tests pass, no CRITICAL CVEs             │
└─────────────────────┬───────────────────────────────────────┘
                      │ auto-deploy
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGING ENVIRONMENT (Swarm 3-node)                        │
│  Full stack, shared DB, Redis Sentinel                     │
│  Automated: integration tests, load tests (k6 smoke),      │
│  OWASP ZAP baseline, Pact provider verification            │
│                                                             │
│  GATE: all automated tests pass                             │
└─────────────────────┬───────────────────────────────────────┘
                      │ MANUAL APPROVAL (release manager)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PRODUCTION ENVIRONMENT (Swarm 5+ nodes)                   │
│  Rolling update, health-check gating per service           │
│  Post-deploy: smoke tests, SLO confirmation                │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Environments and Triggers

| Environment | Trigger                              | Deployment Method       | Approval   |
|-------------|--------------------------------------|-------------------------|------------|
| dev         | Any feature branch push              | `docker compose up`     | None       |
| staging     | Merge to `main`                      | Swarm `docker stack deploy` | None (auto) |
| prod        | Manual `workflow_dispatch` after staging gate | Swarm rolling update | Release Manager |

### 1.3 Branch Strategy

| Branch Pattern       | Purpose                        | Lifecycle                     |
|----------------------|--------------------------------|-------------------------------|
| `main`               | Production-ready trunk         | Permanent, protected          |
| `feature/*`          | Feature development            | Deleted after PR merge        |
| `fix/*`              | Bug fixes                      | Deleted after PR merge        |
| `release/v*`         | Release candidate stabilisation | Merged to main + tagged      |
| `hotfix/*`           | Production emergency fixes     | Merged to main + cherry-picked to release |

Branch protection rules on `main`:
- Require PR with ≥1 approver and no unresolved conversations
- Require status checks: `pr / lint`, `pr / unit-test`, `pr / build`, `pr / trivy-scan`, `pr / contract-tests`
- Require linear history (squash or rebase merge only)
- Restrict force-push; restrict branch deletion

---

## 2. GitHub Actions Workflow Design

### 2.1 PR Workflow (`pr.yml`)

**Trigger:** `pull_request` (types: `opened`, `synchronize`, `reopened`) targeting `main`

**Runner:** `ubuntu-24.04` (GitHub-hosted)

**Concurrency:** Cancel in-progress runs for the same PR (`concurrency.group: pr-${{ github.event.pull_request.number }}`)

```
Job: lint
  ├── actions/checkout@v4
  ├── actions/setup-go@v5 (Go 1.23)
  ├── golangci-lint run (config: .golangci.yml)
  ├── actions/setup-node@v4 (Node 22 LTS)
  └── eslint + prettier --check (frontend)

Job: unit-test (needs: lint)
  ├── actions/checkout@v4
  ├── actions/setup-go@v5
  ├── go test ./... -race -coverprofile=coverage.out -covermode=atomic
  ├── coverage threshold gate: go tool cover → must be ≥ 80%
  ├── Upload coverage to Codecov (actions/upload-artifact)
  ├── npm ci && npm test --coverage (frontend Jest)
  └── Frontend coverage threshold gate: ≥ 80% statements

Job: build (needs: unit-test)
  ├── actions/checkout@v4
  ├── docker/setup-buildx-action@v3 (BuildKit)
  ├── docker/build-push-action@v6
  │     push: false          ← no push on PR
  │     cache-from: type=gha
  │     cache-to: type=gha,mode=max
  │     outputs: type=docker,dest=/tmp/image.tar
  └── actions/upload-artifact (image tarballs, 1-day retention)

Job: trivy-scan (needs: build)
  ├── actions/download-artifact (image tarballs)
  ├── aquasecurity/trivy-action@master
  │     scan-type: image
  │     input: /tmp/image.tar
  │     format: sarif
  │     severity: CRITICAL,HIGH
  │     exit-code: 1          ← fail on CRITICAL
  └── github/codeql-action/upload-sarif (sarif report → GitHub Security tab)

Job: contract-tests (needs: build)
  ├── docker compose -f docker-compose.test.yml up -d (starts pact broker + services)
  ├── go test ./... -run TestPact -tags=contract
  ├── pact-cli publish (publish consumer pacts to Pact Broker)
  └── docker compose down

Job: pact-verification (needs: contract-tests)
  ├── Checkout provider service
  ├── go test ./... -run TestPactProvider -tags=pactprovider
  │     PACT_BROKER_URL=${{ secrets.PACT_BROKER_URL }}
  │     PACT_BROKER_TOKEN=${{ secrets.PACT_BROKER_TOKEN }}
  └── Exit non-zero if any consumer contract fails verification
```

**Estimated duration:** lint 3min + unit-test 6min + build 8min + trivy 4min + contract 5min = ~26 minutes total (parallel where noted).

### 2.2 Main Branch Workflow (`main.yml`)

**Trigger:** `push` to `main` branch

**Runner:** `ubuntu-24.04` (GitHub-hosted); deploy jobs use self-hosted runner on Swarm manager node (`runs-on: [self-hosted, swarm-manager]`)

```
Job: build-and-push
  ├── actions/checkout@v4
  ├── docker/login-action@v3 (registry: ghcr.io, GITHUB_TOKEN)
  ├── Extract metadata (docker/metadata-action@v5)
  │     tags: |
  │       type=sha,prefix=sha-,format=short
  │       type=semver,pattern={{version}}   (if tagged)
  │       type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
  ├── docker/setup-buildx-action@v3
  ├── For each of 12 services (matrix strategy):
  │     docker/build-push-action@v6
  │       push: true
  │       tags: ${{ steps.meta.outputs.tags }}
  │       labels: ${{ steps.meta.outputs.labels }}
  │       cache-from: type=registry,ref=ghcr.io/org/dcms-<svc>:buildcache
  │       cache-to: type=registry,ref=ghcr.io/org/dcms-<svc>:buildcache,mode=max
  │       provenance: true     (SLSA level 2)
  │       sbom: true           (CycloneDX SBOM attached to image)
  └── Output: IMAGE_DIGEST per service (pinned sha256 digest)

Job: trivy-registry-scan (needs: build-and-push)
  ├── aquasecurity/trivy-action (scan pushed image by digest)
  ├── Exit-code 1 on CRITICAL CVE → blocks staging deploy
  └── Upload SARIF to Security tab

Job: deploy-staging (needs: trivy-registry-scan)
  runs-on: [self-hosted, swarm-manager, staging]
  ├── Render Swarm stack file: envsubst or Helm template
  │     IMAGE_TAG=${{ github.sha }} injected into stack.yml
  ├── docker stack deploy --with-registry-auth --resolve-image always
  │     -c stack-staging.yml dcms-staging
  ├── Wait for service convergence:
  │     scripts/wait-stack-healthy.sh dcms-staging 300
  │     (polls `docker service ls` until all replicas = desired)
  └── Fail job if convergence not reached within 5 minutes

Job: integration-tests (needs: deploy-staging)
  runs-on: [self-hosted, swarm-manager, staging]
  ├── go test ./integration/... -v -timeout 10m
  │     API_BASE_URL=https://staging.dcms.internal
  ├── k6 run --vus 20 --duration 60s scripts/smoke.js
  └── Upload test results (JUnit XML) as artifact

Job: owasp-zap-baseline (needs: integration-tests)
  ├── zaproxy/action-baseline@v0.12.0
  │     target: https://staging.dcms.internal
  │     fail_action: true
  │     rules_file_name: zap-rules.tsv
  └── Upload ZAP report as artifact

Job: staging-gate-report (needs: [integration-tests, owasp-zap-baseline])
  └── Post summary comment to last merged PR with test results

Job: await-prod-approval (needs: staging-gate-report)
  ├── environment: production          (requires environment protection rule)
  └── Uses GitHub Environment with required reviewers (release-manager team)

Job: deploy-prod (needs: await-prod-approval)
  runs-on: [self-hosted, swarm-manager, prod]
  ├── docker stack deploy --with-registry-auth --resolve-image always
  │     -c stack-prod.yml dcms-prod
  ├── scripts/wait-stack-healthy.sh dcms-prod 600
  ├── go test ./integration/... -run TestSmoke -v
  │     API_BASE_URL=https://dcms.example.com
  └── Tag git commit as deployed: git tag deploy/prod-$TIMESTAMP
```

**Service matrix** (12 services built in parallel):

| Service Key         | Image Name                          |
|---------------------|-------------------------------------|
| api-server          | ghcr.io/org/dcms-api-server         |
| web-ui              | ghcr.io/org/dcms-web-ui             |
| agent               | ghcr.io/org/dcms-agent              |
| auth-service        | ghcr.io/org/dcms-auth-service       |
| notification-svc    | ghcr.io/org/dcms-notification-svc   |
| image-scanner       | ghcr.io/org/dcms-image-scanner      |
| log-aggregator      | ghcr.io/org/dcms-log-aggregator     |
| metrics-collector   | ghcr.io/org/dcms-metrics-collector  |
| cluster-controller  | ghcr.io/org/dcms-cluster-controller |
| registry-proxy      | ghcr.io/org/dcms-registry-proxy     |
| audit-service       | ghcr.io/org/dcms-audit-service      |
| migration-runner    | ghcr.io/org/dcms-migration-runner   |

### 2.3 Nightly Workflow (`nightly.yml`)

**Trigger:** `schedule: - cron: '0 2 * * *'` (02:00 UTC daily)

**Purpose:** Dependency updates, extended security scans, backup verification

```
Job: renovate-update
  ├── renovatebot/github-action@v40
  │     configurationFile: renovate.json
  └── Opens PRs for outdated dependencies (Go modules, npm, Docker base images)

Job: full-trivy-scan (scans all images currently in ghcr.io with :latest tag)
  ├── For each service image (matrix):
  │     trivy image ghcr.io/org/dcms-<svc>:latest
  │     --format json --output trivy-<svc>.json
  │     --db-update (force fresh vuln DB)
  ├── Parse results: any new CRITICAL CVEs → create GitHub Issue
  └── Upload all reports as artifact

Job: dependency-audit
  ├── go list -m -json all | nancy sleuth    (Go vuln audit)
  ├── npm audit --audit-level=high           (frontend npm)
  └── Post summary to #security Slack channel (secrets.SLACK_WEBHOOK)

Job: db-backup-verification
  runs-on: [self-hosted, swarm-manager, staging]
  ├── trigger-backup.sh staging             (calls DCMS API to initiate backup)
  ├── Wait 5 minutes for backup to complete
  ├── verify-backup.sh staging              (restore to ephemeral container, run checksums)
  └── Alert #ops Slack if verification fails

Job: gitleaks-full-scan
  ├── zricethezav/gitleaks-action@v2
  │     config: gitleaks.toml
  │     scan: all                           (full history, not just new commits)
  └── Create issue if new secrets found

Job: license-scan
  ├── fossa-action (with FOSSA_API_KEY)
  └── Fail if any GPL/LGPL copyleft licenses introduced without approval
```

---

## 3. Build Strategy

### 3.1 Docker BuildKit Multi-Stage Builds

All DCMS service images use a standardised multi-stage `Dockerfile` pattern:

```
Stage 1: deps
  FROM golang:1.23-alpine AS deps
  WORKDIR /app
  COPY go.mod go.sum ./
  RUN --mount=type=cache,target=/root/.cache/go-build \
      --mount=type=cache,target=/go/pkg/mod \
      go mod download

Stage 2: build
  FROM deps AS build
  COPY . .
  RUN --mount=type=cache,target=/root/.cache/go-build \
      CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
      go build -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
      -o /bin/service ./cmd/service

Stage 3: test (used only in CI, not pushed)
  FROM build AS test
  RUN go test ./... -race -count=1

Stage 4: final
  FROM gcr.io/distroless/static-debian12:nonroot AS final
  COPY --from=build /bin/service /service
  USER nonroot:nonroot
  ENTRYPOINT ["/service"]
```

Key BuildKit flags set in all build jobs:
- `DOCKER_BUILDKIT=1` (enforced by `docker/setup-buildx-action`)
- `--build-arg BUILDKIT_INLINE_CACHE=1`
- `--platform linux/amd64` (v1 scope; `linux/arm64` added in v2)

### 3.2 Layer Caching

| Cache Strategy         | Used In              | Mechanism                                      |
|------------------------|----------------------|------------------------------------------------|
| GitHub Actions cache   | PR builds            | `type=gha` (GitHub cache backend)             |
| Registry cache         | Main + nightly       | `type=registry,ref=ghcr.io/org/<svc>:buildcache` |
| Go module cache mount  | All Go builds        | `RUN --mount=type=cache,target=/go/pkg/mod`   |
| Go build cache mount   | All Go builds        | `RUN --mount=type=cache,target=/root/.cache/go-build` |
| npm cache              | Frontend builds      | `actions/cache` with `~/.npm` key             |

Cache invalidation: the `deps` stage cache is busted only when `go.mod`/`go.sum` or `package-lock.json` changes. The `build` stage cache is busted on any `COPY . .` change.

### 3.3 Image Digest Pinning

All base images in Dockerfiles are pinned by `sha256` digest, not floating tags:

```dockerfile
FROM golang:1.23-alpine@sha256:<pinned-digest> AS deps
FROM gcr.io/distroless/static-debian12@sha256:<pinned-digest>:nonroot AS final
```

Renovate is configured to automatically open PRs when base image digests update:

```json
// renovate.json (excerpt)
{
  "dockerfile": {
    "pinDigests": true
  }
}
```

### 3.4 Image Signing (SLSA)

- All pushed images are signed using `cosign` with keyless OIDC signing (GitHub Actions OIDC token → Sigstore Fulcio CA)
- SBOM attached to image manifest in CycloneDX JSON format using `syft`
- Provenance attestation: `--provenance=true --sbom=true` in `docker/build-push-action@v6`
- Verification step in deploy jobs: `cosign verify ghcr.io/org/dcms-<svc>@<digest>` before `docker stack deploy`

---

## 4. Image Registry

### 4.1 Registry: GitHub Container Registry (ghcr.io)

| Registry URL pattern   | `ghcr.io/org/dcms-<service-key>`                            |
|------------------------|-------------------------------------------------------------|
| Authentication         | `GITHUB_TOKEN` in CI; personal access token for local dev  |
| Visibility             | Private repository images; read access granted to deploy runners |
| Retention              | Controlled via GitHub Package retention policies (see Section 10) |

### 4.2 Image Tagging Strategy

Every image push creates three tags simultaneously:

| Tag Pattern           | Example                        | Purpose                                    |
|-----------------------|--------------------------------|--------------------------------------------|
| `sha-<7-char-SHA>`    | `sha-a1b2c3d`                  | Immutable reference to exact commit build  |
| `<semver>`            | `1.4.2`                        | Semantic version (only on tagged releases) |
| `<semver>-staging`    | `1.4.2-staging`                | Staging-promoted build                     |
| `latest`              | `latest`                       | Latest main branch build (mutable)         |
| `<branch>-latest`     | `release-v1.4-latest`          | Latest build on a long-lived branch        |

Deployment stack files always reference images by `sha-<SHA>` tag, never `latest`, to ensure deterministic deploys. The `latest` tag is used only for nightly security scans.

### 4.3 Image Promotion Flow

```
Build (main.yml)
  → Push: sha-<SHA>  (immutable)

Staging deploy
  → Re-tag: sha-<SHA> as <version>-staging
  → No rebuild; same layer digests

Prod deploy (after manual approval)
  → Re-tag: sha-<SHA> as <semver> and latest
  → Image digest logged in deployment record
```

Re-tagging uses `crane tag` (from `gcr.io/go-containerregistry/crane`) to avoid repulling image layers.

### 4.4 Registry Security

- Repository-scoped GITHUB_TOKEN with `write:packages` permission only in `build-and-push` job
- All other jobs use read-only token
- GitHub Packages audit log enabled; exported to Loki
- Image pull secret (`dcms-registry-secret`) deployed to Swarm as a Docker secret; rotated monthly

---

## 5. Deployment Strategy

### 5.1 Rolling Update for Docker Swarm Services

All Swarm services use the rolling update strategy. Example service definition in stack file:

```yaml
services:
  api-server:
    image: ghcr.io/org/dcms-api-server:sha-${IMAGE_SHA}
    deploy:
      replicas: 3
      update_config:
        parallelism: 1           # update one replica at a time
        delay: 20s               # wait 20s between each replica
        failure_action: rollback # automatic rollback on failure
        monitor: 60s             # monitor new replica for 60s before continuing
        max_failure_ratio: 0     # any failure triggers rollback
        order: start-first       # start new container before stopping old (zero-downtime)
      rollback_config:
        parallelism: 0           # rollback all at once
        delay: 0s
        failure_action: pause
        monitor: 60s
        order: stop-first
      restart_policy:
        condition: on-failure
        delay: 10s
        max_attempts: 3
        window: 120s
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
      placement:
        constraints:
          - node.role == worker
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s
```

### 5.2 Zero-Downtime Deploy Requirements

| Requirement                                   | Implementation                                              |
|-----------------------------------------------|-------------------------------------------------------------|
| No traffic to unhealthy replica               | `order: start-first` + health check passes before old removed |
| No failed connection during update            | Kong upstream health checks remove failed instances         |
| Database migration backward-compatible        | Expand-contract pattern; migration runs before service update |
| State not lost during replica replacement     | Stateless services (state in Redis/PostgreSQL only)        |
| Convergence verified before declaring success | `wait-stack-healthy.sh` polls until all replicas healthy    |

### 5.3 Migration Job Pattern

Database migrations run as a separate `migration-runner` service with `restart_policy: on-failure, max_attempts: 1` and `deploy.mode: replicated, replicas: 0` by default. Migrations are triggered by:

1. Increasing replicas to 1: `docker service scale dcms-prod_migration-runner=1`
2. Waiting for exit code 0
3. Scaling back to 0 before service update begins

This is orchestrated by `scripts/run-migration.sh` called from `deploy-prod` job.

---

## 6. Environment Promotion

### 6.1 Promotion Rules

| From    | To       | Trigger               | Gate Checks                                                       | Approver              |
|---------|----------|-----------------------|-------------------------------------------------------------------|-----------------------|
| feature | dev      | Push to feature branch | Pre-commit hooks pass                                            | None (developer)      |
| PR      | —        | PR opened/updated     | lint + unit-test + build + trivy + contracts all green           | Peer reviewer         |
| main    | staging  | Merge to main         | trivy-registry-scan passes (no CRITICAL CVEs)                    | None (automatic)      |
| staging | prod     | workflow_dispatch      | Integration tests pass + ZAP scan pass + staging healthy 30 min | Release Manager       |

### 6.2 Staging Soak Period

After auto-deploy to staging, a 30-minute soak timer is enforced before the `await-prod-approval` job becomes available. The timer is implemented as a `sleep 1800` in the `staging-gate-report` job, with a timestamp comment posted to the deployment tracking issue.

### 6.3 Promotion Metadata

Every promotion is recorded in a deployment tracking issue in GitHub with:
- Image SHAs for all 12 services
- Link to workflow run
- Test result summaries
- Approver identity (GitHub username)
- Timestamp

This provides the immutable deployment audit trail required for SOC 2 CC8.1.

---

## 7. Secret Management

### 7.1 CI Secrets (GitHub Secrets)

Stored in GitHub organisation-level secrets, scoped to the DCMS repository:

| Secret Name                | Purpose                                      | Rotation Period  |
|----------------------------|----------------------------------------------|------------------|
| `GHCR_TOKEN`               | Write access to ghcr.io packages             | 90 days          |
| `PACT_BROKER_URL`          | Pact Broker base URL                         | Static           |
| `PACT_BROKER_TOKEN`        | Pact Broker API token                        | 90 days          |
| `STAGING_DEPLOY_KEY`       | SSH key for self-hosted staging runner       | 180 days         |
| `PROD_DEPLOY_KEY`          | SSH key for self-hosted prod runner          | 90 days          |
| `SLACK_WEBHOOK`            | Slack alert channel webhook                  | 180 days         |
| `FOSSA_API_KEY`            | FOSSA license scanning                       | 180 days         |
| `COSIGN_PRIVATE_KEY`       | Image signing key (fallback to keyless)      | 365 days         |
| `VAULT_ADDR`               | HashiCorp Vault address (staging)            | Static           |
| `VAULT_TOKEN_CI`           | Vault CI AppRole token                       | 30 days          |

GitHub Secrets usage rules:
- Never print secret values in workflow logs (enforced by GitHub masking)
- Secrets not passed as CLI arguments; always injected as environment variables
- `ACTIONS_STEP_DEBUG` disabled in production; only enabled temporarily for debugging

### 7.2 Runtime Secrets (HashiCorp Vault)

All application runtime secrets are managed in HashiCorp Vault. Services retrieve secrets at startup using the Vault Agent Sidecar pattern:

```
Vault Path Structure:
  secret/dcms/staging/
    api-server/
      db_password
      redis_password
      jwt_signing_key
      registry_credentials
    auth-service/
      oidc_client_secret
      mfa_totp_issuer_key
    notification-svc/
      smtp_password
      slack_bot_token
    ...

  secret/dcms/prod/
    (same structure, separate credentials)
```

Vault AppRole authentication:
- Each service has a dedicated AppRole with a policy granting read access only to its own path
- AppRole `role_id` stored as Docker Secret; `secret_id` rotated every 30 days by Vault Agent
- Lease duration: 1 hour; auto-renewed by Vault Agent sidecar

### 7.3 Docker Secrets (Swarm)

Swarm-level Docker secrets are used for:
- Registry pull credentials: `dcms-registry-secret`
- TLS certificates (internal CA): `dcms-tls-cert`, `dcms-tls-key`
- Vault AppRole role_ids: `dcms-<service>-vault-role-id`

Docker secrets are mounted as read-only files at `/run/secrets/<secret-name>` inside containers.

---

## 8. Quality Gates

### 8.1 PR Merge Gate (blocks merge to main)

| Check                     | Threshold / Requirement              | Enforcement              |
|---------------------------|--------------------------------------|--------------------------|
| Unit test coverage        | Go backend: ≥ 80% line coverage      | CI job exits non-zero    |
| Unit test coverage        | Frontend Jest: ≥ 80% statement coverage | CI job exits non-zero |
| Lint (Go)                 | Zero golangci-lint findings          | CI job exits non-zero    |
| Lint (JS/TS)              | Zero ESLint errors                   | CI job exits non-zero    |
| Trivy scan                | Zero CRITICAL CVEs in built image    | CI job exits non-zero    |
| Pact consumer contracts   | All consumer tests pass              | CI job exits non-zero    |
| Pact provider verification| All provider contracts verified      | CI job exits non-zero    |
| Peer review               | ≥1 approved review, no unresolved   | GitHub branch protection |
| Secrets scan (gitleaks)   | Zero secrets in diff                 | Pre-commit + CI          |

### 8.2 Staging Promotion Gate (blocks staging deploy)

| Check                         | Threshold / Requirement             |
|-------------------------------|-------------------------------------|
| Trivy registry scan           | Zero CRITICAL CVEs in pushed image  |
| Build job success             | All 12 service images pushed        |
| SBOM + provenance attached    | All images have CycloneDX SBOM      |

### 8.3 Production Promotion Gate (blocks prod deploy)

| Check                          | Threshold / Requirement                |
|--------------------------------|----------------------------------------|
| Integration tests (staging)    | All test suites pass (zero failures)   |
| k6 smoke test                  | p95 latency ≤ 500ms at 20 VUs         |
| OWASP ZAP baseline             | Zero HIGH or CRITICAL findings         |
| Staging soak                   | Staging healthy for ≥ 30 minutes       |
| Manual approval                | Release Manager approval in GitHub     |
| Deployment window              | Only within defined change window      |

### 8.4 Static Analysis (SonarQube)

SonarQube is integrated into the PR workflow as an advisory check (non-blocking initially; promoted to blocking at GA):
- Zero sonarqube P1 bugs or vulnerabilities
- Maintainability rating ≥ A
- Security hotspots reviewed: 100%
- Duplicated code < 3%

---

## 9. Rollback Procedure

### 9.1 Automated Rollback (Swarm)

Automatic rollback is triggered by Swarm when a service update fails its health check within the `monitor` window (60 seconds):

```yaml
update_config:
  failure_action: rollback
  monitor: 60s
  max_failure_ratio: 0
```

When triggered, Swarm automatically rolls all replicas back to the previous task specification. The `wait-stack-healthy.sh` script monitors this and exits non-zero if rollback was triggered, failing the CI deploy job and notifying the team.

### 9.2 Manual Rollback Commands

**Rollback a single service to previous image:**
```bash
# Find previous image SHA
docker service ps dcms-prod_api-server --no-trunc --format "table {{.Name}}\t{{.Image}}\t{{.CurrentState}}"

# Roll back to previous task spec
docker service rollback dcms-prod_api-server

# Alternatively, update to a specific known-good image
docker service update \
  --image ghcr.io/org/dcms-api-server:sha-<previous-sha> \
  --update-order start-first \
  dcms-prod_api-server
```

**Full stack rollback:**
```bash
# Deploy the previous stack file version (kept in git tag)
git checkout deploy/prod-<previous-timestamp>
docker stack deploy \
  --with-registry-auth \
  --resolve-image always \
  -c stack-prod.yml \
  dcms-prod
scripts/wait-stack-healthy.sh dcms-prod 600
```

**Database rollback:**
```bash
# Only required if migration was destructive (contract pattern should prevent this)
# Restore from most recent WAL-archived backup via DCMS DR runbook
# RTO target: 30 minutes (NFR-A-003)
```

### 9.3 Rollback Decision Tree

```
Deploy job fails
     │
     ├─ Swarm auto-rollback triggered?
     │     YES → verify stack healthy → post incident in #ops channel
     │     NO  →
     │           ├─ Health checks failing on new version?
     │           │     YES → run: docker service rollback dcms-prod_<service>
     │           │     NO  → investigate logs before rollback
     │           └─ Data consistency issue suspected?
     │                 YES → engage DBA → assess migration rollback
     │                 NO  → manual rollback via stack file
     │
     └─ Post-rollback: update deployment tracking issue, trigger post-mortem
```

### 9.4 Rollback Notification

A rollback event posts to the `#incidents` Slack channel via Alertmanager webhook with:
- Service name and version rolled back from/to
- Reason (health check failure / manual)
- Link to workflow run
- On-call engineer to engage

---

## 10. Artifact Versioning and Retention

### 10.1 Image Retention Policy

| Environment   | Retention Rule                          | Implementation                           |
|---------------|-----------------------------------------|------------------------------------------|
| Production    | Keep last 10 versions (by semver tag)   | GitHub Packages retention policy: keep 10 versions per `<semver>` tag |
| Staging       | Keep last 5 staging builds              | `<version>-staging` tags; prune >5 via nightly `crane delete` script |
| Development   | Keep last 3 builds per branch           | `<branch>-latest` tags; prune via nightly cleanup job |
| Build cache   | 7 days (GitHub Actions cache)           | GitHub Actions cache eviction policy      |
| Nightly scans | 30 days (Trivy reports as artifacts)    | `actions/upload-artifact` retention: 30 days |

Nightly cleanup job (`nightly.yml`) runs:
```bash
# Prune staging images older than 5 most recent
crane ls ghcr.io/org/dcms-api-server \
  | grep "\-staging$" \
  | sort -V \
  | head -n -5 \
  | xargs -I{} crane delete ghcr.io/org/dcms-api-server:{}
```

### 10.2 Artifact Naming and Versioning Convention

| Artifact Type          | Naming Pattern                           | Semantic Version Source        |
|------------------------|------------------------------------------|--------------------------------|
| Container image        | `ghcr.io/org/dcms-<service>:<version>`  | Git tag (`v1.4.2`) → `1.4.2`  |
| Helm chart             | `dcms-<version>.tgz`                    | `Chart.yaml` version field     |
| SBOM                   | `dcms-<service>-<sha>.cdx.json`          | Attached to image manifest     |
| Test report            | `test-results-<sha>.tar.gz`             | GitHub Actions artifact        |
| Coverage report        | `coverage-<sha>.html`                   | GitHub Actions artifact        |
| Trivy report           | `trivy-<service>-<sha>.sarif`           | GitHub Actions artifact        |

### 10.3 Release Tagging

Releases are tagged on `main` branch following SemVer 2.0.0:
- `MAJOR`: breaking API change
- `MINOR`: backward-compatible new feature
- `PATCH`: backward-compatible bug fix

Release tagging procedure:
```bash
git tag -a v1.4.2 -m "Release v1.4.2: <brief description>"
git push origin v1.4.2
```

This triggers `main.yml` with `github.ref_type == 'tag'`, which additionally pushes the `<semver>` tag to the image registry.

### 10.4 Helm Chart Versioning

Helm chart versioning is decoupled from application versioning:
- `Chart.yaml appVersion`: matches the application semver
- `Chart.yaml version`: increments independently for chart-only changes

Charts are published to GitHub Pages at `https://org.github.io/dcms-helm/` via `helm/chart-releaser-action`.

---

## Appendix A: Workflow File Inventory

| Workflow File         | Trigger                      | Estimated Duration |
|-----------------------|------------------------------|--------------------|
| `.github/workflows/pr.yml`       | PR open/update     | ~28 minutes        |
| `.github/workflows/main.yml`     | Push to main       | ~45 minutes (incl. soak) |
| `.github/workflows/nightly.yml`  | Daily 02:00 UTC    | ~20 minutes        |
| `.github/workflows/release.yml`  | Git tag push       | ~15 minutes        |

## Appendix B: Self-Hosted Runner Requirements

| Runner Label                        | Host Type           | Required Tools                                          |
|-------------------------------------|---------------------|---------------------------------------------------------|
| `[self-hosted, swarm-manager, staging]` | Swarm manager node  | Docker CLI 24+, cosign, crane, helmfile, kubectl       |
| `[self-hosted, swarm-manager, prod]`    | Prod Swarm manager  | Same as staging; network access to prod Swarm API only |
