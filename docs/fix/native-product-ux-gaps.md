# Atria Native Product UX / Capability Backlog

> Status: re-audited and normalized after the Product Frontend Redesign was integrated into `main`.
>
> Task branch: `fix/native-product-ux-audit`
>
> Verified baseline: `main@ad15c1e0c3e15e625ba163e284a300c00811f10d`
>
> Scope: current Atria-native product capability, authoring, runtime, portability, lifecycle, data-safety and recovery gaps.

## 1. Boundary

This backlog is for the current Atria product, not for preserving old SillyTavern user data.

**Do not add legacy user-data migration as a default requirement**, including old preset / World Info / other SillyTavern data conversion.

This does **not** prohibit migrating retained functionality.

If Atria still needs a capability currently implemented through SillyTavern-era extension/configuration/ABI code:

1. migrate or rebuild the required capability under the correct Atria Native/Core/Agents/Runtime authority;
2. switch active callers to the Native owner;
3. then remove the old implementation, old product surface and dead compatibility authority.

Do not keep dual-read, alias, dual-write or permanent compatibility ownership merely to preserve old user data.

## 2. Execution contract

The issue order below is the implementation order.

For each `NUX-xxx`:

1. verify it still reproduces on current `main`;
2. implement the complete fix;
3. add/update focused and adjacent tests;
4. remove the solved issue from this active backlog;
5. commit **code + tests + backlog removal** as one atomic commit;
6. continue directly to the next issue.

After completing one Group:

1. run that Group's full regression;
2. update necessary handoff/progress records;
3. push the working branch;
4. continue directly to the next Group.

Do not stop for routine failures. Stop only for required human device/UI validation, Secrets/accounts/permissions, or a newly discovered architectural conflict that changes an established product boundary.

## 3. Product constraints

- Current Atria UI, tokens, primitives and neighboring implementations are the visual authority.
- This is not a second frontend redesign.
- Do not rebuild Shell or create another local design system.
- Do not create a second router / persistence / settings / runtime authority.
- Preserve exact revision, Resource Graph, ChangeSet, Runtime Route, PackageVersion and Native Session semantics.
- New UI must reuse the nearest existing Atria picker/editor/destructive/remediation/sheet/confirmation/resource-relation pattern.
- Package originals remain read-only.
- Player Connections / Models / Secrets remain player-owned.
- Studio human/project writes continue through ChangeSet / Review / Apply.

## 4. Ordered work groups


# Group 1 — P0 — User Data Safety

**Group goal:** 先保证当前 Atria Native 数据不会在目录管理、备份、恢复或 Storage Engine 迁移中丢失。

## NUX-001 — Per-user filesystem layout was not normalized for the Native product model

**New finding from the post-redesign data-layout audit**

**Current evidence**

`USER_DIRECTORY_TEMPLATE` still describes the older SillyTavern-oriented physical layout, including directories such as:

- `worlds`;
- `characters`;
- `chats`;
- provider-specific settings directories;
- `sysprompt`;
- compatibility extensions.

Major Native-owned data paths are created outside that template:

- Native FS engine resources: `<user-root>/atria-native/resources/...`;
- Studio projects: `<user-root>/projects/...`;
- Native/package asset blobs: `<user-root>/assets/atria-native/blobs/...`.

These paths work because their owning services create them lazily, but they are not represented as first-class entries in the central user-directory contract.

**Impact**

The data layout is operational but fragmented:

- directory initialization/introspection does not describe the complete Atria-owned layout;
- backup category code can miss Native paths;
- storage tooling must know ad-hoc paths independently;
- future cleanup/migration can drift between services.

**Acceptance**

Define a canonical Atria per-user data layout/registry for all durable filesystem-owned product data.

This does **not** require moving legacy-compatible directories merely for cosmetic purity. The goal is to centralize authoritative Native paths and make backup/storage/inspection tooling derive from the same contract.

At minimum, Project and Native storage/blob roots must be represented explicitly rather than reconstructed independently by each service.

**Evidence**

- `src/constants.js`
- `src/users.js`
- `src/native/project-store.js`
- `src/native/repositories/asset-store.js`
- `src/storage/engines/fs-engine-transaction.js`

---

---

## NUX-002 — User backup / restore is not Native-data complete

**New finding from the post-redesign data-integrity audit**

**Current evidence**

The downloadable user backup selection still uses the legacy category model:

- settings;
- secrets;
- characters;
- chats;
- lorebooks;
- presets;
- assets;
- extensions;
- globalExtensions;
- vectors.

