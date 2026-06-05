# CI Configuration & Gates

Files in this directory enforce the Dual-Gate Control Loops, Dependency Manager
policies, and per-track dry-run sandbox validation across the full nine-phase
software factory pipeline.

---

## Files

### `dependency-manager-gate.yml`
GitHub Actions workflow that runs on every PR and push to `main`/`develop`/`release/**`.

**Jobs:**
1. **`check_lock`** — Verifies local `package-lock.json` matches `canonical-lock.json`
2. **`sandbox` (matrix)** — Runs per-track dry-run sandbox: `backend`, `frontend`, `db`, `integration`
3. **`gate_status`** — Aggregates results; fails and blocks merge if any check fails

Triggered by path changes across tracks; uploads `sandbox_report_{track}.json` as CI artifacts.

Deploy to `.github/workflows/` in your target repository.

### `run_local_ci.sh`
Bash script for developers to run the same checks CI runs, before pushing.

```bash
# Run all tracks
./scripts/run_local_ci.sh --verbose

# Run only the backend track
./scripts/run_local_ci.sh --track backend --verbose

# Non-interactive mode (for pre-commit hooks or other scripts)
./scripts/run_local_ci.sh --track frontend --ci
```

Produces `sandbox_report_{track}.json` locally, matching CI output exactly.

### `PULL_REQUEST_TEMPLATE.md`
PR template with the full Dual-Gate metadata checklist:
- **Pipeline phase** and **track** classification
- Architect gate (required for API contract / schema / infrastructure changes)
- Tech Lead gate (required for all implementation and integration PRs)
- UI/UX gate (required for all frontend PRs)
- Dependency Manager approval status
- API contract change declaration
- Testing checklist

Deploy to `.github/` in your repository.

---

## Gate Flow

```
Developer pushes PR
        │
        ▼
[check_lock]  — lockfile vs canonical-lock.json
        │
        ├─ MISMATCH → dependency_manager_agent review required
        │
        ▼
[sandbox (matrix: backend | frontend | db | integration)]
        │
        ├─ FAIL on any track → fix lint/compile/test; see sandbox_report_{track}.json
        │
        ▼
[gate_status]  — aggregate; must be green for merge
        │
        ▼
[Tech Lead review]  — code quality, acceptance criteria, architecture alignment
        │
        ▼
[Merge to release branch]  → triggers integration phase checks
```

---

## Gating Rules

| Condition | Result | Owner |
|-----------|--------|-------|
| Lockfile mismatch | CI fails | `dependency_manager_agent` reviews |
| Sandbox fails (any track) | CI fails | Developer for that track fixes |
| PR missing Tech Lead approval | Merge blocked (branch protection) | Tech Lead |
| API contract changed, no Architect sign-off | Gate blocked | `senior_architect_agent` reviews |
| Frontend PR, no UI/UX sign-off | Gate blocked (PR template) | `ui_ux_agent` / designer reviews |
| Dependency changes unchecked | Gate blocked (PR template) | `dependency_manager_agent` approves |

---

## Integration Steps

1. Copy `dependency-manager-gate.yml` to `.github/workflows/`.
2. Copy `PULL_REQUEST_TEMPLATE.md` to `.github/`.
3. Copy `run_local_ci.sh` to `./scripts/` and make executable: `chmod +x scripts/run_local_ci.sh`.
4. Add branch protection rules (see [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)).
5. Onboard all teams using [USAGE_GUIDE.md](../USAGE_GUIDE.md).

---

## Sandbox Report Schema

Each track produces a `sandbox_report_{track}.json` conforming to:

```json
{
  "status": "PASS | FAIL",
  "track": "backend | frontend | db | integration",
  "timestamp": "ISO-8601",
  "lockfile_sha": "...",
  "checks": {
    "lint":                 { "status": "PASS | FAIL", "violations": [] },
    "typecheck":            { "status": "PASS | FAIL", "errors": [] },
    "unit_tests":           { "status": "PASS | FAIL", "coverage_pct": 87, "failures": [] },
    "dependency_integrity": { "status": "PASS | FAIL", "deviations": [] },
    "bundle_size":          { "status": "PASS | FAIL", "budget_kb": 250, "actual_kb": 240 }
  },
  "error_reflection": [
    {
      "error": "...",
      "source_file": "src/services/auth.ts:42",
      "suggested_owner": "backend_developer_agent",
      "reference_doc": "docs/adrs/004-auth-pattern.md"
    }
  ],
  "artifact_path": "sandbox-artifacts/sandbox-artifact-{track}-{sha}.tar.gz"
}
```

See [agents/dry_run_sandbox.md](../agents/dry_run_sandbox.md) for full specification.
