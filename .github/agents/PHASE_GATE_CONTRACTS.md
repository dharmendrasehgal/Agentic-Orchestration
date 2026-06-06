# Software Factory — Phase Gate Contracts

Each gate is a hard checkpoint. The Software Factory Orchestrator will not advance
to the next phase until every required artifact is registered and the sign-off agent
has explicitly approved. Gate decisions are logged with timestamp and artifact SHA.

---

## Gate 0 → 1: Discovery Complete

**Sign-off agent:** `requirement_agent`

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `brd.md` | business_analyst_agent | All business goals mapped to measurable outcomes |
| 2 | `frd.md` | requirement_agent | Every functional area has at least one requirement |
| 3 | `user_stories.md` | requirement_agent | Every story has: role, goal, benefit, and acceptance criteria |
| 4 | `nfr.md` | requirement_agent | Performance, security, accessibility, and compliance targets stated |
| 5 | `open_questions_log.md` | requirement_agent | All open questions marked: resolved, deferred-to-PM, or out-of-scope |

**Blocking conditions:** Any unresolved ambiguity in a user story that would prevent
an architect from making a technology decision.

---

## Gate 1 → 2: Planning Complete

**Sign-off agent:** `product_manager_agent`

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `product_roadmap.md` | product_manager_agent | Features sequenced by value; each has a target phase |
| 2 | `mvp_scope.md` | product_manager_agent | In-scope and out-of-scope features clearly listed |
| 3 | `sprint_plan.md` | product_manager_agent | At least one sprint's worth of stories prioritized |
| 4 | `kpi_definitions.md` | product_manager_agent | Each KPI has a baseline, target, and measurement method |

**Blocking conditions:** MVP scope undefined (architects cannot size work without knowing boundaries).

---

## Gate 2 → 3: System Architecture Complete

**Sign-off agent:** `senior_architect_agent`

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `solution_architecture.md` | senior_architect_agent | System diagram with all major components and interactions |
| 2 | `adrs/` (minimum 3) | senior_architect_agent | Database choice, runtime platform, frontend framework |
| 3 | `technology_stack.md` | senior_architect_agent | Per-domain: languages, frameworks, infra services |
| 4 | `cross_domain_contracts.md` | senior_architect_agent | Frontend↔Backend, Backend↔DB, App↔Infra boundaries defined |
| 5 | `risk_assessment.md` | senior_architect_agent | Top-5 risks with mitigation strategies |

**Blocking conditions:** Technology stack includes unvetted or conflicting choices.

---

## Gate 3 → 4: Domain Design Complete

**Sign-off agent:** `senior_architect_agent` (reviews all five domain outputs)

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `frontend_architecture.md` | frontend_architect_agent | Component hierarchy, state management strategy, routing |
| 2 | `ui_wireframes/` | ui_ux_agent | All user stories have at least one wireframe |
| 3 | `design_tokens.json` | ui_ux_agent | Color, typography, spacing tokens defined |
| 4 | `ux_flows.md` | ui_ux_agent | Happy-path and error-path flows for every major feature |
| 5 | `backend_architecture.md` | backend_architect_agent | Service map, failure isolation, SLO targets |
| 6 | `api_contracts.json` | backend_architect_agent | OpenAPI 3.x or GraphQL schema; every endpoint documented |
| 7 | `db_schema.sql` | db_architect_agent | All tables, columns, types, constraints, indexes |
| 8 | `er_diagrams/` | db_architect_agent | Entity-relationship diagrams for all domains |
| 9 | `data_governance_standards.md` | db_architect_agent | Retention, PII classification, backup policy |
| 10 | `ci_cd_architecture.md` | devops_architect_agent | Pipeline stages, environment promotion rules |
| 11 | `infrastructure_architecture.md` | devops_architect_agent | Cloud topology, networking, IAM |
| 12 | `monitoring_design.md` | devops_architect_agent | Metrics, alerts, dashboards per service |

**Blocking conditions:**
- API contracts not agreed between frontend and backend architects.
- DB schema missing tables that backend services require.
- Infrastructure design missing security controls flagged in NFRs.

---

## Gate 4 → 5: Foundation Complete

**Sign-off agent:** `tech_lead_agent`

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `dependency_manifest.lock` | dependency_manager_agent | Single canonical lockfile; no floating versions |
| 2 | `approved_packages.json` | dependency_manager_agent | All packages in technology_stack.md approved and scanned |
| 3 | `project_scaffold/` | devops_developer_agent | Directory structure matches code_structure_blueprint |
| 4 | `ci_cd_pipeline.yaml` | devops_developer_agent | All pipeline stages runnable end-to-end in dry-run mode |
| 5 | `containerization/` | devops_developer_agent | Dockerfiles for all runtime components |
| 6 | `environment_configs/` | devops_developer_agent | Dev/staging/prod configs; no secrets hardcoded |

