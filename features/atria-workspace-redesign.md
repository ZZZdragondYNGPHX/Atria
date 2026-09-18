# Atria Agent & Memory Workspace Redesign

## Status

Implementation completed, fully validated, and squash-merged into `main`.

## Task identity

- Repository: `ZZZdragondYNGPHX/Atria`
- Task branch: `feat/atria-workspace-redesign`
- Baseline: `main@ed2957eba42fdbd9099eacd15eedf7f94b790fab`
- Final validated task-branch head: `5f4cd9947e7858b88fed1c2a1ab5f7b36cb1094c`
- Formal implementation plan: `main:docs/plans/atria-workspace-redesign.md`
- Pull request: #4 — `feat: redesign Atria Agent & Memory Workspace`

## Goal

Replace the migration-era Agent & Memory Workspace UI with a product-level Atria control surface after the runtime, orchestration, memory and namespace foundations had stabilized.

The redesign intentionally changed information architecture and interaction patterns rather than merely reskinning the existing drawer. The new UI preserves the underlying runtime and memory contracts while presenting them through a standalone-first product shell.

## Product architecture

The former top-level Workspace tabs:

- Presets
- Live Run
- Graph
- Agents
- Memory
- Diagnostics

were replaced with four product-level sections:

1. **Orchestration**
2. **Run**
3. **Memory**
4. **Diagnostics**

The desktop Workspace is now a near-fullscreen three-layer layout with:

- primary navigation;
- main work surface;
- contextual Inspector.

Mobile uses a real fullscreen layout with bottom navigation and fullscreen contextual detail, rather than stacking the desktop columns.

The extension drawer is now a launcher for **Atria Workspace** instead of a second configuration surface.

## Orchestration authoring

The previous long-form Preset editor and per-Agent accordion layout was replaced with:

- Preset Library;
- Plan canvas;
- Agent cards;
- contextual Agent / Preset Inspector;
- explicit default / character / conversation binding controls.

Agent configuration now separates:

- basic identity and instructions;
- model/API/prompt profile selection;
- grouped searchable tool permissions;
- capability editing;
- node capability ceilings.

Tool permissions provide:

- search;
- category grouping;
- Allow all;
- Deny all.

Raw Plan JSON and complex graph editing remain available, but are moved into the Advanced layer instead of being part of the primary editing flow.

Dangerous actions such as Preset deletion are no longer presented beside the main Save/Validate actions.

## Run console

The old Live Run, Graph and Agents top-level pages were unified into a single Run console.

The Run console now provides:

- Agent count;
- internal/model call count;
- tool call count;
- Memory recall count;
- token total;
- concurrency;
- output-owner status;
- Graph / Timeline secondary views;
- contextual node Inspector.

The Timeline includes productized events for:

- handoff;
- delegation;
- join;
- model calls;
- tool calls;
- Memory recall;
- Engine result/output events.

Stop Run is shown only while a run is active.

## Memory Workspace

Memory no longer requires the intermediate **Knowledge · Sources · Build & Maintenance** launcher.

Entering Memory opens a native four-view Workspace:

1. **Overview**
2. **Knowledge**
3. **Sources**
4. **Maintenance**

### Overview

Overview exposes the everyday Memory controls and status:

- Memory OS;
- Memory enabled;
- Recall;
- Auto extraction;
- Auto compression;
- Recall method;
- entity / relation / fact / episode counts;
- current-run recall evidence.

The UI uses shared Memory Workspace control ports rather than independently mutating settings.

### Knowledge

Knowledge uses the current Memory snapshot and inspector-compute path directly.

It provides:

- search;
- type filtering;
- history inclusion;
- entity list;
- Cytoscape graph;
- entity/relation/fact Inspector;
- source episode evidence;
- current-run Memory-use evidence.

### Sources

Sources exposes provenance as a first-class product surface:

- chat episodes;
- external/provider state sources;
- provider snapshots;
- manual corrections.

### Maintenance

High-frequency maintenance actions are now native Workspace actions:

- history build / rollback;
- manual compression;
- vector rebuild;
- Memory export;
- Memory import;
- refresh;
- current-chat Memory reset.

The old Memory settings UI remains only as an Advanced adapter for configuration and complex maintenance features that were intentionally not duplicated.

