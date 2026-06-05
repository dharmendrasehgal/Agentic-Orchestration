# Multi-Agent Control Framework: Deployment & Integration

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Developer                                                       │
│ ├─ Feature branch & local dev                                  │
│ ├─ ./updated-agents/ci/run_local_ci.sh (pre-push validation)  │
│ └─ Open PR with gate metadata                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │ Push & Open PR
┌────────────────▼────────────────────────────────────────────────┐
│ GitHub Actions: dependency-manager-gate.yml                     │
│ ├─ check_lock: Verify canonical lockfile match                 │
│ ├─ dry_run_sandbox: Lint, compile, unit tests                  │
│ └─ gate_status: Aggregate results & enforce pass/fail           │
└────────────────┬────────────────────────────────────────────────┘
                 │ If lockfile mismatch
┌────────────────▼────────────────────────────────────────────────┐
│ Dependency Manager Agent                                        │
│ ├─ Review lockfile changes & security advisories               │
│ ├─ Approve or propose alternative packages                     │
│ └─ Update canonical-lock.json if approved                      │
└────────────────┬────────────────────────────────────────────────┘
                 │ Lockfile approved
┌────────────────▼────────────────────────────────────────────────┐
│ Tech Lead Agent                                                 │
│ ├─ Code review: design, quality, standards                     │
│ ├─ Verify dry-run sandbox passed                               │
│ └─ Approve or request changes                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │ Code approved
┌────────────────▼────────────────────────────────────────────────┐
│ Merge to release branch                                         │
└────────────────┬────────────────────────────────────────────────┘
                 │ Release candidate formed
┌────────────────▼────────────────────────────────────────────────┐
│ QA Lead Agent: E2E Validation                                   │
│ ├─ Run full E2E test suite                                      │
│ ├─ Verify acceptance criteria met                               │
│ └─ Generate validation report                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │ E2E tests pass
┌────────────────▼────────────────────────────────────────────────┐
│ Architect Agent (if architecture change)                        │
│ ├─ Review cross-service impacts                                 │
│ ├─ Approve or require design changes                            │
│ └─ Sign release manifest                                        │
└────────────────┬────────────────────────────────────────────────┘
                 │ Architecture approved
┌────────────────▼────────────────────────────────────────────────┐
│ Release Manager Agent                                           │
│ ├─ Collect all signoffs (QA, Architect, Tech Lead)            │
│ ├─ Create release manifest                                      │
│ ├─ Define canary rollout schedule                               │
│ └─ Issue deployment approval to DevOps                          │
└────────────────┬────────────────────────────────────────────────┘
                 │ Release approved
┌────────────────▼────────────────────────────────────────────────┐
│ DevOps Developer Agent                                          │
│ ├─ depman check-lock in deployment job (frozen-lock)           │
│ ├─ Deploy canary to 10% of users                                │
│ ├─ Monitor for errors (MTTR, latency)                           │
│ └─ Escalate if regression detected                              │
└────────────────┬────────────────────────────────────────────────┘
                 │ Canary healthy
┌────────────────▼────────────────────────────────────────────────┐
│ 100% Rollout & Production Release                               │
│ ├─ Continue monitoring                                          │
│ ├─ Post-release verification (1-7 days)                         │
│ └─ Close release ticket & publish notes                         │
└─────────────────────────────────────────────────────────────────┘
```

## Step-by-Step Deployment

### 1. Repository Setup

```bash
# 1a. Copy CI workflow into your repo
mkdir -p .github/workflows
cp updated-agents/ci/dependency-manager-gate.yml .github/workflows/

# 1b. Copy PR template
mkdir -p .github
cp updated-agents/ci/PULL_REQUEST_TEMPLATE.md .github/

# 1c. Copy CLI into repo (or reference via submodule)
cp -r updated-agents/tools/dependency-manager ./tools/
cp updated-agents/ci/run_local_ci.sh ./scripts/

# 1d. Create canonical lockfile (if not present)
cp package-lock.json canonical-lock.json
git add canonical-lock.json
git commit -m "chore: add canonical lockfile baseline"
```

### 2. Branch Protection Rules

In GitHub repository settings:

```yaml
Branch: main
  - Require a pull request before merging
  - Dismiss stale pull request approvals when new commits are pushed
  - Require approval of the most recent push
  - Require status checks to pass before merging:
      - [x] Dependency Manager Gate / check_lock
      - [x] Dependency Manager Gate / dry_run_sandbox
      - [x] Dependency Manager Gate / gate_status
  - Require branches to be up to date before merging
  - Require code review from owner (if CODEOWNERS file exists)