**Blocking conditions:**
- Pipeline cannot install from lockfile (`npm ci` / `pnpm install --frozen-lockfile` fails).
- Any package fails security scan without documented exception.

---

## Gate 5 → 6: Implementation Complete

**Sign-off agent:** `tech_lead_agent` (once per track; all three must pass)

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `db_migrations/` | db_developer_agent | All migrations idempotent; rollback scripts present |
| 2 | `sandbox_report_db.json` | dry_run_sandbox | No lint errors; migrations apply/rollback cleanly |
| 3 | `backend_source/` | backend_developer_agent | All MVP endpoints implemented per api_contracts.json |
| 4 | `sandbox_report_backend.json` | dry_run_sandbox | Lint pass; unit-test coverage ≥ threshold defined in NFRs |
| 5 | `frontend_source/` | frontend_developer_agent | All MVP screens implemented per wireframes |
| 6 | `sandbox_report_frontend.json` | dry_run_sandbox | Lint pass; unit-test coverage ≥ threshold; no console errors |

**Blocking conditions:**
- Any sandbox report contains a `FAIL` status.
- An endpoint in `api_contracts.json` has no implementation.
- A wireframe screen has no corresponding component.

---

## Gate 6 → 7/8: Integration Complete

**Sign-off agents:** `tech_lead_agent` + `senior_architect_agent` (if API contracts changed)

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `integration_tests/` | integration_developer_agent | Cross-layer tests for every API contract endpoint |
| 2 | `wiring_report.md` | integration_developer_agent | Every frontend page confirmed to call correct backend API |
| 3 | `merged_prs/` | tech_lead_agent | All feature branches merged to release branch |
| 4 | `sandbox_report_integration.json` | dry_run_sandbox | All integration tests passing in containerized environment |

**Blocking conditions:**
- Any integration test fails.
- Frontend calls an API endpoint not defined in api_contracts.json.
- Database foreign-key constraint violations in integration test data.

---

## Gate 7 → 9: Validation Complete

**Sign-off agent:** `qa_lead_agent`

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `test_automation/` | qa_developer_agent | Automated tests for all acceptance criteria |
| 2 | `e2e_test_report.json` | qa_lead_agent | All critical E2E paths green; no P0/P1 defects open |
| 3 | `defect_register.md` | qa_developer_agent + qa_lead_agent | All critical/high defects resolved or accepted with owner |
| 4 | `performance_test_report.json` | qa_developer_agent | Response time and throughput meet NFR targets |
| 5 | `accessibility_test_report.json` | qa_developer_agent | WCAG level meets target defined in NFRs |
| 6 | `qa_gate_signoff.md` | qa_lead_agent | Explicit go/no-go decision with rationale |

**Blocking conditions:**
- Any P0 (system down) or P1 (critical function broken) defect unresolved.
- Performance targets from NFRs not met.
- E2E pass rate below 95% for gated scenarios.

---

## Gate 8 → 9: Documentation Complete

**Sign-off agent:** `product_manager_agent`

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `user_guide.md` | content_creator_agent | Covers all MVP user-facing features |
| 2 | `api_docs/` | content_creator_agent | Every public endpoint documented with examples |
| 3 | `onboarding_guide.md` | content_creator_agent | New developer setup takes < 30 min following guide |
| 4 | `release_notes.md` | content_creator_agent | Lists all features, fixes, known issues |

**Blocking conditions:**
- Public-facing API endpoints have no documentation.
- Features shipped in MVP scope have no user guide entry.

---

## Gate 9: Release Complete (System Manifest Issued)

**Sign-off agent:** `release_manager_agent`

| # | Required Artifact | Owner | Acceptance Condition |
|---|------------------|-------|---------------------|
| 1 | `release_manifest.json` | release_manager_agent | All gate sign-offs recorded with timestamps |
| 2 | `deployment_schedule.md` | release_manager_agent | Canary %, timing, and rollback thresholds defined |
| 3 | `canary_rollout_plan.md` | release_manager_agent | Traffic promotion stages with success criteria |
| 4 | `rollback_plan.md` | release_manager_agent | Automated rollback triggers and manual steps |
| 5 | `post_release_verification_report.json` | devops_developer_agent | All probes green for minimum observation window |
| 6 | `system_manifest.json` | software_factory_orchestrator | All artifacts indexed; no orphans; all consumers satisfied |

**Blocking conditions:**
- Any automated rollback was triggered during canary phase.
- Post-release SLO breach within observation window.
- system_manifest.json shows unresolved artifact gaps.

---

## Gate Escalation Policy

| Wait Time | Action |
|-----------|--------|
| > 4 hours, sign-off pending | Orchestrator sends reminder to sign-off agent |
| > 24 hours | Orchestrator escalates to next authority in chain |
| > 48 hours | Orchestrator flags to senior_architect_agent + release_manager_agent |
| > 72 hours | Orchestrator logs pipeline halt event; human intervention required |

All escalations are recorded in `pipeline_execution_log.md`.