## Memory runtime integration

The redesign added Memory Workspace ports for:

- reading current Memory status;
- mutating core Memory controls through the existing runtime side effects;
- loading current Memory snapshots;
- computing inspector projections;
- loading the graph renderer;
- history build;
- manual compression;
- vector rebuild;
- import/export;
- reset.

The old Memory settings controls were updated to call the same underlying functions, avoiding a second state-management path.

## Diagnostics

Diagnostics was reorganized so raw Engine and Runtime data is no longer the default experience.

The default Diagnostics view now contains:

- runtime-health metrics;
- checkpoint / recovery summary;
- context / token-budget summary;
- Trace export;
- Trace import;
- replay status.

Raw Engine projection, arbitration state, result provenance and Runtime journal entries remain available under Advanced.

## Header and focus model

The Workspace header now exposes:

- current character/conversation scope;
- effective Preset;
- Preset selection source;
- orchestration enabled state;
- active run status.

Keyboard/focus behavior was tightened:

- navigation supports arrow/Home/End behavior;
- mobile and desktop use the same section model;
- Inspector receives focus after a render that opens it;
- Escape closes the active Inspector first;
- a second Escape can close the Workspace.

## Styling and responsive behavior

The Workspace now has its own tokenized presentation layer while continuing to inherit the SillyTavern theme.

The redesign introduced:

- surface/border/accent/status tokens;
- dedicated shell/navigation/Inspector styles;
- product-level metric cards;
- permission panels;
- native Memory/Diagnostics layouts;
- mobile fullscreen behavior;
- responsive graph/list layouts.

Validation explicitly covered 320 / 390 / 768 / 1440-style viewport behavior and horizontal overflow.

## Permanent Workspace CI

A dedicated workflow was added:

- `.github/workflows/workspace-ui.yml`

It runs:

1. Workspace information-architecture guard;
2. Run projection Chromium smoke;
3. full Workspace UI Chromium smoke;
4. Run call-count Chromium smoke;
5. Atria config initialization;
6. real-host Preset binding persistence E2E.

The permanent IA guard is:

- `scripts/check-atria-workspace-ui.sh`

It rejects the return of migration-era product patterns such as:

- old six-page Workspace routes;
- the old Memory launcher;
- old Preset Graph accordions;
- the old primary Raw Plan editor;
- the old destructive binding action wording;
- the old 1080px right-side Drawer geometry.

## Validation actually executed

Final validation was performed on task-branch head:

`5f4cd9947e7858b88fed1c2a1ab5f7b36cb1094c`

### Atria PR Checks #134

Completed successfully:

- ESLint: passed
- full Node unit suite: passed
- frontend library build prerequisite: passed
- Android JVM tests: passed
- Atria Migration Guard: passed

### Workspace UI #46

Completed successfully:

- Workspace IA guard: passed
- Run projection Chromium smoke: passed
- full Workspace UI Chromium smoke: passed
- Run call-count Chromium smoke: passed
- Atria config initialization: passed
- real-host Preset binding persistence E2E: passed

The browser validation covered:

- orchestration authoring;
- import/export;
- scope binding;
- runtime graph and timeline;
- Memory recall refresh;
- Memory teardown/remount;
- large Memory graph rendering;
- Memory source/scope guard;
- trace replay;
- cancellation;
- Chinese locale;
- mobile/desktop responsive behavior;
- horizontal overflow;
- Inspector focus/Escape behavior.

## Integration

PR #4 was squash-merged into `main`.

- PR: #4 — `feat: redesign Atria Agent & Memory Workspace`
- Final validated task head: `5f4cd9947e7858b88fed1c2a1ab5f7b36cb1094c`
- Squash merge / resulting `main` SHA: `b84d411431e72be39099cba1a0a42cde9052c778`
- Merge time: 2026-09-18T08:27:44Z
- Validated task-head tree: `cf3fc3a4794e1df0dc62dba5de212cb7f1f09d81`
- Resulting `main` tree: `cf3fc3a4794e1df0dc62dba5de212cb7f1f09d81`

The merge tree is exactly identical to the final validated task-head tree.

Post-merge `main` product-build/cleanup workflows were triggered automatically.
