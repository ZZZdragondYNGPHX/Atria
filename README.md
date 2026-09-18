# Atria

Atria is a **SillyTavern-based modified role-playing product** focused on extending the upstream foundation with richer memory, multi-agent orchestration, workspace tooling, generation/runtime improvements and Atria-specific UX.

Atria succeeds the former **Atria** product line. The project remains intentionally based on SillyTavern rather than attempting a ground-up rewrite.

## Branch model

- `main` — active Atria product line.
- `vanilla` — SillyTavern upstream reference snapshot; update only when upstream comparison/synchronization is needed.
- `luker` — legacy Luker reference snapshot; update only when migration/reference work is needed.
- `docs` — long-lived planning, architecture, handoff and completed-work documentation.
- `feat/*`, `fix/*`, `refactor/*`, `chore/*` — temporary task branches.

## Development model

New product work starts from `main`. SillyTavern changes are inspected through `vanilla` and selectively adapted rather than blindly merged. Luker code is retained only as legacy/reference material on the `luker` branch after migration.

New Atria-owned modules should prefer concise `atri_*` naming (for example, `atri_memory`). Existing Atria internal identifiers may remain temporarily when they are part of compatibility-sensitive paths, storage keys, APIs, Android package names or persisted data.

## Current inherited capabilities

The initial Atria baseline inherits the current Atria implementation, including its multi-agent orchestration, Memory OS / memory graph, workspace/agent tooling, generation lifecycle changes, storage extensions, Android integration and other SillyTavern modifications. These systems will be progressively reworked under the Atria product namespace.

## Upstream

- SillyTavern: https://github.com/SillyTavern/SillyTavern
- Legacy migration source: https://github.com/ZZZdragondYNGPHX/Luker

## License

AGPL-3.0
