# Software Factory — Orchestrated Agent Catalog

This folder is the **orchestration layer** for the full software factory pipeline.
It contains updated agent specifications with complete `orchestration:` blocks and four
new coordination documents that wire every agent into a single, gap-free pipeline.

A single entry point — `SOFTWARE_FACTORY_ORCHESTRATOR` — accepts raw requirements and
drives all agents through nine gated phases to produce a deployable software system.

---

## Orchestration Documents

| File | Purpose |
|------|---------|
| [`SOFTWARE_FACTORY_ORCHESTRATOR.md`](SOFTWARE_FACTORY_ORCHESTRATOR.md) | Master entry-point agent — accepts requirements, sequences all phases |
| [`ORCHESTRATION_PIPELINE.md`](ORCHESTRATION_PIPELINE.md) | Phase-by-phase pipeline definition with parallel tracks and gate rules |
| [`AGENT_DEPENDENCY_GRAPH.md`](AGENT_DEPENDENCY_GRAPH.md) | Mermaid dependency graph + artifact-flow matrix |
| [`PHASE_GATE_CONTRACTS.md`](PHASE_GATE_CONTRACTS.md) | Exact artifact checklist and sign-off requirements per phase gate |

---

## Phase Map

```
P0  Discovery         requirement_agent → business_analyst_agent
P1  Planning          product_manager_agent
P2  Architecture      senior_architect_agent
P3  Domain Design     frontend_architect | backend_architect | db_architect | devops_architect | ui_ux_agent  [PARALLEL]
P4  Foundation        dependency_manager_agent + devops_developer_agent
P5  Implementation    frontend_developer | backend_developer | db_developer  [PARALLEL]
P6  Integration       integration_developer_agent ← tech_lead_agent (gate)
P7  Validation        qa_developer_agent + qa_lead_agent  [PARALLEL + feedback loops]
P8  Documentation     content_creator_agent  (starts alongside P7)
P9  Release           release_manager_agent → devops_developer_agent
```

---

## Agent Roster

### Discovery & Planning (P0–P1)
- [`requirement_agent.md`](requirement_agent.md) — Capture and structure all requirements into design-ready artifacts
- [`business_analyst_agent.md`](business_analyst_agent.md) — Convert business goals into functional requirements
- [`product_manager_agent.md`](product_manager_agent.md) — Prioritize roadmap, manage backlog, define KPIs

### Architecture (P2–P3)
- [`senior_architect_agent.md`](senior_architect_agent.md) — Define solution architecture, governance, and cross-domain ADRs
- [`frontend_architect_agent.md`](frontend_architect_agent.md) — Design frontend system, component library, and accessibility standards
- [`backend_architect_agent.md`](backend_architect_agent.md) — Design backend services, API contracts, and observability
- [`db_architect_agent.md`](db_architect_agent.md) — Define data models, schemas, and governance
- [`devops_architect_agent.md`](devops_architect_agent.md) — Design CI/CD, cloud infrastructure, and monitoring
- [`ui_ux_agent.md`](ui_ux_agent.md) ⭐ **NEW** — Produce wireframes, design tokens, and UX flows for web apps

### Foundation & Cross-Cutting (P4)
- [`dependency_manager_agent.md`](dependency_manager_agent.md) — Maintain canonical lockfile, enforce reproducibility
- [`tech_lead_agent.md`](tech_lead_agent.md) — Gate PRs, enforce standards, bridge arch→implementation

### Implementation (P5)
- [`frontend_developer_agent.md`](frontend_developer_agent.md) — Build UI components and client-side logic
- [`backend_developer_agent.md`](backend_developer_agent.md) — Build APIs, services, and business logic
- [`db_developer_agent.md`](db_developer_agent.md) — Implement schemas, migrations, and stored procedures
- [`devops_developer_agent.md`](devops_developer_agent.md) — Build CI/CD pipelines and deployment automation

### Integration (P6)
- [`integration_developer_agent.md`](integration_developer_agent.md) ⭐ **NEW** — Wire all layers, run integration tests, unblock cross-layer issues

### Validation (P7)
- [`qa_developer_agent.md`](qa_developer_agent.md) — Automate tests, execute regression, validate APIs and UI
- [`qa_lead_agent.md`](qa_lead_agent.md) — Define QA strategy, own E2E gate, block releases on failure

### Documentation (P8)
- [`content_creator_agent.md`](content_creator_agent.md) — Produce user guides, API docs, and release notes

### Release (P9)
- [`release_manager_agent.md`](release_manager_agent.md) — Coordinate final signoff, canary rollout, post-release verification

---

## Control Documents

- [`dual_gate_control_loops.md`](dual_gate_control_loops.md) — Architect↔TechLead and TechLead↔Developer gate rules
- [`dry_run_sandbox.md`](dry_run_sandbox.md) — Pre-PR and CI sandbox validation specification
- [`code_structure_blueprint.md`](code_structure_blueprint.md) — Directory layout and script conventions
- [`release_flow.md`](release_flow.md) — End-to-end release flow with signoff checklist

---

## Gaps Closed vs. Previous Agent Set

| Gap | Resolution |
|-----|-----------|
| No single entry point for raw requirements | `SOFTWARE_FACTORY_ORCHESTRATOR` added |
| No UI/UX design agent for web apps | `ui_ux_agent` added (P3, parallel) |
| `developer_agent` role was vague | Replaced with `integration_developer_agent` (P6, explicit wiring role) |
| `requirement_agent` was domain-specific | Generalized to accept any software project |
| `content_creator_agent` handoff pointed to non-existent `release_management` | Fixed → `release_manager_agent` |
| No artifact registry | Maintained by `SOFTWARE_FACTORY_ORCHESTRATOR` |
| No parallel execution specification | Every agent has `orchestration.parallel_with` |
| DB schema not explicitly wired to backend developer | Explicit `consumes_artifacts` dependency added |
| No project scaffolding phase | Phase 4 Foundation added (devops_dev + dependency_manager) |
| Feedback loops from QA to developers not explicit | `feedback_loop` block added to all QA agents |
| No phase gate contracts document | `PHASE_GATE_CONTRACTS.md` added |
