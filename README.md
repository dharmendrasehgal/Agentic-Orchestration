Updated Agents & Multi-Agent Workflow

Overview:
This folder contains the canonical copy of all agent specifications, including legacy domain agents from `.github/agents/` and new workflow control agents. It also includes supporting documentation, CI templates, and a Dependency Manager CLI to implement a controlled, auditable multi-agent workflow for completing web application implementations with full E2E validation and dependency control.

## Quick Links

### Getting Started
- **[USAGE_GUIDE.md](USAGE_GUIDE.md)**: Complete workflows, examples, and troubleshooting
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**: Step-by-step integration into your repository

### Agent Specs (agents/ folder)
- [INDEX.md](agents/INDEX.md): Quick reference catalog for all agents and workflow documents
- [backend_architect_agent.md](agents/backend_architect_agent.md)
- [backend_developer_agent.md](agents/backend_developer_agent.md)
- [business_analyst_agent.md](agents/business_analyst_agent.md)
- [content_creator_agent.md](agents/content_creator_agent.md)
- [db_architect_agent.md](agents/db_architect_agent.md)
- [db_developer_agent.md](agents/db_developer_agent.md)
- [devops_architect_agent.md](agents/devops_architect_agent.md)
- [devops_developer_agent.md](agents/devops_developer_agent.md)
- [frontend_architect_agent.md](agents/frontend_architect_agent.md)
- [frontend_developer_agent.md](agents/frontend_developer_agent.md)
- [product_manager_agent.md](agents/product_manager_agent.md)
- [qa_developer_agent.md](agents/qa_developer_agent.md)
- [qa_lead_agent.md](agents/qa_lead_agent.md)
- [requirement_agent.md](agents/requirement_agent.md)
- [senior_architect_agent.md](agents/senior_architect_agent.md)
- [tech_lead_agent.md](agents/tech_lead_agent.md)
- [dependency_manager_agent.md](agents/dependency_manager_agent.md)
- [release_manager_agent.md](agents/release_manager_agent.md)

> Note: This folder now contains the full set of legacy agent specs from `.github/agents/` plus newly suggested control-layer agents for dependency, tech lead, and release governance.

### Control Framework & Standards
- [dual_gate_control_loops.md](agents/dual_gate_control_loops.md): Architect ↔ Tech Lead ↔ Developer gating
- [dry_run_sandbox.md](agents/dry_run_sandbox.md): Automated linting, compilation, and test validation
- [code_structure_blueprint.md](agents/code_structure_blueprint.md): Directory layout and script patterns
- [release_flow.md](agents/release_flow.md): Release signoff, debugging escalation, and team alignment

### CI Templates & Tools
- [ci/dependency-manager-gate.yml](ci/dependency-manager-gate.yml): GitHub Actions workflow for lockfile & sandbox checks
- [ci/run_local_ci.sh](ci/run_local_ci.sh): Local dev script to run same checks before pushing
- [ci/PULL_REQUEST_TEMPLATE.md](ci/PULL_REQUEST_TEMPLATE.md): PR template with Dual-Gate metadata
- [tools/dependency-manager/](tools/dependency-manager/): Minimal Node.js CLI for lockfile enforcement

## Key Features

✅ **Dual-Gate Control Loops**: Architect ↔ Tech Lead ↔ Developer approval flow with signed checkboxes  
✅ **Dependency Manager as Single Source of Truth**: Canonical lockfile + frozen-lock CI enforcement  
✅ **Dry-Run Sandbox**: Automated linting, type checks, and unit tests before human review  
✅ **E2E Validation**: QA Lead gate ensures release-readiness  
✅ **Release Signoff**: Coordinated approval from all teams with audit trail  
✅ **Emergency Response**: Fast-track hotfixes with emergency-lock and expedited approvals  

## 5-Minute Setup

1. Copy CI templates into your repository:
   ```bash
   cp ci/dependency-manager-gate.yml .github/workflows/
   cp ci/PULL_REQUEST_TEMPLATE.md .github/
   cp ci/run_local_ci.sh ./scripts/
   ```

2. Set up canonical lockfile:
   ```bash
   cp package-lock.json canonical-lock.json
   git add canonical-lock.json
   git commit -m "chore: add canonical lockfile"
   ```

3. Add branch protection rule (GitHub Settings → Branches):
   - Require status checks: `Dependency Manager Gate` jobs
   - Require pull request review

4. Developer onboarding:
   - Run `./scripts/run_local_ci.sh --verbose` before opening a PR
   - Use PR template for gate checkboxes

5. For details, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Workflow at a Glance

```
Developer → Local CI (dry-run) → PR (gate metadata) → CI Gates (lockfile + sandbox)
  → Dependency Manager Review → Tech Lead Review → Merge
  → Release Candidate → E2E Validation → Architect Signoff → Release Manager Approval
  → DevOps Deployment (canary → 100%) → Post-Release Monitoring
```

See [USAGE_GUIDE.md](USAGE_GUIDE.md) for detailed workflows and examples.
