# Atria Native Authoring Platform & Product Frontend Refactor

## Status

Design is frozen. Implementation has not started.

- Product baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- Native Content & Session Architecture N0–N10 is complete and must not be redone.
- This refactor is a hard cutover, not a compatibility upgrade.

## Objective

Turn Atria from a SillyTavern-derived product with a modern shell plus legacy authoring/runtime surfaces into a coherent independent product with:

- a Native Build domain and full-project Atria Studio;
- a reusable Library asset system;
- Native Text / Component / Hybrid / Full experience authoring and runtime;
- World / Knowledge as first-class game assets;
- a formal Plugin / Skill split;
- one shared authoring operation layer for human editing and Project Agent vibe coding;
- an Atria-native product frontend for Play, Library, Build, Agents, Runtime and major utilities;
- a hard removal path for CardApp Studio, `game.json`, charId package identity, swipe-derived game branches and chat-state world authority.

The operating rule is:

> Default to removal. Any legacy surface or authority must justify why it is still required. Mature implementation ideas may be migrated; legacy product authority is not preserved for compatibility.

## Existing Native baseline that remains authoritative

Do not replace or duplicate these authorities:

- Package / PackageVersion / EntryPoint
- World / WorldRevision
- KnowledgeBase / KnowledgeRevision / KnowledgeEntry / KnowledgeBinding
- ProjectStore
- Session / Branch
- immutable TimelineEntry + birth Variant
- SessionRevision
- SavePoint / `.atriasave`
- SessionRevision-backed runtime / derived state
- bounded ContextPlan with provenance
- AssetStore content-addressed immutable asset refs

Existing SillyTavern machinery may remain only where it is still needed as internal runtime ABI. It must not re-emerge as Native product identity, persistence authority or final Atria product UI.

---

## Frozen product information architecture

Primary domains:

1. **Play** — play installed works and active Native Sessions.
2. **Library** — reusable works and authoring assets.
3. **Build** — projects and Atria Studio.
4. **Agents** — orchestration, runs, memory and agent diagnostics.
5. **Runtime** — roles, connections, presets and model/runtime capabilities.

Global utilities:

- Search / Command
- Diagnostics
- Plugins
- Settings
- Account

`Studio` is no longer a primary domain. **Build** is the primary authoring domain; **Atria Studio** is the project workspace opened from Build.

No separate Home primary domain is required. Play without an active Session acts as launcher/continue/start surface.

---

## Experience model

A Native project explicitly declares one of four first-class experience modes:

- **Text**
- **Component**
- **Hybrid**
- **Full**

This must be explicit in the Native authoring/runtime contract (for example `experience.mode`), rather than inferred from the presence or absence of legacy UI fields.

### Text

- Uses Atria-native Conversation / Composer.
- May still use Actors, Worlds, Knowledge, Logic, Memory, Agents, Skills, Plugins and Assets.
- Is not a reduced or compatibility mode.

### Component

- Atria Play remains the main host.
- Project components mount into semantic surfaces such as app root, chat header/footer, composer before/after, sidebars, drawer and modal.

### Hybrid

- Package owns the main stage composition while reusing Atria-native capabilities/components such as Conversation and Composer.

### Full

- Package owns the Play stage visually.
- Full visual ownership does not grant host authority.
- Atria retains recovery controls such as exit, stop, save/diagnostics as appropriate.

### Shared component model

Component / Hybrid / Full must share one component model. Do not create three UI engines.

A component resource should be able to describe at least:

- id / type
- props
- bindings
- actions
- visibility
- responsive behavior
- children

The modes differ primarily in host composition, surface availability and stage ownership.

---

## Structured UI and source boundary

Atria Studio provides a visual UI builder for **Atria Structured UI**.

The first-class editor views are:

- Design
- Structure
- Bindings
- Source

The visual builder only promises lossless round-tripping for the structured Atria component model.

Arbitrary HTML/JS/source is not required to round-trip through the visual designer. Advanced source implementations must be represented as explicit custom components with declared properties/capabilities where needed.

Do not build a general arbitrary-HTML visual designer.

---

## World / Knowledge / “worldbook” model

World and Knowledge are core game assets inside Build and Library.

Product terminology may expose a friendly **World & Knowledge / 世界与知识** workspace, while Native authority remains:

- World / WorldRevision
- KnowledgeBase / KnowledgeRevision
- KnowledgeEntry
- KnowledgeBinding

