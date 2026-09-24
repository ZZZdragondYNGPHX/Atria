# Atria Native Product UX / Capability Backlog

> Status: re-audited and normalized after the Product Frontend Redesign was fully integrated.
>
> Task branch: `fix/native-product-ux-audit`
>
> Verified baseline: `main@ad15c1e0c3e15e625ba163e284a300c00811f10d`
>
> Frontend redesign integration: `Integrate Atria Product Frontend Redesign Phases 2–8`
>
> Scope: current Atria-native product capability, authoring, runtime, portability, lifecycle and recovery gaps.
>
> Explicit exclusion: legacy SillyTavern/Luker → Native import, conversion or migration work. This backlog assumes a Native-only product even if no legacy data is ever imported.

## 1. Purpose

The frontend redesign is complete and materially improves the presentation, responsive behavior, error states, navigation, accessibility, Studio shell and cross-product consistency. This document is no longer a visual-redesign punch list.

The remaining items are primarily **capability and workflow gaps**: Native authorities already exist in backend contracts, repositories or runtime, but the product cannot fully create, edit, route, validate, share, recover or manage them through first-class Atria workflows.

This file is the formal problem backlog for the later implementation task. Do not implement it piecemeal from this audit branch. Before implementation, turn the confirmed items into a phased plan against the then-current `main`.

## 2. Audit result after frontend redesign

### Resolved by the redesign and removed from the active backlog

- **Build project creation dead end:** resolved. Build now exposes **New Project → Create Project** and uses the Native Studio client.
- **Installed Work versions were invisible:** resolved at the visibility level. Work detail now shows **Installed versions**. A remaining capability gap is recorded below because those versions are not actionable for starting a new session.
- **Studio was raw-JSON-only for generic structured values:** partially resolved. `studio-value-editor.js` now provides labelled nested fields with a lossless Source fallback. The remaining issue is semantic/domain-specific authoring, not “no structured editor at all”.
- **Library visual hierarchy / state / confirmation / responsive issues:** substantially resolved by Phase 4 and should not be duplicated here.
- **Runtime compact/dialog/error presentation:** substantially resolved by Phase 5. Remaining Runtime items below are configuration capabilities and workflow semantics.
- **Play import/save presentation and general interaction hardening:** substantially resolved by Phase 3/8. Remaining Play items below are data/lifecycle capabilities.

### Still-valid architectural boundaries

- Exact immutable revisions remain authoritative for versioned resources.
- Package originals remain read-only.
- Connection / Model / Secret remain player-owned.
- Studio writes remain ChangeSet / Review / Apply.
- Native Session and exact PackageVersion remain durable runtime authorities.
- Legacy preset / World Info paths must not regain Native authority.

## 3. Priority

- **P0 — Native capability gap / regression:** a first-class Native workflow is incomplete, misleading, or functionally weaker than the model it replaced.
- **P1 — Productization gap:** the core authority works, but authoring, lifecycle, portability, discoverability or recovery is incomplete.
- **P2 — Convergence debt:** compatibility-era concepts remain after the Native replacement exists; remove only after the Native path has equivalent capability.

---

# P0 — Native capability gaps

## NUX-001 — World / Knowledge Library cannot author immutable revisions

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

## NUX-002 — KnowledgeEntry lacks a semantic first-class editor

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

## NUX-003 — KnowledgeBinding is not a first-class management object

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

## NUX-004 — WorldRevision composition is not productized

**Current evidence**

WorldRevision can contain schema, baseline, exact KnowledgeBinding IDs and Asset IDs. Library exposes history but not a semantic composition editor.

**Impact**

The World abstraction exists architecturally but is not usable as a complete authoring object.

**Acceptance**

A World editor must compose baseline/schema, Knowledge bindings and assets into a reviewed immutable revision, with dependency preview and exact references.

---

## NUX-005 — Native Knowledge applicability fields do not have complete runtime semantics

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

## NUX-006 — Native Knowledge validation is broader than runtime behavior

**Current evidence**

Examples:

