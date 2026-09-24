# Atria Native Product UX Gaps Audit

> Status: problem inventory only. No implementation is authorized on this branch yet.
>
> Branch: `fix/native-product-ux-audit`
>
> Baseline: `main@402b53a98a823573591db4e9fd015f98e6effbdb`
>
> Scope rule: this document intentionally excludes legacy-to-Native migration/conversion work. It records current Atria-native product, authoring, runtime, portability, and UX gaps that should still exist even if no legacy data is ever imported.

## Purpose

Atria's Native architecture is substantially ahead of its current product affordances. Prompt/Runtime and World/Knowledge both have explicit ownership, immutable revisions, dependency closure, Package integration, and Native runtime authority, but several user-facing workflows still expose only partial CRUD, raw JSON, compatibility-era configuration names, or a single generalized route where a specialized workflow needs multiple routes.

This audit is a holding document. It should be re-verified and normalized after the active frontend redesign branch is fully integrated. Do not implement against screenshots or UI structure that may be replaced by that redesign without first rebasing/re-auditing.

## Current Native resource model

### Model / Prompt / Runtime

- Connection Profile — player-owned provider endpoint / Secret reference.
- Model Profile — player-owned model identity, limits and capabilities.
- Generation Profile — immutable exact revision containing generation controls.
- Prompt Module — immutable reusable prompt unit with semantic target, stages, conditions and parameters.
- Prompt Program — immutable staged composition of exact Prompt Module revisions; supports derive operations.
- Runtime Route — binds role + Model + Connection + exact Generation Profile + exact Prompt Program, including retry/fallback policy.

### World / Knowledge

- World — stable Library identity.
- WorldRevision — immutable world snapshot metadata, baseline/schema, exact KnowledgeBinding IDs and Asset IDs.
- KnowledgeBase — stable Library identity.
- KnowledgeRevision — immutable ordered set of KnowledgeEntry IDs.
- KnowledgeEntry — content plus discovery, applicability, lifecycle, relations and delivery metadata.
- KnowledgeBinding — exact Knowledge revision attachment with source ownership, augment/override mode, target, visibility and priority.

## Priority definitions

- **P0** — Native product capability is missing, materially regressed, misleading, or difficult to use without internal/raw APIs.
- **P1** — Core flow exists but productization, portability, consistency or authoring UX is incomplete.
- **P2** — Cleanup / convergence work that should follow the functional UX closure.

---

# P0 — Functional product gaps

## UX-001 — World / Knowledge Library can create identities but cannot author first-class revisions

**Observed**

The Native Product API exposes Library-level create/read/rename/delete for Worlds and Knowledge Bases:

- `POST /worlds`
- `PUT /worlds/:worldId`
- `POST /knowledge`
- `PUT /knowledge/:knowledgeBaseId`

Creation produces stable identities whose `currentRevisionId` may be null.

The actual content authorities already exist lower down:

- `WorldRepo.commitRevision()`
- `KnowledgeRepo.commitRevision()`
- `KnowledgeRepo.saveBinding()`

But the normal Product API / Library workspace does not expose corresponding authoring operations.

**User impact**

A user can create an empty World or Knowledge Base in Library and then has no ordinary Library flow to create its first usable revision/content.

**Required product outcome**

Library authoring must support creating a first revision and subsequent revisions without requiring repository internals, tests, raw storage calls, or manually constructing project source.

---

## UX-002 — KnowledgeEntry lacks a first-class structured authoring experience

**Observed**

The Native Knowledge contract already distinguishes:

- content;
- discovery: keywords / aliases / regex / semantic hints / vector hints;
- applicability;
- lifecycle;
- relations;
- delivery.

Library detail currently displays entries but does not provide a complete create/edit/delete/reorder workflow.

Studio project-owned Knowledge is edited through a generic JSON textarea.

**User impact**

The richest Native replacement for a lore/world entry is harder to author than the old flat editor despite having a better model.

**Required product outcome**

KnowledgeEntry needs a structured editor with safe controls for every supported field, entry creation/deletion/reorder, validation feedback, and revision-aware save/review.

---

## UX-003 — KnowledgeBinding is architecture-critical but not a first-class product object

**Observed**

KnowledgeBinding controls:

- exact source revision;
- source scope;
- enabled state;
- `augment` / `override`;
- target;
- visibility;
- priority.

Bindings also connect Worlds, EntryPoints, sessions and Library Knowledge.

