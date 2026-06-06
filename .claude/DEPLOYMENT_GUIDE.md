# Software Factory — Deployment & Integration Guide

Step-by-step instructions for integrating the software factory pipeline into
a target repository, configuring CI gates, and onboarding every role.

---

## System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SOFTWARE_FACTORY_ORCHESTRATOR                                               │
│  Accepts raw requirements → sequences Phases P0–P9 → produces system_manifest│
└──────────────────┬───────────────────────────────────────────────────────────┘
                   │
     ┌─────────────┴──────────────────────────────────────────┐
     │ P0–P2: Discovery → Planning → Architecture             │
     │   business_analyst → requirement_agent → product_manager│
     │   → senior_architect                                    │
     └─────────────┬──────────────────────────────────────────┘
                   │  (5 domain agents run in parallel)
     ┌─────────────┴──────────────────────────────────────────┐
     │ P3: Domain Design [PARALLEL]                           │
     │   ui_ux_agent ║ frontend_arch ║ backend_arch           │
     │   db_arch     ║ devops_arch                            │
     └─────────────┬──────────────────────────────────────────┘
                   │
     ┌─────────────┴──────────────────────────────────────────┐
     │ P4: Foundation [PARALLEL]                              │
     │   dependency_manager_agent ║ devops_developer_agent    │
     └─────────────┬──────────────────────────────────────────┘
                   │  Gate: tech_lead_agent
     ┌─────────────┴──────────────────────────────────────────┐
     │ Developer Workflow (P5–P6)                             │
     │                                                        │
     │  feature branch                                        │
     │      └─ ./scripts/run_local_ci.sh --track <track>     │
     │              └─ sandbox_report_{track}.json            │
     │                      └─ Open PR                        │
     └─────────────┬──────────────────────────────────────────┘
                   │ Push & PR
     ┌─────────────▼──────────────────────────────────────────┐
     │ GitHub Actions: dependency-manager-gate.yml            │
     │   check_lock      — canonical lockfile match           │
     │   sandbox (matrix)— per-track: backend/frontend/db/int │
     │   gate_status     — aggregate; blocks merge on failure  │
     └─────────────┬──────────────────────────────────────────┘
                   │ If lockfile mismatch
     ┌─────────────▼──────────────────────────────────────────┐
     │ dependency_manager_agent                               │
     │   Approve or deny package changes                      │
     │   Update canonical-lock.json if approved               │
     └─────────────┬──────────────────────────────────────────┘
                   │ CI green
     ┌─────────────▼──────────────────────────────────────────┐
     │ tech_lead_agent (Gate 2: TechLead↔Developer)           │
     │   Code review: design, quality, acceptance criteria     │
     │   Verify sandbox reports attached                       │
     │   Approve or request changes                            │
     └─────────────┬──────────────────────────────────────────┘
                   │ Merge → release branch
     ┌─────────────▼──────────────────────────────────────────┐
     │ P6: integration_developer_agent                        │
     │   Wires all layers; runs integration tests             │
     │   Produces wiring_report.md + sandbox_report_integration│
     │   Gate: tech_lead (+ senior_architect if API changed)   │
     └─────────────┬──────────────────────────────────────────┘
                   │
     ┌─────────────┴─────────────────────────┐
     │ P7: Validation [PARALLEL with P8]     │  P8: Documentation
     │   qa_developer_agent                  │    content_creator_agent
     │   qa_lead_agent                       │    user_guide, api_docs,
     │   E2E gate → qa_gate_signoff.md       │    release_notes
     └─────────────┬─────────────────────────┘
                   │ Both P7 + P8 gates passed
     ┌─────────────▼──────────────────────────────────────────┐
     │ P9: release_manager_agent                              │
     │   Collect all signoffs → release_manifest.json         │
     │   Canary rollout via devops_developer_agent            │
     │   Post-release probes → post_release_verification_report│
     │   Close: system_manifest.json (FINAL)                  │
     └────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Repository Setup

### Step 1: Copy CI Artefacts

```bash
# 1a. GitHub Actions workflow
mkdir -p .github/workflows
cp updated-agents/ci/dependency-manager-gate.yml .github/workflows/

# 1b. PR template
mkdir -p .github
cp updated-agents/ci/PULL_REQUEST_TEMPLATE.md .github/

# 1c. Local CI runner
mkdir -p scripts
cp updated-agents/ci/run_local_ci.sh scripts/
chmod +x scripts/run_local_ci.sh

# 1d. Dependency Manager CLI (or reference as submodule)
cp -r updated-agents/tools/dependency-manager ./tools/

# 1e. Canonical lockfile baseline (if not already present)
cp package-lock.json canonical-lock.json
git add canonical-lock.json
git commit -m "chore: add canonical lockfile baseline"
```