- `KnowledgeEntry.delivery.position` accepts arbitrary text; runtime effectively treats only `before` and `after`, defaulting unknown values to `before`.
- `KnowledgeBinding.target` accepts generic JSON; runtime target matching recognizes a narrow narrator/actor/agent/user-style selector shape.

**Impact**

Invalid or unsupported values can pass authoring validation and silently change behavior later.

**Acceptance**

Contract, editor and runtime must share the same typed enum/selector definitions. Unsupported values fail before commit with field-level errors.

---

## NUX-007 — Native Orchestrator loses per-agent / per-stage route selection

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

## NUX-008 — Native Memory loses task-specific route selection

**Current evidence**

Memory distinguishes recall, extraction, request/schema assistance and RAG rewrite settings, but Native calls funnel through:

`executeFirstPartyGeneration(context, 'memory', ...)`

without task-specific `nativeRouteRef` in the inspected flow.

**Impact**

Cheap query rewrite, strong structured extraction and other memory jobs cannot intentionally use different Native model/prompt/generation routes.

**Acceptance**

Memory tasks must select explicit Native routes/subroles while preserving one Native authority model. Legacy preset names remain compatibility-only.

---

## NUX-009 — Native generation provider support is materially incomplete

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

## NUX-010 — Native Skill scope model and the primary Skill Manager disagree

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

## NUX-011 — Runtime Connection setup requires an opaque Secret ID

**Current evidence**

Runtime Connections require a free-text **Exact Secret ID** and warn users not to paste the secret value.

No Native picker / Secret inventory / create-secret action is exposed from the Connection editor.

**Impact**

A user can know their API key and endpoint and still be unable to finish Native Runtime setup without discovering an internal identifier elsewhere.

**Acceptance**

Provide a first-party Secret selection/create flow that returns an exact Secret reference without exposing secret material in the Connection document.

---

## NUX-039 — Memory embedding / rerank provider ownership remains outside Native Runtime

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

## NUX-043 — User backup / restore is not Native-data complete

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

Therefore a normal downloadable ZIP backup in FS mode can omit:

- Native Packages / PackageVersions / Package state;
- Native Sessions, branches, revisions, timelines, SavePoints and state;
- Native Worlds / WorldRevisions;
- Native Knowledge / KnowledgeEntries / KnowledgeBindings;
- Native Prompt / Generation resources;
- player Runtime Routes / Models / Connections;
- other Native `native_resources`;
- Studio Projects and their source files.

Native asset/package blobs under `assets/atria-native/blobs` happen to travel with the old `assets` category, but their Native refs/metadata may not.

### SQLite / MySQL / PostgreSQL modes

