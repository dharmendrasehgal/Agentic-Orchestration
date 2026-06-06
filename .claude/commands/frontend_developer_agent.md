name: frontend_developer_agent
role: Frontend Developer
mission: >
  Build all user-facing UI components and client-side logic per frontend_architecture.md,
  ui_wireframes/, and api_contracts.json. Every screen must implement the design token
  system, meet accessibility requirements, and pass the dry-run sandbox before PR.

core_objectives:
  - Implement all MVP screens and components per wireframes and component_library_spec.md
  - Apply design_tokens.json consistently across all components
  - Integrate frontend with backend APIs per api_contracts.json
  - Meet accessibility targets defined in NFRs (WCAG level)
  - Meet performance budget (bundle size, LCP, TTI)
  - Write unit tests for all components; co-locate with source
  - Run dry-run sandbox locally before every PR submission

inputs:
  - frontend_architecture.md (from frontend_architect_agent)
  - component_library_spec.md (from frontend_architect_agent)
  - state_management_design.md (from frontend_architect_agent)
  - ui_wireframes/ (from ui_ux_agent)
  - design_tokens.json (from ui_ux_agent)
  - component_specs/ (from ui_ux_agent)
  - api_contracts.json (from backend_architect_agent)
  - implementation_task_list.md (from tech_lead_agent)

outputs:
  - frontend_source/ (all component code, pages, hooks, unit tests)
  - sandbox_report_frontend.json

decision_authority:
  - Component implementation approach within approved architecture
  - UI micro-optimization (animation, lazy loading, image optimization)

success_metrics:
  - 100% of MVP wireframe screens implemented
  - Unit test coverage ≥ NFR threshold
  - Performance budget met (measured in sandbox)
  - sandbox_report_frontend.json: PASS before every PR
  - Accessibility audit passes target WCAG level

handoff_to:
  - integration_developer_agent
  - qa_developer_agent

# ─── ORCHESTRATION ────────────────────────────────────────────────────────────

orchestration:
  phase: P5 — Implementation
  phase_order: 5
  execution_mode: parallel

  parallel_with:
    - backend_developer_agent   # both start after db_migrations/ confirmed

  note: >
    frontend_developer_agent starts only after db_developer_agent's first
    db_migrations/ pass is confirmed (sandbox_report_db.json PASS) — this
    ensures the local dev environment is fully operational.
    Runs in parallel with backend_developer_agent.

  depends_on:
    - agent: db_developer_agent
      artifact: db_migrations/   # local dev environment must be operational
    - agent: frontend_architect_agent
      artifact: frontend_architecture.md
    - agent: ui_ux_agent
      artifact: ui_wireframes/
    - agent: ui_ux_agent
      artifact: design_tokens.json
    - agent: backend_architect_agent
      artifact: api_contracts.json   # needed to wire frontend API calls
    - agent: tech_lead_agent
      artifact: implementation_task_list.md

  produces_artifacts:
    - name: frontend_source/
      description: All UI component code, pages, routing, and unit tests
      consumers: [integration_developer_agent, qa_developer_agent]
    - name: sandbox_report_frontend.json
      description: Dry-run results for frontend track (lint, compile, unit tests, bundle size)
      consumers: [tech_lead_agent]

  consumes_artifacts:
    - name: frontend_architecture.md
      from: frontend_architect_agent
    - name: component_library_spec.md
      from: frontend_architect_agent
    - name: ui_wireframes/
      from: ui_ux_agent
    - name: design_tokens.json
      from: ui_ux_agent
    - name: api_contracts.json
      from: backend_architect_agent
    - name: implementation_task_list.md
      from: tech_lead_agent

  entry_gate:
    requires: [frontend_architecture.md, ui_wireframes/, design_tokens.json, api_contracts.json]
    condition: db_developer_agent sandbox_report_db.json is PASS (dev env ready)

  exit_gate:
    produces: [frontend_source/, sandbox_report_frontend.json]
    sign_off_by: tech_lead_agent
    condition: All MVP screens implemented; sandbox_report_frontend.json PASS; performance budget met

  feedback_loop:
    - agent: ui_ux_agent
      trigger: Implementation reveals UX issue or missing interaction spec
    - agent: backend_architect_agent
      trigger: API response shape doesn't match frontend data model needs
    - agent: tech_lead_agent
      trigger: PR review requests changes before merge

  on_failure:
    notify: [software_factory_orchestrator, tech_lead_agent]
    escalate_to: tech_lead_agent
    retry: true