Do not restore legacy World Info filename, numeric uid, selected-world-info or character-lore identity as Native authority.

World/Knowledge authoring must support project ownership and exact Library attachment, and should eventually expose:

- entry search/edit
- binding/activation inspection
- context/activation test
- reference graph
- revision comparison
- token/provenance diagnostics

---

## Library asset model

Library becomes the reusable asset repository for the product.

Target categories include:

- Works
- Actors
- Worlds
- Knowledge
- UI Components
- Skills
- Plugins
- Presets
- Processors
- Templates
- Images / Audio / Video / Fonts / other media

This is a product-level taxonomy; it does not imply one database table or one dedicated repository per type.

### Project–Library relationships

Keep the author-facing model small:

- **Attach** — project pins an exact immutable Library revision/content hash.
- **Fork** — create an independent project-owned derivative while retaining origin provenance.
- **Create / Import** — create project-owned resources.
- **Publish to Library** — publish reusable project-owned assets when supported.

Never use `Library latest` as a build input. Updates are explicit Compare → Update / Keep.

### Build closure

Normal release `.atria` packages are self-contained. Library references are authoring-time relationships. Build resolves exact immutable dependency closure into the package.

Host-only development tools are excluded. Allowed package runtime contributions are included according to the Plugin contract.

---

## Resource Registry and Resource Graph

Create a formal **Resource Registry** that allows Atria Core and Plugins to register authoring resource types and their schemas/editors/validators/generators.

Plugin-defined authoring resources may include domain concepts such as:

- rpg.item
- rpg.quest
- gal.route
- strategy.country
- strategy.province

### Authority rule

The **Resource Graph is derived only**.

It may provide:

- search
- references / Used By
- dependency graph
- delete safety
- build closure
- AI retrieval
- project indexing

It must never become a second project manifest or writable authority. Canonical project/native/plugin sources remain authoritative. Authoring Operations mutate those sources, then the graph is incrementally updated.

Core Native authority remains closed: Plugins cannot create competing Session, Timeline, Package, World-state or persistence authorities.

---

## Authoring backend

Build must use a dedicated Native authoring boundary rather than extending the thin Native Product consumer API.

Target architecture:

```text
ProjectStore / AssetStore / WorldRepo / KnowledgeRepo
Package builder / Preview / Git / Runtime compiler
                      ↑
                 StudioService
                      ↑
             /api/native/studio/*
                      ↑
       Studio UI / Project Agent / Plugins
```

StudioService / related authoring services should support, as appropriate by phase:

- Project CRUD
- source read/write/move/delete/list
- batch/transactional authoring operations
- resource CRUD through operation registry
- asset import/bind
- dependency inspection
- validation / diagnostics
- diff / ChangeSet
- history / commit / rollback
- simulation
- preview
- build / preflight / build report

No Native Studio endpoint may use Character/card filename identity.

---

## Authoring Operations, Workspace and ChangeSet

Human structured editors, source editors, Project Agent and eligible Plugin authoring contributions share the same mutation infrastructure.

```text
Human UI ─┐
          ├─> Authoring Operations -> Workspace -> ChangeSet -> Validate -> Commit
AI Tools ─┘
```

The AI must not have a privileged or separate write path.

### Concurrency

Each operation/change set is based on an explicit project revision.

- If base revision still matches: apply normally.
- If the project advanced and operations can be proven non-conflicting: replay safely.
- If conflict is possible: stop at a ChangeSet conflict/review boundary.

Do not silently rebase AI work over human edits.

### History

ChangeSet/Task history is semantic development history, not a second source-history authority.

Project revision/Git remains source history. Tasks/ChangeSets record intent, operations, validation results and resulting commit/revision references.

---

## Project Agent / Vibe Coding

Replace the old “AI chat beside code” model with a Project-level agent.

Primary model:

```text
Intent
 -> Plan
 -> Authoring Workspace
 -> Operations
 -> ChangeSet
 -> Validate
 -> Simulate / Preview
 -> Review
 -> Commit
```

The AI UI centers on:

- Task
- Plan
- Progress
- Changes
- Diagnostics
- Conversation

Conversation is supportive, not the primary state model.

Project Agent uses Resource Registry/Operation schemas to discover domain tools. Low-level source operations are fallback tools, not the default authoring model.

Relevant Skills provide know-how; Plugins/resources provide capabilities.

A bounded automatic repair loop may validate/fix/simulate/preview, but must have a repair-round limit and review gates for high-impact changes.

Atria Studio must remain fully functional without AI.

