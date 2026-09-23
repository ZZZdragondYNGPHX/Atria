# Atria Model / Prompt / Runtime Native Refactor

## Status

**P0–P7 已完成并验证。当前停止在 P8 接手点；P8 尚未实施。**

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


## P0 completion record

P0 — Baseline / Contracts / Guard Evolution 已在 `refactor/atria-model-prompt-settings` 完成并验证。

- validated HEAD: `472e1a9f0759a460d845a2e6c618983c35e18654`
- workflow: Model Prompt Runtime P0 Checks #6
- run: `35832249672`
- baseline main: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- branch remained ahead-only; no merge to main was performed.

P0 froze these Native contracts in code:

- Connection Profile
- Model Profile
- Generation Profile
- Prompt Module
- Prompt Program
- Runtime Route
- RequestContextPlan
- Prompt IR
- EffectiveRequestSnapshot
- capability supported / unsupported / unknown + provenance
- Generation Service / Route Resolver / Provider Port / Secret Port / Context Provider

The package-side author-intent contract is frozen at `AtriaPackage.runtime.modelPrompt`. It may carry role capability requirements and exact package Prompt Program / Generation Profile refs. It must not carry player Connection, Model, concrete Runtime Route, secret material, or secret values.

The new Core boundary is `src/native/model-prompt-runtime/`. Its P0 architecture guard rejects direct dependency on SillyTavern globals/DOM/PresetManager/PromptManager, `Atria.getContext()`, `generateTask`, direct Atria dispatch senders, browser persistence, and `package.presets` authority.

No user-visible Runtime/UI cutover occurred in P0.


## P1 completion record

P1 — Native Resource & Persistence Foundation 已完成并验证。

- validated HEAD: `802a68654f53015800e141fd052f1a006df149e0`
- P1 workflow: Model Prompt Runtime P1 Checks #6
- P1 run: `35836303381`
- P0 workflow on the same HEAD: Model Prompt Runtime P0 Checks #17
- P0 run: `35836303445`
- baseline main remains: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- branch remains ahead-only; no merge to main was performed.

P1 implemented:

- generic `VersionedJsonResourceHandler` on the existing Native `native_resources` infrastructure;
- versioned Library resources for `core.prompt-module`, `core.prompt-program`, and `core.generation-profile`;
- immutable exact revision lookup that never follows latest when an exact ref is supplied;
- A2 Resource Registry descriptors for the three resource types;
- NativeLibraryService list/get-exact through the handler seam;
- Library Attach/Fork/Update through the existing A1 Workspace/ChangeSet path;
- derived-readonly Resource Graph nodes plus forward/reverse exact-reference edges;
- delete-safety via reverse Resource Graph references;
- Project source `resources` and exact `dependencies.resources`;
- Package dependency closure that recursively resolves exact Prompt Program → Prompt Module dependencies and fails closed on missing exact revisions;
- Package build vendoring that rewrites Project/Library exact refs to exact Package-scope refs for the generated PackageVersion;
- Package resource closure validation, including `runtime.modelPrompt` exact resource membership;
- player-owned Connection Profile / Model Profile / Runtime Route persistence;
- Connection persistence remains `secretRef` only; secret material is rejected by the frozen P0 contract;
- project/library/package origin and provenance remain explicit.

Authority decisions preserved:

- no PromptStore / GenerationStore / second Library;
- no second Resource Graph;
- no WorldRepo / KnowledgeRepo / AssetStore rewrite;
- Resource Graph remains derived-readonly;
- Studio mutations remain inside A1 Authoring Operation / Workspace / ChangeSet;
- Project Agent still consumes Registry / Graph / A1 authority;
- no Generation Service implementation, Prompt Compiler, first-party generation cutover, Runtime UI cutover, or A6/A8 replacement-gate changes were performed in P1.

P1 commits:

- `a2c2fee0` — add P1 Native resource persistence foundation
- `bff67534` — integrate P1 resources with A2 authoring authority
- `1822358d` — close P1 model/prompt Package dependencies
- `577eeedc` — preserve frozen P0 Package metadata contract
- `84d3fe50` — add P1 resource/package integration tests
- `fd38b8ec` — add P1 CI workflow
- `342452b4` — align persistence test fixture with normalized Model contract
- `ce900854` — focused lint fix
- `61f0b1aa` — prove project/library/package origin + provenance
- `0ff8fcb4` — add P1 architecture guard
- `802a6865` — enforce P1 architecture guard in CI

Actually validated on `802a68654f53015800e141fd052f1a006df149e0`:

- P1 focused + adjacent Native: 9 suites / 37 tests passed;
- P0 architecture guard: success;
- P1 resource/persistence architecture guard + syntax: success;
- frozen A1 guard: success;
- frozen A2 guard: success;
- frozen A7 guard: success;
- frozen A8 guard: success;
- focused ESLint: success;
- P0 Checks #17: success.

