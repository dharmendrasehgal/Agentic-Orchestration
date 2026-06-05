# Software Factory — Multi-Agent Workflow

A complete, orchestrated agent system that takes **raw requirements** as input and
produces a **fully deployed software system** as output — with no coverage gaps.

A single entry point ([`SOFTWARE_FACTORY_ORCHESTRATOR`](agents/SOFTWARE_FACTORY_ORCHESTRATOR.md))
drives 21 specialist agents through a nine-phase, gated pipeline.

---

## Quick Links

| What you need | Where to go |
|--------------|-------------|
| Start a new project | [USAGE_GUIDE.md → "Start a project from scratch"](USAGE_GUIDE.md#workflow-1-start-a-project-from-scratch) |
| Set up CI in your repo | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) |
| Understand the full pipeline | [agents/ORCHESTRATION_PIPELINE.md](agents/ORCHESTRATION_PIPELINE.md) |
| See agent dependencies visually | [agents/AGENT_DEPENDENCY_GRAPH.md](agents/AGENT_DEPENDENCY_GRAPH.md) |
| See gate requirements | [agents/PHASE_GATE_CONTRACTS.md](agents/PHASE_GATE_CONTRACTS.md) |
| Troubleshoot a CI failure | [USAGE_GUIDE.md → Troubleshooting](USAGE_GUIDE.md#troubleshooting) |

---

## Pipeline at a Glance

```
RAW REQUIREMENTS
       │
       ▼  [SOFTWARE_FACTORY_ORCHESTRATOR]
       │
P0  Discovery         business_analyst ──► requirement_agent
P1  Planning          product_manager_agent
P2  Architecture      senior_architect_agent
P3  Domain Design     frontend_arch ║ backend_arch ║ db_arch ║ devops_arch ║ ui_ux_agent  [PARALLEL]
P4  Foundation        dependency_manager ║ devops_developer  [PARALLEL]
P5  Implementation    frontend_dev ║ backend_dev ║ db_dev  [STAGGERED PARALLEL]
P6  Integration       integration_developer_agent ◄── tech_lead_agent (gate)
P7  Validation        qa_developer ║ qa_lead  [PARALLEL + feedback loops]
P8  Documentation     content_creator_agent  (runs alongside P7)
P9  Release           release_manager ──► devops_developer
       │
       ▼
  system_manifest.json  ←  FINAL OUTPUT
```

Each phase transition is gated — the orchestrator checks that all required
artifacts are registered and signed off before the next phase begins.

---

## Agent Roster

### Orchestration Entry Point
- [SOFTWARE_FACTORY_ORCHESTRATOR.md](agents/SOFTWARE_FACTORY_ORCHESTRATOR.md) — Accepts raw requirements, sequences all 9 phases

### Discovery & Planning (P0–P1)
- [requirement_agent.md](agents/requirement_agent.md) — BRD, FRD, user stories, NFRs
- [business_analyst_agent.md](agents/business_analyst_agent.md) — Converts business goals to requirements
- [product_manager_agent.md](agents/product_manager_agent.md) — Roadmap, MVP scope, KPI definitions

### Architecture (P2–P3)
- [senior_architect_agent.md](agents/senior_architect_agent.md) — Solution architecture, ADRs, tech stack
- [frontend_architect_agent.md](agents/frontend_architect_agent.md) — Component system, state management, performance budgets
- [backend_architect_agent.md](agents/backend_architect_agent.md) — Service design, API contracts, SLOs
- [db_architect_agent.md](agents/db_architect_agent.md) — Schema, ER diagrams, data governance
- [devops_architect_agent.md](agents/devops_architect_agent.md) — CI/CD, infrastructure, monitoring design
- [ui_ux_agent.md](agents/ui_ux_agent.md) ⭐ — Wireframes, design tokens, UX flows, accessibility

### Foundation & Gating (P4, cross-phase)
- [dependency_manager_agent.md](agents/dependency_manager_agent.md) — Canonical lockfile, package approval, CVE scanning
- [tech_lead_agent.md](agents/tech_lead_agent.md) — PR gating, code review, sprint task breakdown

### Implementation (P5)
- [frontend_developer_agent.md](agents/frontend_developer_agent.md) — UI components, pages, client-side logic
- [backend_developer_agent.md](agents/backend_developer_agent.md) — APIs, services, business logic
- [db_developer_agent.md](agents/db_developer_agent.md) — Migrations, procedures, seed data

### Infrastructure (P4 + P9)
- [devops_developer_agent.md](agents/devops_developer_agent.md) — CI/CD pipeline, IaC, monitoring, production deployment

### Integration (P6)
- [integration_developer_agent.md](agents/integration_developer_agent.md) ⭐ — Wires all layers, integration tests, merge coordination

### Validation (P7)
- [qa_developer_agent.md](agents/qa_developer_agent.md) — Automated test suite, regression, performance, accessibility
- [qa_lead_agent.md](agents/qa_lead_agent.md) — E2E gate, release blocking, defect triage

### Documentation (P8)
- [content_creator_agent.md](agents/content_creator_agent.md) — User guide, API docs, release notes, onboarding guide

### Release (P9)
- [release_manager_agent.md](agents/release_manager_agent.md) — Final signoff, canary rollout, post-release verification

---

## Orchestration Documents

- [ORCHESTRATION_PIPELINE.md](agents/ORCHESTRATION_PIPELINE.md) — Full pipeline with parallel tracks, artifact flow matrix, and feedback loops
- [AGENT_DEPENDENCY_GRAPH.md](agents/AGENT_DEPENDENCY_GRAPH.md) — Mermaid dependency graph + full dependency matrix
- [PHASE_GATE_CONTRACTS.md](agents/PHASE_GATE_CONTRACTS.md) — Exact artifact checklist per gate (10 gates, 45+ artifacts)

## Control Framework
- [dual_gate_control_loops.md](agents/dual_gate_control_loops.md) — Architect↔TechLead and TechLead↔Developer gate rules
- [dry_run_sandbox.md](agents/dry_run_sandbox.md) — Per-track sandbox spec and report schema
- [code_structure_blueprint.md](agents/code_structure_blueprint.md) — Directory layout and script conventions
- [release_flow.md](agents/release_flow.md) — End-to-end release stages and signoff checklist

## CI Templates & Tools
- [ci/dependency-manager-gate.yml](ci/dependency-manager-gate.yml) — GitHub Actions: lockfile check + per-track sandbox matrix
- [ci/run_local_ci.sh](ci/run_local_ci.sh) — Local pre-push CI runner with `--track` support
- [ci/PULL_REQUEST_TEMPLATE.md](ci/PULL_REQUEST_TEMPLATE.md) — PR template with pipeline phase, track, and all gate metadata
- [tools/dependency-manager/](tools/dependency-manager/) — Node.js CLI: `depman check-lock`, `depman dry-run --track <track>`

---

## Key Features

- **Single entry point**: give raw requirements to `SOFTWARE_FACTORY_ORCHESTRATOR`; it drives everything
- **No coverage gaps**: every requirement is traced through implementation, testing, documentation, and deployment
- **Parallel execution**: P3, P5, and P7+P8 run in parallel tracks — minimises critical path
- **Gated pipeline**: 10 phase gates, each with an explicit artifact checklist and sign-off agent
- **Dual-gate control loops**: Architect↔TechLead and TechLead↔Developer gates on every merge
- **Per-track dry-run sandbox**: lint, typecheck, and unit tests per track before any PR review
- **Explicit feedback loops**: QA, Tech Lead, and dependency issues loop back to the right agent automatically
- **Emergency response**: `depman emergency-lock` + fast-track approval flow for CVEs

---

## 5-Minute Repository Setup

```bash
# 1. Copy CI workflow
mkdir -p .github/workflows
cp updated-agents/ci/dependency-manager-gate.yml .github/workflows/

# 2. Copy PR template
cp updated-agents/ci/PULL_REQUEST_TEMPLATE.md .github/

# 3. Copy local CI runner
mkdir -p scripts
cp updated-agents/ci/run_local_ci.sh scripts/
chmod +x scripts/run_local_ci.sh

# 4. Create canonical lockfile baseline
cp package-lock.json canonical-lock.json
git add canonical-lock.json
git commit -m "chore: add canonical lockfile baseline"
```

Then add branch protection rules in GitHub Settings → Branches (see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)).

---

See [USAGE_GUIDE.md](USAGE_GUIDE.md) for full workflows and [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for team onboarding.