Atria Native data now lives in additional authorities/paths that are not represented by those backup targets.

### FS storage mode

Native Storage Engine documents are written under:

`<user-root>/atria-native/resources/<native-kind>/...`

Studio Projects are stored under:

`<user-root>/projects/<project-id>/...`

Neither `atria-native/` nor `projects/` is included by `getUserBackupTargets()`.

Therefore a normal downloadable

---


# Group 2 — P0 — Native Runtime / Provider Foundation

**Group goal:** 闭合 Secret → Connection → Model → Generation Profile → Runtime Route 的第一方 Native 配置链。

## NUX-003 — Native generation provider support is materially incomplete

**Current evidence**

Production Native generation currently registers:

- `provider.openai-compatible`
- `provider.raw-text`

Runtime UI explicitly states Anthropic and Gemini transports are unavailable.

The HTTP adapter rejects configured `reasoning`, `cache`, `providerExtensions`, connection options/network policy and model hints that it cannot consume.

**Impact**

Mainstream provider-native capabilities and modern reasoning/cache controls cannot be represented/executed by the first-party Native Runtime even though the schema reserves those concepts.

**Acceptance**

Define and implement the intended provider matrix. At minimum:

- provider-native protocol adapters required by the product;
- capability discovery/validation;
- explicit supported reasoning/cache/tool controls per adapter;
- fail-closed behavior for unsupported controls;
- no fallback to legacy preset/provider authority.

---

---

## NUX-004 — Runtime Connection setup requires an opaque Secret ID

**Current evidence**

Runtime Connections require a free-text **Exact Secret ID** and warn users not to paste the secret value.

No Native picker / Secret inventory / create-secret action is exposed from the Connection editor.

**Impact**

A user can know their API key and endpoint and still be unable to finish Native Runtime setup without discovering an internal identifier elsewhere.

**Acceptance**

Provide a first-party Secret selection/create flow that returns an exact Secret reference without exposing secret material in the Connection document.

---

---

## NUX-005 — Runtime cannot pull provider model choices and lacks connection validation

**Current evidence**

Runtime Model authoring exposes `Remote model ID` as a required free-text field. Users must know and type the provider's exact model identifier manually.

No Native model-list discovery/picker is exposed, even when a provider can enumerate models. Connection setup also lacks a first-party **Test connection** / provider-health action.

**Impact**

Model setup is unnecessarily error-prone: endpoint/authentication/model-ID mistakes are usually discovered only at preview/execution time, and users cannot simply fetch and choose from available models.

**Acceptance**

- Add non-destructive connection validation.
- When supported by the provider, fetch available models and present a selectable model list.
- Preserve manual model-ID entry for custom/OpenAI-compatible endpoints.
- Model discovery must not silently mutate the saved Model Profile.
- Capability/limit metadata discovered from providers must keep provenance and explicit user override semantics.

---

---

## NUX-006 — Runtime profiles and routes lack lifecycle cleanup

**Current evidence**

Runtime supports New/Edit for Connection, Model and Route, but no first-class delete/archive/duplicate flow is exposed. Persistence endpoints are save/list oriented.

Prompt/Generation Library resources similarly expose new revision/fork/derive but no normal cleanup/archive workflow.

**Acceptance**

Define reference-safe lifecycle semantics:

- delete when unreferenced;
- block with Used By when referenced;
- archive/hide where permanent deletion is intentionally disallowed;
- duplicate where useful.

---

---

## NUX-007 — Generation Profiles have two competing product homes

**Current evidence**

Generation Profiles appear in:

- Library → Generation Profiles;
- Runtime → Profiles.

Runtime's Profiles section writes the same `core.generation-profile` Library resource family.

**Impact**

Ownership and revision history are conceptually ambiguous.

**Acceptance**

Choose one canonical authoring home. Runtime Routes should link to exact Generation Profile revisions without creating a competing ownership model.

---

---

## NUX-008 — Runtime fallback editor offers invalid route choices

**Current evidence**

Fallbacks must use the same role. The editor explains this but populates “Add fallback route” from every other route.

The backend rejects mismatched roles later.

**Acceptance**

Only same-role routes are selectable. Changing a route's role must revalidate or clear incompatible fallback refs before save.

---

---

## NUX-009 — Runtime Diagnostics requires raw Project ID / revision

**Current evidence**

When no Native Session owns context, Diagnostics asks users to type Project ID and Project revision manually.

Build already owns a project/revision inventory.

**Acceptance**

Use a project + exact revision picker backed by Build authority. Keep raw IDs only in Advanced/debug mode.

---

---

