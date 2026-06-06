# Release Flow and Signoff

This document describes the end-to-end release flow from "implementation complete"
through "production verified." It maps to Phases 6–9 of the software factory pipeline.

---

## Release Stages

```
Stage 1:  Tech Lead review gate
          ─ All feature PRs pass dry-run sandbox
          ─ Tech Lead approves and merges to release branch
          ─ Gate: pr_merge_log.md signed by tech_lead_agent

Stage 2:  Integration
          ─ integration_developer_agent wires all layers
          ─ Runs integration tests in containerized environment
          ─ Gate: sandbox_report_integration.json PASS
          ─ Gate: tech_lead_agent + senior_architect (if API changed)

Stage 3:  QA E2E Validation (parallel with Documentation)
          ─ qa_developer_agent builds full automated test suite
          ─ qa_lead_agent runs E2E gate
          ─ Gate: qa_gate_signoff.md (go/no-go) by qa_lead_agent

Stage 4:  Documentation (parallel with Stage 3)
          ─ content_creator_agent produces all docs
          ─ Gate: product_manager_agent sign-off on completeness

Stage 5:  Architect Signoff (for architecture-sensitive releases)
          ─ Required when: contract or interface changed, new service added,
            infrastructure topology changed
          ─ Gate: senior_architect_agent ADR update + co-sign

Stage 6:  Release Manager Final Signoff
          ─ Collects all gate artifacts
          ─ Produces release_manifest.json
          ─ Gate: release_manager_agent go/no-go

Stage 7:  Deployment by DevOps
          ─ devops_developer_agent executes canary rollout
          ─ Monitoring dashboards active before first traffic shift
          ─ Automated post-release probes run for observation window

Stage 8:  Post-Release Verification
          ─ devops_developer_agent publishes post_release_verification_report.json
          ─ release_manager_agent reviews; closes release if all probes green
          ─ release_manager_agent triggers rollback if SLO thresholds breached
```

---

## Signoff Checklist (All Gates Must Pass)

| # | Checkpoint | Sign-off Agent | Artifact |
|---|-----------|----------------|---------|
| 1 | All implementation PRs merged | tech_lead_agent | pr_merge_log.md |
| 2 | Dependency Manager approval | dependency_manager_agent | approved_packages.json |
| 3 | Integration dry-run sandbox passed | tech_lead_agent | sandbox_report_integration.json |
| 4 | Architecture signoff (if interface changed) | senior_architect_agent | updated ADR |
| 5 | QA E2E gate passed | qa_lead_agent | qa_gate_signoff.md + e2e_test_report.json |
| 6 | Performance tests pass NFR targets | qa_lead_agent | performance_test_report.json |
| 7 | Accessibility tests pass target WCAG | qa_lead_agent | accessibility_test_report.json |
| 8 | Documentation complete | product_manager_agent | user_guide.md + api_docs/ |
| 9 | Rollback plan defined | release_manager_agent | rollback_plan.md |
| 10 | Canary schedule defined | release_manager_agent | canary_rollout_plan.md |
| 11 | Monitoring dashboards and alerts active | devops_developer_agent | monitoring_dashboards/ |

---

## Debugging & Escalation

| Scenario | Who Owns | Action |
|----------|----------|--------|
| Sandbox / CI fails with non-obvious errors | tech_lead_agent | Creates triage ticket; attaches sandbox-artifact.tar.gz |
| E2E fails post-integration | qa_lead_agent | Opens defect ticket; 24h resolution SLA; integration_developer_agent assigned |
| E2E fails post-deploy (production) | release_manager_agent | Evaluates rollback; coordinates with devops_developer_agent |
| Dependency-induced runtime issue | dependency_manager_agent + devops_developer_agent | Emergency-lock produced; hotfix PR coordinated with release_manager_agent |
| SLO breach post-deploy | devops_developer_agent (monitoring) | Alerts release_manager_agent; rollback triggered if threshold crossed |

---

## Post-Release

1. Automated verification probes run for a configured observation window (default: 24h canary, then 24h full).
2. release_manager_agent reviews `post_release_verification_report.json`.
3. If probes pass: release is officially closed; release_manager_agent publishes close notice.
4. software_factory_orchestrator registers `system_manifest.json` as the final pipeline artifact.
5. Any post-release issues are recorded in a new ADR and enter the next release cycle as P0 backlog items.

---

## Orchestration Phase Map

| Release Stage | Pipeline Phase | Primary Agent |
|--------------|---------------|---------------|
| Stage 1 | P5 exit + P6 start | tech_lead_agent |
| Stage 2 | P6 | integration_developer_agent |
| Stage 3 | P7 | qa_lead_agent |
| Stage 4 | P8 | content_creator_agent |
| Stage 5 | P6/P9 (if needed) | senior_architect_agent |
| Stage 6 | P9 start | release_manager_agent |
| Stage 7 | P9 | devops_developer_agent |
| Stage 8 | P9 close | release_manager_agent |
