# Atria

Atria is a **SillyTavern-based modified role-playing product** focused on richer memory, orchestration, authoring/runtime, storage tooling and Atria-specific UX.

## Branch model

- `main` — stable Atria product/source line.
- `docs` — independent Repository Governance, Plans, Records and optional live `HANDOFF.md`.
- `package` — independent long-lived game/Atria Package assets.
- `plugin` — independent long-lived standalone tools.
- `skills` — independent long-lived repository-agent Skills.
- `reference/vanilla` — SillyTavern upstream/reference history.
- `reference/luker` — legacy Luker reference history.
- `feat/*`, `fix/*`, `refactor/*` and other justified semantic prefixes — short-lived product task branches.

Complete repository governance is authoritative at `docs:README.md`.

## Development model

New product work starts from current `main` on a short-lived semantic task branch. A specific `reference/<project>` is read only under explicit reference authorization and updated only under separate explicit update authorization.

`docs`, `package`, `plugin`, and `skills` are isolated long-lived workspaces; do not merge `main` into them for convenience.

New Atria-owned modules should prefer concise `atri_*` naming where practical while preserving real upstream/compatibility-sensitive contracts.

## Upstream

- SillyTavern: https://github.com/SillyTavern/SillyTavern
- Legacy migration source: https://github.com/ZZZdragondYNGPHX/Luker

## License

AGPL-3.0