Library currently mainly lists binding data/references. It does not expose a complete Binding manager.

**User impact**

Users cannot easily answer or edit the most important runtime question: “where does this exact Knowledge revision apply, to whom, with what authority?”

**Required product outcome**

Provide first-class Binding create/edit/delete, Used By, exact revision selection, conflict/reference feedback, and attachment workflows.

---

## UX-004 — WorldRevision lacks first-class composition UX

**Observed**

A WorldRevision can carry:

- schema;
- baseline;
- KnowledgeBinding IDs;
- Asset IDs;
- metadata.

Library exposes revision history, but not a complete “create new revision” composition editor.

**User impact**

The World abstraction exists architecturally but users cannot comfortably compose a World from Knowledge and assets.

**Required product outcome**

World editor should make exact Knowledge bindings/assets visible and editable, create immutable revisions explicitly, and preview the resulting dependency set.

---

## UX-005 — Native Orchestrator collapses specialized agent routing into the generalized orchestrator role

**Observed**

Compatibility-era Orchestrator profiles still model per-agent routing with fields such as:

- `apiPresetName`
- `promptPresetName`
- global/fallback prompt/API selections.

Native execution funnels first-party orchestration through `executeFirstPartyGeneration(..., 'orchestrator')`.

The current Native selection UI tells users to configure Runtime routes and does not expose equivalent per-agent exact Native route selection. No normal per-agent `nativeRouteRef` path is surfaced in the inspected runtime flow.

**User impact**

Multiple agents that previously could intentionally use different model/prompt/generation configurations can converge onto the same `role.orchestrator` primary route.

**Required product outcome**

Preserve specialized routing in Native form. Per-agent/per-stage route selection must reference explicit Native Runtime routes or an equally strict Native routing abstraction rather than legacy preset names.

---

## UX-006 — Native Memory collapses distinct LLM jobs into the generalized memory role

**Observed**

Memory currently distinguishes several tasks/settings, including recall, extraction, schema/request assistance, and RAG query rewrite. Compatibility settings still contain separate API/prompt selections.

Native calls funnel through `executeFirstPartyGeneration(..., 'memory')`, while normal Native UI no longer offers the old selectors.

**User impact**

Workloads with different cost/capability needs can be forced through one `role.memory` route.

Examples:

- cheap/fast query rewrite;
- strong structured extraction;
- recall planner with tool calling;
- schema/authoring assistance.

**Required product outcome**

Native Memory must preserve task-specific routing, using exact Runtime route references or explicit subroles with clear product configuration.

---

## UX-007 — Native Knowledge applicability contract/runtime semantics are incomplete

**Observed**

The Native contract includes `applicability.stateConditions`, `stateEvents`, and `stateActivation`.

In `knowledge-runtime.js`, inspected selection logic evaluates `stateConditions` with a hard-coded `all` aggregation. The Native contract does not expose an explicit aggregation mode.

The inspected Native KnowledgePlan compilation path does not visibly evaluate `stateEvents` as part of candidate eligibility.

**User impact**

Native authoring exposes concepts whose runtime semantics are either fixed, incomplete, or not expressible with enough precision.

**Required product outcome**

Define and validate complete Native applicability semantics. Authoring controls and runtime behavior must share one contract, including condition aggregation and event semantics.

---

## UX-008 — Contract validation permits values that runtime silently narrows

**Observed examples**

- `KnowledgeEntry.delivery.position` accepts arbitrary text at contract level, while the runtime projection recognizes effectively `before` / `after` and defaults unknown values.
- `KnowledgeBinding.target` accepts generic JSON while runtime matching expects narrator/actor/agent/user-style selectors.

**User impact**

Invalid or unsupported authoring values can survive validation and then silently behave differently at runtime.

**Required product outcome**

Fail early. Supported Native authoring values should be typed/validated by contracts and editor controls; unsupported values should not silently degrade.

---

# P1 — Productization and portability gaps

## UX-009 — Prompt Module / Prompt Program / Generation Profile lack lightweight Import / Export

**Observed**

The resources are already JSON-serializable and have structured/advanced editors, exact revisions, Fork, and Program Derive.

There is no normal per-resource portable Import/Export UX comparable to the maturity of `.atria` Package and `.atriasave`.

**User impact**

Sharing one Prompt system or Generation profile requires manual JSON handling or packaging a much larger Work.

**Required product outcome**