## NUX-010 — First-time Native Runtime setup has no dependency-guided readiness flow

**Current evidence**

A usable Route may require, in dependency order:

1. Secret;
2. Connection;
3. Model;
4. Prompt Program;
5. Generation Profile;
6. Runtime Route.

Current empty states are section-local.

**Acceptance**

Provide one readiness/checklist experience that identifies the next missing dependency and deep-links to its canonical owner, without introducing a second configuration authority.

---

---

## NUX-011 — Native Product errors lose actionable context at the UI boundary

**Current evidence**

`product-client.js` preserves `error.code` and `error.details` but constructs a generic message such as:

`Native Product request failed (409)`

Many UI callers show `error.message`.

Library maps a few cases to generic conflict/reference strings, but field/blocker details are not consistently surfaced.

**Acceptance**

Map known error codes to actionable product messages and preserve sanitized field/reference details end-to-end.

---

---


# Group 3 — P0 — Agents / Memory Native Routing

**Group goal:** 先补齐 Orchestrator / Memory 的 Native route 与 provider ownership，再清理兼容 preset vocabulary。

## NUX-012 — Native Orchestrator loses per-agent / per-stage route selection

**Current evidence**

Orchestrator authoring still models agent-level `apiPresetName` / `promptPresetName`.

When Native generation is active, `generation-compat.js` supports an explicit `nativeRouteRef`, but inspected Orchestrator callers generally invoke:

`executeFirstPartyGeneration(context, 'orchestrator', ...)`

without supplying a per-agent Native route.

Native preset selectors collapse to a disabled “Native Runtime route — configure in Runtime” option.

**Impact**

Different agents/planners/judges that should intentionally use different model + prompt + generation configurations can collapse onto one primary `role.orchestrator` route.

**Acceptance**

Provide explicit Native routing per relevant Orchestrator agent/stage, using exact Runtime route refs or a typed Native sub-routing model. Do not restore legacy preset-name authority.

---

---

## NUX-013 — Native Memory loses task-specific route selection

**Current evidence**

Memory distinguishes recall, extraction, request/schema assistance and RAG rewrite settings, but Native calls funnel through:

`executeFirstPartyGeneration(context, 'memory', ...)`

without task-specific `nativeRouteRef` in the inspected flow.

**Impact**

Cheap query rewrite, strong structured extraction and other memory jobs cannot intentionally use different Native model/prompt/generation routes.

**Acceptance**

Memory tasks must select explicit Native routes/subroles while preserving one Native authority model. Legacy preset names remain compatibility-only.

---

---

## NUX-014 — Memory embedding / rerank provider ownership remains outside Native Runtime

**New finding in the post-redesign re-audit**

**Current evidence**

Memory Graph's vector embedding and rerank configuration still relies on Connection Manager embedding/rerank profiles and their provider/model/endpoint/secret ownership.

At the same time, Memory's first-party LLM generation path now uses Native Runtime through `role.memory`.

**Impact**

One Native Memory feature is split across two provider/configuration authorities:

- Native Runtime for generation;
- compatibility-era Connection Manager profiles for embedding/rerank.

Users must understand both models, and Native Memory cannot be fully configured from the Native Runtime/Library product model.

**Acceptance**

Define one deliberate Native ownership model for embedding/rerank configuration.

If embedding/rerank remain a separate resource family, make that separation first-class in Atria and expose it through Native product UI rather than requiring compatibility-only management. Do not silently copy Secrets or provider state between authorities.

**Evidence**

- `public/scripts/extensions/memory-graph/main.js`
- `public/scripts/embedding-service.js`
- `public/scripts/extensions/connection-manager/embed-rerank.js`
- `docs/features/memory-graph.md`

---

---

## NUX-015 — Orchestrator and Memory still persist compatibility-era preset names

**Current evidence**

Native execution no longer needs legacy preset authority, but settings/persistence still contain fields such as:

- `apiPresetName`
- `promptPresetName`
- `llmPresetName`

The Orchestrator workspace continues to author/display these compatibility concepts even while Native generation collapses their selector into Runtime authority.

**Acceptance**

After NUX-012/008 provide equivalent Native routing, Native-facing schemas/UI should store Runtime route/subrole concepts. Keep legacy preset fields only in explicit non-Native compatibility islands.

---

---


# Group 4 — P0 — Native Knowledge Semantics

**Group goal:** 先保证所有可作者配置的 Knowledge 字段都有明确 contract、validation 与 runtime 行为。

## NUX-016 — Native Knowledge applicability fields do not have complete runtime semantics

