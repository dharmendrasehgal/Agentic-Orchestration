# Software Factory — Agent Dependency Graph

---

## Full Pipeline Graph (Mermaid)

```mermaid
graph TD
    %% ── Entry Point ──
    SFO([Software Factory Orchestrator]):::orchestrator

    %% ── Phase 0: Discovery ──
    BA[Business Analyst Agent]:::p0
    RA[Requirement Agent]:::p0

    %% ── Phase 1: Planning ──
    PM[Product Manager Agent]:::p1

    %% ── Phase 2: Architecture ──
    SA[Senior Architect Agent]:::p2

    %% ── Phase 3: Domain Design ──
    UX[UI/UX Agent]:::p3
    FA[Frontend Architect Agent]:::p3
    BKA[Backend Architect Agent]:::p3
    DBA[DB Architect Agent]:::p3
    DVA[DevOps Architect Agent]:::p3

    %% ── Phase 4: Foundation ──
    DM[Dependency Manager Agent]:::p4
    DVd1[DevOps Developer Agent P4]:::p4

    %% ── Phase 5: Implementation ──
    DBd[DB Developer Agent]:::p5
    BD[Backend Developer Agent]:::p5
    FD[Frontend Developer Agent]:::p5

    %% ── Phase 6: Integration ──
    TL{Tech Lead Agent}:::gate
    INT[Integration Developer Agent]:::p6

    %% ── Phase 7: Validation ──
    QAd[QA Developer Agent]:::p7
    QAL[QA Lead Agent]:::p7

    %% ── Phase 8: Documentation ──
    CC[Content Creator Agent]:::p8

    %% ── Phase 9: Release ──
    RM[Release Manager Agent]:::p9
    DVd2[DevOps Developer Agent P9]:::p9

    %% ── Control Services ──
    SAND([Dry-Run Sandbox]):::control

    %% ── Flow ──
    SFO --> BA
    BA --> RA
    RA --> PM
    PM --> SA

    SA --> UX
    SA --> FA
    SA --> BKA
    SA --> DBA
    SA --> DVA

    UX -.-> FA
    FA --> DM
    BKA --> DM
    DBA --> DM
    DVA --> DM

    DM --> DVd1
    DM --> TL
    DVd1 --> TL

    DBA --> DBd
    DBd --> BD
    DBd --> FD
    FA --> FD
    BKA --> BD
    UX --> FD

    FD --> SAND
    BD --> SAND
    DBd --> SAND
    SAND --> TL

    TL --> INT
    BD --> INT
    FD --> INT
    DBd --> INT

    INT --> SAND
    SAND --> TL
    INT --> QAd
    INT --> QAL

    QAd --> QAL
    QAd -.->|defects| INT
    QAL -.->|E2E block| INT
    QAL -.->|release hold| RM

    INT --> CC
    QAL --> RM
    CC --> RM

    RM --> DVd2
    DVd2 -.->|post-release metrics| RM

    %% ── Styles ──
    classDef orchestrator fill:#1a1a2e,color:#e8e8e8,stroke:#4a90d9,stroke-width:3px
    classDef p0 fill:#16213e,color:#a8d8ea,stroke:#a8d8ea
    classDef p1 fill:#0f3460,color:#e8d44d,stroke:#e8d44d
    classDef p2 fill:#533483,color:#ffffff,stroke:#9b59b6
    classDef p3 fill:#2d6a4f,color:#d8f3dc,stroke:#52b788
    classDef p4 fill:#b5451b,color:#fff3e0,stroke:#ff8a65
    classDef p5 fill:#1b4332,color:#95d5b2,stroke:#40916c
    classDef p6 fill:#6c3483,color:#e8daef,stroke:#af7ac5
    classDef p7 fill:#1a535c,color:#d4f1f4,stroke:#4ecdc4
    classDef p8 fill:#4a4e69,color:#f2e9e4,stroke:#c9ada7
    classDef p9 fill:#7b2d00,color:#ffe8d6,stroke:#fb8b24
    classDef gate fill:#2c2c54,color:#ffeb3b,stroke:#ffeb3b,stroke-width:2px,shape:diamond
    classDef control fill:#263238,color:#b0bec5,stroke:#607d8b,stroke-dasharray:5
```

---

## Dependency Matrix

The table below lists every agent, the agents it directly depends on (blocking),
the agents it can run in parallel with, and the agents it hands off to.

