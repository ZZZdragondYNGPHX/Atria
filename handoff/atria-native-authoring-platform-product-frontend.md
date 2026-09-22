# Atria Native Authoring Platform & Product Frontend Refactor — Handoff

## Current status

Planning/design is complete and frozen. Implementation has **not** started.

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- Branch created directly from the baseline above.
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Prior Native Content & Session Architecture N0–N10 remains complete and must not be redone.

## Task identity

This refactor is:

**Atria Native Authoring Platform & Product Frontend Refactor**

It is a hard-cutover product/authoring/runtime/frontend refactor, not a compatibility upgrade.

Operating rule:

> Default to removal. Legacy code may be mined for mature capabilities, but legacy authoring/runtime/product authority is not preserved merely for compatibility.

## Frozen design

### Product IA

Primary domains:

- Play
- Library
- Build
- Agents
- Runtime

Global utilities:

- Search / Command
- Diagnostics
- Plugins
- Settings
- Account

`Studio` ceases to be a primary domain. Build owns project management; Atria Studio is the project workspace.

### Experience

Four explicit Native experience modes:

- Text
- Component
- Hybrid
- Full

Text is a complete first-class game mode.

Component / Hybrid / Full share one Component Model; they differ in surface composition/stage ownership rather than using separate UI engines.

### World / Knowledge

World/Knowledge/worldbook authoring is core game-asset functionality.

Native authority remains:

- World / WorldRevision
- KnowledgeBase / KnowledgeRevision / KnowledgeEntry / KnowledgeBinding

Do not restore old World Info filename/numeric-uid/selected-world-info/character-lore identity as Native authority.

### Library

Library is the reusable asset repository. Target reusable categories include Works, Actors, Worlds, Knowledge, UI Components, Skills, Plugins, Presets, Processors, Templates and media.

Project/Library relationships:

- Attach exact immutable revision/content hash
- Fork to project-owned derivative
- Create / Import project-owned resource
- Publish reusable project resources back to Library where supported

Release `.atria` builds resolve a self-contained immutable dependency closure.

### Resource model

Create a Resource Registry extensible by Atria Core and Plugins.

Resource Graph is **derived only**. It supports search, references, dependencies, build closure, AI retrieval and delete safety but is never writable/canonical authority.

Plugins may define authoring resource types but may not create new competing Native persistence/Session/Timeline/Package/World-state authorities.

### Authoring backend

Create a dedicated Native authoring boundary (StudioService / `/api/native/studio/*` or equivalent), backed by ProjectStore/AssetStore/World/Knowledge/package/build/preview/Git services.

No Native authoring path uses `charId` identity.

### Human + AI

Human structured editors, source editors and Project Agent share Authoring Operations → Workspace → ChangeSet → Validation → Commit.

AI has no privileged write path.

Concurrency uses explicit project revisions and optimistic conflict handling. Do not silently rebase AI changes over human edits.

Project Agent model:

Intent → Plan → Workspace → Operations → ChangeSet → Validate → Simulate/Preview → Review → Commit.

AI-disabled Studio must remain fully functional.

### Plugin / Skill

- Plugin = executable/system capability and Build/Play contribution.
- Skill = AI knowledge/workflow/guidance.

New Native skill scopes include at least global/project/package; Character scope is not part of new Native authoring identity.

Host Plugin may execute under the new Atria Plugin API.

Package runtime v1 **does not execute arbitrary package JavaScript**. It is declarative/capability-defined. A truly programmable isolated package plugin runtime is deferred.

### Game Runtime hard cutover

Retain/migrate mature logic algorithms (commands, reducers, rules, formula, deterministic RNG, selectors, interpretation/simulation/turn concepts where compatible).

Retire:

- `game.json` runtime/package authority
- charId package identity
- `/api/card-app/*` runtime loading
- swipe-id-derived game branch authority
- Chat State `atri_game_world` authority
- independent Game World branch/timeline authority