**Current evidence**

`src/native/world-knowledge.js` accepts:

- `stateConditions`
- `stateEvents`
- `stateActivation`

In `public/scripts/native/knowledge-runtime.js`:

- `stateConditions` are evaluated with hard-coded `all` logic;
- no runtime consumer was found for `stateEvents`;
- no runtime consumer was found for `stateActivation`.

**Impact**

Authors can persist fields that imply behavior the Native selector does not fully implement.

**Acceptance**

Define one explicit Native applicability contract and implement all supported fields end-to-end. Unsupported fields must be rejected or hidden rather than silently inert.

---

---

## NUX-017 — Native Knowledge validation is broader than runtime behavior

**Current evidence**

Examples:

- `KnowledgeEntry.delivery.position` accepts arbitrary text; runtime effectively treats only `before` and `after`, defaulting unknown values to `before`.
- `KnowledgeBinding.target` accepts generic JSON; runtime target matching recognizes a narrow narrator/actor/agent/user-style selector shape.

**Impact**

Invalid or unsupported values can pass authoring validation and silently change behavior later.

**Acceptance**

Contract, editor and runtime must share the same typed enum/selector definitions. Unsupported values fail before commit with field-level errors.

---

---

## NUX-018 — semanticHints / vectorHints are accepted but have no discovered Native retrieval consumer

**Current evidence**

The fields exist in the Native Knowledge contract and tests. Repository audit found no Native Knowledge selection path consuming them.

**Impact**

Authors can reasonably assume a configured semantic/vector hint affects retrieval when it may currently be inert metadata.

**Acceptance**

Either implement documented semantic/vector retrieval behavior or mark/reject these fields until supported.

---

---


# Group 5 — P0 → P2 — World / Knowledge Authoring

**Group goal:** 补齐 World / Knowledge 的完整作者工作流；兼容 ABI 清理必须最后执行。

## NUX-019 — World / Knowledge Library cannot author immutable revisions

**Current evidence**

`public/scripts/native/library-workspaces.js` can create, rename and delete stable World / KnowledgeBase identities and display revision history.

The actual revision authorities still live below the Product UI:

- `WorldRepo.commitRevision()`
- `KnowledgeRepo.commitRevision()`
- `KnowledgeRepo.saveBinding()`

The normal Library surface has no first-revision / new-revision authoring workflow.

**Impact**

A user can create a World or Knowledge Base whose `currentRevisionId` is empty, then cannot turn it into usable Native content from Library.

**Acceptance**

- Create first WorldRevision / KnowledgeRevision from Library.
- Create subsequent immutable revisions.
- Validate before commit.
- Show exact revision identity and references.
- Never mutate an existing revision in place.

---

---

## NUX-020 — KnowledgeEntry lacks a semantic first-class editor

**Current evidence**

The Native contract supports:

- content;
- discovery: keywords / aliases / regex / semanticHints / vectorHints;
- applicability;
- lifecycle;
- relations;
- delivery.

Library mostly renders entries read-only. Studio now has a generic nested value editor, but it does not understand Knowledge semantics.

**Impact**

Atria's richer Native Knowledge model is harder to author correctly than a simple lore editor.

**Acceptance**

Provide a KnowledgeEntry editor that understands every supported Native field, including create/delete/reorder, safe defaults, validation, relation selection and exact revision review. Keep Source/JSON only as an Advanced escape hatch.

---

---

## NUX-021 — KnowledgeBinding is not a first-class management object

**Current evidence**

KnowledgeBinding controls exact Knowledge revision, source kind, enabled state, augment/override mode, target, visibility and priority.

Current Library surfaces display binding/reference data but do not provide a full Binding manager.

**Impact**

Users cannot comfortably answer or edit: “which exact Knowledge revision applies where, to whom, with what authority?”

**Acceptance**

- Create/edit/delete bindings.
- Pick an exact Knowledge revision.
- Configure mode / target / visibility / priority.
- Show Used By / reference blockers.
- Support attach/detach/update without raw IDs.

---

---

## NUX-022 — WorldRevision composition is not productized

**Current evidence**

WorldRevision can contain schema, baseline, exact KnowledgeBinding IDs and Asset IDs. Library exposes history but not a semantic composition editor.

**Impact**

The World abstraction exists architecturally but is not usable as a complete authoring object.

**Acceptance**

A World editor must compose baseline/schema, Knowledge bindings and assets into a reviewed immutable revision, with dependency preview and exact references.

---

---

## NUX-023 — Revision UX is incomplete for World / Knowledge

**Current evidence**

