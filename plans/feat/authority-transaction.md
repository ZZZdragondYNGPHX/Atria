# Authority Transaction — Core Plan

> 执行规则入口：[Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- **Task ID:** feat/authority-transaction
- **Primary Workspace:** main
- **Implementation branch:** feat/authority-transaction (merged; temporary branch removed)
- **Blocks:** P0 Core prerequisite cleared; Package P1 is unblocked but not started
- **Design authority:** docs:plans/package/original-occult-western-fantasy-game/technical-design.md (Rounds 9.5–9.8)

## Goal

Add one reusable Native Core capability, "authority-transaction@1", that lets an author-declared gameplay transaction safely compose existing Game World, Lifecycle, canonical clock, disclosure-safe derived projections and one current-turn receipt under a single authority boundary.

This is a platform capability, not game-specific logic.

The implementation must reuse existing Native authority systems rather than creating a parallel persistence or transaction engine.

## Required capability boundary

Add a separate optional Experience capability:

"authority-transaction@1"

Do not redefine ordinary "action@2" as a general cross-authority mutation mechanism.

When the capability is absent, existing Packages retain current behavior.

The capability may add an optional "authorityRuntime" declaration to ExperienceContract under strict capability/runtime consistency.

Game logic gains a backwards-compatible declarative transaction definition surface. Existing schemaVersion 1/2 behavior remains supported; the approved direction is schemaVersion 3 for transaction declarations.

## Product responsibilities

The new capability owns only:

1. safe intent observation;
2. atomic typed authority preparation/composition;
3. safe current-turn transaction receipt;
4. derived-publication refresh for affected authority publications;
5. atomic finalization with the assistant turn.

It does not own:

- game-specific NPC personality;
- Case logic;
- Claim rules;
- Agenda strategy;
- generic Memory;
- frontend visual design;
- unrestricted JSON/state mutation.

## Transaction declaration

A Package transaction declaration may define only bounded, statically declared behavior such as:

- stable transaction / verb ID;
- input schema;
- intent-resolver exposure metadata;
- private read grants;
- deterministic / bounded Resolution policy;
- World Event templates;
- typed Lifecycle app-command effects;
- optional canonical clock advance;
- optional workflow transition;
- derived publication declarations;
- safe receipt projection.

Domain IDs / command IDs referenced by effects must be statically declared by the Package contract.

The model must never choose arbitrary domain IDs, command IDs, namespaces or patch paths.

## Permitted effect families

v1 effect families:

- world.event;
- app.command;
- clock.advance;

Explicitly reject generic:

- state.patch;
- namespace.write;
- json.patch;
- eval / executable script;
- dynamic domain/command selection.

## Read and disclosure model

Intent resolver observation is separately constructed from explicitly player-safe sources.

The transaction can privately inspect statically granted records after a target/action is selected, including relevant Entity, Belief, Memory, Relation, Evidence, Condition or Claim records.

Private reads must never automatically appear in:

- resolver observation;
- Narrator receipt;
- player frontend projections.

## Final authority-first flow

The required flow is:

1. anchor the current Session revision;
2. expose bounded player-safe intent observation;
3. resolve free text or typed input to one declared Transaction;
4. construct the allowed private read set;
6. resolve deterministic/bounded mechanics and Fortune;
7. build a bounded typed effect plan;
8. apply all World/Lifecycle/clock effects to a private candidate;
9. update declared derived projections/indexes in the same candidate;
10. create an immutable player-safe Turn-local receipt;
11. invoke Narrator against the frozen candidate + safe receipt;
12. only after Narrator succeeds, publish prepared authority + Action receipt + assistant message in one final CAS;
13. if Narrator fails, publish nothing.

"Resolve first" must not mean "publish before narration".

## Typed and free-text invocation

The same declared Transaction authority path must support:

- authority-first free-text intent;
- fixed Native Frontend transaction invocation.

Do not create separate frontend authority rules.

## Derived publication hook

Authority-derived player/Narrator read models may be affected by player Transactions or ordinary Lifecycle/background changes.

The capability must provide one bounded derived-publication hook that can refresh declared safe projections before Session publication.

Background authority changes do not need to masquerade as player Transactions merely to update projections.

Derived projections remain rebuildable read models and never become a second source of Truth.

## Deterministic Fortune / retry semantics

Mechanical randomness must be stable for the same unresolved anchored action even when Narrator/provider generation is retried.

Use a stable authority identity derived from durable inputs such as Package/version + anchored player-turn identity + stable transaction identity/ordinal.

The exact formula is implementation-owned, but it must not depend on provider response timing or prose-generation retry.

Native Branch Retry remains an alternate branch/new Turn execution.

A future prose-only re-narrate path, if added, must not rerun transaction resolution or Fortune.

## Transaction bounds

Hard boundedness is required.

Approved design targets:

- <=16 private read grants;
- <=16 World Events;
- <=24 Lifecycle app-command effects;
- <=1 canonical clock advance;
- <=32 total authority effects;
- receipt target <=32 KiB;
- intent observation target <=64 items / 16 KiB.

Equivalent or stricter limits may be chosen if justified by existing Core contracts.

## Compatibility

Packages that do not declare "authority-transaction@1":

- must continue installing/running under current contracts;
- must not require authorityRuntime;
- must retain existing action/turn/lifecycle behavior.

Do not introduce an unrelated global migration.

## Implementation stages

### C1 — Contract and declarative surface

- Experience capability registration;
- optional authorityRuntime contract and capability/runtime consistency;
- declarative Game Logic transaction schema/versioning;
- static effect/read target closure;
- bounded limits;
- backwards compatibility for Game Logic schemaVersion 1/2 and Packages without the capability.

Do not implement full authority execution in C1.

**C1 exit:** contract/compiler tests establish accepted/rejected declarations and old-package compatibility.

### C2 — Private candidate authority engine

Implement:

- player-safe intent observation builder;
- private read-grant resolution;
- deterministic transaction/RNG identity;
- World Event preparation;
- multi-domain Lifecycle app-command preparation;
- canonical clock preparation;
- private-candidate effect application;
- derived-publication hook;
- safe receipt projection;
- zero partial publication on preparation failure.

### C3 — Turn and Frontend integration

Implement:

- authority-first resolver transaction catalog/invocation;
- frozen candidate + safe receipt passed to Narrator;
- Narrator cannot alter mechanical result;
- final authority + assistant-message single CAS;
- Narrator/provider failure zero mutation;
- fixed Native Frontend transaction invocation through the same authority path;
- action receipt / idempotency / stale revision behavior;
- retry/Fortune semantics.

**C3 exit:** free-text and typed invocation exercise the same declared Transaction; successful turn finalizes once; failed Narrator publishes nothing; retry does not silently reroll the same unresolved authority action.

## Documentation

Implementation Record:

"docs:records/feat/authority-transaction.md"

If the task spans conversations/stages, use the repository's single live:

"docs:HANDOFF.md"

At the end of C1, C2 and C3:

- commit/push;
- update the same Record;
- refresh HANDOFF;
- provide next-stage takeover prompt;
- stop.

## Non-goals

Do not add as part of this Core task:

- dynamic per-NPC Information Views;
- game-specific occult rules;
- Case/Evidence systems;
- generic cross-package economy/state APIs;
- Content extension points;
- Player Continuity changes;
- UI visual redesign;
- Package-specific workarounds.

If implementation reveals a material contradiction with this Plan, update the Plan before expanding scope.