```

### 3. Team Onboarding

**For all developers**:
- [ ] Read [USAGE_GUIDE.md](USAGE_GUIDE.md) section "Quick Start for Developers".
- [ ] Run `./scripts/run_local_ci.sh --verbose` before opening a PR.
- [ ] Use `.github/PULL_REQUEST_TEMPLATE.md` checklist when opening PRs.

**For Tech Leads**:
- [ ] Read [agents/tech_lead_agent.md](agents/tech_lead_agent.md) and [dual_gate_control_loops.md](agents/dual_gate_control_loops.md).
- [ ] Enable GitHub notifications for PR reviews.
- [ ] Use branch protection rule to enforce code review requirement.

**For Dependency Manager**:
- [ ] Read [agents/dependency_manager_agent.md](agents/dependency_manager_agent.md).
- [ ] Set up canonical lockfile path and ensure it's version-controlled.
- [ ] (Optional) Integrate with GitHub Actions to auto-open upgrade PRs via `depman propose-upgrade`.

**For QA Lead**:
- [ ] Read [agents/qa_lead_agent.md](agents/qa_lead_agent.md) and [release_flow.md](agents/release_flow.md).
- [ ] Define E2E test pass/fail criteria and store results in CI artifact.
- [ ] Set up automated health probes post-deployment.

**For Release Manager**:
- [ ] Read [agents/release_manager_agent.md](agents/release_manager_agent.md) and [release_flow.md](agents/release_flow.md).
- [ ] Define release checklist and approval workflow.
- [ ] Document escalation path for issues found post-release.

### 4. Dependency Manager CLI Setup (Optional Automation)

If you want to automate upgrade PRs:

```bash
# Install depman globally (for local testing)
cd updated-agents/tools/dependency-manager
npm install -g .

# Set environment variables (in CI or .env)
export DEPMAN_LOCK="package-lock.json"
export DEPMAN_CANONICAL_LOCK="./canonical-lock.json"
export DEPMAN_GITHUB_TOKEN="<your-token>"

# Test locally
depman check-lock
depman dry-run

# (Future) Auto-upgrade workflows:
# depman propose-upgrade express@4.19.0
# depman emergency-lock --cve=CVE-2024-12345
```

### 5. CI Monitoring & Debugging

**Watch for CI failures**:
1. **Lockfile mismatch**: Dependency Manager reviews; may need to update canonical lock.
2. **Dry-run sandbox failure**: Developer fixes lint/test issues and re-pushes.
3. **Gate status fail**: Review CI logs; escalate to Dependency Manager or Tech Lead.

**Access CI artifacts**:
- GitHub Actions > [Run] > Artifacts
- Download `sandbox-report.json` to inspect test results.

**Debugging template**:

```bash
# If a PR's dry-run fails remotely but passes locally:
cd <repo>
git checkout <branch>
./scripts/run_local_ci.sh --verbose

# Check sandbox report
cat sandbox-report.json | jq .

# If still unclear, ask Dependency Manager to investigate
```

---

## Compliance & Audit Trail

All gate decisions and signoffs are recorded via:

1. **PR Comments**: Gate approvals left as comments.
2. **GitHub Checks**: CI results and timestamps.
3. **Commit History**: Merge commits include gate metadata in commit messages.
4. **ADRs**: Major architectural decisions linked in PRs and release notes.

Example release manifest (created by Release Manager):

```markdown
# Release v1.2.0 - June 4, 2026

## Features
- [PR #123](link) User auth endpoint (Architect: approved, Tech Lead: approved, QA: passed)
- [PR #124](link) Search optimization (Architect: N/A, Tech Lead: approved, QA: passed)

## Dependency Changes
- express: 4.18.0 → 4.19.0 (Dependency Manager: approved for security)

## Signoffs
- Architect: [Signed] John Doe (June 4, 10:30 AM)
- Tech Lead: [Signed] Jane Smith (June 4, 10:45 AM)
- QA Lead: [Signed] Bob Johnson (June 4, 11:00 AM)
- Release Manager: [Signed] Alice Brown (June 4, 11:15 AM)

## Deployment
- Canary: 10% (June 4, 2:00 PM) → Healthy (June 4, 3:00 PM)
- Rollout: 100% (June 4, 3:15 PM) → Healthy

## Notes
No issues detected post-release. Release closed successfully.
```

---

## Post-Deployment Verification

Release Manager runs automated checks at 1h, 6h, and 24h post-deployment:

```bash
# Example health check script (can be scheduled in CI)
depman check-lock  # Ensure canonical lock is still in effect
npm test -- --testPathPattern="e2e"  # Run smoke E2E tests
curl https://api.example.com/health  # Custom health endpoint
```

If any check fails:
1. Release Manager opens an incident.
2. On-call engineer investigates.
3. If a dependency is the root cause, Dependency Manager opens a hotfix PR with emergency-lock.
4. Fast-track approvals & canary redeploy.

---

## Continuous Improvement

After the first 3 releases using this framework:

- [ ] Measure dry-run sandbox execution time and optimize.
- [ ] Survey teams on gate friction; adjust approval workflows if needed.
- [ ] Update ADRs based on lessons learned.
- [ ] Automate `propose-upgrade` and `emergency-lock` if Dependency Manager feels manual.
- [ ] Integrate with Slack/Teams for real-time gate notifications.

---

## Reference Links

- [Dual-Gate Control Loops](agents/dual_gate_control_loops.md)
- [Dependency Manager Agent](agents/dependency_manager_agent.md)
- [Dry-Run Sandbox](agents/dry_run_sandbox.md)
- [Release Flow](agents/release_flow.md)
- [Usage Guide & Examples](USAGE_GUIDE.md)