Immutable revisions and history exist, but users do not get a complete workflow for:

- create revision from current;
- inspect semantic diff;
- fork from historical revision;
- understand dependency changes;
- safely select/promote exact versions where legal.

**Acceptance**

Expose revision actions without weakening exact pinning.

---

---

## NUX-024 — Used By / reference information is not consistently actionable

**Current evidence**

Resource Graph / reverse references exist. Studio Inspector and Prompt Library can display references, but rows generally become text rather than navigation/resolution actions.

**Acceptance**

Standardize reference rows with:

- human-readable owner;
- open/navigate;
- exact revision;
- detach/update/fork where legal;
- blockers before destructive actions.

---

---

## NUX-025 — Embedded Knowledge promotion still exposes internal identity instead of content intent

**Current evidence**

Play Timeline lists session-scoped Knowledge using raw `knowledgeBindingId` text.

“Save to my Library” asks only for a Knowledge Base name, then promotes the binding.

**Acceptance**

Show human-readable content/source summary, destination preview and structured naming/confirmation before promotion. Keep raw IDs behind Details.

---

---

## NUX-026 — Native Knowledge still projects through the old World Info ABI

**Current evidence**

`knowledgePlanToWorldInfoEntries()` converts Native KnowledgePlan entries into World Info-shaped records for the remaining downstream path.

Native Knowledge is already the authority; this is an adapter, not migration support.

**Impact**

New Native Knowledge semantics remain constrained by an old ABI and some fields are flattened/defaulted during projection.

**Acceptance**

Only after Native Knowledge feature parity is complete, replace downstream World Info-shaped consumption with a Native Knowledge interface and shrink the compatibility adapter. Do not make this cleanup block NUX-019–006.

---

---


# Group 6 — P1 — Studio / Skills / Prompt Authoring

**Group goal:** 让 Build / Studio 能通过当前 Atria authoring authority 完成核心资源制作，而不是依赖内部 JSON。

## NUX-027 — Native Skill scope model and the primary Skill Manager disagree

**Current evidence**

Native Skill authority uses scopes such as:

- `global`
- `project`
- `package`

Studio Agent consumes project/package Skills.

The primary `skill-manager-panel.js` still groups and formats compatibility-era scopes:

- `global`
- `preset`
- `orch-preset`
- `character`

Unknown Native scope kinds fall outside the first-class grouping model.

**Impact**

Native project/package Skills can affect product behavior while being difficult or impossible to manage through the main Skill UI.

**Acceptance**

The main Skill product surface must understand Native global/project/package scopes, origin, read-only Package ownership, project editing and movement rules. Compatibility scopes may remain under Advanced compatibility UI.

---

---

## NUX-028 — Studio still lacks domain-specific World / Knowledge / Skill authoring

**Current evidence**

Frontend redesign added a generic structured value editor with labelled fields and Source fallback.

However:

- World/Knowledge require semantic editors;
- Skills view edits package declarations through the generic value editor;
- relationship selection and Knowledge-specific constraints are not first-class.

**Acceptance**

Build domain-aware editors on top of existing ChangeSet authority. Generic fields/Source remain the fallback for unknown/plugin fields.

---

---

## NUX-029 — Build can create/open projects but has no user-facing project deletion

**Current evidence**

The redesign fixed project creation: Build now exposes New Project / Create Project and project cards can be opened normally.

Backend Product/Studio APIs already support project deletion, but neither the normal Build project list nor the project workspace exposes a first-class Delete Project action.

**Impact**

Users can create an unlimited number of test/abandoned projects but cannot remove them through the product UI.

**Acceptance**

- Expose a visible project lifecycle action from Build and/or project detail.
- Delete must use the existing project authority rather than direct filesystem removal.
- Require destructive confirmation.
- Respect current revision/conflict protection.
- Explain whether deletion removes project source only or any derived build artifacts.
- After deletion, return to the Build project list and refresh search/navigation state.

Archiving may be added later if useful, but it must not substitute for a real deletion path when deletion is safe.

---

---

## NUX-030 — Asset management remains minimal

**Current evidence**

Studio Assets can import and remove files. Rows mainly show logical name/path.

No first-class preview, metadata edit, rename/repath, replace, collision handling or Used By flow is exposed.

**Acceptance**

Add type-aware preview/details, safe replace/rename, collision feedback and dependency inspection before removal.

---

---

## NUX-031 — Source editor remains an advanced plain-text escape hatch without file-aware validation

**Current evidence**

Studio Source supports file selection, textarea editing, review and reload. It does not expose language/type diagnostics, staged textual diff before review or clear binary handling.