Support explicit portable resource sharing without weakening exact identity/revision guarantees.

---

## UX-010 — World / Knowledge lack lightweight portable Import / Export

**Observed**

`.atria` is an effective full Work/package distribution format, but Library Worlds and Knowledge Bases have no equivalent lightweight portable resource action.

**User impact**

Sharing a reusable setting, lore corpus, ruleset or World independently of a full game package is awkward.

**Required product outcome**

World/Knowledge portability should follow the same resource mechanism as Prompt/Generation rather than inventing an unrelated format.

---

## UX-011 — A unified Native Resource Bundle layer is missing

**Observed**

A single Prompt Program can depend on exact Prompt Modules. A World depends on exact KnowledgeBindings/assets. A useful Knowledge share may need an exact revision plus entries/bindings.

Plain single-object JSON export is therefore insufficient because it can create broken references.

**Required product outcome**

Introduce one Native Resource Bundle concept capable of exporting a root resource plus its exact dependency closure, preflighting imports, reporting conflicts, and offering explicit conflict choices.

Candidate use cases:

- one Prompt Module;
- Prompt Program + dependent Modules;
- Generation Profile;
- Knowledge Base revision + entries/bindings;
- World revision + bindings/assets;
- future plugin-defined resources.

Do not include player Secrets in portable bundles.

---

## UX-012 — Package-scoped resource browsing/forking is inconsistent across resource families

**Observed**

Prompt resources loaded from installed Packages are visible as read-only package-scope resources and can be Forked to Library.

World/Knowledge package content is available to a Work/runtime, but the Library Worlds & Knowledge experience does not provide an equivalent obvious “browse package original → fork to my Library” flow.

**User impact**

Users learn two different mental models for otherwise similar immutable package resources.

**Required product outcome**

Unify Package-origin treatment across Prompt, World, Knowledge, Skills/assets where appropriate: origin badge, read-only original, Used By, Fork/copy-to-Library, exact revision information.

---

## UX-013 — Studio World / Knowledge editing is raw-JSON-heavy

**Observed**

Studio exposes Worlds and Knowledge as project resource views, but project-owned items use a generic JSON textarea through the collection editor.

Attach/Fork/Update from Library is stronger and revision-aware, but content authoring itself remains low-level.

**User impact**

A user can build sophisticated Native resources only by understanding internal JSON shapes.

**Required product outcome**

Provide structured World, KnowledgeEntry and Binding authoring in Studio, with raw JSON retained only as an Advanced view.

---

## UX-014 — Revision UX is incomplete across World / Knowledge

**Observed**

Immutable revision repositories and revision history already exist. The product shows revision IDs/history but does not provide a coherent revision workflow such as:

- create revision from current;
- compare revisions;
- inspect dependency changes;
- explicitly promote/select a revision where allowed;
- fork from historical revision;
- understand Used By before destructive actions.

**User impact**

The architecture's strongest safety feature—exact immutable revisions—is exposed as IDs rather than a usable versioning workflow.

---

## UX-015 — `semanticHints` / `vectorHints` are authorable contract fields without an obvious Native runtime consumer

**Observed**

These fields exist in the Native Knowledge contract and tests. Repository search did not identify a clear Native Knowledge runtime path consuming them for semantic/vector selection.

**User impact**

Authors may reasonably assume these settings affect retrieval when they may currently be inert metadata.

**Required product outcome**

Either wire them to a documented retrieval capability, or clearly mark them reserved/unsupported and prevent misleading authoring UI.

---

## UX-016 — Native resource “Used By” and dependency visualization should be consistently actionable

**Observed**

The resource graph and reverse references exist, and several screens expose Used By/reference data. Presentation and follow-through differ between Prompt resources, World/Knowledge, Project dependencies and Package content.

**User impact**

Users can see that something is referenced but may not be able to navigate to, update, detach, fork, or resolve the reference from the same workflow.

**Required product outcome**

Standardize dependency cards: origin, exact revision, Used By, Open owner, Attach/Detach/Update/Fork where legal, and conflict explanation.

---

# P2 — Native convergence / cleanup

## UX-017 — Orchestrator and Memory product schemas still expose compatibility-era preset naming

**Observed**

Native runtime authority no longer relies on old prompt preset selection in mounted Native product flows, yet Orchestrator and Memory persistence/settings still contain names such as `apiPresetName`, `promptPresetName`, and `llmPresetName`.

**User impact**