---

## Plugin and Skill split

### Plugin

Executable/system capability and contribution model.

Potential contribution surfaces include:

- Build resource types/editors/panels
- asset importers
- validators
- generators
- component palette items
- Play components/inspectors/commands
- authoring operation/tool schemas

### Skill

AI knowledge, workflow and guidance.

Skills may contain supporting files/examples/scripts as data, but a Skill does not gain arbitrary host execution authority merely by containing scripts.

Target Native-oriented scopes include at least:

- global
- project
- package

Character scope is not part of the new Native authoring identity.

### Host Plugin vs Package runtime contribution

Use one plugin ecosystem with distinct trust/execution identities:

- **Host Plugin** — explicitly installed developer/user extension; may execute code under the new Atria Plugin API.
- **Package Runtime contribution** — package-scoped capability included with a work.

### Package runtime v1 safety rule

Package runtime v1 must **not execute arbitrary package JavaScript**.

Initial package contributions are controlled/declarative and capability-defined: schemas, commands, rules, reducers, selectors, components, validators and other host-validated definitions.

Do not treat an ordinary Web Worker as a secure sandbox.

A truly programmable package-plugin sandbox (for example an isolated QuickJS/WASM-like runtime with explicit capability bridge) is deferred to a separate future design.

Legacy SillyTavern extensions may temporarily remain as compatibility/host internals but are not the new Atria Plugin standard.

---

## Game Runtime hard cutover

The existing mature Game Runtime contains valuable algorithms but its old authoring/loading/persistence authority must not survive.

### Retain/migrate useful capabilities

- formula/compiler/evaluator
- command registry and validation
- reducers
- rules engine
- deterministic RNG
- interpretation mapping
- selector model
- simulation traces
- intent/event interpretation principles
- narrative/turn concepts where compatible
- surface host ideas
- native component mounting
- full-stage ownership/recovery

### Retire old authorities

- `game.json` as package/runtime authority
- charId Game Package identity
- `/api/card-app/*` package resource loading
- swipe-id-derived game branch paths
- Chat State `atri_game_world` persistence authority
- independent Game World branch/timeline authority

### Native runtime relationship

```text
Native Package
 -> Runtime Descriptor compiler
 -> Runtime Descriptor
 -> Game Runtime
 -> Native Session / Branch / SessionRevision
```

Game domain events/reducers may project world state, but Native Session/SessionRevision determines the authoritative revision/branch. Game Journal must not become a parallel Session timeline authority.

---

## CardApp / legacy Studio hard cutover

After migrated capabilities have replacements, remove:

- `public/scripts/extensions/character-editor-assistant/studio/*`
- CardApp Studio product entrypoints
- `src/endpoints/card-app.js`
- `/api/card-app/*`
- charId Studio identity
- Character sidecar Studio/AI session identity
- old CardApp Git/history/diff API
- old CardApp `.atria` build/import path
- legacy Studio AI tool names
- CardApp as a fifth Native experience mode

Do not keep compatibility aliases.

CardApp and old Studio are implementation sources, not compatibility targets.

---

## Product frontend architecture

The refactor must finish the product-level separation from SillyTavern, not merely add a new Build UI.

### Atria Product UI System

All official product surfaces use one Atria design system:

- semantic `--atri-*` tokens
- shared primitives/patterns
- consistent navigation, inspector, responsive behavior and interaction rules

Do not allow Agents or other first-party domains to maintain independent visual token systems long-term.

SmartTheme becomes at most a legacy theme input adapter. New Atria product UI must not directly depend on SmartTheme variables as its product contract.

Avoid “everything is a card”. Add proper productivity primitives such as:

- Page/PageHeader/SubNavigation
- ResourceTree/ResourceList/ResourceInspector
- DataTable
- EditorHost/EditorTabs/PropertyPanel
- ActivityPanel / Problems / Output
- Task / Plan / ChangeSet views
- Tree / Menu / ContextMenu / Dialog
- ResourcePicker / AssetPicker
- PreviewHost / Canvas / ComponentPalette / StructureTree
- Permission/Dependency/Reference views

### Responsive model

Keep Expanded / Medium / Compact as product layouts, not merely CSS scaling.

- Expanded: navigation + main workspace + persistent contextual inspector where appropriate.
- Medium: rail + main workspace; inspector becomes transient.
- Compact: current-view/drill-down model with bottom navigation or workspace tabs.