**Acceptance**

Keep Source as an advanced escape hatch, but add file-type awareness, read-only/binary protection, validation where available and clearer staged diff feedback.

---

---

## NUX-032 — Prompt advanced semantics are still authorable only through Advanced Resource JSON

**New finding in the post-redesign re-audit**

**Current evidence**

The redesigned Prompt editor productizes common authoring:

- Prompt Module target / stages / body / priority;
- Prompt Program stage/module composition;
- common Generation Profile controls.

However, Prompt condition/parameters and derived-program configuration are still surfaced mainly as read-only technical evidence in the simple editor. Editing those semantics requires switching to the full **Advanced editor** Resource JSON.

System provenance should remain read-only, but user-authored condition/parameter/derive behavior is part of Atria's first-class Prompt model.

**Impact**

Some of the most Atria-specific Prompt capabilities are technically available but remain developer-only in practice.

**Acceptance**

Provide structured authoring for user-controlled Prompt conditions, typed parameters and derive operations while preserving immutable exact revision semantics. Keep raw Resource JSON as the Advanced escape hatch and keep system provenance read-only.

**Evidence**

- `public/scripts/native/prompt-authoring.js`
- `src/native/model-prompt-runtime/contracts.js`

---

---


# Group 7 — P1 — Portable Resources / Work / Session Lifecycle

**Group goal:** 统一资源便携、PackageVersion、Session、Save 与引用冲突的产品闭环。

## NUX-033 — Prompt / Generation / World / Knowledge have no lightweight portable resource format

**Current evidence**

- Prompt Program / Module / Generation Profile are serializable exact resources.
- World / Knowledge have immutable exact revisions.
- Full `.atria` packages are self-contained but too heavy for sharing one reusable resource system.
- Plain one-object JSON can break exact dependencies.

**Acceptance**

Introduce one Atria **Resource Bundle** mechanism:

- root resource + exact dependency closure;
- preflight;
- conflict reporting;
- import as new identity/revision where legal;
- origin/provenance;
- no player Secrets.

It should cover Prompt, Generation, World, Knowledge and future plugin-defined resource types rather than inventing separate formats.

---

---

## NUX-034 — Package-scoped World / Knowledge reuse is weaker than Prompt reuse

**Current evidence**

Prompt resources from installed Packages appear as read-only package-scope resources and can be Forked to Library.

World/Knowledge Library primarily shows user Library identities. Package World/Knowledge content is usable by Work/runtime but lacks equivalent browse-original → fork-to-Library UX.

**Acceptance**

Unify package-origin behavior across reusable resource families: origin badge, exact revision, read-only original, Used By and Fork/copy-to-Library where supported.

---

---

## NUX-035 — Installed Work versions are visible but not actionable

**Current evidence**

Frontend redesign now displays **Installed versions**.

Backend `startWork()` accepts an explicit `packageVersionId`.

The Work UI's **Start New** still starts against the current version and does not expose “start from this installed version”.

**Acceptance**

Allow intentional session creation from an installed exact PackageVersion, clearly marking current/default and preventing accidental downgrade semantics.

---

---

## NUX-036 — Package update / permission review lacks change impact and post-install management

**Current evidence**

Install/update preflight shows required permission identifiers and capabilities.

The UI does not present:

- old → new version delta;
- newly added/removed permissions;
- existing-session pinning impact;
- human-readable permission explanations/rationale;
- a first-class post-install permission/grant management surface.

**Acceptance**

Update preflight must explain deltas and security impact. Work detail should show effective permission state and the supported revocation/update model. Existing Sessions remain pinned to their exact PackageVersion.

---

---

## NUX-037 — Save dependency recovery explains the problem but does not complete the recovery path

**Current evidence**

When a `.atriasave` requires a missing/mismatched exact Package, Play/Library explains that the matching Work must be installed first.

There is no direct “install/open matching Work” recovery action from the same flow.

**Acceptance**

Provide a direct recovery path into Package install/version resolution while preserving exact hash/version verification.

---

---

## NUX-038 — Native Sessions support displayTitle but cannot be named/renamed normally

**Current evidence**

Session contracts and `startWork()` support `displayTitle`.

Work/Play **Start New** does not ask for a title, and no normal rename/update endpoint/product action was found.

**Acceptance**

Allow optional naming at creation and rename later without changing Session identity, history or PackageVersion pin.

---

---

## NUX-039 — Play branch/revision history is still raw JSON

**Current evidence**

Timeline renders “Branches & revisions” by `JSON.stringify` into a `<pre>`.

