# Atria Native Frontend Runtime v3 — Plan Index

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Status: Complete — Phases 1–9 integrated and verified; see `records/refactor/native-frontend-runtime-v3.md`.
- Final integrated main recorded by the Record: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.

## Goal

Give Native Packages near-complete presentation/interaction freedom while Host-owned typed capabilities remain the only path to product authority.

## Frozen core principles

- Package owns presentation; Host owns capabilities and authority.
- Experience mode controls layout ownership only.
- Declarative UI owns structure; sandbox code does not regain raw DOM authority.
- Frontend Host Bridge is the single versioned cross-boundary protocol.
- Authoring Source and derived Runtime Graph remain separate.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `architecture.md` | Goal, invariants, hard cut, manifest, Source Graph, Runtime Graph | — |
| `presentation-security.md` | Presentation runtime, visual boundary, local state/environment, Host Bridge | `architecture.md` |
| `services-media.md` | Fixed Host services, prose/message presentation, media | `presentation-security.md` |
| `sandbox-environment.md` | Script sandbox, environment/localization/input/accessibility, reliability, future seams | `architecture.md`, `presentation-security.md` |
| `implementation.md` | Phase 1–9 plan, implementation discipline, baseline gate | all routed modules |

## Stage routing

| Stage | Required modules |
| --- | --- |
| Phase 1 — Contract Reset / Compiler Skeleton | `index.md`, `architecture.md`, `implementation.md` |
| Phase 2 — Presentation Runtime / Containment | `index.md`, `architecture.md`, `presentation-security.md`, `implementation.md` |
| Phase 3 — Host Bridge / Data Plane | `index.md`, `presentation-security.md`, `implementation.md` |
| Phase 4 — Conversation / Session / Prose | `index.md`, `presentation-security.md`, `services-media.md`, `implementation.md` |
| Phase 5 — Media / Localization / Input / Accessibility / Boundaries | `index.md`, `services-media.md`, `sandbox-environment.md`, `implementation.md` |
| Phase 6 — Script Sandbox / Canvas | `index.md`, `sandbox-environment.md`, `implementation.md` |
| Phase 7 — Studio / AI Authoring | `index.md`, `architecture.md`, `implementation.md` |
| Phase 8 — Integration / Heavy Frontend Acceptance | `index.md`, `implementation.md`, plus only the domain modules exercised by the failing/inspected acceptance case |
| Phase 9 — Legacy Removal / Regression / Finalize | `index.md`, `implementation.md`, plus only the domain modules touched by final regression fixes |

This task is complete. Future work should load only the relevant frozen module plus the permanent Record when historical implementation evidence matters.

## Material routing/design changes

- **2026-09-30 — Plan Bundle migration:** the completed architecture Plan was split by domain; no frozen Native Frontend v3 contract was intentionally changed.