Build mobile must not compress desktop resource tree + editor + inspector + AI + console into one screen. Use separate Project / Editor / Preview / AI / More views.

---

## Frontend domain targets

### Play

Replace the final user-facing dependence on reparented SillyTavern chat DOM with Atria-native:

- Conversation
- Message Renderer
- Composer
- Session Header
- Play Toolbar

The SillyTavern generation/prompt machinery may remain temporarily as internal ABI where still required.

Text/Component/Hybrid/Full must all use the Native package/session model.

### Library

Upgrade from a few tabs into a master-detail asset browser with categories, search/filter/sort, resource list/grid and Inspector.

World/Knowledge get dedicated editing/testing/ref graph/revision surfaces.

### Build

Build landing page manages projects/templates/recent builds/tasks.

Opening a project launches Atria Studio with, on desktop:

- Resource Tree
- Editor Host
- Inspector
- Activity Panel
- AI / Changes
- Preview/Run/Build controls

Project resources include at least:

- Overview
- Experience
- Actors
- EntryPoints
- Worlds
- Knowledge
- Game Logic
- UI
- Assets
- Memory
- Agents/Orchestration
- Skills
- Plugins
- Presets/Processors/Localization/Permissions as supported
- Test/Simulation
- Preview
- Build
- Source

### Agents

Remove the nested second “Atria Workspace shell”. Reuse the main Atria Product UI System and main shell.

Keep/migrate mature orchestration, run graph/timeline, memory and diagnostics capabilities.

### Runtime

Productize:

- Overview
- Roles
- Connections
- Presets
- Capabilities

### Plugins

New Atria Plugins UI:

- Installed
- Import/available source
- Permissions
- Development
- Legacy

Legacy extension compatibility is Advanced/Legacy, never the primary Plugins experience.

### Skills

Primary reusable Skills management lives under Library; project-attached/project-owned Skills are managed in Build.

### Settings

Main product settings become Atria-native:

- General
- Appearance
- Language
- Accessibility
- Interaction
- Storage
- Advanced

Do not retain reparented `user-settings-block` as the final official Settings page.

Runtime/Plugin/Project-specific settings remain in their owning domains.

### Account

Use an Atria-native product surface for primary profile/data/backups/sync/storage/security workflows while reusing backend services where appropriate.

### Diagnostics

Unify diagnostics into a formal utility surface:

- Overview
- Incidents
- Runtime
- Build
- Plugins
- Storage
- Network
- Logs

### Navigation/search rule

Global Search/Command may find resources and functions across domains, but selecting a result must navigate to the target's authoritative route. Do not render a foreign domain's feature inside the caller's current page.

---

## Scope exclusions / deferred work

Explicitly out of scope for this refactor:

- migration of old CardApp/game.json/legacy Studio project data
- compatibility aliases for removed Native authoring APIs
- arbitrary-JS package plugins
- full online/community Plugin marketplace
- real-time multi-user collaborative project editing
- cloud IDE/Codespaces replacement
- Photoshop/DAW/video-editor-class media editing
- arbitrary HTML ↔ visual designer round-tripping
- making every Library asset type a dedicated Native repository
- rewriting already-correct lower-level AI/orchestration algorithms without architectural need

Low-frequency legacy compatibility controls may temporarily remain behind an Advanced/Legacy boundary when backend replacement would explode unrelated scope, but they must not define new product architecture.

---

## Implementation phases

The implementation uses one long-lived temporary refactor branch and stops after every phase for documentation/handoff and validation.

### A0 — Contracts & Hard-cutover Guards

Define/freeze:

- Experience contract
- Resource descriptors / registry contracts
- Authoring Operation / Workspace / ChangeSet contracts
- project revision/conflict contracts
- Runtime Descriptor contract
- Atria Plugin contracts and package-runtime v1 restrictions
- Native Skill scope contract
- residual guards against reintroducing retired authorities

No broad UI implementation yet.

### A1 — Native Authoring Backend

Implement the project-authoring backend boundary:

- StudioService / Native Studio HTTP surface
- project source CRUD
- transactional/batch operation path
- workspace / ChangeSet plumbing
- validation/diagnostic hooks
- Git/history integration on ProjectStore directory
- build/preview/simulation seams

### A2 — Library & Resource Architecture

Implement:

- Resource Registry
- incrementally derived Resource Graph
- Library immutable snapshot/ref model where needed
- Attach / Fork / explicit update
- World/Knowledge authoring integration
- dependency/reference/build-closure support

### A3 — Native Game Runtime Cutover

