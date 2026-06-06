## Description
<!-- What does this PR do? Which user story or task does it address? -->

## Pipeline Context

**Phase**: <!-- P0-Discovery | P1-Planning | P2-Architecture | P3-DomainDesign | P4-Foundation | P5-Implementation | P6-Integration | P7-Validation | P8-Documentation | P9-Release -->

**Track**: <!-- backend | frontend | db | devops | integration | qa | docs | release | N/A -->

## Type of Change
- [ ] Feature implementation
- [ ] Bug fix
- [ ] Integration / wiring
- [ ] Dependency update
- [ ] CI/CD / infrastructure
- [ ] Documentation
- [ ] Refactor

---

## Dual-Gate Metadata

### Architect Gate *(required if any of the following changed)*
- [ ] Service boundaries or inter-service communication patterns
- [ ] API contracts (`api_contracts.json` modified)
- [ ] Database schema (`db_schema.sql` or migrations affecting structure)
- [ ] Infrastructure topology or cloud resources

**Architect sign-off**: *(name or "N/A — no architecture change")*
**ADR reference**: *(e.g., `docs/adrs/005-auth-pattern.md` or "none")*

### Tech Lead Gate *(required for all implementation and integration PRs)*
- [ ] Code review completed by Tech Lead
- [ ] Dry-run sandbox passed locally: `./scripts/run_local_ci.sh --track <track> --verbose`
- [ ] All unit tests pass with coverage meeting NFR threshold
- [ ] Dependency changes reviewed by `dependency_manager_agent` (if any)
- [ ] Sandbox report attached: `sandbox_report_<track>.json`

**Tech Lead sign-off**: *(name)*

### UI/UX Gate *(required for frontend implementation PRs)*
- [ ] Screens match `ui_wireframes/` (or deviation documented below)
- [ ] Design tokens from `design_tokens.json` applied consistently
- [ ] Accessibility: keyboard navigation and ARIA roles verified

**UI/UX notes** *(if wireframe deviation)*:

---

## Dependency Changes
- [ ] No dependency changes
- [ ] Dependencies added or updated (list below):
  | Package | Old Version | New Version | Purpose |
  |---------|-------------|-------------|---------|
  | | | | |

**Dependency Manager review**: *(pending / approved / rejected / N/A)*
**`canonical-lock.json` updated**: *(yes / no / N/A)*

---

## API Contract Changes
- [ ] No API contract changes
- [ ] `api_contracts.json` updated — Architect review required (see above)
  - Endpoints added:
  - Endpoints changed:
  - Breaking changes: *(yes / no — if yes, version bump required)*

---

## Testing
- [ ] Unit tests added or updated
- [ ] Integration tests pass (`sandbox_report_integration.json`)
- [ ] E2E tests pass (if applicable)
- [ ] Performance impact assessed (if applicable)
- [ ] Accessibility tested (if frontend PR)

---

## Checklist
- [ ] Code follows project conventions (`code_structure_blueprint.md`)
- [ ] Self-review complete; no debug code or console.log left in
- [ ] Documentation updated (if user-facing or API change)
- [ ] No hardcoded secrets or credentials
- [ ] Sandbox report(s) attached as PR comment or artifact

---

## Related
**Issue / Story**: Closes #*(issue number)*
**Depends on PR**: #*(number or "none")*
**Blocks PR**: #*(number or "none")*
