# Multi-Agent Workflow: Usage Guide & Examples

This guide shows how teams use the updated agent framework and dependency control to complete a web application implementation end-to-end with full E2E validation.

## Quick Start

### For Developers
1. Clone the repository and set up your environment.
2. Before opening a PR, run the local CI check:
   ```bash
   ./updated-agents/ci/run_local_ci.sh --verbose
   ```
3. If it passes, open a PR using the template in `.github/PULL_REQUEST_TEMPLATE.md`.
4. Check the Architect and Tech Lead gates in your PR checklist.

### For Tech Leads
1. Review PRs for code quality and architecture alignment.
2. If dry-run sandbox passes and dependencies are approved, mark the Tech Lead gate as complete.
3. Merge when all gates pass.

### For Dependency Manager
1. Monitor PRs for dependency changes.
2. Run `depman dry-run` on the PR branch to validate the sandbox.
3. If safe, approve the PR's dependency gate checkbox.

### For Release Manager
1. Collect release candidate PRs and ensure all gates passed.
2. Trigger the release workflow; run E2E tests.
3. If tests pass, sign off on the release; DevOps deploys.

---

## Detailed Workflows

### Workflow 1: Developer Adds a Feature

**Goal**: Add a new backend API endpoint that requires a new npm package.

**Steps**:

1. **Create feature branch**:
   ```bash
   git checkout -b feature/user-auth-endpoint
   ```

2. **Implement the feature**:
   ```bash
   # Add code and a new dependency
   npm install jsonwebtoken
   ```

3. **Run local CI**:
   ```bash
   ./updated-agents/ci/run_local_ci.sh --verbose
   ```
   - `depman check-lock` fails because `package-lock.json` was updated.
   - Developer is prompted: "Lockfile changed; have Dependency Manager review."

4. **Commit and push**:
   ```bash
   git add .
   git commit -m "Add user auth endpoint"
   git push origin feature/user-auth-endpoint
   ```

5. **Open PR**:
   - Use the PR template.
   - Mark: `Architect Gate (N/A)`, `Tech Lead Gate (pending review)`, `Dependency changes: jsonwebtoken (pending Dependency Manager review)`.

6. **CI runs**:
   - GitHub Actions runs `dependency-manager-gate.yml`.
   - `check_lock` job detects lockfile mismatch → CI shows warning but continues.
   - `dry_run_sandbox` job runs tests → passes.
   - `gate_status` job: dry-run passed, but lockfile mismatch noted in PR comment.

7. **Dependency Manager review**:
   - Dependency Manager runs `depman check-lock` locally to understand the mismatch.
   - If the new package is approved and safe:
     - Comment on PR: "Approved: jsonwebtoken@^8.5.0. Update canonical lock: `depman emergency-lock`."
     - Update the canonical lockfile and merge a deps-update PR.
   - If denied:
     - Comment: "jsonwebtoken is not approved. Use [alternative package] instead."
     - Developer removes the dependency and pushes a new commit.

8. **Tech Lead review**:
   - Once Dependency Manager approves, Tech Lead reviews code.
   - Checks: is the endpoint design correct? Are there unit tests? Does it follow code standards?
   - If approved: marks "Tech Lead Gate: approved" in PR.

9. **Merge**:
   - All gates passed. Tech Lead merges the PR.

---

### Workflow 2: Release Coordinator Prepares a Release

**Goal**: Bundle features from three completed PRs into a release candidate and validate E2E.

**Steps**:

1. **Create release branch**:
   ```bash
   git checkout -b release/v1.2.0
   ```

2. **Cherry-pick or merge feature PRs**:
   ```bash
   git merge feature/user-auth-endpoint
   git merge feature/search-optimization
   git merge feature/admin-dashboard
   ```

3. **Run release candidate checks**:
   ```bash
   ./updated-agents/ci/run_local_ci.sh --verbose
   ```

4. **Verify E2E tests**:
   - QA Lead runs the E2E test suite on the release branch.
   - Tests validate: user registration, login, search, admin functions.
   - Report: 98 pass, 2 fail (non-critical UI flakiness).

5. **Release Manager gate**:
   - Review the release manifest: features, dependency changes, E2E results.
   - Architecture: has the team reviewed cross-service impacts? (Tech Lead + Architect sign-off in release notes.)
   - Signoff decision: "Approved for canary deployment to 10% of users."

6. **DevOps deploys canary**:
   - DevOps runs `depman check-lock` in the deployment job to ensure lockfile stability.
   - Deploys release/v1.2.0 to 10% of production.

7. **Monitor & roll forward**:
   - Automated health checks pass (error rate, latency unchanged).
   - After 1 hour, Release Manager approves 100% rollout.
   - DevOps deploys to 100% of production.

8. **Post-release**:
   - Release Manager publishes the release notes and closes the release ticket.
   - Any issues discovered post-deploy are filed as bugs and triaged by QA Lead.

---

### Workflow 3: Dependency Manager Proposes an Upgrade

**Goal**: Update Express from 4.18.0 to 4.19.0 across the backend.

**Steps**:

1. **Dependency Manager detects available upgrade**:
   - Live registry or security feed shows Express 4.19.0 available.
   - Dependency Manager runs: `depman propose-upgrade express@4.19.0`.

2. **Sandbox testing**:
   - CLI clones the repo, updates `package-lock.json`, and runs `depman dry-run`.
   - All tests pass. Produces `sandbox-report.json` and upgrade notes.

3. **Open a PR**:
   - Dependency Manager opens a PR: "Upgrade Express to 4.19.0 (security fixes)".
   - PR includes the updated lockfile and a link to the sandbox report.
   - Marks: `Dependency changes: express@4.19.0 (Dependency Manager approved)`.

