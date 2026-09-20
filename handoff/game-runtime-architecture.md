# Atria Game Runtime Architecture — Implementation Handoff

## Current branch and HEAD

- Working branch: `refactor/game-runtime-architecture`
- Baseline: `main@63da3141a3895d3386ed1bebc30876c9766315ba`
- Current working HEAD: `d72058d33c9471d8514ca540d775079f97dd54a9`
- Live `main` was re-checked at the checkpoint and remains `63da3141a3895d3386ed1bebc30876c9766315ba`.
- Formal Master Plan: `docs:refactor/game-runtime-architecture.md`
- Midpoint status: R0 complete, R1 minimum foundation complete, R2 minimum World/Event vertical slice complete and focused CI green.
- No PR has been opened and nothing has been merged to `main`; keep this branch and continue the Master Refactor.

## Midpoint completed

### R0 — Regex Separation

- Added an explicit architecture boundary to Regex Core: Regex owns string transformation only.
- Game Runtime does not depend on Regex for world state, package activation, persistence or UI lifecycle.
- Existing Regex Engine Performance Refactor remains intact; execution-plan caching, lane indexing/runtime providers and diagnostics were not reimplemented.
- Added a structural regression test that prevents Game Runtime from depending on Regex and prevents the R0/R1 foundation from silently growing DOM/world mutation responsibilities.

### R1 — Game Package Foundation

Implemented a real `game.json`-rooted package foundation under:

- `public/scripts/extensions/game-runtime/manifest.js`
- `public/scripts/extensions/game-runtime/package-loader.js`
- `public/scripts/extensions/game-runtime/index.js`
- `public/scripts/extensions/game-runtime/manifest.json`

Current manifest contract includes:

- `format: "atria-game"`
- `manifestVersion: 1`
- package id/name/version
- Game Runtime version gate
- declared capabilities
- optional Component/Hybrid/Full UI entry
- optional World schema/initial entry
- optional Logic entry
- strict unknown-field rejection
- safe package-relative path validation

Game Package discovery:

- root entry is `game.json`, not `index.js`;
- missing `game.json` means “no Game Package”, not an error;
- malformed/incompatible packages do not activate;
- declared `world/ui/logic` files are checked against the real character file inventory before activation;
- invalid packages leave the normal Atria host UI available as the recovery shell.

Transport reuse:

- Game Package deliberately reuses the existing CardApp per-character directory and character-card file transport;
- package activation is not tied to `card_app.enabled`;
- package-only characters containing `game.json` are packed on export;
- nested text and binary assets round-trip through the existing character-card artifact;
- this is transport reuse only, not reuse of CardApp's broad `ctx` runtime model.

### R2 — World / Event Runtime minimum vertical slice

Implemented:

- `world/branch.js`
  - maps live chat `swipe_id` values to a deterministic game branch path;
  - historical events are replayed only when their recorded branch path is a prefix of the active path;
  - changing an earlier swipe selects another event lineage instead of manually rolling variables backward.

- `world/schema.js`
  - deterministic JSON-schema subset for World State validation;
  - no DOM dependency and no JavaScript `eval`.

- `world/journal.js`
  - versioned Event Journal;
  - monotonic event sequence/id;
  - event branch lineage;
  - snapshot records;
  - deterministic replay through pure reducers;
  - unknown event types fail replay instead of silently losing facts;
  - reducers receive a deeply frozen clone and must return the next state.

- `world/runtime.js`
  - Initial State + Event Journal + Snapshot + Branch/Replay projection;
  - atomic persistence update path;
  - schema validation before a commit becomes durable;
  - failed state validation leaves persistence unchanged;
  - bounded snapshots.

- `world/persistence.js`
  - current authoritative chat-state namespace: `atri_game_world`;
  - Chat State provides atomic storage;
  - Event Journal, not FloorState incremental patches, is the authoritative game history.

- `world/package.js`
  - loads declared World schema and initial state from the Game Package;
  - rejects invalid JSON roots and invalid initial states.

- `world/session.js`
  - binds a validated package World to the current chat;
  - loads the current swipe branch;
  - supports branch synchronization and reload from persisted Event Journal;
  - exposes an internal event commit primitive for the upcoming Command Bus.

Runtime integration:

- `game-runtime/index.js` creates a World Session for a validated package that declares `world`;
- malformed World definitions downgrade package activation to invalid rather than taking over the host;
- structural chat events synchronize the active world branch;
- the extension API currently exposes World state/journal/branch as read-only views;
- no public generic world setter or LLM-facing `set_state` was introduced.

## Important architecture decisions preserved

1. Regex is a text subsystem, not Game Runtime/UI/state.
2. MVU/LoreState/legacy Regex status bars are not compatibility constraints for the new runtime.
3. `game.json` is the Game Package entry.
4. Existing CardApp file storage/import/export/Git infrastructure is reused as transport/authoring infrastructure only.
5. Event Journal is the causal history source; projected World State is derived.
6. Game branch identity is based on full swipe lineage, not only the tail swipe.
7. World history does not use FloorState's incremental patch log as its authoritative event model.
8. World mutation is not exposed publicly yet. `commitEventsInternal` exists only to bridge R2 into R3.
9. The next normal mutation surface must be the typed Command Bus.
10. No Master Plan architecture change occurred in this midpoint, so `docs:refactor/game-runtime-architecture.md` did not require revision.

## Validation completed

Final focused workflow:

- Workflow: `Game Runtime Dev Checks`
- Run: `35523372735`
- HEAD: `d72058d33c9471d8514ca540d775079f97dd54a9`
- Result: success

The final run passed:

- Game Package manifest tests
- Game Package loader tests
- declared-file rejection tests
- package-only nested text/binary import-export round-trip
- CardApp transport regression tests
- Regex lane semantics
- Regex/Game Runtime architecture boundary tests
- World branch mapping tests
- World Event Journal deterministic replay tests
- snapshot replay tests
- alternate swipe branch restoration tests
- World Runtime atomic commit/reload tests
- schema-failure no-partial-write test
- World package schema/initial loading tests
- live World Session branch synchronization/reload tests
- focused ESLint for Game Runtime, World Runtime, Regex engine and CardApp endpoint

The run immediately before the final lint fix already reported 11 passing suites / 59 tests; the final run then passed both the focused unit-test step and focused ESLint.

Android and Docker were not run, per repository/user policy and because this midpoint touches browser/Node runtime architecture only.

## Current limitations / intentionally unfinished

R2 is a minimum vertical slice, not the final World Runtime.

Not yet implemented:

- package-loaded reducer/logic registry;
- explicit event type schema registry;
- richer snapshot policy/compaction/corruption recovery diagnostics;
- dedicated World Inspector UI;
- full host diagnostics correlation ids;
- Command Bus;
- validators;
- Formula AST;
- deterministic RNG;
- Rules Engine;
- Simulation;
- transaction/rule trace;
- Card UI Runtime/Surfaces/Selectors;
- LLM Bridge;
- Game Studio upgrades.

The production Game Runtime currently starts a World Session with an empty reducer registry. That is safe because no public mutation API exists yet. R3 must establish the reducer/command registry before exposing any package/UI/LLM write path.

## Next implementation step

Continue on the existing branch from:

`refactor/game-runtime-architecture@d72058d33c9471d8514ca540d775079f97dd54a9`

Startup sequence:

1. Re-read `main:AGENTS.md`.
2. Re-read `main:FORK_MAINTENANCE.md`.
3. Re-read `docs:handoff/latest-handoff.md`.
4. Re-read this handoff.
5. Re-read `docs:refactor/game-runtime-architecture.md`.
6. Re-check live `main`; if it advanced, inspect conflicts before synchronizing this long-running branch.
7. Inspect the current `public/scripts/extensions/game-runtime/**` implementation and focused tests.
8. Continue R2 hardening only where required by the Master Plan, then begin R3 with the smallest real Command Bus vertical slice.

Recommended first R3 slice:

- command registry + typed argument schema;
- one deterministic command fixture;
- command validation;
- reducer/event production;
- atomic `WorldRuntime.commitEvents`;
- simulation/no-commit path;
- focused tests proving failed commands cannot partially mutate state.

Do not expose arbitrary `set_state(path,value)`.
Do not give Game Logic the broad CardApp/Atria context.
Do not begin R4 UI takeover before the R3 mutation contract is stable.