| Agent | Phase | Depends On (blocking) | Parallel With | Hands Off To |
|-------|-------|-----------------------|---------------|-------------|
| `software_factory_orchestrator` | Entry | — | — | `requirement_agent` |
| `business_analyst_agent` | P0 | `software_factory_orchestrator` | — | `requirement_agent` |
| `requirement_agent` | P0 | `business_analyst_agent` | — | `product_manager_agent` |
| `product_manager_agent` | P1 | `requirement_agent` | — | `senior_architect_agent` |
| `senior_architect_agent` | P2 | `product_manager_agent` | — | all P3 agents |
| `ui_ux_agent` | P3 | `senior_architect_agent` | `frontend_architect`, `backend_architect`, `db_architect`, `devops_architect` | `frontend_architect_agent`, `frontend_developer_agent` |
| `frontend_architect_agent` | P3 | `senior_architect_agent` | `ui_ux_agent`, `backend_architect`, `db_architect`, `devops_architect` | `frontend_developer_agent` |
| `backend_architect_agent` | P3 | `senior_architect_agent` | `ui_ux_agent`, `frontend_architect`, `db_architect`, `devops_architect` | `backend_developer_agent` |
| `db_architect_agent` | P3 | `senior_architect_agent` | `ui_ux_agent`, `frontend_architect`, `backend_architect`, `devops_architect` | `db_developer_agent`, `backend_architect_agent` (schema input) |
| `devops_architect_agent` | P3 | `senior_architect_agent` | `ui_ux_agent`, `frontend_architect`, `backend_architect`, `db_architect` | `devops_developer_agent` |
| `dependency_manager_agent` | P4 | all P3 agents | `devops_developer_agent` (P4) | `tech_lead_agent`, `devops_developer_agent` |
| `devops_developer_agent` (P4) | P4 | `devops_architect_agent` | `dependency_manager_agent` | `tech_lead_agent` |
| `db_developer_agent` | P5 | P4 gate | — | `backend_developer_agent`, `frontend_developer_agent`, `integration_developer_agent` |
| `backend_developer_agent` | P5 | `db_developer_agent` (migrations confirmed) | `frontend_developer_agent` | `integration_developer_agent`, `qa_developer_agent` |
| `frontend_developer_agent` | P5 | `db_developer_agent` (migrations confirmed) | `backend_developer_agent` | `integration_developer_agent`, `qa_developer_agent` |
| `tech_lead_agent` | P4–P6 | — (cross-phase gatekeeper) | — | `integration_developer_agent` |
| `integration_developer_agent` | P6 | P5 gate + `tech_lead_agent` approval | — | `qa_developer_agent`, `qa_lead_agent`, `content_creator_agent` |
| `qa_developer_agent` | P7 | P6 gate | `qa_lead_agent`, `content_creator_agent` | `qa_lead_agent` |
| `qa_lead_agent` | P7 | P6 gate | `qa_developer_agent`, `content_creator_agent` | `release_manager_agent` |
| `content_creator_agent` | P8 | P6 gate | `qa_developer_agent`, `qa_lead_agent` | `release_manager_agent` |
| `release_manager_agent` | P9 | P7 gate + P8 gate | — | `devops_developer_agent` (P9) |
| `devops_developer_agent` (P9) | P9 | `release_manager_agent` | — | post-release monitoring |

---

## Critical Path

The **critical path** (longest sequential chain with no parallel shortcut) is:

```
software_factory_orchestrator
  → business_analyst_agent
    → requirement_agent
      → product_manager_agent
        → senior_architect_agent
          → backend_architect_agent       ← longest P3 track (API contracts gate frontend)
            → dependency_manager_agent
              → db_developer_agent        ← must complete before backend/frontend start
                → backend_developer_agent
                  → integration_developer_agent
                    → qa_lead_agent
                      → release_manager_agent
                        → devops_developer_agent
```

All other tracks are either parallel (saving time) or faster than this path.

---

## Feedback-Loop Edges (Dashed in Graph)

| From | To | Condition |
|------|----|-----------|
| `qa_developer_agent` | `integration_developer_agent` | Defect found in any implementation track |
| `qa_lead_agent` | `integration_developer_agent` | E2E gate blocked |
| `qa_lead_agent` | `release_manager_agent` | Release hold — critical defect |
| `dry_run_sandbox` | any developer | PR fails lint/compile/unit test |
| `devops_developer_agent` | `release_manager_agent` | Post-release SLO breach |
| `dependency_manager_agent` | `tech_lead_agent` | Security advisory / upgrade proposal |
| `product_manager_agent` | `software_factory_orchestrator` | Scope change request |