4. **Tech Lead review**:
   - Reviews the changelog and sandbox results.
   - Confirms no breaking changes to the codebase.
   - Approves and merges.

5. **Canonical lock updated**:
   - Dependency Manager updates `canonical-lock.json` via a secondary PR or direct commit.
   - Future PRs will now use the new lockfile baseline.

---

### Workflow 4: Debugging a CI Failure

**Goal**: A PR fails dry-run sandbox; developer needs guidance.

**Steps**:

1. **Sandbox fails**:
   - PR CI shows: `depman dry-run` failed on unit test step.
   - CI job output: "Error: Test suite failed in /src/handlers/auth.test.js:42."

2. **Error reflection**:
   - GitHub Actions artifact includes `sandbox-report.json`:
     ```json
     {
       "ok": false,
       "checks": [
         { "name": "lint", "ok": true },
         { "name": "unit-tests", "ok": false }
       ],
       "details": "Jest test suite failed: expect(user.id).toBeDefined() failed"
     }
     ```
   - Sandbox artifact includes log file with stack trace.

3. **Developer investigates**:
   - Developer downloads sandbox artifact and reviews logs.
   - Finds: auth endpoint mock is incomplete.
   - Fixes the mock and re-runs locally: `./updated-agents/ci/run_local_ci.sh --verbose`.
   - Sandbox passes locally now.

4. **Push fix and re-run CI**:
   ```bash
   git add src/handlers/auth.test.js
   git commit -m "Fix: Complete auth mock setup"
   git push origin feature/user-auth-endpoint
   ```
   - GitHub Actions re-runs dry-run sandbox. It passes now.

5. **PR progresses**:
   - Tech Lead resumes review and approves.
   - Merge succeeds.

---

### Workflow 5: Emergency Hotfix

**Goal**: A critical bug is found post-release. Dependency Manager must accelerate a hotfix lock update.

**Steps**:

1. **Issue detected**:
   - Production monitors alert: critical vulnerability in a transitive dependency.
   - Release Manager opens an incident.

2. **Dependency Manager emergency response**:
   - Dependency Manager runs: `depman emergency-lock --cve=CVE-2024-12345`.
   - Produces an emergency lockfile with the patched version and an emergency-lock PR.

3. **Fast-track PR**:
   - PR is tagged `emergency` and auto-assigned to Tech Lead and Architect.
   - Dry-run sandbox is pre-run in the emergency-lock command. Results are inline in PR.

4. **Expedited approvals**:
   - Tech Lead reviews in parallel with Architect.
   - Both approve within 15 minutes.
   - Release Manager merges immediately (skipping normal vote cycle).

5. **Hotfix deployment**:
   - DevOps deploys hotfix to canary, monitors for 10 minutes, then rolls out 100%.
   - Release Manager posts incident summary and closes the emergency.

---

## Integration Checklist for Teams

### Repository Setup
- [ ] Copy `.github/workflows/dependency-manager-gate.yml` into `.github/workflows/`.
- [ ] Copy `.github/PULL_REQUEST_TEMPLATE.md` into `.github/`.
- [ ] Set branch protection rule: require `Dependency Manager Gate Status` CI check to pass.
- [ ] Add PR review requirement: at least 1 Tech Lead approval before merge.

### Local Development
- [ ] Clone `updated-agents/ci/run_local_ci.sh` into `scripts/` or `ci/` folder locally.
- [ ] Add a pre-commit hook to run `./scripts/run_local_ci.sh` or include in developer onboarding.

### Dependency Manager Setup
- [ ] Store canonical lockfile at a known path (e.g., `./canonical-lock.json` or artifact store).
- [ ] Integrate `depman check-lock` into your live registry or artifact store.
- [ ] (Optional) Wire `propose-upgrade` and `emergency-lock` to your issue tracker and PR automation.

### Release Coordination
- [ ] Define release checklist (in `release_flow.md`) and assign Release Manager role.
- [ ] Create a release branch naming convention and CI stage for release validation.
- [ ] Document rollback procedure and MTTR SLO in Release Manager onboarding.

### QA & E2E Testing
- [ ] Store E2E test results in a location accessible to Release Manager (e.g., CI artifact).
- [ ] Define E2E pass criteria and critical-path tests.
- [ ] Link QA Lead gate to Release Manager sign-off.

---

## Troubleshooting

**Q: Lockfile keeps mismatching in CI.**
A: Ensure all developers run `depman check-lock` locally before pushing. If mismatch persists, Dependency Manager updates canonical lock and notifies team.

**Q: Dry-run sandbox takes too long in CI.**
A: Optimize by running only fast unit tests (exclude integration tests). Store test suite config in `.depman/config.json`.

**Q: How do I know if Dependency Manager approved my PR?**
A: Check the PR for the "Dependency changes" checkbox marked approved. GitHub Actions gate_status will also show green.

**Q: Can I merge without Tech Lead approval?**
A: No. Branch protection rule enforces at least 1 approval. PR template reminds you to request review.

**Q: How do I recover from a release rollback?**
A: Release Manager opens a post-incident ADR. Dependency Manager checks if a dependency caused the issue. If yes, issue a hotfix and emergency-lock.

---

## Summary

This workflow framework ensures:
1. **Reproducibility**: Canonical lockfile + frozen-lock CI checks prevent dependency drift.
2. **Quality**: Dry-run sandbox catches lint/test failures before human review.
3. **Accountability**: Dual gates (Architect, Tech Lead) and signed checkboxes create a clear handoff trail.
4. **Speed**: E2E validation and gating are automated; teams focus on deliberate approvals.
5. **Incident Response**: Emergency-lock and post-deploy monitoring enable fast, safe fixes.
