# Latest Handoff

## Current state

Atria bootstrap migration is complete and PR #1 has passed final validation. The product is a SillyTavern-based modified product and is independent from the former Luker product line, not from SillyTavern itself.

## Branch roles

- `main`: authoritative Atria development and integration branch.
- `docs`: permanent development documentation and latest handoff.
- `vanilla`: SillyTavern upstream reference only; refresh/use when an upstream comparison or synchronization task requires it.
- `luker`: legacy Luker reference only; refresh/use for migration archaeology or legacy comparison.
- `feat/*`, `fix/*`, `refactor/*`, `chore/*`: temporary branches created from current `main`.

## Development rules

1. Start ordinary work from the live `main` HEAD.
2. Do not use `luker` or `vanilla` as the default development base.
3. For new Atria-owned modules, prefer concise `atri_*` naming where practical.
4. Preserve SillyTavern upstream structure when that helps future upstream synchronization.
5. Preserve compatibility-sensitive legacy Luker storage/protocol identifiers until a deliberate migration exists.
6. At task completion, write the implementation record to `docs`, merge the task branch into `main`, verify integration, then delete the temporary branch.

## Current inherited architecture

The initial Atria baseline inherits the current Luker implementation, including Agent Runtime, multi-agent orchestration, Memory OS / memory graph, Workspace, storage extensions, generation lifecycle changes, Android integration, Termux support and other SillyTavern modifications.

These are now Atria-owned product capabilities. Future refactors should migrate naming and structure incrementally rather than globally replacing compatibility-sensitive identifiers.

## Bootstrap references

- Legacy source snapshot: `ZZZdragondYNGPHX/Luker:custom-release@463fd6274ba369d92f464aba5eddb7bdbabc45c3`
- SillyTavern snapshot: `SillyTavern/SillyTavern:release@06bde939fb1e9c4c8d8641d810f0a916b5bce127`
- Bootstrap PR: `#1`
- Final validated feature head: `380c433f1eac27cf351b99dd284a2f8abcdebe63`

See `features/bootstrap-migration.md` for the detailed migration record.

## Integration result

- PR #1 merged into `main` with squash commit `45121d344873aea7bbc8892f9b8c30633b6b98eb`.
