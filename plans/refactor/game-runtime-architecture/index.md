# Atria Game Runtime Architecture Refactor — Plan Index

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- Task ID: `refactor/game-runtime-architecture`
- Primary Workspace: `main`
- R7 execution was superseded into the separate `refactor/atria-game-first-shell-redesign` task.

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

## Stage routing

| Stage | Required modules |
| --- | --- |
| R7 — Atria Game-first Shell Redesign | This master Plan is background only; follow the separate R7/product-frontend Plan named by the branch-strategy amendment in `baseline.md`. |

## Material routing/design changes

- **2026-09-30 — Plan Bundle migration:** the master architecture was split by domain without changing the R7 supersession/amendment.
