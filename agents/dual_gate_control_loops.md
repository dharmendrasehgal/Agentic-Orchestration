# Dual-Gate Control Loops

Purpose: Enforce staged approvals and accountability at two critical interfaces in the
software factory pipeline. Both gates must be operational from Phase 4 onward.

---

## Gate 1: Architect ↔ Tech Lead

**When it applies:**
- Before any large design change, API version bump, or cross-service contract modification.
- At the Phase 2→3 transition (senior_architect signs off domain architects' plans).
- At the Phase 3→4 transition (senior_architect reviews all five domain outputs together).
- When integration_developer_agent changes an API contract endpoint during P6.

**Gate Inputs:**
- Architecture Decision Record (ADR) for the change
- Impact analysis: which services, consumers, and tests are affected
- Dependency impacts from dependency_manager_agent (any new packages?)
- Performance/load forecast vs. SLO targets

**Gate Outputs:**
- Architect signoff (approve) or required changes (reject with specific requested changes)
- Updated ADR with decision rationale
- Test matrix for tech_lead_agent (what must be verified before merge)

**Rules:**
- Architect approves design; Tech Lead must provide an implementation plan and rollout strategy.
- Both must co-sign the release candidate metadata for architecture-sensitive releases.
- If architect and tech lead disagree: software_factory_orchestrator escalates to senior_architect_agent for tie-break.

---

## Gate 2: Tech Lead ↔ Developer

**When it applies:**
- Before any feature branch is merged into the release branch (all phases P5–P6).
- For all implementation and integration PRs.

**Gate Inputs:**
- PR containing passing dry-run sandbox results (lint, compile, unit tests — see dry_run_sandbox.md)
- dependency_manager_agent approval for any package additions or version changes
- Tech Lead review checklist (code quality, test coverage, acceptance criteria coverage)

**Gate Outputs:**
- Merge approval (PR merged to release branch) or request changes (PR returned to developer)
- Test run assignment (if additional tests are required before merge)

**Rules:**
- No merge without passing dry-run sandbox and Tech Lead explicit approval.
- Dependency deltas must be explicitly shown in PR diff and approved by dependency_manager_agent.
- PR lead time SLA: Tech Lead reviews within 48 hours of submission; auto-escalation to release_manager_agent after 48h wait.

---

## Enforcement Mechanisms

| Mechanism | Description |
|-----------|-------------|
| `frozen-lockfile` CI check | CI enforces `npm ci` / `pnpm install --frozen-lockfile`; any deviation fails immediately |
| Linter/compiler pass | All PRs must pass static analysis and type checking |
| Unit test threshold | Coverage must meet or exceed the threshold defined in nfr.md |
| Signed approvals | CI requires both `Architect:approved` and `TechLead:approved` metadata for architecture-sensitive PRs |
| Dependency delta check | Any package.json / lockfile change must include dependency_manager_agent approval reference |
| Automated escalation | If gate waits > 48h, orchestrator notifies stakeholders and auto-escalates |

---

## Audit & Traceability

- All gate decisions recorded in the artifact registry with: approver, timestamp, CI artifact SHA, and ADR reference.
- Gate logs are indexed in `pipeline_execution_log.md` maintained by software_factory_orchestrator.
- Gate decisions are immutable once recorded; amendments require a new gate decision referencing the previous one.

---

## Orchestration Integration

```
Phase 5 (Implementation):
  developer_track → dry_run_sandbox → Tech Lead Gate 2 → merge to release branch

Phase 6 (Integration):
  integration_developer → dry_run_sandbox → Tech Lead Gate 2 → merge
  if API contract changed: → Architect Gate 1 → Tech Lead Gate 2 → merge

Phase 9 (Release):
  release_manager collects: Architect Gate 1 sign-off + QA gate + Tech Lead Gate 2 log
  → release_manifest.json → deploy
```
