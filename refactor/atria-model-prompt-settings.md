# Atria Model / Prompt / Runtime Native Refactor

## Status

**Implementation-ready design. Product code implementation has not started.**

- Repository: `ZZZdragondYNGPHX/Atria`
- Baseline: `main@2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- Implementation branch: `refactor/atria-model-prompt-settings`
- Detailed planning pack: `planning/atria-model-prompt-settings/`
- Prior frozen foundations: Native Content & Session N0–N10; Native Authoring Platform & Product Frontend A0–A9.

This refactor follows the repository's staged-task rule. Complete one phase, validate it, update docs/handoff, stop, then continue in a new conversation with the next phase prompt.

## Product direction

Atria is moving toward a host-independent product core. SillyTavern remains a temporary host and compatibility island, not a long-term domain authority.

Allowed dependency direction:

    Atria Domain / Runtime / Authoring / Model / Prompt
                         |
                         v
                    Host Ports
                         |
                         v
              SillyTavern Adapters

New Atria-owned domain code must not create fresh authority dependencies on SillyTavern DOM, `extension_settings`, `power_user`, PresetManager, PromptManager, or other host globals.

## Core native model

Six top-level domain objects are sufficient:

1. Connection Profile — provider transport, endpoint, proxy/network policy and secret reference.
2. Model Profile — one runnable model instance, capabilities, limits and optional message-format details.
3. Generation Profile — provider-neutral generation policy with narrowly scoped provider extensions.
4. Prompt Module — one declarative composable prompt unit.
5. Prompt Program — ordered/conditional composition of Prompt Modules.
6. Runtime Route — role binding to Model + Connection + Generation + Prompt with fallback policy.

Runtime artifacts are not additional persistent product objects:

- Request Context Plan
- Prompt IR
- Effective Request Snapshot

## Authority and scope

- Package/Project owns distributable author intent: Prompt Modules, Prompt Programs, Generation Profiles, runtime requirements and recommendations.
- Player runtime owns Connection Profiles, Model Profiles, secrets and concrete Runtime Routes.
- Session overrides are explicit and scoped to one session.
- Request overrides are ephemeral and never write back.
- Package resources may recommend models but never carry user credentials or concrete private connections.
- Effective Request Snapshot freezes one accepted request and redacts secrets.

Kernel/runtime authority always outranks author prompts. Prompts cannot grant tools, secrets, state authority, package access or execution permissions.

## Prompt architecture

Prompt Program uses declarative Modules + semantic targets + ordered stages. It does not inherit SillyTavern position/depth/jailbreak ABI.

V1 supports:

- single-parent derive;
- add / disable / replace / configure by stable module ID;
- finite condition DSL;
- typed read-only host views;
- program parameters;
- request-local scratch and explicit cross-stage artifacts;
- Response Directive as the native replacement for PHI/jailbreak placement semantics.

V1 does not create a second persistent-state authority. Durable mutations remain owned by Native Session State and existing revision/transaction boundaries.

Prompt Stage expresses semantic author workflow only. It is not an orchestrator node, DAG, retry engine, tool runner or model-call definition. Single-model RP consumes the complete applicable program; orchestration projects the same stage resources to role/node responsibilities without duplicating the full program.

## Context and generation architecture

Native Session Context remains authoritative for Native session facts, but the common boundary is a host-independent `RequestContextPlan`. Studio/task contexts may produce the same contract without requiring a Session.

Generation path:

    Runtime Route
        -> Route Resolver
        -> Request Context Plan
        -> Prompt Compiler
        -> Prompt IR
        -> Effective Request Snapshot
        -> Provider Port
        -> Transitional ST Adapter / future Native Adapter

`context.generateTask()` becomes a compatibility facade, not the Native core.

Capabilities use supported / unsupported / unknown with provenance. Required unsupported or unknown capabilities fail closed unless the user explicitly overrides an unknown capability. Fallback re-resolves the complete route and must not silently weaken required tools/output contracts.

Existing mature provider senders may remain behind transitional adapters during this refactor, but adapters must consume explicit resolved requests and must not read current ST presets/settings as hidden request authority.

## Resource model

A2 Resource Registry and derived Resource Graph remain authoritative. This refactor extends them rather than creating PromptStore/GenerationStore parallel systems.

Add a generic versioned JSON resource handler sufficient for:

- `core.prompt-module`
- `core.prompt-program`
- `core.generation-profile`

Integrate exact revisions, Library, Attach/Fork/Update, Resource Graph and Package closure through existing A1/A2 authoring boundaries.

Do not rewrite World/Knowledge/Asset repositories merely to make everything generic.

`package.presets` is not promoted into the new runtime contract. New package runtime intent uses explicit native runtime metadata and exact resource references.

## Product frontend slice

The long-term Atria Product Frontend V2 vision remains Home / Play / Library / Studio / Runtime, but this task does not reopen the entire A6 shell.

This refactor fully productizes the affected slice:

- Runtime: Routes, Models, Connections, Profiles, Diagnostics.
- Library: Prompt Programs, Prompt Modules, Generation Profiles.
- existing Build/Studio workspace: Prompt Authoring and Runtime Design.
- Settings: remove Model/Prompt/Runtime authority from the Settings product surface.
- global search: always navigate to owning product routes; never inject foreign-domain UI.

The existing A6 primary `Build` product route remains outside this task's global-navigation scope. A future global IA change may rename/reposition it as Studio.

Prompt Authoring uses a professional Resource Tree / Workspace / Inspector layout, with Simple and Advanced authoring levels. Desktop and mobile layouts are separate interaction designs, not compressed copies.

Formal Atria product pages must not reparent legacy ST DOM. Legacy controls, if temporarily retained, live only in an explicit host/developer compatibility island.

## Hard cut

At final completion, first-party Native Atria paths must not use these as authority:

- PresetManager / PromptManager
- `buildPresetAwarePromptMessages()`
- `extensionSettings.connectionManager`
- `oai_settings` / `power_user`
- legacy Context/Instruct/System Prompt preset identity
- ST macro side-effect state semantics
- `package.presets`
- legacy Runtime preset/profile names as identity
- legacy DOM reparenting
- first-party `Atria.getContext().generateTask()`

Legacy third-party/non-Native ST compatibility may retain them outside the Native boundary.

No automatic bidirectional migration or dual-write is allowed. Legacy import, if later implemented, is an explicit one-way converter and is not a completion blocker for this refactor.

## Frozen-contract policy

N0–N10 and A0–A9 semantic authorities remain frozen: Package/PackageVersion, Native Session/Branch/Revision, Native State, A1 Workspace/ChangeSet, A2 Registry/derived graph, A4 component model, A5 Plugin/Skill boundaries, Native Play, Studio and Project Agent review/commit boundaries must not be replaced.

Some old guard assertions encode transitional implementation details that this refactor intentionally supersedes. Examples already confirmed on current main:

- A6 requires the Advanced Connection compatibility editor.
- A6 requires a standalone Runtime Capabilities route.
- A8 requires Studio Agent generation through `generateTask`.

When the new native authority replaces those seams, update the old guard deliberately so it preserves the original invariant while asserting the new seam. Do not disable frozen guards wholesale or restore legacy behavior merely to satisfy stale literal patterns.

## Implementation phases

- P0 — Baseline / contracts / guard evolution
- P1 — Native resources and persistence
- P2 — Generation Core and route resolution
- P3 — Request Context + Prompt Compiler
- P4 — first-party runtime cutover
- P5 — Native Runtime product UI
- P6 — Library + Studio authoring
- P7 — product-surface cleanup
- P8 — hard cut / integration / freeze

See `planning/atria-model-prompt-settings/IMPLEMENTATION.md` for phase exits and validation.

## Non-goals

- no marketplace;
- no arbitrary Package JavaScript;
- no new Session or Project authority;
- no second orchestration engine;
- no complete provider-network-stack rewrite in the same task;
- no automatic lossless conversion of all ST presets;
- no Android or Docker build unless explicitly requested.