Not executed in P1:

- full Node regression;
- frontend build;
- browser E2E;
- Android;
- Docker;
- real-host model request.

## P2 completion record

Validated HEAD: `5d5ab196c37ad7ff25db44d9dd249c0863b94115` on the same work branch.
GenerationService.execute, exact RouteResolver, capability tri-state/provenance,
fail-closed requirements, full-route fallback, immutable config, send-boundary Secret
and explicit Provider adapters are complete.
Local results: P2 33 tests; Native FS/SQLite 48 suites / 347 tests; P0/P1/P2 guards,
A1/A2/A7/A8 guards, root/focused lint, syntax and frontend build passed.
No main merge or first-party/UI cutover. See planning/atria-model-prompt-settings/P2-VALIDATION.md
for unavailable external engines and other limits. P3 is next after explicit continuation.

## P3 completion checkpoint (2026-09-23)

P3 is complete at `5e51332b34146236fd4d4a6d45c25ef7c37a9e08` on the existing work branch.
Request Context Providers, exact Prompt Compiler, typed request-local values and declared
artifacts, bounded condition DSL, derive/conflict checks, semantic stage/target projections,
immutable IR/provenance and protocol render fixtures are implemented. No first-party/UI
cutover or main merge occurred. Earlier P3-future statements above are historical.

Local validation: Native FS/SQLite 49 suites / 385 tests; final P3 focused 38 tests;
P0–P3 and A1/A2/A7/A8 guards, root/focused lint, syntax and frontend build passed.
See planning/atria-model-prompt-settings/P3-VALIDATION.md for exact commands, the final
narrow adapter change retest and exclusions. P4 First-party Runtime Cutover is next,
only after explicit continuation. A6/A8 transitional gates remain unchanged in P3.

## P4 completion checkpoint (2026-09-23)

P4 is complete at `6cba266814a7ff04666220f1031efdb844ad4e46`. First-party Native
generation uses the exact route service/context/compiler. A8 seam replacement is
verified; human Review/Commit and A6 gates remain. Broad 206 suites/1807 tests,
final callers 143 suites/1744 tests, four real desktop/mobile browser cases, guards,
lint and webpack passed. See P4-VALIDATION.md in the planning pack. Earlier
P4-future statements are historical. Next is P5 only after explicit continuation.

## P5 completion checkpoint (2026-09-23)

P5 complete at `0cb56b9a0d37789025fb8069d08f6f43ead2413d`. Native Runtime Routes/Models/Connections/Profiles/Diagnostics
replace the compatibility editors, reuse P1 exact storage and P4 host, and provide
compile-only preview, remediation, search deep links and mobile fullscreen editors.
A6/P0 replacement gates evolved after actual visual verification. Broad FS/SQLite:
206 suites / 1811 tests; final focused: 6 / 39; real P4/P5 browser: 8 passed.
Guards/lint/syntax/prebuild passed. Exact commands, intermediate visual defects,
exclusions and P6 obligations: P5-VALIDATION.md. No main merge or P6 implementation.
P6 Library & Studio Authoring is next, only after explicit continuation.


## P6 completion checkpoint (2026-09-23)

P6 complete at `2351be51e8c8cbdadf0966104ec607018e93de6e`. Library Prompt/Generation exact resource
views and Fork/Derive, A1-reviewed Studio Prompt Authoring/Runtime Design, scoped
pickers/preview, Package derive freeze and owner-aware Package Resource Graph are
implemented. Primary Build and A1/A2/A7/A8 authority remain. Final regression:
209 suites / 1830 tests; final P6 real-browser desktop/mobile: 2 passed, with 8
adjacent P4/P5 cases passing separately in the combined run. Final screenshots
inspected. Broader storage run has four failures reproduced on unchanged P5;
see P6-VALIDATION.md for exact evidence, intermediate failures and exclusions.
No main merge or P7/P8 implementation. P7 is next only on explicit continuation.


## P7 completion checkpoint (2026-09-23)

P7 complete at `bde2fbc1ed58bc8f9a915dc7c2e72c210917c245`. Settings is preference-only,
Studio no longer edits package.presets, Search navigates to exact owner/revision
Library details and refreshes on Command open, and legacy preset UI reads are
Native-disabled behind one explicit compatibility boundary. Simplified Chinese
Prompt/Runtime/Settings labels and dynamic stages use existing localization.
Final FS/SQLite regression: 210 suites / 1837 tests; P4-P7 combined browser: 12
passed, final P4/P7 follow-up: 6 passed (overlapping). Screenshots inspected.
P0-P7/A0-A8/N9-N10 guards, lint/syntax/diff and prebuild-cache passed.
Details/exclusions: P7-VALIDATION.md. No main merge; stop before P8.