**Acceptance**

Provide a readable branch/history model showing current branch, fork points and revision relationships. Raw payload stays under Details/Diagnostics.

---

---

## NUX-040 — Reference-safe failures do not consistently become resolution flows

**Current evidence**

Backend deletion/authoring guards can know exact blockers and the Resource Graph can resolve reverse references.

Product surfaces usually stop at “still referenced” / conflict text.

**Acceptance**

Convert blockers into navigable Used By rows and legal remediation actions instead of leaving the user at a dead end.

---

---


# Group 8 — P1 → P2 — Plugin Hard Cut

**Group goal:** 形成 Work Plugins / Global Plugins 的 Atria 插件模型，并在依赖迁移后物理退役其余 SillyTavern extension 产品。

## NUX-041 — Plugins still use the wrong product taxonomy

**Current evidence**

The current Plugins utility mixes two different systems:

1. **Native Plugins** projected from installed Work/Package manifests.
2. An **Advanced · Legacy extensions** area that embeds SillyTavern extension settings and exposes the Legacy Extension Manager / install flow.

The codebase also still contains many upstream-style built-in extensions under `public/scripts/extensions/`.

At the same time, Orchestrator and Memory are already first-class product capabilities under **Agents**:

- Agents → Orchestration
- Agents → Run
- Agents → Memory
- Agents → Diagnostics

They should not remain conceptually duplicated as plugins.

**Target product taxonomy**

### Work Plugins

Plugins shipped as part of an Atria Work / `.atria` Package.

Ownership and lifetime are tied to:

- Package;
- exact PackageVersion;
- declared capabilities;
- explicit permissions;
- Package Runtime.

These are not globally installed SillyTavern extensions.

### Global Plugins

User-level Atria capabilities independent of a Work.

For the current product direction, retain only:

- **Regex**
- **Search Tools**

as first-class Global Plugins.

### Not Plugins

The following are first-class Atria product domains/capabilities and must not appear as plugin products:

- Orchestrator / agent orchestration;
- Memory / Memory Graph.

They belong exclusively under **Agents**.

**Impact**

Keeping the old extension model makes Atria look like a themed SillyTavern extension host instead of an independent product. It also creates duplicate ownership and settings surfaces.

**Acceptance**

- Replace the current Native + Legacy extension product model with **Work Plugins / Global Plugins**.
- Work Plugins come only from installed Work/Package runtime declarations.
- Global Plugins initially contain only Regex and Search Tools.
- Remove Orchestrator and Memory from all plugin/extension management presentation; Agents is their sole product home.
- Remove the Legacy Extension Manager and embedded SillyTavern extension settings from the normal Atria Plugins domain.
- Do not allow legacy extension installation to remain a normal Atria product workflow.
- Plugin permissions/status/dependencies must be managed according to the new Work/Global ownership model.
- Keep opaque IDs and technical contribution payloads behind Details rather than as the primary identity.

---

---

## NUX-042 — Retire the remaining SillyTavern extension/plugin inventory from the Atria product line

**New user-directed hard-cut requirement**

**Current evidence**

`public/scripts/extensions/` still contains a broad upstream-style extension inventory, including examples such as:

- assets / attachments;
- caption;
- expressions;
- gallery;
- quick-reply;
- stable-diffusion;
- token-counter;
- translate;
- tts;
- vectors;
- connection-manager;
- completion/character assistant extensions;
- Orchestrator / Memory implementation modules;
- Regex;
- Search Tools;
- shared extension infrastructure.

Not every directory is safe to delete immediately: some are currently implementation dependencies for retained Atria capabilities. For example, Memory embedding/rerank still relies on Connection Manager today, and Orchestrator/Memory source currently lives under the historical `extensions/` tree even though their product ownership has moved to Agents.

**Required end state**

The Atria product should no longer carry a general SillyTavern built-in-extension catalog.

Retained plugin products are only:

- **Global Plugin: Regex**
- **Global Plugin: Search Tools**
- **Work Plugins:** Package-declared Native runtime plugins

Orchestrator and Memory remain retained functionality, but as Agents-owned Atria modules rather than plugin products.

All other extension products are to be retired from Atria.

**Implementation constraint**

“Delete all other plugins” is a **physical cleanup target**, not permission to blindly remove directories before dependency replacement.

For every candidate extension:

1. build an import/runtime dependency graph;
2. decide whether the functionality is:
   - obsolete and removable;
   - still required by an Atria core/domain and therefore must be migrated into that domain;
   - shared infrastructure that must be renamed/relocated before the old extension shell is removed;