Database backup dumps do contain `native_resources` (SQLite database bytes, or the SQL engines' `native_resources` table).

However normal restore deliberately stages database-backed archives and copies selected data through `MigrationRunner`. That runner currently knows only legacy repo families:

- settings;
- presets;
- namedDocs;
- worlds (World Info);
- chats;
- groups;
- stats.

It does not migrate Native resource kinds.

Studio `projects/` is also filesystem data and is absent from the current selectable backup target set in every storage mode.

### Test coverage gap

`tests/storage/endpoints/backup-roundtrip.parity.test.js` claims to round-trip “every Repo”, but its seeded/probed repos cover only the legacy Storage repos. It does not verify Native PackageRepo, SessionRepo, SavePointRepo, WorldRepo, KnowledgeRepo, Native Model/Prompt persistence, ProjectStore or Native asset/package blob integrity.

**Impact**

A user can create a backup that appears successful, wipe/lose data, restore it successfully, and still lose major Atria-native product state.

This is a data-safety issue, not merely a missing convenience feature.

**Acceptance**

- Define first-class backup categories/closure for current Atria Native data.
- Full backup must include every durable per-user Native authority and Studio Project source.
- Selective backup/restore semantics must be explicit and consistent across FS/SQLite/MySQL/Postgres.
- Engine dump restore/migration must preserve selected Native resources rather than discarding them.
- Native asset/package blobs and their refs must restore atomically enough to avoid dangling metadata.
- Add end-to-end backup -> wipe -> restore coverage for all major Native repositories plus ProjectStore and AssetStore.
- Verify same-engine and cross-engine restore.
- Keep pre-restore recovery snapshots/rollback safety; those currently snapshot the whole user root and are stronger than the downloadable category archive.

**Evidence**

- `src/users.js`
- `src/constants.js`
- `src/storage/engines/fs-engine-transaction.js`
- `src/storage/engines/mysql-engine.js`
- `src/storage/engines/postgres-engine.js`
- `src/storage/migration/cross-mode-restore.js`
- `src/storage/migration/runner.js`
- `src/storage/migration/selection-mapping.js`
- `src/native/project-store.js`
- `src/native/repositories/asset-store.js`
- `tests/storage/endpoints/backup-roundtrip.parity.test.js`

---

# P1 — Productization, lifecycle and portability

## NUX-012 — Runtime cannot pull provider model choices and lacks connection validation

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

## NUX-013 — Runtime profiles and routes lack lifecycle cleanup

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

## NUX-014 — Generation Profiles have two competing product homes

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

## NUX-015 — Runtime fallback editor offers invalid route choices

**Current evidence**

Fallbacks must use the same role. The editor explains this but populates “Add fallback route” from every other route.

The backend rejects mismatched roles later.

**Acceptance**

Only same-role routes are selectable. Changing a route's role must revalidate or clear incompatible fallback refs before save.

---

## NUX-016 — Runtime Diagnostics requires raw Project ID / revision

**Current evidence**

When no Native Session owns context, Diagnostics asks users to type Project ID and Project revision manually.

Build already owns a project/revision inventory.

**Acceptance**

Use a project + exact revision picker backed by Build authority. Keep raw IDs only in Advanced/debug mode.

---

## NUX-017 — First-time Native Runtime setup has no dependency-guided readiness flow

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

## NUX-018 — Prompt / Generation / World / Knowledge have no lightweight portable resource format

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

## NUX-019 — Package-scoped World / Knowledge reuse is weaker than Prompt reuse

**Current evidence**

Prompt resources from installed Packages appear as read-only package-scope resources and can be Forked to Library.

World/Knowledge Library primarily shows user Library identities. Package World/Knowledge content is usable by Work/runtime but lacks equivalent browse-original → fork-to-Library UX.

**Acceptance**

Unify package-origin behavior across reusable resource families: origin badge, exact revision, read-only original, Used By and Fork/copy-to-Library where supported.

---

## NUX-020 — Studio still lacks domain-specific World / Knowledge / Skill authoring

**Current evidence**

Frontend redesign added a generic structured value editor with labelled fields and Source fallback.

However:

- World/Knowledge require semantic editors;
- Skills view edits package declarations through the generic value editor;
- relationship selection and Knowledge-specific constraints are not first-class.

**Acceptance**

Build domain-aware editors on top of existing ChangeSet authority. Generic fields/Source remain the fallback for unknown/plugin fields.

---

## NUX-040 — Prompt advanced semantics are still authorable only through Advanced Resource JSON

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

## NUX-021 — Revision UX is incomplete for World / Knowledge

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

## NUX-022 — semanticHints / vectorHints are accepted but have no discovered Native retrieval consumer

**Current evidence**

The fields exist in the Native Knowledge contract and tests. Repository audit found no Native Knowledge selection path consuming them.

**Impact**

Authors can reasonably assume a configured semantic/vector hint affects retrieval when it may currently be inert metadata.

**Acceptance**

Either implement documented semantic/vector retrieval behavior or mark/reject these fields until supported.

---

## NUX-023 — Used By / reference information is not consistently actionable

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

## NUX-024 — Build exposes project creation but not normal project deletion/archive

**Current evidence**

The redesign fixed project creation. Backend Product/Studio APIs support deletion, but the normal Build project list does not expose a delete/archive lifecycle action.

**Acceptance**

Provide safe project deletion/archive with revision protection and confirmation.

---

## NUX-025 — Asset management remains minimal

**Current evidence**

Studio Assets can import and remove files. Rows mainly show logical name/path.

No first-class preview, metadata edit, rename/repath, replace, collision handling or Used By flow is exposed.

**Acceptance**

Add type-aware preview/details, safe replace/rename, collision feedback and dependency inspection before removal.

---

## NUX-026 — Source editor remains an advanced plain-text escape hatch without file-aware validation

**Current evidence**

Studio Source supports file selection, textarea editing, review and reload. It does not expose language/type diagnostics, staged textual diff before review or clear binary handling.

**Acceptance**

Keep Source as an advanced escape hatch, but add file-type awareness, read-only/binary protection, validation where available and clearer staged diff feedback.

---

## NUX-027 — Installed Work versions are visible but not actionable

**Current evidence**

Frontend redesign now displays **Installed versions**.

Backend `startWork()` accepts an explicit `packageVersionId`.

The Work UI's **Start New** still starts against the current version and does not expose “start from this installed version”.

**Acceptance**

Allow intentional session creation from an installed exact PackageVersion, clearly marking current/default and preventing accidental downgrade semantics.

---

## NUX-028 — Package update / permission review lacks change impact and post-install management

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

## NUX-029 — Save dependency recovery explains the problem but does not complete the recovery path

**Current evidence**

When a `.atriasave` requires a missing/mismatched exact Package, Play/Library explains that the matching Work must be installed first.

There is no direct “install/open matching Work” recovery action from the same flow.

**Acceptance**

Provide a direct recovery path into Package install/version resolution while preserving exact hash/version verification.

---

## NUX-030 — Native Sessions support displayTitle but cannot be named/renamed normally

**Current evidence**

Session contracts and `startWork()` support `displayTitle`.

Work/Play **Start New** does not ask for a title, and no normal rename/update endpoint/product action was found.

**Acceptance**

Allow optional naming at creation and rename later without changing Session identity, history or PackageVersion pin.

---

## NUX-031 — Embedded Knowledge promotion still exposes internal identity instead of content intent

**Current evidence**

Play Timeline lists session-scoped Knowledge using raw `knowledgeBindingId` text.

“Save to my Library” asks only for a Knowledge Base name, then promotes the binding.

**Acceptance**

Show human-readable content/source summary, destination preview and structured naming/confirmation before promotion. Keep raw IDs behind Details.

---

## NUX-032 — Play branch/revision history is still raw JSON

**Current evidence**

Timeline renders “Branches & revisions” by `JSON.stringify` into a `<pre>`.

**Acceptance**

Provide a readable branch/history model showing current branch, fork points and revision relationships. Raw payload stays under Details/Diagnostics.

---

## NUX-033 — Native Plugin surface is mainly diagnostic, not management

**Current evidence**

Native Plugin cards display pluginId, Package, capability strings and contribution payload details.

The page states that each Work manages plugin permissions, but no first-class activation/permission/dependency management action is exposed from the Native Plugin surface.

**Acceptance**

Either make Plugins the management owner or deep-link to the actual permission/activation owner. Show human-facing name/description/origin/status/dependencies before internal IDs.

---

## NUX-034 — Global Search coverage and completeness signaling are incomplete

**Current evidence**

Product Search indexes Works, Worlds, Knowledge Bases, Build Projects, Runtime configuration and Prompt/Generation resources.

It does not index several major user entities, including Sessions, SavePoints, Skills, individual Knowledge entries and orchestration configurations.

Search refresh uses `Promise.allSettled`; failed authorities can disappear from the result set while the UI still looks complete.

**Acceptance**

Define supported global-search domains, include major navigable user entities, and show a lightweight “some results unavailable” state with retry/details when a source fails.

---

## NUX-035 — Native Product errors lose actionable context at the UI boundary

**Current evidence**

`product-client.js` preserves `error.code` and `error.details` but constructs a generic message such as:

`Native Product request failed (409)`

Many UI callers show `error.message`.

Library maps a few cases to generic conflict/reference strings, but field/blocker details are not consistently surfaced.

**Acceptance**

Map known error codes to actionable product messages and preserve sanitized field/reference details end-to-end.

---

## NUX-036 — Reference-safe failures do not consistently become resolution flows

**Current evidence**

Backend deletion/authoring guards can know exact blockers and the Resource Graph can resolve reverse references.

Product surfaces usually stop at “still referenced” / conflict text.

**Acceptance**

Convert blockers into navigable Used By rows and legal remediation actions instead of leaving the user at a dead end.

---

## NUX-041 — Atria product localization remains incomplete

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

## NUX-042 — Per-user filesystem layout was not normalized for the Native product model

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

# P2 — Native convergence debt

## NUX-037 — Orchestrator and Memory still persist compatibility-era preset names

**Current evidence**

Native execution no longer needs legacy preset authority, but settings/persistence still contain fields such as:

- `apiPresetName`
- `promptPresetName`
- `llmPresetName`

The Orchestrator workspace continues to author/display these compatibility concepts even while Native generation collapses their selector into Runtime authority.

**Acceptance**

After NUX-007/008 provide equivalent Native routing, Native-facing schemas/UI should store Runtime route/subrole concepts. Keep legacy preset fields only in explicit non-Native compatibility islands.

---

## NUX-038 — Native Knowledge still projects through the old World Info ABI

**Current evidence**

`knowledgePlanToWorldInfoEntries()` converts Native KnowledgePlan entries into World Info-shaped records for the remaining downstream path.

Native Knowledge is already the authority; this is an adapter, not migration support.

**Impact**

New Native Knowledge semantics remain constrained by an old ABI and some fields are flattened/defaulted during projection.

**Acceptance**

Only after Native Knowledge feature parity is complete, replace downstream World Info-shaped consumption with a Native Knowledge interface and shrink the compatibility adapter. Do not make this cleanup block NUX-001–006.

---

# 4. Suggested implementation workstreams

This backlog should not be implemented as 38 unrelated fixes. Normalize it into these workstreams when development starts:

1. **World / Knowledge Authoring**
   - NUX-001–006
   - NUX-019–023
   - NUX-031
   - NUX-038 last

2. **Native Runtime / Provider**
   - NUX-009
   - NUX-011–017
   - NUX-035

3. **Agent / Memory Native Routing**
   - NUX-007–008
   - NUX-039
   - NUX-037 after route/provider parity

4. **Prompt / Portable Native Resources**
   - NUX-018–019
   - NUX-040
   - shared conflict/preflight infrastructure with NUX-036

5. **Studio / Build Lifecycle**
   - NUX-020
   - NUX-024–026
   - NUX-035–036

6. **Work / Session / Plugin Product Lifecycle**
   - NUX-027–033
   - NUX-035–036

7. **Skills / Search / Localization**
   - NUX-010
   - NUX-034
   - NUX-041

8. **User Data / Backup Integrity**
   - NUX-042–043

## 5. Implementation order constraints

- Fix Native routing before removing compatibility preset fields.
- Complete Native Knowledge semantics before removing the World Info projection adapter.
- Build one Resource Bundle infrastructure rather than separate Prompt/World/Knowledge import formats.
- Do not bundle player Connections, Models or Secrets with portable authoring resources.
- Preserve exact revisions and immutable PackageVersion / Session pins.
- Keep Studio ChangeSet/Review/Apply as the only human/project write authority.
- Do not reintroduce “latest by name” lookups.
- Provider expansion must remain capability-driven and fail closed.

## 6. Validation expectations for the future implementation task

Each workstream should include:

- focused unit tests for contracts/services;
- browser tests for the real user workflow;
- reference/conflict tests;
- compact/medium/expanded UI acceptance where the workflow is interactive;
- keyboard/focus/error recovery;
- existing P0–P8 / A0–A9 / N0–N10 architecture guards as applicable;
- full root lint and frontend build before final integration.

Android/Termux physical validation is required only where a changed workflow materially depends on WebView/IME/device behavior.

## 7. Re-audit notes

This document was re-verified after the frontend redesign integrated into:

`main@ad15c1e0c3e15e625ba163e284a300c00811f10d`

The redesign intentionally did not change routing, persistence or runtime authority, so many pre-redesign capability findings remained valid. Items whose product behavior materially changed were removed or rewritten rather than mechanically carried forward.
