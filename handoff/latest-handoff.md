# Active checkpoint: Atria Model / Prompt / Runtime Native Refactor ready for P0

## Status

Atria Native Content & Session N0–N10 and Native Authoring Platform / Product Frontend A0–A9 remain complete, integrated and frozen.

A new staged refactor has now been designed and sealed:

**Atria Model / Prompt / Runtime Native Refactor**

Product implementation has **not** started yet.

- Repository: `ZZZdragondYNGPHX/Atria`
- Current verified main baseline: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- Implementation branch: `refactor/atria-model-prompt-settings`
- Branch was created from the above current main; no task implementation commits existed at creation.
- Formal plan: `refactor/atria-model-prompt-settings.md`
- Detailed planning pack: `planning/atria-model-prompt-settings/`
- Next phase: **P0 — Baseline / Contracts / Guard Evolution**

Before any work, fetch the remote implementation branch and preserve any newer commits pushed by another conversation.

## Why this refactor exists

Current A6 product surfaces are Native-first visually, but Model / Prompt / Connection authority is still partly inherited from SillyTavern:

- Runtime reads `extensionSettings.connectionManager`;
- Runtime Presets uses `getPresetManager()`;
- Runtime Connections can reparent old Connection Manager DOM;
- `generateTask()` still resolves ST connection/prompt/world-info/macro state;
- `buildPresetAwarePromptMessages` still relies on the old prompt/preset system;
- Native Session Context exists but is not yet the final generation request assembly authority.

The goal is to make Atria's runtime/model/prompt system a host-independent Native core, while temporarily retaining mature ST senders only behind explicit adapters.

## Final design

Six persistent/core product objects:

1. Connection Profile
2. Model Profile
3. Generation Profile
4. Prompt Module
5. Prompt Program
6. Runtime Route

Runtime artifacts:

- Request Context Plan
- Prompt IR
- Effective Request Snapshot

Native generation direction:

    first-party Atria
        -> Runtime Route
        -> Generation Service
        -> Request Context Plan
        -> Prompt Compiler / Prompt IR
        -> Effective Request Snapshot
        -> Provider Port
        -> transitional ST adapter or future Native adapter

`context.generateTask()` becomes a compatibility facade, not the Native Core.

## Product direction

Atria is intentionally moving toward an independent product core rather than permanently treating SillyTavern internals as its domain layer.

New rule:

**No New SillyTavern Authority**

Allowed:

    Atria Core <- Host Port <- ST Adapter

Forbidden:

    Atria Core -> ST globals / DOM / PresetManager as domain truth

## Resource direction

A2 Resource Registry / derived Resource Graph remain authoritative.

This task will add a generic versioned JSON resource path for:

- `core.prompt-module`
- `core.prompt-program`
- `core.generation-profile`

Do not create PromptStore or a second Library.

A8 Project Agent already consumes Registry-driven resource capabilities in several places; current bottlenecks are primarily LibraryService, LibraryAuthoring Attach/Fork/Update and package dependency closure.

## Prompt direction

Prompt Program is not a renamed ST preset.

V1:

- semantic targets;
- ordered stages;
- finite condition DSL;
- typed parameters;
- request scratch / declared cross-stage artifacts;
- Response Directive;
- single-parent derive;
- add / disable / replace / configure.

Prompt Stage is not an Orchestrator. Durable state mutation remains owned by Native Session State / Revision transactions.

Single-model RP is first-class. Orchestration consumes projected stages from the same resources rather than requiring a separate prompt system.

## Frontend scope

Long-term Atria IA may evolve toward Home / Play / Library / Studio / Runtime, but this task does not reopen the whole A6 shell.

This refactor productizes only the affected slice:

- Runtime: Routes / Models / Connections / Profiles / Diagnostics
- Library: Prompt Programs / Prompt Modules / Generation Profiles
- existing Build / A7 Studio: Prompt Authoring / Runtime Design
- Settings: remove Model / Prompt / Runtime authority
- Search: navigate to owning route only

The A6 primary `Build` route remains unchanged in this task.

Formal Atria pages must not reparent legacy ST DOM.

## Frozen-contract consistency check

N0–N10 / A0–A9 semantic authorities remain frozen.

However, the current old guards contain several transitional literal assertions that the new architecture will intentionally supersede:

- A6 requires the Advanced Connection compatibility editor;
- A6 requires a standalone Runtime Capabilities route;
- A8 requires Studio Agent generation through `generateTask`.

Do not delete those guards early. When each replacement seam is implemented and tested, evolve only the obsolete literal assertion while preserving the original invariant and all unrelated frozen checks.

Never wholesale disable frozen guards.

## Migration / hard cut

No automatic bidirectional migration.

No runtime dual-write.

No hidden fallback from Native config to old ST preset/global state.

Legacy import, if later added, must be explicit, one-way and non-blocking for this refactor.

At final P8, first-party Native paths must no longer use old Prompt/Preset/Connection Manager authority. Legacy non-Native ST / third-party compatibility may remain in an isolated host island.

## Phases

- P0 — Baseline / Contracts / Guard Evolution
- P1 — Native Resource & Persistence Foundation
- P2 — Generation Core & Route Resolution
- P3 — Request Context & Prompt Compiler
- P4 — First-party Runtime Cutover
- P5 — Native Runtime Product UI
- P6 — Library & Studio Authoring
- P7 — Product Surface Cleanup
- P8 — Hard Cut / Integration / Freeze

Only one phase should be executed per conversation checkpoint.

## Immediate next action

Execute **P0 only** on `refactor/atria-model-prompt-settings`.

P0 must establish contracts, architecture guards and the frozen-guard evolution matrix without prematurely removing the existing compatibility seams.

After P0:

1. validate;
2. update docs/handoff;
3. record branch HEAD and checks;
4. stop;
5. produce a P1 handoff prompt.

Android and Docker remain opt-in.