3. remove its UI/settings/registration/product surface;
4. migrate any still-required data/config authority;
5. delete dead source, styles, templates, tests, docs and settings keys;
6. add residual guards so deleted extensions cannot silently return through upstream merges.

Examples of required dependency-first handling:

- Memory embedding/rerank must stop depending on Connection Manager before Connection Manager can be removed.
- Orchestrator/Memory implementation may be relocated out of the legacy extension hierarchy only after imports/tests are updated; their functionality is retained under Agents.
- Game/runtime/shared support code that happens to live under `extensions/` must not be deleted merely because of its directory name; migrate retained core functionality to Atria-owned modules first.

**Acceptance**

- Normal Atria has no Legacy Extension Manager.
- No general third-party SillyTavern extension install flow is exposed.
- Regex and Search Tools are the only first-party Global Plugins.
- Package-declared Work Plugins are isolated from Global Plugins.
- Orchestrator and Memory appear only under Agents.
- Every other retired extension has no active registration, settings UI, persisted authority or reachable product route.
- Dead extension code is physically removed after dependency migration.
- Architecture/residual tests enforce the retained-plugin allowlist.

**Evidence**

- `public/scripts/atria-shell/utility-workspaces.js`
- `public/scripts/extensions/`
- `public/scripts/atria-shell/workspace-host.js`
- `tests/e2e/atria-shell/07-plugins-settings.e2e.js`

---

---


# Group 9 — P1 — Search / Localization / Final Closure

**Group goal:** 最后统一补全全局发现能力与产品汉化，并清理此次任务留下的死入口/死文案。

## NUX-043 — Global Search coverage and completeness signaling are incomplete

**Current evidence**

Product Search indexes Works, Worlds, Knowledge Bases, Build Projects, Runtime configuration and Prompt/Generation resources.

It does not index several major user entities, including Sessions, SavePoints, Skills, individual Knowledge entries and orchestration configurations.

Search refresh uses `Promise.allSettled`; failed authorities can disappear from the result set while the UI still looks complete.

**Acceptance**

Define supported global-search domains, include major navigable user entities, and show a lightweight “some results unavailable” state with retry/details when a source fails.

---

---

## NUX-044 — Atria product localization remains incomplete

**New finding / user-confirmed after frontend redesign**

**Current evidence**

The redesign added substantial zh-CN / zh-TW coverage, but Native product controllers still contain user-facing English that is either:

- not routed through localization at all;
- constructed dynamically before `translateShellText()`, so no stable locale key can match it;
- technical labels/diagnostics that remain English in normal product surfaces.

Examples include dynamic Runtime readiness/fallback summaries and multiple Native authoring/help/error strings.

**Impact**

Switching Atria to Chinese still produces mixed Chinese/English interfaces across Runtime, Library, Studio, Play, Plugins and error/recovery states.

**Acceptance**

- Audit every current Atria-owned product surface for untranslated user-facing text.
- Replace concatenated translation lookups with stable keyed/formatted localization.
- Complete zh-CN and zh-TW coverage for normal, loading, empty, validation, error and recovery states.
- Keep user-authored names, provider/model identifiers, paths and code literals untranslated.
- Add automated coverage that catches newly introduced Atria-owned hard-coded UI strings where practical.

**Evidence**

- `public/scripts/atria-shell/localization.js`
- `public/locales/zh-cn.json`
- `public/locales/zh-tw.json`
- `public/scripts/native/runtime-workspace.js`
- `public/scripts/native/library-workspaces.js`
- `public/scripts/native/studio-workspace.js`
- `public/scripts/native/play-controls.js`

---

---

# 5. Final completion criteria

The task is complete only when:

- every active `NUX-xxx` above has been implemented and removed from this file;
- each Group has passed its focused/adjacent regression before push;
- final lint, frontend build and required browser E2E pass;
- Native backup/restore/storage-migration data integrity is verified;
- Plugins follow the final Work Plugins / Global Plugins boundary;
- Global Plugins retain only Regex and Search Tools;
- Orchestrator and Memory are Agents-owned product capabilities, not plugin products;
- no new compatibility layer exists solely for old SillyTavern user-data migration;
- current Atria-owned product UI has complete intended localization coverage;
- final handoff records the branch/HEAD and validation evidence.

## 6. Re-audit basis

This backlog was verified against the frontend-redesign-integrated baseline:

`main@ad15c1e0c3e15e625ba163e284a300c00811f10d`

Before implementing any issue, current remote `main` remains authoritative if it has advanced since this audit.
