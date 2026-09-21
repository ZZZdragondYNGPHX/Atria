# Atria Native Content & Session Architecture — implementation handoff

## Current state

The architecture discussion is complete and frozen. Implementation has not started.

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- First implementation phase: **N0 — Native Contracts & Identity**
- Formal plan: `docs:refactor/atria-native-content-session-architecture.md`

The branch was created from the exact baseline above and contains no task-specific functional changes yet.

## Frozen decisions

- Replace Character Card as Atria's top-level product object with Package.
- Actors are assets/entities inside a Package.
- `.atria` becomes the Native Package distribution artifact.
- `.atriasave` becomes the Native portable Session/save artifact.
- Session is an entire run; Timeline is message history; SavePoint is a revision-backed save.
- PackageRepo / AssetStore / SessionRepo / SavePointRepo / ProjectStore are separate authorities.
- Stable opaque IDs replace filename/name/`charDir`/message-index identity.
- Installed Package versions are immutable.
- Studio Source Project is separate from installed Package.
- SessionRevision provides a coherent multi-state commit point.
- Branch/Checkpoint chat-file copies are replaced by BranchGraph + SavePoint semantics.
- Native data does not dual-read/dual-write/fallback to old PNG/JSONL persistence.
- Old local data migration is not guaranteed and must not shape the Native schema.
- SillyTavern is retained as a runtime ABI behind a one-way compatibility adapter.
- R7 Shell primary domains remain Play / Library / Studio / Agents / Runtime.
- No UI cutover before the Native Store + runtime adapter + save system are proven.

## Implementation sequence

- N0 Native Contracts & Identity
- N1 Native Storage Foundation
- N2 Package / Project Separation
- N3 Native Session Core
- N4 SillyTavern Runtime Projection
- N5 Native Runtime State Integration
- N6 Save System & `.atriasave`
- N7 Product UI Cutover
- N8 Hard Cutover & Legacy Retirement

Checkpoint A: after N3, prove pure Native Package → Session → Timeline → Branch → Revision without PNG/JSONL authority.

Checkpoint B: after N6, prove restart/save/load/export/import consistency across World/Memory/Orchestrator/Branch/Variant state before UI cutover.

## Next action

Start N0 directly. Do not redesign the product model and do not create another task branch.

Read, in order:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:refactor/atria-native-content-session-architecture.md`

Then inspect the live working branch and implement N0.
