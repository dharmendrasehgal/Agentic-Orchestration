# Software Factory — Usage Guide

End-to-end workflows for every role: from kicking off a new project with raw
requirements all the way through canary deployment and post-release verification.

---

## Quick Start by Role

### Starting a new project
→ Go to [Workflow 1: Start a project from scratch](#workflow-1-start-a-project-from-scratch)

### I'm a Developer opening a PR
```bash
# Run sandbox for your track before pushing
./scripts/run_local_ci.sh --track backend --verbose   # or frontend / db / integration
# Open PR using .github/PULL_REQUEST_TEMPLATE.md
```

### I'm a Tech Lead reviewing a PR
1. Check that CI `gate_status` is green (sandbox passed for the PR's track).
2. Check Dependency Manager approved any package changes.
3. Review code quality and acceptance criteria coverage.
4. Mark Tech Lead gate as approved in the PR.

### I'm the Dependency Manager
```bash
# Verify a PR's lockfile change locally
depman check-lock package-lock.json ./canonical-lock.json

# Run sandbox against a proposed upgrade
depman propose-upgrade express@4.19.0

# Emergency patch
depman emergency-lock --cve=CVE-2024-12345
```

### I'm the Release Manager
1. Collect: `qa_gate_signoff.md`, all sandbox reports, documentation sign-off.
2. Produce `release_manifest.json`.
3. Approve deployment via `devops_developer_agent`.
4. Monitor post-release probes; trigger rollback if SLOs breach.

---

## Workflow 1: Start a Project from Scratch

**Goal**: Turn raw requirements into a deployed software system using the full pipeline.

### Step 1 — Hand requirements to the Orchestrator

Give `SOFTWARE_FACTORY_ORCHESTRATOR` any of:
- A free-form description ("Build a task management web app for teams")
- A product brief document
- A set of user stories
- A technical specification

The orchestrator normalises this into `project_brief.md` and triggers Phase 0.

### Step 2 — Phase 0: Discovery

**Agents**: `business_analyst_agent` → `requirement_agent`

```
Outputs produced:
  brd.md               Business Requirements Document
  frd.md               Functional Requirements Document
  user_stories.md      All user stories with Given/When/Then acceptance criteria
  nfr.md               Non-functional requirements (performance, security, a11y)
  open_questions_log.md All ambiguities resolved or formally deferred
```

Gate sign-off: `requirement_agent` certifies all five requirement domains are complete.

### Step 3 — Phase 1: Planning

**Agent**: `product_manager_agent`

Produces `product_roadmap.md`, `mvp_scope.md`, `sprint_plan.md`, `kpi_definitions.md`.
Gate: PM signs off MVP scope — architects can now size work.

### Step 4 — Phase 2: System Architecture

**Agent**: `senior_architect_agent`

Produces `solution_architecture.md`, `adrs/`, `technology_stack.md`, `cross_domain_contracts.md`.
Gate: Senior architect signs off — all five domain design tracks can start in parallel.

### Step 5 — Phase 3: Domain Design (5 agents in parallel)

| Agent | Primary Output |
|-------|---------------|
| `ui_ux_agent` | `ui_wireframes/`, `design_tokens.json`, `ux_flows.md` |
| `frontend_architect_agent` | `frontend_architecture.md`, `component_library_spec.md` |
| `backend_architect_agent` | `backend_architecture.md`, `api_contracts.json` |
| `db_architect_agent` | `db_schema.sql`, `er_diagrams/`, `data_governance_standards.md` |
| `devops_architect_agent` | `ci_cd_architecture.md`, `infrastructure_architecture.md`, `monitoring_design.md` |

Gate: `senior_architect_agent` reviews all five outputs together before Phase 4 starts.

### Step 6 — Phase 4: Foundation (2 agents in parallel)

`dependency_manager_agent` creates `canonical-lock.json` and `approved_packages.json`.
`devops_developer_agent` creates the CI/CD pipeline, project scaffold, and containerisation.
Gate: `tech_lead_agent` signs off — implementation tracks can start.

### Step 7 — Phase 5: Implementation

`db_developer_agent` starts first (writes migrations; backend depends on them).
Once `sandbox_report_db.json` is PASS, `backend_developer_agent` and `frontend_developer_agent` start in parallel.

```bash
# Developers run locally before each PR
./scripts/run_local_ci.sh --track db       # db track
./scripts/run_local_ci.sh --track backend  # backend track
./scripts/run_local_ci.sh --track frontend # frontend track
```

Gate: `tech_lead_agent` approves each track's PRs.

### Step 8 — Phase 6: Integration

`integration_developer_agent` wires all three tracks together:
- Runs cross-layer integration tests.
- Confirms every frontend page calls the correct backend endpoint.
- Merges all feature branches to the release branch.

```bash
./scripts/run_local_ci.sh --track integration --verbose
```

Gate: `tech_lead_agent` (+ `senior_architect_agent` if API contracts changed).

### Step 9 — Phase 7 + 8: Validation & Documentation (in parallel)

`qa_developer_agent` and `qa_lead_agent` run validation simultaneously with `content_creator_agent`.

Gate (P7): `qa_lead_agent` issues `qa_gate_signoff.md` with explicit go/no-go.
Gate (P8): `product_manager_agent` confirms documentation is complete.

### Step 10 — Phase 9: Release

`release_manager_agent` collects all gate sign-offs, produces `release_manifest.json`,
and instructs `devops_developer_agent` to execute the canary rollout.

Post-release probes run for the configured observation window. If all pass,
`release_manager_agent` publishes `post_release_verification_report.json` and the
orchestrator records `system_manifest.json` — the final pipeline output.

---

## Workflow 2: Developer Adds a Feature (P5 PR)

**Goal**: Add a new backend API endpoint with a new npm dependency.

1. **Create feature branch**: `git checkout -b feature/user-auth-endpoint`

2. **Implement the feature** and add the dependency: `npm install jsonwebtoken`

3. **Run local sandbox**:
   ```bash
   ./scripts/run_local_ci.sh --track backend --verbose
   # FAIL: Lockfile mismatch — package-lock.json changed
   # → Request dependency_manager_agent review before proceeding
   ```

4. **Dependency Manager reviews the change**:
   - If approved: updates `canonical-lock.json` via a deps-update PR.
   - If denied: suggests an alternative package.

5. **Re-run sandbox once canonical lock is updated**:
   ```bash
   ./scripts/run_local_ci.sh --track backend --verbose
   # PASS: sandbox_report_backend.json created
   ```

6. **Open PR** using `.github/PULL_REQUEST_TEMPLATE.md`:
   - Phase: `P5-Implementation`, Track: `backend`
   - Architect gate: `N/A` (no API contract change)
   - Tech Lead gate: pending
   - Dependency changes: `jsonwebtoken@^9.0.0 — Dependency Manager: approved`
   - Attach `sandbox_report_backend.json`

7. **CI runs** `dependency-manager-gate.yml` — all jobs must be green.

8. **Tech Lead reviews** and approves → PR is merged.

---

## Workflow 3: Release Coordinator Prepares a Release (P9)

**Goal**: Ship three completed features to production with canary rollout.

1. **Verify all gate prerequisites** are in the artifact registry:
   - `qa_gate_signoff.md` (qa_lead_agent: go)
   - `user_guide.md` + `api_docs/` (content_creator_agent)
   - `pr_merge_log.md` (tech_lead_agent: all PRs merged)
   - `approved_packages.json` (dependency_manager_agent)

2. **Create `release_manifest.json`**:
   ```markdown
   # Release v1.2.0 — 2026-06-05
   
   ## Features
   - User auth endpoint  [Arch: N/A, TL: approved, QA: passed]
   - Search optimisation [Arch: N/A, TL: approved, QA: passed]
   - Admin dashboard     [Arch: approved (ADR-007), TL: approved, QA: passed]
   
   ## Signoffs
   - Tech Lead:      [Signed] 2026-06-05 10:45
   - QA Lead:        [Signed] 2026-06-05 11:00
   - Release Manager:[Signed] 2026-06-05 11:15
   ```

3. **Canary deployment**:
   ```bash
   # DevOps executes per canary_rollout_plan.md
   # Stage 1: 10% of traffic — monitor for 1 hour
   # Stage 2: 50% — monitor for 30 min
   # Stage 3: 100% — close release
   ```

4. **Post-release verification**: automated probes at 1h, 6h, 24h.
   If all pass → release closed, `system_manifest.json` finalised.

---

## Workflow 4: Dependency Manager Proposes an Upgrade

**Goal**: Upgrade Express 4.18.x → 4.19.x (security fixes).

1. **Detect upgrade**: Live registry or CVE feed shows 4.19.0 available.

2. **Run upgrade sandbox**:
   ```bash
   depman propose-upgrade express@4.19.0
   # (scaffold: would update lockfile, run all 4 track sandboxes, produce reports)
   ```

3. **Open upgrade PR**: `chore: upgrade express to 4.19.0 (CVE-XXXX)`
   - Attach all `sandbox_report_{track}.json` artifacts.
   - Dependency Manager marks: `approved`.

4. **Tech Lead reviews**: confirms no breaking changes, approves.

5. **Canonical lock updated**: `canonical-lock.json` committed; future PRs use new baseline.

---

## Workflow 5: Debugging a CI Sandbox Failure

**Goal**: PR fails sandbox; developer needs to identify and fix the issue.

1. **CI reports failure**: `Software Factory Gate — FAIL: sandbox (matrix) failed`

2. **Download artifact** from GitHub Actions: `sandbox-report-backend`

3. **Read the report**:
   ```json
   {
     "status": "FAIL",
     "track": "backend",
     "checks": {
       "lint":       { "status": "FAIL", "violations": ["src/services/auth.ts:42 — missing semicolon"] },
       "unit_tests": { "status": "PASS" }
     },
     "error_reflection": [
       {
         "error": "Lint: missing semicolon",
         "source_file": "src/services/auth.ts:42",
         "suggested_owner": "backend_developer_agent",
         "reference_doc": "docs/code_standards.md"
       }
     ]
   }
   ```

4. **Fix the issue locally, re-run sandbox**:
   ```bash
   ./scripts/run_local_ci.sh --track backend --verbose
   # PASS: sandbox_report_backend.json
   ```

5. **Push fix** → CI re-runs → gate passes → Tech Lead resumes review.

---

## Workflow 6: Emergency Hotfix (Post-Release CVE)

**Goal**: Critical CVE found in a transitive dependency in production.

1. **Incident opened**: `release_manager_agent` is notified; incident ticket created.

2. **Emergency lock**:
   ```bash
   depman emergency-lock --cve=CVE-2024-12345
   # (scaffold: pins affected package; produces emergency canonical-lock.json)
   ```

3. **Fast-track PR**: tagged `emergency`; auto-assigned to Tech Lead + Architect.
   - Dry-run sandbox is pre-run inline. Results attached.
   - Architect and Tech Lead review in parallel.

4. **Expedited approvals** — target: < 30 minutes.
   `release_manager_agent` merges immediately.

5. **Hotfix deployment**: canary at 10%, monitor 10 minutes, 100% rollout.

6. **Post-incident**: `release_manager_agent` files post-incident ADR.
   `dependency_manager_agent` updates canonical lock for all environments.

---

## Integration Checklist

### Repository Setup
- [ ] `ci/dependency-manager-gate.yml` → `.github/workflows/`
- [ ] `ci/PULL_REQUEST_TEMPLATE.md` → `.github/`
- [ ] `ci/run_local_ci.sh` → `./scripts/` (make executable)
- [ ] Branch protection: require `Software Factory Gate Status` CI check and 1 Tech Lead approval

### Lockfile
- [ ] `canonical-lock.json` committed to repo root
- [ ] `DEPMAN_LOCK` and `DEPMAN_CANONICAL_LOCK` set in CI environment
- [ ] All developers instructed to run `./scripts/run_local_ci.sh` before opening PRs

### Agent Roles Assigned
- [ ] `dependency_manager_agent` role assigned (team member or automated bot)
- [ ] `tech_lead_agent` role assigned with PR review permission
- [ ] `qa_lead_agent` role assigned with release block authority
- [ ] `release_manager_agent` role assigned with deployment approval authority

### QA & Validation
- [ ] E2E test suite exists in `tests/e2e/`
- [ ] Performance test suite exists in `tests/performance/`
- [ ] `qa_gate_signoff.md` template agreed

### Release Coordination
- [ ] `release_manifest.json` template defined
- [ ] Canary rollout percentages and observation windows documented
- [ ] Rollback procedure documented and tested
- [ ] Post-release probe schedule configured in monitoring_dashboards/

---

## Troubleshooting

**Lockfile keeps mismatching in CI**
→ All developers must run `./scripts/run_local_ci.sh` before pushing.
→ If canonical is stale: `dependency_manager_agent` updates it after approving the change.

**Sandbox takes too long**
→ Configure `npm test -- --runInBand --testPathPattern=unit` to exclude integration tests from the fast check.
→ Store config in `.depman/config.json` (scaffold — integrate as needed).

**How do I know Dependency Manager approved my change?**
→ Look for the "Dependency Manager Review: approved" line in the PR description.
→ CI `gate_status` will show green once canonical lock is updated.

**Can I merge without Tech Lead approval?**
→ No. Branch protection enforces at least 1 approval matching the Tech Lead role.

**QA is blocking the release — what do I do?**
→ `qa_lead_agent` has unilateral authority to block. Treat it as a hard stop.
→ `tech_lead_agent` + responsible developer are assigned a 24h resolution SLA.
→ Once defects are resolved, `qa_lead_agent` re-runs the E2E gate.

**Post-release SLO breach — should I rollback?**
→ `release_manager_agent` decides based on `post_release_verification_report.json`.
→ Automated rollback trigger is defined in `rollback_plan.md`.
→ If triggered automatically, `devops_developer_agent` executes; `release_manager_agent` is notified.

**Phase gate is stuck — no sign-off after 48 hours**
→ `SOFTWARE_FACTORY_ORCHESTRATOR` auto-escalates at 48h.
→ Check `pipeline_execution_log.md` for the blocked gate entry.
→ If a role is unassigned, `software_factory_orchestrator` can approve on their behalf (with a logged justification).