Target:

Native Package → Runtime Descriptor → Game Runtime → Native Session / Branch / SessionRevision.

### CardApp / old Studio

After replacement capabilities exist, remove:

- `public/scripts/extensions/character-editor-assistant/studio/*`
- CardApp Studio/runtime product paths
- `src/endpoints/card-app.js`
- `/api/card-app/*`
- charId Studio identity
- Character-sidecar Studio/AI sessions
- old CardApp Git/history/build/import path
- old Studio AI tool names

Do not keep compatibility aliases.

### Product frontend

All official product surfaces converge on one Atria Product UI System using `--atri-*` tokens, shared primitives/patterns and consistent responsive/navigation/Inspector behavior.

Final product-facing surfaces must not rely on reparented SillyTavern DOM as their official implementation.

Targets include:

- Atria-native Play Conversation / Message Renderer / Composer / Session Header / Play Toolbar
- Library master-detail asset browser
- Build landing + full Studio
- Agents integrated into the main shell/design system
- Runtime productized around Overview/Roles/Connections/Presets/Capabilities
- new Atria Plugins UI with Legacy isolated under Advanced
- Skills primarily under Library and project attachment under Build
- Atria-native primary Settings and Account surfaces
- unified Diagnostics
- search results navigate to the authoritative domain/route rather than rendering foreign-domain content in-place
- mobile Build uses separate Project/Editor/Preview/AI/More views, not squeezed desktop panes

SmartTheme may remain only as a legacy theme input adapter; it is not the new product design contract.

## Explicitly deferred/out of scope

- migration of old CardApp/game.json/legacy Studio project data
- compatibility aliases for removed authoring APIs
- arbitrary-JS package plugins
- full online/community plugin marketplace
- real-time multi-user collaboration
- cloud IDE/Codespaces replacement
- full media editors
- arbitrary HTML ↔ visual designer round trip
- one dedicated Native repo per Library asset type
- unrelated rewrites of already-correct AI/orchestration algorithms

## Implementation phases

Use the same implementation branch for all phases:

- **A0** — Contracts & Hard-cutover Guards
- **A1** — Native Authoring Backend
- **A2** — Library & Resource Architecture
- **A3** — Native Game Runtime Cutover
- **A4** — Experience Runtime
- **A5** — Plugin & Skill Platform
- **A6** — Native Product Frontend
- **A7** — Studio Authoring UX
- **A8** — Project Agent / Vibe Coding
- **A9** — Hard Cutover & Product Finalization

After every phase: validate, commit/push, update docs/handoff, stop, and provide the next-phase takeover prompt. Do not create a new branch per phase. Do not merge `main` until the complete refactor reaches final integration.

## Next action — A0 only

Start **A0 — Contracts & Hard-cutover Guards**.

Before changing code:

1. re-read current `main:AGENTS.md`;
2. re-read current `main:FORK_MAINTENANCE.md`;
3. re-read `docs:handoff/latest-handoff.md`;
4. re-read the formal plan above;
5. fetch the implementation branch and use its actual latest HEAD;
6. inspect current Native contracts/project/package/session/runtime tests and residual-guard patterns.

A0 must define/freeze the minimum contracts needed by later phases without starting broad UI or backend implementation:

- explicit Experience contract with Text/Component/Hybrid/Full;
- Resource Descriptor / Registry contracts;
- Authoring Operation / Workspace / ChangeSet contracts;
- project revision/conflict semantics;
- Native Runtime Descriptor contract;
- Atria Plugin contract and package-runtime-v1 no-arbitrary-JS restrictions;
- Native Skill scope contract;
- residual guards for retired authorities.

A0 must preserve existing N0–N10 Native authority and must not recreate a second manifest/session/world authority.

At A0 completion: run focused contract tests/guards and appropriate lint/regression, push the same branch, update docs/handoff with the validated HEAD, then stop and provide an A1 takeover prompt.