Highest-risk authority migration:

- retire `game.json` runtime authority
- retire charId resource loading
- compile Native Runtime Descriptor
- connect world/game logic to Native Session/Branch/SessionRevision
- remove swipe-derived game world branching
- remove Chat State game-world authority
- complete Text experience end-to-end first

### A4 — Experience Runtime

Implement/migrate:

- shared Component Model
- Component surfaces
- Hybrid stage composition/native slots
- Full stage ownership/recovery
- structured UI runtime
- Native Preview integration for all four modes

### A5 — Plugin & Skill Platform

Implement:

- Atria Plugin manifest/API
- contribution registry
- Host Plugin boundary
- declarative/capability package-runtime v1
- permission/dependency model
- Native Skill scopes
- Build/Play contribution integration

### A6 — Native Product Frontend

Unify/refactor product surfaces and design system:

- primary navigation Studio -> Build
- Play native shell/conversation/composer migration
- Library master-detail browser
- Build landing shell
- Agents integration into main design system
- Runtime
- Plugins
- Settings
- Account
- Diagnostics
- responsive/mobile product patterns

### A7 — Studio Authoring UX

Implement the full project workspace:

- Resource Tree
- structured resource editors
- World/Knowledge authoring
- UI Builder
- Source editor
- Asset management
- Simulation
- Preview
- Build/report
- Problems/Output/History/Inspector

### A8 — Project Agent / Vibe Coding

Implement:

- Project Tasks
- Plan
- AI tool projection from Authoring Operations
- workspace/ChangeSet execution
- validation/repair loop
- simulation/preview inspection
- human takeover
- optimistic revision conflict handling
- semantic development history

### A9 — Hard Cutover & Product Finalization

After replacements are validated, delete retired systems:

- CardApp Studio/runtime product paths
- `/api/card-app/*`
- `game.json` authority/loader
- charId Game Package identity
- swipe-path game branch authority
- Chat State world authority
- old Studio AI tools/sessions
- old product-facing Play DOM
- obsolete compatibility entrypoints that no longer have justified consumers

Run full residual scans, focused acceptance, full regression/build/lint and final product validation.

---

## Phase execution rule

This is a multi-stage project.

After each A0–A9 phase:

1. finish the coherent phase;
2. run phase-appropriate targeted and broader checks;
3. commit and push the same implementation branch;
4. update the formal plan only when architecture/scope changed;
5. update the docs handoff with branch HEAD, completed work, decisions, actual validation, known issues and next phase;
6. stop and provide a ready-to-copy prompt for the next phase/new conversation.

Do not create a new implementation branch per phase.
Do not merge `main` until the user explicitly reaches final integration after the complete refactor.
Do not redo prior completed phases unless validation proves a defect.

---

## Acceptance criteria

### Authoring

A user can stay inside Build/Studio to:

Create project → choose Text/Component/Hybrid/Full → create/attach Actors/Worlds/Knowledge/assets → author logic/UI → use Skills/Plugins → validate/simulate/preview → build `.atria`.

No CardApp Studio is required.

### Runtime

All four experiences execute from Native Package + Native Session authority.

No active Native path depends on:

- charId package identity
- `game.json` runtime authority
- swipe-derived game branch authority
- Chat State game-world authority

### Library

Reusable supported assets can be created/imported, attached/forked, revision-pinned, inspected and explicitly updated. Release build produces a self-contained immutable dependency closure.

### Plugin / Skill

New Plugin and Skill concepts are distinct. New Plugin contributions can extend Build/Play without creating competing Native authority. Package runtime v1 has no arbitrary package JS execution.

### Vibe Coding

Project Agent can plan and apply domain Authoring Operations, validate/simulate/preview, expose ChangeSets, handle revision conflicts and allow human takeover. The same project remains fully authorable with AI disabled.

### Frontend

Normal product paths present Atria-native Play, Library, Build, Agents, Runtime and principal utility surfaces using the unified product design system. Legacy SillyTavern drawers/CardApp Studio/chat-file concepts are not part of the normal Native product experience.

### Hard-cutover residuals

Final active Native authoring/runtime/product code must not reintroduce:

- CardApp Studio authority
- `/api/card-app`
- `GAME_MANIFEST_PATH` / `game.json` authority
- charId Native game-package identity
- swipe-id Game World branch authority
- Chat State Game World authority

Legacy SillyTavern generation internals may remain only as justified internal ABI behind Native/Atria product adapters.
