# Code Structure Blueprint

Goal: Provide a consistent project layout and script conventions that are
CI-friendly, ownership-clear, and compatible with the software factory pipeline.
`devops_developer_agent` creates this scaffold in Phase 4.

---

## Recommended Directory Layout

```
project-root/
├── src/                        # Application source (all runtime code)
│   ├── frontend/               # Frontend application source
│   │   ├── components/         # Reusable UI components (grouped by domain)
│   │   ├── pages/              # Route-level components / pages
│   │   ├── hooks/              # Custom React hooks or framework equivalents
│   │   ├── store/              # State management (Redux/Zustand/Pinia etc.)
│   │   ├── api/                # API client layer (typed wrappers per contract)
│   │   └── styles/             # Global styles and design token consumers
│   ├── backend/                # Backend application source
│   │   ├── services/           # Domain services and business logic
│   │   ├── api/                # Route handlers / controllers
│   │   ├── middleware/         # Auth, logging, error handling
│   │   ├── repositories/       # Data access layer (one per aggregate root)
│   │   └── config/             # Runtime configuration loading
│   └── shared/                 # Types/contracts shared across frontend and backend
├── db/                         # Database source
│   ├── migrations/             # Migration scripts (timestamped, up + rollback)
│   ├── procedures/             # Stored procedures and functions
│   └── seeds/                  # Reference data and test fixtures
├── packages/                   # Monorepo packages (if applicable)
├── infra/                      # Infrastructure-as-code
│   ├── terraform/ (or pulumi/) # Cloud resource definitions
│   ├── kubernetes/             # K8s manifests (if applicable)
│   └── docker/                 # Dockerfiles and compose files
├── ci/                         # CI/CD job definitions
│   ├── pipeline.yaml           # Main pipeline definition
│   ├── jobs/                   # Individual job definitions
│   └── sandbox/                # Sandbox container configuration
├── scripts/                    # Developer and CI helper scripts
│   ├── dry-run.sh              # Pre-PR local validation (owned by devops_developer)
│   ├── release.sh              # Release orchestration script
│   ├── backend_lint.sh         # Backend-specific lint (owned by backend team)
│   ├── frontend_lint.sh        # Frontend-specific lint (owned by frontend team)
│   └── db_migrate.sh           # Database migration runner (owned by db team)
├── tests/                      # Cross-layer and E2E tests
│   ├── integration/            # Integration tests (API contract + DB wiring)
│   ├── e2e/                    # End-to-end tests (full browser/API scenarios)
│   └── performance/            # Load and performance tests
└── docs/                       # Project documentation
    ├── architecture/           # solution_architecture.md and diagrams
    ├── adrs/                   # Architecture Decision Records
    ├── api/                    # api_contracts.json and generated API docs
    ├── agents/                 # Agent specifications (this directory)
    └── runbooks/               # Operational runbooks for common scenarios
```

---

## Custom Script Guidelines

All scripts in `/scripts` must:

1. **Be idempotent** — running the same script twice produces the same result.
2. **Accept `--ci` flag** — non-interactive mode for pipeline execution; no stdin prompts.
3. **Verify the canonical lockfile** before making any install or dependency change.
4. **Emit `report.json`** (machine-readable) alongside human-friendly log output.
5. **Avoid privileged operations** without an explicit `--force` flag with documented justification.
6. **Exit with non-zero code** on any check failure (so CI fails fast).

### Script Header Template

```bash
#!/usr/bin/env bash
# Owner:   <devops_developer | backend | frontend | db>
# Purpose: <one-line description>
# Requires: <list of env vars or tools>
# Usage:   ./scripts/<name>.sh [--ci] [--force]
```

---

## CI Integration Rules

- CI jobs call scripts from `/scripts` only — no ad-hoc shell commands in pipeline YAML.
- All jobs consume the `report.json` output of scripts for gate decisions.
- All jobs run in containerized execution (matching Dependency Manager environment).
- CI must pass `--ci` flag to all scripts so they run non-interactively.

---

## Ownership & Naming Conventions

| Prefix | Owner |
|--------|-------|
| `devops_` | devops_developer_agent |
| `backend_` | backend_developer_agent |
| `frontend_` | frontend_developer_agent |
| `db_` | db_developer_agent |

- Migration files: `{timestamp}_{description}_up.sql` and `{timestamp}_{description}_rollback.sql`
- ADRs: `{NNN}-{kebab-title}.md` (e.g., `004-auth-pattern.md`)
- Test files: co-located with source using `*.test.ts` / `*.spec.ts` suffix

---

## Orchestration Integration

`devops_developer_agent` (Phase 4) creates the scaffold from this blueprint.
All implementation agents (Phase 5) write into `/src/{frontend|backend}` and `/db/`.
`integration_developer_agent` (Phase 6) writes into `/tests/integration/` and `/tests/e2e/`.
`qa_developer_agent` (Phase 7) writes into `/tests/e2e/` and `/tests/performance/`.
`content_creator_agent` (Phase 8) writes into `/docs/`.
