# Atria Repository Operating Rules

This file is the authoritative entry point for AI coding agents working on `ZZZdragondYNGPHX/Atria`.

## Repository identity

Atria is a SillyTavern-based modified product. It is independent from the former Luker product line while intentionally retaining SillyTavern as its upstream foundation.

Long-lived branches:

- `main`: authoritative Atria product and integration branch.
- `docs`: permanent planning, architecture, decisions, latest handoff, and completed-task records.
- `vanilla`: SillyTavern upstream reference snapshot. Refresh only when upstream comparison or synchronization is needed.
- `luker`: legacy Luker reference snapshot. Refresh only when legacy comparison or migration is needed.

Temporary branches:

- `feat/*`: new functionality.
- `fix/*`: bug fixes.
- `refactor/*`: structural refactors without an intended feature change.
- `chore/*`: CI, build, dependencies, maintenance, and upstream adaptation.

## Mandatory startup protocol

Before changing code:

1. Read this file and `FORK_MAINTENANCE.md` from the current `main`.
2. Fetch/read `handoff/latest-handoff.md` from the `docs` branch.
3. Verify the live HEAD of `main`; it is the normal development baseline.
4. Inspect relevant current code, tests, and recent Atria history before editing.
5. Use `vanilla` only when SillyTavern upstream behavior materially matters to the task.
6. Use `luker` only when legacy behavior, migration, or historical comparison materially matters to the task.

Do not use `luker` or `vanilla` as the default development base.

## Task lifecycle

For a normal task:

1. Branch from current `main`.
2. Use the appropriate temporary prefix: `feat/`, `fix/`, `refactor/`, or `chore/`.
3. Diagnose/design before editing.
4. Implement the smallest coherent change that preserves unrelated behavior.
5. Run targeted checks, then broader lint/unit/build checks appropriate to the touched area.
6. Record what was implemented, validated, and learned on the `docs` branch.
7. Merge the verified temporary branch into `main`.
8. Verify the integrated result.
9. Delete the completed temporary branch.

One independent task should normally use one temporary branch.

## Product and code naming

- Product/UI/package identity: **Atria**.
- New Atria-owned code should prefer concise `atri_*` namespaces where practical, e.g. `atri_memory`, `atri_agent`, `atri_workspace`.
- SillyTavern upstream names remain unchanged unless Atria intentionally overrides that behavior.
- Legacy Luker identifiers may remain when they are compatibility-sensitive persisted keys, protocol fields, migration surfaces, or legacy data paths.
- Do not introduce new Luker-branded product identity.

## Upstream relationship

SillyTavern is Atria's upstream foundation, not its daily development branch. When a SillyTavern update is needed, inspect the change through `vanilla`, adapt it on a temporary task branch, preserve Atria-specific behavior deliberately, test the result, document the integration, then merge to `main`.

Luker is legacy reference material. Do not import from it by default.

## Engineering rules

- Find root cause before fixing bugs.
- Inspect the existing architecture before adding features.
- Reuse existing services/state/persistence paths instead of creating parallel systems.
- Preserve data/config compatibility unless a migration is explicitly designed.
- Avoid unrelated refactors.
- Never commit credentials, tokens, keystores, local paths, user data, downloaded binaries, caches, generated build outputs, or APKs.
- Report only checks actually executed.
- Git history and current code are authoritative for integrated behavior; the docs branch is the durable human/agent handoff layer.