The product model is harder to understand and future code can accidentally reintroduce name-based compatibility authority.

**Required product outcome**

Once task-specific Native routing is complete, Native-facing settings should use Runtime route/subrole concepts. Compatibility names should remain isolated to explicitly non-Native paths only.

---

# Cross-cutting constraints for eventual implementation

1. Do not reintroduce name/latest lookup where exact revisions are already authoritative.
2. Package originals remain read-only; edits create an independent Library/Project resource.
3. Connections, Models and Secrets remain player-owned and must not leak into portable authoring bundles.
4. Project writes continue through ChangeSet / Review / Apply rather than bypassing Studio authority.
5. Native Session state remains the authority for durable game state; Prompt/Knowledge metadata must not become a parallel state store.
6. New UX must preserve desktop/mobile accessibility and the active frontend redesign's navigation/sheet/dock patterns.
7. No implementation should begin from this baseline branch until the frontend redesign is integrated and this audit is rebased/re-verified.

# Re-audit checkpoint

Before implementation:

- rebase or recreate this task from the then-current `main`;
- inspect the fully integrated frontend redesign;
- re-verify every item against current code and real UI;
- merge duplicates with redesign follow-ups;
- convert confirmed issues into a normalized implementation plan with explicit phases and acceptance tests.


---

# Second-pass cross-product UX audit

This pass intentionally focuses on interaction and capability gaps that are unlikely to disappear merely through visual restyling. Findings are against `main@402b53a98a823573591db4e9fd015f98e6effbdb`; the active frontend redesign branch is still in progress, so presentation-only findings must be rechecked after integration.

## P0 — Setup and lifecycle dead ends

### UX-018 — Runtime Connections require users to manually type an internal Secret ID

**Observed**

The Native Connection editor asks for an `Exact Secret ID` as a required free-text field and warns users not to paste the actual key.

There is no picker for existing Secrets, no visible Secret inventory, and no direct action from the Connection editor to create/manage a Secret.

**User impact**

The primary “connect a model provider” flow assumes knowledge of an internal identifier that ordinary users should not need to discover manually. A user can know their API key and endpoint and still be unable to finish the Native Connection form.

**Required product outcome**

Connection setup should select an existing Secret or open a first-party Secret-management/create flow while preserving the existing rule that the credential value never enters the Connection document.

---

### UX-019 — Runtime has no connection test or model discovery path

**Observed**

Native Connection/Model setup requires manual entry of:

- endpoint URL;
- remote model ID;
- context/output limits;
- tokenizer;
- capability overrides.

No `Test connection`, provider health check, or model-list discovery action is exposed in the inspected Native Runtime workspace.

**User impact**

Configuration errors are discovered late, often only when a Route preview/execute fails. Users must already know provider model IDs and capability details.

**Required product outcome**

Provide non-destructive connection validation and, where a provider supports it, model discovery/capability inspection. Manual entry must remain available for OpenAI-compatible/custom providers.

---

### UX-020 — Runtime configuration lacks basic lifecycle management

**Observed**

The Native Runtime UI supports New/Edit for Routes, Models and Connections, but no Delete/Archive/Duplicate action is exposed. Corresponding Native persistence APIs inspected here also do not expose delete methods for those player-owned profiles.

Prompt/Generation resources similarly have registry-level `delete` capability and delete-safety inspection infrastructure, but the user-facing Prompt Library does not surface cleanup/archive/delete actions.

**User impact**

Mistakes, obsolete models, dead connections, abandoned routes and old prompt resources accumulate indefinitely. Users can create replacements but cannot keep their inventory clean through normal product flows.

**Required product outcome**

Define reference-safe lifecycle semantics for mutable Runtime profiles and versioned Library resources: delete where safe, block with Used By details where referenced, and provide archive/hide when physical deletion is intentionally disallowed.

---

### UX-021 — Build has an explicit project-creation dead end

**Observed**

The Build project list empty state says:

> “Create a Native project to enter Atria Studio.”

The backend and clients already expose project creation, but the inspected Build/Studio list UI provides no Create Project action.

**User impact**

A brand-new user can navigate to Build and reach a dead end despite the underlying create capability existing.

**Required product outcome**

Provide first-class project creation from Build, with sane Native defaults and optional template/blank choices. Creation must go through the existing ProjectStore/Studio authority.

---

### UX-022 — Project deletion exists in backend APIs but is not exposed in normal Studio lifecycle UX

