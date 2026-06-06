# Dependency Manager CLI

A minimal Node.js CLI that enforces canonical lockfile policies and runs per-track
dry-run sandboxes locally and in CI. Part of the Software Factory pipeline — owned
by `dependency_manager_agent` (see `agents/dependency_manager_agent.md`).

---

## Install

```bash
cd updated-agents/tools/dependency-manager
npm install

# Make `depman` available globally (optional, for local dev)
npm link
```

Requires Node.js >= 18.

---

## Commands

### `depman check-lock [local-lock] [canonical-lock]`

Compares the local lockfile (SHA-256) against the canonical lockfile.
Exits non-zero on any mismatch — CI blocks the PR.

```bash
# Uses package-lock.json and ./canonical-lock.json by default
depman check-lock

# Explicit paths
depman check-lock package-lock.json ./canonical-lock.json

# Via environment variables
DEPMAN_LOCK=package-lock.json DEPMAN_CANONICAL_LOCK=./canonical-lock.json depman check-lock
```

**Output on mismatch**: Exits code 5; instructs developer to request `dependency_manager_agent` review.

---

### `depman dry-run [--track backend|frontend|db|integration]`

Runs the dry-run sandbox for a specific implementation track. Produces
`sandbox_report_{track}.json` matching the schema in `agents/dry_run_sandbox.md`.

```bash
# Default track (backend, or DEPMAN_TRACK env var)
depman dry-run

# Specific track
depman dry-run --track frontend
depman dry-run --track db
depman dry-run --track integration

# Via environment variable
DEPMAN_TRACK=backend depman dry-run
```

**Checks run per track:**
- `dependency_integrity` — lockfile exists and matches
- `lint` — `npm run lint --if-present`
- `typecheck` — `npm run typecheck --if-present`
- `unit_tests` — `npm test -- --runInBand --passWithNoTests`
- `bundle_size` — (frontend track only, scaffold — wire your bundler)

**Output:** `sandbox_report_{track}.json`

---

### `depman propose-upgrade <package@version>`

*(Scaffold)* Intended to run sandbox tests against the upgraded package and
open an upgrade PR with the results attached.

```bash
depman propose-upgrade express@4.19.0
```

Wire to your PR automation (GitHub Actions, GitLab CI) for full use.
See `agents/dependency_manager_agent.md` — upgrade workflow.

---

### `depman emergency-lock [--cve=CVE-ID]`

*(Scaffold)* Intended to produce an emergency canonical lockfile with the
patched version and notify `release_manager_agent`.

```bash
depman emergency-lock --cve=CVE-2024-12345
```

Wire to your incident tracker for full use.
See `agents/release_flow.md` — emergency hotfix workflow.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPMAN_LOCK` | `package-lock.json` | Path to the local lockfile |
| `DEPMAN_CANONICAL_LOCK` | `./canonical-lock.json` | Path to the canonical lockfile |
| `DEPMAN_TRACK` | `backend` | Default track for `dry-run` if `--track` not specified |

---

## Sandbox Report Schema

`sandbox_report_{track}.json` output:

```json
{
  "status": "PASS | FAIL",
  "track": "backend | frontend | db | integration",
  "timestamp": "ISO-8601",
  "lockfile_sha": "abc123...",
  "checks": {
    "dependency_integrity": { "status": "PASS", "deviations": [] },
    "lint":      { "status": "PASS", "violations": [] },
    "typecheck": { "status": "PASS", "errors": [] },
    "unit_tests":{ "status": "PASS", "coverage_pct": null, "failures": [] },
    "bundle_size":{ "status": "PASS", "budget_kb": 250, "actual_kb": null }
  },
  "error_reflection": [
    {
      "error": "...",
      "source_file": "src/services/auth.ts:42",
      "suggested_owner": "backend_developer_agent",
      "reference_doc": "docs/adrs/004-auth-pattern.md"
    }
  ],
  "artifact_path": "sandbox-artifacts/sandbox-artifact-backend-abc12345.tar.gz"
}
```

---

## CI Usage Example

```yaml
- name: Install depman
  run: |
    cd updated-agents/tools/dependency-manager
    npm ci
    npm link

- name: Check canonical lockfile
  run: depman check-lock

- name: Run dry-run sandbox (backend)
  run: depman dry-run --track backend

- name: Upload report
  uses: actions/upload-artifact@v4
  with:
    name: sandbox-report-backend
    path: sandbox_report_backend.json
```

See `ci/dependency-manager-gate.yml` for the full multi-track workflow.

---

## Notes

This is a scaffold implementation. For production use:
- Wire `propose-upgrade` to your PR automation.
- Wire `emergency-lock` to your incident management system.
- Integrate bundle-size reporting with your actual frontend build tool.
- Store `canonical-lock.json` in version control (committed, not gitignored).
