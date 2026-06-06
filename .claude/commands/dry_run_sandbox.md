# Dry-Run Sandbox

Purpose: Provide an automated, programmatic sandbox that validates code before human
gating and full CI validation. Reduces noisy failures during PR review by catching
issues at the developer's workstation and in a reproducible CI container.

---

## Pre-PR Local Step

Before submitting any PR, developers run `./scripts/dry-run.sh` (or `npm run dry-run`), which:

1. **Static analysis and linters** — ESLint, Prettier, language-specific linters
2. **Type checks and compilation** — TypeScript, Go, or equivalent for the stack
3. **Unit test quick-run** — fast subset (~< 2 minutes) for immediate feedback
4. **Dependency integrity check** — verifies install matches canonical lockfile exactly
5. **Bundle size check** (frontend only) — fails if performance budget exceeded

Sandbox output: human-readable log + machine-readable `sandbox-report-local.json`

---

## CI Sandbox Job

For every PR, CI runs an isolated sandbox job in a container that:

1. **Installs from the canonical lockfile** — `npm ci` / `pnpm install --frozen-lockfile` (Dependency Manager enforced)
2. **Runs linters and full unit test suite** in the containerized environment
3. **Runs integration smoke test** — confirms basic wiring is correct (e.g., DB connects, API responds)
4. **Produces an error-reflection report** — maps runtime stack traces to source files and suggests responsible owners

Per-track reports:
- `sandbox_report_backend.json`
- `sandbox_report_frontend.json`
- `sandbox_report_db.json`
- `sandbox_report_integration.json`

---

## Report Schema

```json
{
  "status": "PASS | FAIL",
  "track": "backend | frontend | db | integration",
  "timestamp": "ISO-8601",
  "lockfile_sha": "...",
  "checks": {
    "lint": { "status": "PASS | FAIL", "violations": [] },
    "typecheck": { "status": "PASS | FAIL", "errors": [] },
    "unit_tests": { "status": "PASS | FAIL", "coverage_pct": 87, "failures": [] },
    "dependency_integrity": { "status": "PASS | FAIL", "deviations": [] },
    "bundle_size": { "status": "PASS | FAIL", "budget_kb": 250, "actual_kb": 240 }
  },
  "error_reflection": [
    {
      "error": "TypeError: Cannot read property...",
      "source_file": "src/services/auth.ts:42",
      "suggested_owner": "backend_developer_agent",
      "reference_doc": "docs/adrs/004-auth-pattern.md"
    }
  ],
  "artifact_path": "sandbox-artifacts/sandbox-artifact-{track}-{sha}.tar.gz"
}
```

---

## Error Reflection & Feedback

- Sandbox aggregates all failures and annotates the PR with failing files, failing rules, and suggested fixes.
- Sandbox links to relevant docs (coding standards, architecture notes) and names the responsible Tech Lead or Architect.
- Error reflection output is parsed by tech_lead_agent to prioritize review focus.

---

## Sandbox Artifacts

| Artifact | Description |
|----------|-------------|
| `sandbox-report.json` | Machine-readable results; consumed by gate decisions |
| `sandbox-artifact.tar.gz` | Full logs and environment snapshot for deep debugging |
| `error-reflection.md` | Human-readable annotation added to PR |

---

## Automation Integrations

| Use | Details |
|-----|---------|
| Dependency Manager upgrades | Runs sandbox on proposed upgrade PRs before recommending update |
| Release Manager pre-release check | Triggers sandbox dry-run across all release-candidate commits before final signoff |
| Pre-commit hook | Optional developer-side hook that runs the local quick-check before `git commit` |

---

## Orchestration Integration

```
Phase 5:  each developer track → ./scripts/dry-run.sh → sandbox_report_{track}.json
                                                        → tech_lead_agent (Gate 2)

Phase 6:  integration_developer → CI sandbox job → sandbox_report_integration.json
                                                  → tech_lead_agent (Gate 2)

Phase 9:  release_manager triggers cross-release sandbox run → included in release_manifest.json
```

Gate rule: No merge and no phase gate sign-off without a `"status": "PASS"` sandbox report attached.