**Observed**

Product and Studio services expose project deletion, but the inspected Build project list/detail surface does not expose a corresponding delete/archive action.

**User impact**

Test projects and abandoned work cannot be cleaned up without calling internal APIs.

**Required product outcome**

Add safe project lifecycle management with destructive confirmation and revision/conflict protection.

---

### UX-023 — Native Skill scope authority and the visible Skill Manager disagree

**Observed**

Native authoring explicitly defines Skill scopes as:

- `global`
- `project`
- `package`

The Native Studio Agent can list/read project/package-scoped Skills.

However, the Skill Manager embedded in Library still formats/groups only compatibility-era scopes:

- `global`
- `preset`
- `orch-preset`
- `character`

Unknown scope kinds produce empty/unknown keys and are not treated as first-class groups.

**User impact**

Native project/package Skills can participate in Native behavior while being undiscoverable or unmanageable from the main Skills Library UI.

**Required product outcome**

The primary Atria Skill surface must natively understand global/project/package scope, origin, read-only Package ownership, and project editing. Compatibility scopes may remain in an Advanced compatibility area but must not define the Native product model.

---

## P1 — Runtime configuration usability

### UX-024 — Generation Profiles have duplicate product homes and ambiguous ownership

**Observed**

Architecture documentation states that Library owns Prompt/Generation discovery/authoring while Runtime owns Connections/Models/Routes.

The product currently exposes:

- Library → Generation Profiles; and
- Runtime → Profiles.

Runtime `profiles` writes the same `core.generation-profile` Library resource family.

**User impact**

Users can reasonably ask whether “Profiles” and “Generation Profiles” are different concepts, where a profile should be edited, and which screen owns revision history.

**Required product outcome**

Choose one canonical product home for Generation Profiles. Runtime Routes may link into the selected exact Library revision, but should not present a competing ownership surface unless the distinction is made explicit.

---

### UX-025 — Runtime fallback-route authoring allows choices that are known to be invalid

**Observed**

A Runtime Route's fallback list must contain same-role routes. The editor notice explains this, but the “Add fallback route” selector is populated from all other routes rather than same-role routes only.

The server later rejects mismatched fallback roles.

**User impact**

The UI invites a configuration that it already knows cannot be saved.

**Required product outcome**

Filter candidates by role and proactively revalidate/clear incompatible fallbacks when the route's role changes.

---

### UX-026 — Runtime Diagnostics asks users to type raw Project ID and exact revision

**Observed**

When no Native game is open, Runtime Diagnostics asks for free-text:

- Project ID
- Project revision

even though Build/Studio already has a project inventory and exact revision authority.

**User impact**

A diagnostic tool intended to explain configuration instead requires users to copy opaque internal identifiers.

**Required product outcome**

Offer a project/revision picker using existing Build authorities, with raw ID entry reserved for Advanced/debug use.

---

### UX-027 — First-time Native Runtime setup has no guided readiness flow

**Observed**

To get from zero configuration to a working generation Route, a user may need to establish, in dependency order:

1. Secret;
2. Connection;
3. Model;
4. Prompt Program/Modules;
5. Generation Profile;
6. Runtime Route.

Current empty states are individual (“Create a route”, “Manage models”, etc.) rather than a coherent readiness/checklist flow.

**User impact**

Users can enter the setup graph in the wrong place and repeatedly encounter missing prerequisites.

**Required product outcome**

Provide a guided setup/readiness view that explains missing dependencies and deep-links to the next actionable step without creating a second configuration authority.

---

## P1 — Build / Studio authoring UX

### UX-028 — Studio Skills authoring is still raw package JSON rather than the Native Skill platform

**Observed**

Studio's `Skills` view edits `source.package.skills` through a generic JSON textarea, while the actual Native Skill platform has explicit project/package scopes and the Project Agent can consume those Skills through `/api/skills`.

**User impact**

Human authors and the Project Agent interact with different-feeling Skill workflows. The most important project-scoped know-how cannot be managed through the same first-class editor used elsewhere.

**Required product outcome**

Integrate project/package Skill inventory and editing directly into Studio using the existing Skill authority, with Package scope read-only where appropriate.

---

### UX-029 — Asset authoring is functional but lacks basic asset-management affordances

**Observed**

Studio Assets supports importing and removing project-owned files. Rows are essentially `logicalName · path`.