### Step 2: Configure Branch Protection Rules

In GitHub repository **Settings → Branches → Add rule** for `main`:

```
Branch name pattern: main
  ✓ Require a pull request before merging
      ✓ Dismiss stale pull request approvals when new commits are pushed
      ✓ Require approval of the most recent push
      ✓ Require review from code owners (if CODEOWNERS file exists)
  ✓ Require status checks to pass before merging:
      ✓ Software Factory Gate / check_lock
      ✓ Software Factory Gate / sandbox (backend)
      ✓ Software Factory Gate / sandbox (frontend)
      ✓ Software Factory Gate / sandbox (db)
      ✓ Software Factory Gate / sandbox (integration)
      ✓ Software Factory Gate / Dependency Manager Gate Status
  ✓ Require branches to be up to date before merging
  ✓ Restrict who can push to matching branches (Tech Lead + Release Manager roles)
```

Repeat for `develop` and `release/**` as appropriate.

### Step 3: Set CI Environment Variables

In GitHub repository **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
|----------|-------|
| `DEPMAN_LOCK` | `package-lock.json` |
| `DEPMAN_CANONICAL_LOCK` | `./canonical-lock.json` |

### Step 4: Directory Structure

Ensure your project matches [code_structure_blueprint.md](agents/code_structure_blueprint.md):

```
project-root/
├── src/frontend/        ← frontend_developer_agent writes here
├── src/backend/         ← backend_developer_agent writes here
├── db/migrations/       ← db_developer_agent writes here
├── infra/               ← devops_developer_agent writes here
├── tests/integration/   ← integration_developer_agent writes here
├── tests/e2e/           ← qa_developer_agent writes here
├── docs/                ← content_creator_agent writes here
├── scripts/
│   └── run_local_ci.sh  ← copied from ci/
├── tools/
│   └── dependency-manager/
├── canonical-lock.json
└── .github/
    ├── PULL_REQUEST_TEMPLATE.md
    └── workflows/
        └── dependency-manager-gate.yml
```

---

## Team Onboarding

### All Developers
- [ ] Read [USAGE_GUIDE.md](USAGE_GUIDE.md) — Quick Start and Workflow 2
- [ ] Run `./scripts/run_local_ci.sh --track <your-track> --verbose` before every PR
- [ ] Use `.github/PULL_REQUEST_TEMPLATE.md` — fill in Phase, Track, and all gate fields
- [ ] Attach `sandbox_report_{track}.json` as a PR comment or let CI upload it

### UI/UX Designer (`ui_ux_agent`)
- [ ] Read [agents/ui_ux_agent.md](agents/ui_ux_agent.md)
- [ ] Consume `user_stories.md` and `mvp_scope.md` when P3 starts
- [ ] Deliver `ui_wireframes/` early so `frontend_architect_agent` can begin
- [ ] Review all frontend PRs for wireframe conformance

### Tech Lead (`tech_lead_agent`)
- [ ] Read [agents/tech_lead_agent.md](agents/tech_lead_agent.md) and [agents/dual_gate_control_loops.md](agents/dual_gate_control_loops.md)
- [ ] Enable GitHub review notifications
- [ ] SLA: review PRs within 48 hours; auto-escalation kicks in after that
- [ ] Verify `sandbox_report_{track}.json` is attached before beginning review
- [ ] Produce `implementation_task_list.md` at the start of each sprint

### Dependency Manager (`dependency_manager_agent`)
- [ ] Read [agents/dependency_manager_agent.md](agents/dependency_manager_agent.md)
- [ ] Install depman CLI: `cd tools/dependency-manager && npm install && npm link`
- [ ] Set `DEPMAN_CANONICAL_LOCK` to your `canonical-lock.json` path
- [ ] Respond to lockfile-change PRs within 24 hours
- [ ] Run scheduled CVE scans; propose upgrades proactively

### QA Lead (`qa_lead_agent`)
- [ ] Read [agents/qa_lead_agent.md](agents/qa_lead_agent.md) and [agents/release_flow.md](agents/release_flow.md)
- [ ] Define E2E pass/fail criteria in `tests/e2e/`
- [ ] Ensure E2E results are stored as CI artifacts accessible to `release_manager_agent`
- [ ] Block releases unilaterally if critical gate fails — no exceptions

### Release Manager (`release_manager_agent`)
- [ ] Read [agents/release_manager_agent.md](agents/release_manager_agent.md) and [agents/release_flow.md](agents/release_flow.md)
- [ ] Define `rollback_plan.md` and `canary_rollout_plan.md` before first release
- [ ] Confirm monitoring dashboards are active before any production deployment
- [ ] Document post-release probe schedule (1h, 6h, 24h recommended)

