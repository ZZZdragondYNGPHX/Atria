# Atria Bootstrap Migration

## Status

Completed and validated.

## Goal

Establish Atria as the active SillyTavern-based product line while separating it from the former Luker product identity and preserving explicit reference branches for both Luker and upstream SillyTavern.

## Source snapshots

- Legacy source: `ZZZdragondYNGPHX/Luker:custom-release`
  - source commit used for bootstrap: `463fd6274ba369d92f464aba5eddb7bdbabc45c3`
- SillyTavern upstream: `SillyTavern/SillyTavern:release`
  - source commit used for bootstrap: `06bde939fb1e9c4c8d8641d810f0a916b5bce127`
- Atria bootstrap feature head before merge: `380c433f1eac27cf351b99dd284a2f8abcdebe63`
- Pull request: `#1 feat: bootstrap Atria product line`

Reference branches omit imported executable GitHub workflow files because repository-scoped GitHub tokens cannot transport foreign workflow files. Atria owns its own workflows on `main`.

## Long-lived branches

- `main` — authoritative Atria product/integration branch.
- `docs` — permanent planning, architecture, decisions, handoff and completed-task records.
- `vanilla` — SillyTavern upstream reference snapshot; refresh only when needed.
- `luker` — legacy Luker reference snapshot; refresh only when needed.

Temporary work uses `feat/*`, `fix/*`, `refactor/*`, or `chore/*`, is documented here when complete, merged into `main`, verified, then deleted.

## Product identity migration

Completed:

- root package name changed from `luker` to `atria`;
- CLI/bin identity changed to `atria`;
- repository metadata points to `ZZZdragondYNGPHX/Atria`;
- web title and PWA manifest now use Atria;
- Android product identity migrated from `com.luker.app` to `com.atria.app`;
- Android Kotlin classes, package paths, resources, runtime naming and test identities migrated to Atria;
- repository AI/Copilot operating instructions now point to Atria `main`, `docs`, `vanilla`, and `luker` instead of Luker `custom-release`.

Compatibility-sensitive legacy Luker identifiers in persisted data, protocols or inherited internal code may remain until a dedicated compatibility migration is designed.

## Atria-owned naming

New Atria-specific modules should prefer concise `atri_*` names where practical, for example:

- `atri_memory`
- `atri_agent`
- `atri_workspace`

SillyTavern upstream identifiers should remain intact unless Atria intentionally overrides the behavior.

## CI / maintenance established

Atria now owns workflows for:

- PR lint;
- Node unit tests;
- Atria product-identity migration guard;
- Android JVM unit tests;
- Android APK build/release;
- Docker image publishing;
- manual `vanilla` / `luker` reference-branch refresh;
- cleanup of fully merged temporary task branches.

## Validation

Final PR validation at bootstrap head `380c433f1eac27cf351b99dd284a2f8abcdebe63`:

- Atria Migration Guard — passed.
- ESLint — passed.
- Node unit tests — passed.
- Android JVM unit tests — passed.

Earlier CI failures during bootstrap were configuration issues discovered and fixed before integration: Android CI initially omitted root npm dependencies, and an intermediate Docker workflow had malformed YAML. Neither was merged into `main`.

## Follow-up

Atria is still intentionally based on SillyTavern. Future work should preserve practical upstream syncability while progressively cleaning or renaming Luker-era internal surfaces only when doing so does not break compatibility.