No normal preview, metadata edit, rename/repath, replacement, type-specific inspection, or filename-collision guidance is exposed in the inspected surface.

**User impact**

Once a project grows beyond a few files, identifying and maintaining media assets becomes unnecessarily low-level.

**Required product outcome**

Provide asset preview/details, safe replace/rename where supported, clear path/collision handling, and Used By/navigation before removal.

---

### UX-030 — Source editor is an undifferentiated text fallback

**Observed**

Studio Source lists files and provides a plain textarea with “Review Source Change”.

There is no visible language/type detection, syntax diagnostics, structured diff before staging, or explicit binary/non-text affordance in the inspected editor.

**User impact**

Advanced users can edit source, but mistakes are caught only later by broader project validation and the experience does not scale to serious authoring.

**Required product outcome**

Keep Source as an advanced escape hatch, but add file type awareness, validation where available, and clear staged diff/review feedback.

---

## P1 — Work / Package lifecycle UX

### UX-031 — Installed Package version history exists but is effectively hidden

**Observed**

`NativeProductService.getWork()` returns all installed Package versions, and `startWork()` accepts an explicit `packageVersionId`.

The Work detail UI shows only the current version and starts new sessions against it. The returned version history is not exposed as a normal user choice.

**User impact**

Exact Package versioning is an important Native safety property, but users cannot inspect version history, compare installed versions, or intentionally start a new session on an older installed version.

**Required product outcome**

Expose installed version history and exact version identity, with clear current/default status and deliberate “start with this version” where safe.

---

### UX-032 — Package update/install preflight lacks user-facing change impact

**Observed**

Install preflight surfaces package metadata and required permission identifiers, then installs/updates the exact Package.

The inspected UI does not summarize changes relative to an already-installed current version: permissions added/removed, version transition, capabilities changed, or existing-session impact.

**User impact**

“Install / Update” asks for trust without clearly explaining what changed.

**Required product outcome**

When updating an installed Package, show old → new version, permission delta, major capability/content changes when available, and clarify that existing sessions remain pinned to their exact PackageVersion.

---

### UX-033 — Package permission grants are raw capability identifiers without explanations

**Observed**

The install surface renders checkboxes using raw permission strings such as:

- `network`
- `world-write`
- `runtime-tools`
- `clipboard`
- `asset-access`

No first-party explanation of what each permission allows or why the Package requests it is shown in the inspected flow.

**User impact**

Users must approve security-sensitive capabilities without meaningful context.

**Required product outcome**

Provide human-readable permission descriptions, risk/impact explanations, and package-declared rationale where supported. Keep explicit grant semantics.

---

### UX-034 — Save dependency recovery is informative but not actionable enough

**Observed**

When importing a `.atriasave` whose exact Package dependency is missing/mismatched, the UI explains that the exact `.atria` Package must be installed first.

The flow does not provide an integrated action to open Package installation or search installed versions from the same recovery card.

**User impact**

The user understands the problem but must manually leave the import workflow, find the install surface, then return and repeat the import.

**Required product outcome**

Add direct recovery actions that navigate to/install the required exact Package while preserving hash/version verification.

---

## P1 — Session and Play organization

### UX-035 — Native Sessions have a title field but no normal naming/rename workflow

**Observed**

Native Session contracts support `displayTitle`, and `startWork()` accepts one.

The Work UI starts sessions without asking for a title, and there is no inspected update/rename endpoint or product action.

Untitled sessions fall back to generic labels such as “Game progress”.

**User impact**

Users with multiple runs of the same Work cannot meaningfully distinguish them.

**Required product outcome**

Allow naming at start and renaming later without changing Session identity/history.

---

### UX-036 — Embedded Knowledge promotion exposes internal Binding IDs and a browser prompt

**Observed**

Play's “Embedded Knowledge” list displays raw `knowledgeBindingId` values. “Save to my Library” asks for a Knowledge Base name through `globalThis.prompt()`.

**User impact**

A high-value workflow—turning session knowledge into reusable Library knowledge—is represented through internal IDs and a primitive modal with no preview of what will be saved.

**Required product outcome**

Show human-readable source/content summary, target Library result, and a structured confirmation/naming surface before promotion.

---

### UX-037 — Branch/revision history is exposed as raw JSON rather than a navigable history model

**Observed**

The Play Timeline drawer renders “Branches & revisions” as `JSON.stringify(...)` inside a `<pre>`.

**User impact**

