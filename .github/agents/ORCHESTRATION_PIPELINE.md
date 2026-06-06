# Software Factory — Orchestration Pipeline

This document defines the full nine-phase pipeline: execution mode, artifact flow,
parallel tracks, gate conditions, and feedback loops for every agent.

---

## Pipeline Overview

```
RAW REQUIREMENTS
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P0  DISCOVERY                                                [SEQUENTIAL]   │
│      business_analyst_agent ──► requirement_agent                            │
│      Artifacts: BRD, FRD, user_stories, NFRs, open_questions               │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: requirement_agent sign-off
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P1  PLANNING                                                 [SEQUENTIAL]   │
│      product_manager_agent                                                   │
│      Artifacts: product_roadmap, mvp_scope, sprint_plan, kpi_definitions    │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: product_manager_agent sign-off
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P2  SYSTEM ARCHITECTURE                                      [SEQUENTIAL]   │
│      senior_architect_agent                                                  │
│      Artifacts: solution_architecture, ADRs, tech_stack, cross_domain       │
│                 contracts, risk_assessment                                   │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: senior_architect_agent sign-off
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P3  DOMAIN DESIGN                                            [PARALLEL ×5]  │
│   ┌──────────────────┐ ┌───────────────────┐ ┌──────────────────────────┐   │
│   │frontend_architect│ │backend_architect  │ │   db_architect_agent     │   │
│   │ + ui_ux_agent    │ │    _agent         │ │                          │   │
│   └──────────────────┘ └───────────────────┘ └──────────────────────────┘   │
│   ┌──────────────────────────────────────────┐                               │
│   │       devops_architect_agent             │                               │
│   └──────────────────────────────────────────┘                               │
│      Artifacts: frontend_arch, wireframes, design_tokens, backend_arch,      │
│                 api_contracts, db_schema, er_diagrams, ci_cd_architecture,   │
│                 infra_architecture, monitoring_design                        │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: senior_architect_agent reviews all 5 domain outputs
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P4  FOUNDATION                                               [PARALLEL ×2]  │
│   ┌──────────────────────────┐   ┌────────────────────────────────────────┐  │
│   │  dependency_manager      │   │     devops_developer_agent             │  │
│   │      _agent              │   │  (CI/CD pipeline + scaffold)           │  │
│   └──────────────────────────┘   └────────────────────────────────────────┘  │
│      Artifacts: dependency_manifest.lock, approved_packages.json,            │
│                 project_scaffold/, ci_cd_pipeline.yaml,                      │
│                 containerization/, environment_configs/                      │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: tech_lead_agent sign-off
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P5  IMPLEMENTATION                                 [STAGGERED → PARALLEL]   │
│                                                                               │
│   Step 1 (immediate):  db_developer_agent                                    │
│           Produces:    db_migrations/, confirmed_schema.sql                  │
│                                    │                                         │
│   Step 2 (after DB migrations ok): ├──► backend_developer_agent             │
│                                    └──► frontend_developer_agent            │
│                                                                               │
│      All tracks guarded by: tech_lead_agent (dry-run gate per PR)           │
│      Artifacts: frontend_source/, backend_source/, db_migrations/,           │
│                 sandbox_report_{track}.json                                  │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: tech_lead_agent sign-off (all 3 tracks)
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P6  INTEGRATION                                              [SEQUENTIAL]   │
│      integration_developer_agent                                             │
│          └── PRs reviewed by: tech_lead_agent                               │
│          └── API changes reviewed by: senior_architect_agent (if needed)    │
│      Artifacts: integration_tests/, wiring_report.md,                       │
│                 merged_prs/, sandbox_report_integration.json                 │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: tech_lead + senior_architect sign-off
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P7  VALIDATION                          [PARALLEL + FEEDBACK LOOPS]        │
│  P8  DOCUMENTATION                       (P7 and P8 run concurrently)       │
│                                                                               │
│   ┌──────────────────────────────────┐   ┌────────────────────────────────┐  │
│   │  qa_developer_agent              │   │  content_creator_agent         │  │
│   │  qa_lead_agent                   │   │  (starts when P6 gates pass)   │  │
│   │                                  │   │                                │  │
│   │  Feedback loops:                 │   │  Artifacts: user_guide,        │  │
│   │  defects → integration_developer │   │  api_docs/, onboarding_guide,  │  │
│   │  blockers → release_manager      │   │  release_notes                 │  │
│   └──────────────────────────────────┘   └────────────────────────────────┘  │
│      Artifacts: test_automation/, e2e_test_report,                          │
│                 defect_register, performance_report, qa_gate_signoff        │
└──────────────────────────┬───────────────────────────────────────────────────┘
                           │  Gate: qa_lead_agent (P7) + product_manager (P8)
                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  P9  RELEASE                                                  [SEQUENTIAL]   │
│      release_manager_agent                                                   │
│          └── deploys via: devops_developer_agent                             │
│      Artifacts: release_manifest.json, deployment_schedule,                 │
│                 canary_rollout_plan, rollback_plan,                          │
│                 post_release_verification_report.json,                       │
│                 system_manifest.json  ← FINAL OUTPUT                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Artifact Flow Matrix

| Artifact | Produced By | Consumed By |
|----------|------------|-------------|
| `brd.md` | business_analyst_agent | requirement_agent, product_manager_agent |
| `frd.md` | requirement_agent | senior_architect_agent, product_manager_agent |
| `user_stories.md` | requirement_agent | product_manager_agent, qa_lead_agent |
| `nfr.md` | requirement_agent | senior_architect_agent, devops_architect_agent, qa_lead_agent |
| `product_roadmap.md` | product_manager_agent | senior_architect_agent, tech_lead_agent |
| `mvp_scope.md` | product_manager_agent | senior_architect_agent, all architects |
| `solution_architecture.md` | senior_architect_agent | all domain architects |
| `adrs/` | senior_architect_agent | tech_lead_agent, all developers |
| `technology_stack.md` | senior_architect_agent | all architects, dependency_manager_agent |
| `cross_domain_contracts.md` | senior_architect_agent | frontend_architect, backend_architect |
| `frontend_architecture.md` | frontend_architect_agent | frontend_developer_agent |
| `ui_wireframes/` | ui_ux_agent | frontend_architect_agent, frontend_developer_agent |
| `design_tokens.json` | ui_ux_agent | frontend_developer_agent |
| `backend_architecture.md` | backend_architect_agent | backend_developer_agent, integration_developer_agent |
| `api_contracts.json` | backend_architect_agent | frontend_developer_agent, backend_developer_agent, qa_developer_agent, content_creator_agent |
| `db_schema.sql` | db_architect_agent | db_developer_agent, backend_developer_agent |
| `er_diagrams/` | db_architect_agent | backend_architect_agent, content_creator_agent |
| `data_governance_standards.md` | db_architect_agent | db_developer_agent |
| `ci_cd_architecture.md` | devops_architect_agent | devops_developer_agent |
| `infrastructure_architecture.md` | devops_architect_agent | devops_developer_agent |
| `monitoring_design.md` | devops_architect_agent | devops_developer_agent, release_manager_agent |
| `dependency_manifest.lock` | dependency_manager_agent | all developers, ci_cd_pipeline |
| `approved_packages.json` | dependency_manager_agent | tech_lead_agent, all developers |
| `ci_cd_pipeline.yaml` | devops_developer_agent | tech_lead_agent, qa_lead_agent, release_manager_agent |
| `project_scaffold/` | devops_developer_agent | all developers |
| `db_migrations/` | db_developer_agent | backend_developer_agent, integration_developer_agent |
| `backend_source/` | backend_developer_agent | integration_developer_agent, qa_developer_agent |
| `frontend_source/` | frontend_developer_agent | integration_developer_agent, qa_developer_agent |
| `sandbox_report_{track}.json` | dry_run_sandbox | tech_lead_agent |
| `integration_tests/` | integration_developer_agent | qa_lead_agent |
| `wiring_report.md` | integration_developer_agent | tech_lead_agent, qa_lead_agent |
| `test_automation/` | qa_developer_agent | qa_lead_agent, release_manager_agent |
| `e2e_test_report.json` | qa_lead_agent | release_manager_agent |
| `defect_register.md` | qa_developer_agent + qa_lead_agent | integration_developer_agent, release_manager_agent |
| `user_guide.md` | content_creator_agent | release_manager_agent, system_manifest |
| `api_docs/` | content_creator_agent | release_manager_agent, system_manifest |
| `release_notes.md` | content_creator_agent | release_manager_agent |
| `release_manifest.json` | release_manager_agent | system_manifest |
| `system_manifest.json` | software_factory_orchestrator | FINAL OUTPUT |

---

## Feedback Loops

| Trigger | Source | Target | Action |
|---------|--------|--------|--------|
| Defect found in feature | qa_developer_agent | integration_developer_agent | Re-open feature branch; fix and re-validate |
| E2E gate blocked | qa_lead_agent | integration_developer_agent + tech_lead_agent | Triage ticket; 24h SLA |
| E2E gate blocked | qa_lead_agent | release_manager_agent | Release hold notification |
| PR fails dry-run | dry_run_sandbox | developer (any track) | Annotated report with failing rules; fix required before re-submit |
| Dependency advisory | dependency_manager_agent | tech_lead_agent | Upgrade request PR; sandbox validation before merge |
| Post-release regression | devops_developer_agent (monitoring) | release_manager_agent | Incident opened; potential rollback |
| Scope change detected | product_manager_agent | software_factory_orchestrator | Phase re-evaluation; backlog update |

---

## Parallel Execution Rules

1. **Domain Design (P3):** All five domain agents may run simultaneously. The only dependency is that `ui_ux_agent` should share wireframe drafts with `frontend_architect_agent` early (not blocking, but collaborative).

2. **Implementation (P5):** `db_developer_agent` starts first. `backend_developer_agent` and `frontend_developer_agent` start once `db_migrations/` first pass is confirmed. Backend and frontend then run in parallel.

3. **Validation + Documentation (P7+P8):** `content_creator_agent` starts as soon as P6 gate passes. `qa_developer_agent` and `qa_lead_agent` also start on P6 completion. These three agents run concurrently.

4. **devops_developer_agent** participates in both P4 (CI/CD pipeline build) and P9 (production deployment). In P5 it provides environment support without blocking the implementation track.

---

## Phase Gate Enforcement

- Gates are enforced by the **Software Factory Orchestrator**, which checks the artifact registry before allowing the next phase to begin.
- A phase is only marked complete when ALL required artifacts are registered AND the designated sign-off agent has approved.
- Gate decisions are logged with timestamp, agent, and artifact references in `pipeline_execution_log.md`.
- If a gate waits more than **48 hours** without sign-off, orchestrator auto-escalates to `senior_architect_agent` (for arch gates) or `release_manager_agent` (for release gates).
