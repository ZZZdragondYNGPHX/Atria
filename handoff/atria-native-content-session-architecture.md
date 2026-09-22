# Atria Native Content & Session Architecture — implementation handoff

## Current state

The original Package/Session architecture is frozen. N0 implementation is in progress, and a newly frozen World/Knowledge extension must be added to the existing N0 contracts before N0 is considered final.

- Repository: `ZZZdragondYNGPHX/Atria`
- Authoritative creation baseline: `main@2c1c171136cb6f35f3f4fff7c62b148b7200485a`
- Working branch: `refactor/atria-native-content-session-architecture`
- Current implementation phase: **N0 — Native Contracts & Identity**
- Current known N0 HEAD: `6be4f7e12e6c0e23faf27e2c4292823191060953`
- Existing N0 commits must be preserved; continue forward from the live branch HEAD
- Formal plan: `docs:refactor/atria-native-content-session-architecture.md`

The branch was created from the exact baseline above. N0 now contains the initial Native contracts, lint cleanup and expanded N0 CI validation. Do not reset to the creation baseline.

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
- World / Knowledge are now first-class Native content assets rather than filename-scoped World Info authority.
- World uses stable World + immutable WorldRevision identity; Knowledge uses KnowledgeBase + immutable KnowledgeRevision + stable KnowledgeEntry identity.
- Knowledge scope is expressed by KnowledgeBinding, not `global` / character / character_aux / chat ownership.
- Package/World Knowledge is canonical immutable baseline; current truth belongs to Session World State/Event Journal.
- Library Knowledge is revisioned and running Sessions pin exact revisions until explicit upgrade.
- Knowledge authority is separate from priority; Memory and augment content cannot override current State or deterministic Runtime mechanics.
- Package Build vendors exact World/Knowledge dependency snapshots into PackageVersion, so runtime does not depend on live Library content.
- The mature World Info selection engine should initially be reused behind a Native Knowledge Runtime Adapter; do not rewrite keyword/regex/vector/sticky/cooldown/delay without a concrete need.
- No UI cutover before the Native Store + runtime adapter + Native Knowledge runtime + save system are proven.

## Implementation sequence

- N0 Native Contracts & Identity
- N1 Native Storage Foundation
- N2 Package / Project / World & Knowledge Composition
- N3 Native Session Core
- N4 SillyTavern Runtime Projection
- N5 Native Runtime State Integration
- N6 Native Knowledge Runtime Integration
- N7 Save System & `.atriasave`
- N8 Product UI Cutover
- N9 Hard Cutover & Legacy Retirement

Checkpoint A: after N3, prove pure Native Package → Session → Timeline → Branch → Revision without PNG/JSONL authority and with exact World/Knowledge dependencies pinned.

Checkpoint K: after N6, prove Knowledge authority, revision pinning, visibility, identity preservation and State-over-stale-Knowledge semantics.

Checkpoint B: after N7, prove restart/save/load/export/import consistency across World/Knowledge/Memory/Orchestrator/Branch/Variant state before UI cutover.

## N0 World / Knowledge incremental change

The current N0 implementation through `6be4f7e12e6c0e23faf27e2c4292823191060953` remains valid. Do not revert it.

Before N0 final validation / N1:

- add Native ID families for World, WorldRevision, KnowledgeBase, KnowledgeRevision, KnowledgeEntry and KnowledgeBinding;
- add strong Native contracts for those entities;
- replace arbitrary Package `worlds` / `knowledge` JSON slots with validated immutable Package snapshot contracts;
- update EntryPoint to reference Package World IDs / primary World and KnowledgeBinding IDs rather than embedding arbitrary World payloads;
- add a resolved Knowledge binding-set reference/head to SessionRevision;
- reserve Native Store schema-v1 resource kinds/families for Library World/Knowledge authorities;
- add tests proving old World Info name/filename/`uid`/character-chat-global scope is not Native identity or ownership.

## Next action

Continue N0 from the live branch HEAD. Do not redesign the product model and do not create another task branch.

Read, in order:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:refactor/atria-native-content-session-architecture.md`

Then inspect the live working branch and implement the N0 World/Knowledge contract extension before declaring N0 final.
