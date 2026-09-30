# Atria Game Runtime Architecture Refactor — Plan Index

- Task ID: `refactor/game-runtime-architecture`
- Primary Workspace: `main`
- Status: R0–R6 frozen/validated historically; R7 execution was superseded into the separate `refactor/atria-game-first-shell-redesign` task.

## Goal

Define Atria as the authoritative deterministic game runtime: packages declare game content, deterministic code owns rules/state transitions, the LLM operates inside bounded intent/narration contracts, and UI owns presentation rather than game authority.

## Frozen core principles

- Regex returns to text processing.
- MVU / LoreState are not target architecture constraints.
- Atria owns authoritative game state and event history.
- LLM does not own arithmetic or authoritative mutation.
- UI does not own game rules.
- Game Runtime remains domain-agnostic.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `baseline.md` | Task identity, R7 amendment, non-negotiable decisions, reusable foundations, top-level architecture | — |
| `package-world.md` | Game Package and World Runtime | `baseline.md` |
| `runtime-llm.md` | Commands, logic runtime, UI runtime, selectors, LLM bridge | `baseline.md`, `package-world.md` |
| `frontend-security-studio.md` | HTML authoring, capability/security model, Game Studio, diagnostics | `runtime-llm.md` |
| `implementation-acceptance.md` | R0–R7 phase map, testing, performance, non-goals, success definition | all routed modules |

## Stage routing

| Stage | Required modules |
| --- | --- |
| R0 — Regex Separation | `index.md`, `baseline.md`, `implementation-acceptance.md` |
| R1 — Game Package Foundation | `index.md`, `package-world.md`, `implementation-acceptance.md` |
| R2 — World / Event Runtime | `index.md`, `package-world.md`, `runtime-llm.md`, `implementation-acceptance.md` |
| R3 — Game Logic Runtime | `index.md`, `runtime-llm.md`, `implementation-acceptance.md` |
| R4 — Card UI Runtime | `index.md`, `runtime-llm.md`, `frontend-security-studio.md`, `implementation-acceptance.md` |
| R5 — LLM Runtime & Model Roles | `index.md`, `runtime-llm.md`, `implementation-acceptance.md` |
| R6 — Game Studio | `index.md`, `frontend-security-studio.md`, `implementation-acceptance.md` |
| R7 — Atria Game-first Shell Redesign | This master Plan is background only; follow the separate R7/product-frontend Plan named by the branch-strategy amendment in `baseline.md`. |

## Material routing/design changes

- **2026-09-30 — Plan Bundle migration:** the master architecture was split by domain without changing the R7 supersession/amendment.
