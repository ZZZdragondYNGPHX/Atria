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