### Integration Developer (`integration_developer_agent`)
- [ ] Read [agents/integration_developer_agent.md](agents/integration_developer_agent.md)
- [ ] Your work starts when Gate 5→6 passes (all three implementation tracks merged)
- [ ] Write integration tests in `tests/integration/`
- [ ] Produce `wiring_report.md` confirming all cross-layer connections

---

## Dependency Manager CLI Setup

```bash
cd tools/dependency-manager
npm install

# Optionally install globally
npm link

# Test the setup
depman check-lock
depman dry-run --track backend
```

Full CLI reference: [tools/dependency-manager/README.md](tools/dependency-manager/README.md)

---

## CI Monitoring & Debugging

### Common CI Failure Modes

| Failure | Root Cause | Resolution |
|---------|-----------|------------|
| `check_lock` fails | Lockfile changed in PR | `dependency_manager_agent` reviews; update canonical if approved |
| `sandbox (backend)` fails | Lint/test failure in backend | Download `sandbox-report-backend` artifact; fix `src/backend/` |
| `sandbox (frontend)` fails | Lint/bundle/test failure | Download `sandbox-report-frontend` artifact; fix `src/frontend/` |
| `sandbox (db)` fails | Migration script error | Download `sandbox-report-db` artifact; fix `db/migrations/` |
| `sandbox (integration)` fails | Cross-layer wiring issue | `integration_developer_agent` investigates `wiring_report.md` |
| Gate blocked (no Tech Lead) | Review SLA exceeded | `software_factory_orchestrator` auto-escalates at 48h |

### Downloading Sandbox Artefacts

```
GitHub Actions → [PR workflow run] → Artefacts → sandbox-report-{track}
```

```bash
# Inspect locally
cat sandbox_report_backend.json | node -e "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('Status:', r.status);
  Object.entries(r.checks).forEach(([k,v]) => console.log(k + ':', v.status));
"
```

### Re-running CI After a Fix

```bash
git add <fixed-files>
git commit -m "fix: resolve sandbox failure in backend track"
git push origin <branch>
# CI automatically re-runs all gate jobs
```

---

## Compliance & Audit Trail

All gate decisions are automatically recorded in:

| Record | Location | Content |
|--------|----------|---------|
| PR comments | GitHub PR | Gate approval text, sandbox report reference |
| GitHub Checks | GitHub Actions | CI job names, timestamps, pass/fail |
| `pr_merge_log.md` | Repo / artifact | Who approved what and when |
| `pipeline_execution_log.md` | Artifact | Phase gate decisions with agent, timestamp, SHA |
| `release_manifest.json` | Repo / artifact | Full release signoff chain |
| `system_manifest.json` | Artifact | All artifacts indexed at pipeline completion |
| ADRs (`docs/adrs/`) | Repo | Architecture decisions with rationale |

Example `release_manifest.json` entry:

```json
{
  "release": "v1.2.0",
  "date": "2026-06-05",
  "gates": {
    "tech_lead": { "agent": "Jane Smith", "timestamp": "2026-06-05T10:45:00Z", "artifact": "pr_merge_log.md" },
    "qa_lead":   { "agent": "Bob Johnson", "timestamp": "2026-06-05T11:00:00Z", "artifact": "qa_gate_signoff.md" },
    "release_manager": { "agent": "Alice Brown", "timestamp": "2026-06-05T11:15:00Z" }
  },
  "artifacts": ["backend_source/", "frontend_source/", "db_migrations/", "api_docs/", "user_guide.md"],
  "deployment": {
    "canary_10pct": "2026-06-05T14:00:00Z",
    "canary_100pct": "2026-06-05T15:15:00Z",
    "status": "healthy"
  }
}
```

---

## Continuous Improvement

After the first 3 releases using this framework:

- [ ] Measure sandbox execution time per track; optimise slow checks.
- [ ] Survey teams on gate friction; adjust approval SLAs if needed.
- [ ] Wire `depman propose-upgrade` to your CI scheduler for automated upgrade PRs.
- [ ] Wire `depman emergency-lock` to your incident management system (PagerDuty, Jira, etc.).
- [ ] Add Slack/Teams webhook notifications for gate blocks and release events.
- [ ] Review ADRs and update `agents/` specs based on lessons learned.

---

## Reference

- [agents/ORCHESTRATION_PIPELINE.md](agents/ORCHESTRATION_PIPELINE.md) — Full pipeline diagram
- [agents/PHASE_GATE_CONTRACTS.md](agents/PHASE_GATE_CONTRACTS.md) — Per-gate artifact checklists
- [agents/dual_gate_control_loops.md](agents/dual_gate_control_loops.md) — Gate rules in detail
- [agents/dry_run_sandbox.md](agents/dry_run_sandbox.md) — Sandbox spec and error schema
- [USAGE_GUIDE.md](USAGE_GUIDE.md) — Worked examples for every workflow