Users cannot understand branch lineage, current branch, fork points or revision relationships without reading internal data structures.

**Required product outcome**

Provide a readable timeline/branch graph or hierarchical history view with clear current state and allowed actions. Raw JSON may remain under Diagnostics.

---

## P1 — Plugins and security UX

### UX-038 — Native Plugins are shown as a read-only projection with no actionable management path

**Observed**

Plugins utility lists Native Package Runtime plugins, their capabilities and contribution counts, then explicitly says activation/permissions are owned by the A5 Plugin Platform.

The inspected Native Plugins surface provides no action to open that owning permission/activation context.

**User impact**

The screen tells users that important controls exist elsewhere but does not let them reach or understand them.

**Required product outcome**

Either make Plugins the first-class management surface or provide explicit navigation to the actual owner for permission state, activation status, dependencies and contribution details.

---

### UX-039 — Native Plugin cards expose identifiers more readily than user-facing identity

**Observed**

Native Plugin cards title themselves with `pluginId` and summarize version/package/capability identifiers. No richer display name/description/dependency state is exposed in the inspected projection.

**User impact**

Package plugin inspection feels like developer diagnostics rather than a product surface.

**Required product outcome**

Show human-facing metadata where available, origin Package, status, permissions, dependencies and contribution categories; keep opaque IDs in details.

---

## P1 — Search and discoverability

### UX-040 — Global “Search Atria” does not search several major user-owned entities

**Observed**

Product Search currently indexes:

- Works;
- Worlds;
- Knowledge Bases;
- Build Projects;
- Runtime Routes/Models/Connections;
- Prompt Programs/Modules/Generation Profiles.

It does not currently index major user-owned entities such as:

- Native Sessions / game progress;
- SavePoints;
- Skills;
- individual Knowledge entries;
- Agent/orchestration configurations.

**User impact**

A global product search can locate technical configuration resources but not some of the things users are most likely to remember by name/content.

**Required product outcome**

Define the intended global search coverage and include major navigable user entities, with sensible grouping and privacy/performance bounds.

---

### UX-041 — Product Search can silently become incomplete

**Observed**

Search refresh uses `Promise.allSettled`. Failed resource sources are omitted while other results continue to render. Failures are primarily logged to console.

**User impact**

The user can receive a plausible-looking but incomplete search result set without any indication that one domain failed to load.

**Required product outcome**

Surface a lightweight “some results unavailable” state with retry/details when one or more authorities fail.

---

## P1 — Error and validation UX

### UX-042 — Native Product client discards useful human-readable error context

**Observed**

Native Product endpoints return an error code and optional details, while the browser client constructs a generic message:

> `Native Product request failed (<status>)`

Many UI surfaces then show `error.message`, not a mapped product explanation.

Native Generation configuration endpoints also collapse broad validation failures into generic codes such as `native_generation_configuration_invalid`.

**User impact**

Users often learn that an operation failed without learning which field/reference/permission caused it or how to fix it.

**Required product outcome**

Preserve sanitized structured validation information end-to-end and map known codes to actionable field-level messages/remediation links.

---

### UX-043 — Destructive/reference conflicts are not consistently converted into resolution flows

**Observed**

World/Knowledge/Work deletion can fail because resources are referenced. Backend services often know blockers or reference details, and the Resource Graph can inspect reverse references.

Product UI generally reports a failure panel rather than turning the blocker set into navigable “Used By / open / detach or update” actions.

**User impact**

Reference safety works technically but leaves users stuck when they try to clean up resources.

**Required product outcome**

Standardize conflict resolution UI across resource families using the existing graph/reference evidence.

---

# Audit areas checked in this pass

This second pass inspected current-main behavior across:

- Native Runtime workspace and generation configuration API;
- Native Product Library / Work / Session / Save controls;
- Native World / Knowledge contracts and repositories;
- Prompt/Generation Library authoring;
- Build / Studio project list, resource editing, assets, source and Library relations;
- Native Skill scope contracts, Studio Agent Skill consumption and current Skill Manager;
- Native/compatibility Plugins utility;
- Product Search / Command projection;
- Native Product client/error propagation.

## Items intentionally not logged here

- visual styling, spacing, typography, layout polish or responsive presentation already inside the active frontend redesign;
- login/onboarding visual redesign already in that project scope;
- legacy-format import/conversion/migration requirements;
- removal of compatibility ABI solely for architectural purity;
- speculative features with no current product authority or user workflow.

