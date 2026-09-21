# R7 — Atria Game-first Shell Redesign

## Status

- Phase: **R7A validated; R7B next**
- Repository: `ZZZdragondYNGPHX/Atria`
- R0-R6 frozen branch: `refactor/game-runtime-architecture`
- R6 final validated HEAD: `26692b80aaa073e2442f5ed23b3f082ef25b3e2c`
- R6 validation: **Game Runtime Dev Checks #340**, run `35559636615`, success
- R7 implementation branch: `refactor/atria-game-first-shell-redesign`
- R7 branch base: `26692b80aaa073e2442f5ed23b3f082ef25b3e2c`
- R7A final validated HEAD: `5fbc216d907aa80c434093b444b977919b19c885`
- R7A validation: **R7 Shell Dev Checks #43**, run `35569965553`, success
- R7 is based directly on the complete R0-R6 branch and therefore already contains the full Master Refactor history.
- Neither long-running branch is to be merged into `main` before R7 final validation.

R7 is the final host/product-shell phase of the Atria Game Runtime Architecture Refactor. R0-R6 runtime contracts are preserved unless a concrete R7 integration defect requires a targeted correction.

---

## R7A validated checkpoint

R7A — Design System & Shell Foundation is complete and validated.

Validated implementation baseline:

- Branch: `refactor/atria-game-first-shell-redesign`
- HEAD: `5fbc216d907aa80c434093b444b977919b19c885`
- Workflow: **R7 Shell Dev Checks #43**
- Run: `35569965553`
- Focused Unit / Lint / Namespace Guard: success
- Expanded / Compact Browser Smoke: success

R7A established:

- semantic `--atri-*` token bridge and neutral host styling;
- the required Atria Shell primitives and layout patterns;
- AppShell with Navigation Rail, Bottom Navigation, Global Bar, Focus Area, Stage, Workspace, Context Dock, transient surfaces and Host Recovery layer;
- Compact / Medium / Expanded environment semantics;
- shared Command Registry rendered as desktop Command Palette and mobile Command Sheet;
- a temporary R7 preview gate using `?atriaShell=1` / `atria.shell.preview`;
- normal-startup Shell initialization without introducing a second application runtime;
- browser-level validation that R7A does not clone or move the native Conversation / Composer before R7B.

R7A also hardened several host compatibility edges exposed by real-browser validation:

- post-visible Select2 enhancement now consistently uses the canonical jQuery instance and fails soft when unavailable;
- responsive autocomplete refresh guards uninitialized widgets;
- the initial static preloader is guaranteed to disappear by the `APP_READY` boundary;
- Backgrounds jQuery UI hash tabs remain local on URLs carrying the R7 preview query instead of accidentally loading a second full application document;
- Shell roots and transient surfaces own explicit dynamic-viewport geometry on Compact layouts;
- Shell primitives now honor the HTML `hidden` contract consistently.

These are compatibility fixes discovered while validating the new host. They do not change the R0-R6 Game Runtime architecture.

### R7B entry condition

R7B starts from the validated R7A HEAD above on the **same long-running R7 branch**. Do not create another R7B branch and do not merge to `main`.

R7B is the first phase that may reparent the real native conversation DOM.

Before changing ownership, inspect the live ancestry and behavior of:

- `#sheld`
- `#chat`
- `#form_sheld`
- `#send_form`
- `#send_textarea`

Then inventory the existing native action paths for:

- send;
- stop;
- continue;
- edit;
- delete;
- swipe;
- regenerate;
- branch;
- history/search.

R7B must preserve the hard invariant:

> **One live Conversation DOM, one live Composer DOM, one generation/message state machine. Reparent, do not duplicate.**

The Shell becomes the architectural host while the existing native nodes remain the compatibility/state ABI. R7B must support deterministic restoration/unmount during the staged migration.

Game-linked historical edit/retry must continue through the existing Game Turn Controller / Host Action Resolver semantics rather than creating a second history or world-state authority.

---

## 1. Product goal

Atria 1.0 is not defined primarily as a chat application, a game launcher, or an IDE.

The product model is:

> **Atria is an Interactive Runtime Host.**

Atria hosts narrative cards, Game Packages, conversation, world/runtime state, agents, memory, model roles, authoring workspaces and diagnostics through one coherent host.

The guiding product principle is:

> **Game-first, not Game-only.**

Narrative-only cards remain first-class and must not require authors to understand Game Runtime. The redesign changes the host information architecture, not the requirement that every experience become a game.

R7 is not a cosmetic reskin. Its purpose is to replace the inherited SillyTavern-era product shell — chat center + top icon strip + drawers + extension bucket — with an Atria-native runtime host.

---

## 2. Information architecture

### 2.1 Primary product domains

Atria 1.0 has five primary destinations:

1. **Play**
   - current Character / Game / Session;
   - Stage;
   - Conversation Timeline;
   - Composer;
   - current Session Runtime;
   - Immersive presentation.

2. **Library**
   - Characters;
   - Games / Game Packages;
   - Worlds & Knowledge;
   - Skills.

3. **Studio**
   - Character Project authoring;
   - Game Project / Game Studio authoring;
   - project context determines the authoring mode.

4. **Agents**
   - Orchestration;
   - Runs;
   - Memory;
   - Agent Presets.

5. **Runtime**
   - Overview;
   - Runtime Roles;
   - Connections;
   - Model / Prompt Presets;
   - Retrieval / Embedding / Rerank.

### 2.2 Global utilities

The following are Shell-level utilities rather than primary destinations:

- Command / Search;
- Diagnostics;
- Plugins;
- Settings;
- Account.

A capability may be a first-class Atria capability without requiring a permanent primary-navigation slot.

### 2.3 World concepts remain separated

Do not collapse unrelated "World" concepts into one backend or one giant page.

- **World Info / Lorebooks / Knowledge** -> Library / Worlds & Knowledge.
- **World Runtime state/events/branch/session** -> Play / Session Inspector.
- **World Schema / Initial State / Commands / Rules** -> Studio / Game Project.

The UI may cross-link these areas, but their runtime semantics remain distinct.

### 2.4 Presets follow their owning domain

Do not create another universal "Preset Center".

- Agent presets -> Agents.
- Model / prompt presets -> Runtime.
- Themes -> Settings.
- Character/project-specific configuration -> the owning Library/Studio context.

---

## 3. Stage, Timeline and Workspace model

The new host distinguishes three concepts:

```text
App Shell
├ Stage
│  └ current interactive experience
├ Timeline
│  └ history / user input / assistant output / swipe / branch / turn lineage
└ Workspace
   └ authoring / management / debugging / configuration
```

### 3.1 Stage

Stage is the current experience surface. It may present a Narrative Card, Component UI, Hybrid Game Surface or Full Game Surface.

### 3.2 Timeline

Conversation Timeline remains a core native/runtime component and preserves:

- user messages;
- AI responses;
- history;
- edit;
- swipe;
- branch;
- regenerate;
- retry;
- turn lineage.

Timeline is not guaranteed to occupy the center of the screen. Its visual state may be:

- Primary;
- Embedded;
- Docked;
- Sheet;
- Hidden-by-default but host-accessible.

### 3.3 Workspace

A Workspace is a task environment for authoring, managing, configuring or debugging.

Primary Workspaces are Shell routes, not fixed overlays on top of chat.

Examples:

- Agents Workspace;
- Studio Workspace;
- Runtime Workspace;
- Library Workspace.

Temporary content such as Sheet, Modal, Popover and Command Palette remains transient.

---

## 4. Conversation / Game Surface model

### 4.1 Runtime UI modes remain unchanged

R7 does not introduce a fourth Game Runtime UI mode.

R4 remains authoritative:

- `component`
- `hybrid`
- `full`

Narrative Cards without a Game UI are the Host default narrative presentation, not a new Game Runtime mode.

### 4.2 Presentation semantics

- **Narrative Card**: Timeline-primary.
- **Component**: conversation-first plus Game UI augmentation.
- **Hybrid**: Game-first surface with native Conversation / Composer composition available.
- **Full**: package fully owns Stage content.

### 4.3 Full owns Stage, not Atria

A Full Game Package never owns the entire Atria application.

Atria Host retains:

- navigation/recovery authority;
- Timeline availability;
- stop generation;
- Diagnostics;
- exit Game UI;
- disable broken package;
- global Command access.

The existing R4 Full recovery controls evolve into a formal **Host Recovery Layer**.

### 4.4 Native component composition

R4 native components remain the single source of truth:

- `conversation`
- `composer`

Do not create duplicate Timeline or Composer implementations for the new shell.

Hybrid/Full packages may continue to mount native components into supported slots. Unmount restores the original native nodes.

### 4.5 Timeline action semantics

R7 exposes the R5 turn semantics clearly.

**Rewrite Narrative**
- authoritative World State unchanged;
- committed Events unchanged;
- same outcome/attempt;
- prose regenerated.

**Retry Turn**
- new attempt/outcome branch;
- commands/events/world state may differ.

Game-linked historical user edits become **Edit & Retry from here**, not silent mutation of already committed facts.

Timeline presentation must distinguish:

- Narrative Variant;
- Outcome Variant.

### 4.6 Timeline Action Resolver

Host Timeline actions resolve by record type:

```text
User action
  -> Timeline Action Resolver
     -> ordinary narrative/chat record -> native chat action
     -> Game-linked turn -> Game Turn Controller action
```

This applies to edit/delete/retry/rewrite/variant switching and prevents DOM presentation from becoming a second state authority.

---

## 5. Desktop architecture

The desktop host is:

```text
Navigation Rail
+ Global Bar
+ Focus Area
+ Context Dock
+ Transient Layer
+ Host Recovery Layer
```

### 5.1 Navigation Rail

Primary destinations:

- Play
- Library
- Studio
- Agents
- Runtime

Third-party plugins do not receive uncontrolled primary-navigation placement.

### 5.2 Global Bar

The Global Bar answers:

- where am I?
- what is currently running?
- is there a problem?
- what global action do I need?

It contains:

- contextual breadcrumb/title;
- compact current status;
- Runtime Status Cluster;
- Command/Search;
- Diagnostics;
- Settings/Account access.

It is not a replacement for the old top strip of every feature button.

### 5.3 Focus Area

One primary focus surface at a time:

- Play -> Stage;
- Agents -> Agents Workspace;
- Studio -> Studio Workspace;
- Runtime -> Runtime Workspace;
- Library -> Library Workspace.

Quick **Peek** can expose context without route change. **Open** changes the primary Workspace route.

### 5.4 Context Dock

Dock is the shared desktop auxiliary container. Inspector is a Dock content type, not the Dock itself.

Possible panels include:

- Timeline;
- Inspector;
- World;
- Runtime;
- Notes;
- selected Agent/tool/memory evidence.

Official layout states remain deliberately limited. Do not create an unrestricted IDE window manager.

Timeline standard desktop states:

- Primary;
- Right Dock;
- Bottom Dock;
- Hidden.

### 5.5 Composer

The primary conversation Composer belongs to Play/Stage context. It is not global shell chrome.

Studio/Agents/Runtime may have their own domain-specific input surfaces, but those are not the native Play Composer.

### 5.6 Command Palette

Desktop provides a shared Command Registry rendered as a Command Palette, e.g. Ctrl/Cmd+K.

Navigation answers "where"; Commands answer "what".

Plugins may extend Commands without polluting primary navigation.

### 5.7 Focus, Immersive and Full are distinct

- **Focus** = reduction of host chrome.
- **Immersive** = presentation mode.
- **Full** = Game Package Stage ownership.

They may combine, but they must never be stored or implemented as one boolean.

---

## 6. Mobile architecture

Mobile is not a scaled-down desktop drawer shell.

### 6.1 Primary navigation

Compact layout uses Bottom Navigation:

- Play
- Library
- Studio
- Agents
- Runtime

Focus/Full/Immersive may temporarily reduce normal chrome, while a Host Handle keeps Atria recoverable.

### 6.2 Stage-first Play

Play prioritizes Stage.

Narrative Cards remain Timeline-primary.

Hybrid/Full use Context Sheets for auxiliary Timeline/Inspector/World/Runtime surfaces.

### 6.3 Timeline Sheet

Standard states:

- Closed;
- Peek;
- Half;
- Full.

Do not persist arbitrary free-form heights as product layout state.

### 6.4 Context Sheets

Inspector, World, Runtime Peek and similar contextual UI use the shared Sheet primitive.

At one navigation level, only one primary Context Sheet should be active. Switching context replaces the current Sheet instead of stacking uncontrolled layers.

### 6.5 Mobile Composer

- Narrative: visible by default.
- Component: normally visible.
- Hybrid: may use a compact native Composer.
- Full: hidden by default unless package embeds the native Composer or user opens Host Input.

### 6.6 Keyboard/safe area

The Shell owns keyboard-aware responsive behavior using visual viewport, dynamic viewport units and safe-area contracts.

When keyboard input is active, navigation/context chrome may reduce so Stage does not collapse into an unusable strip.

### 6.7 Mobile Workspaces

Workspaces use page + local navigation/drill-down rather than desktop multi-pane compression.

Studio mobile prioritizes:

- Project;
- Editor;
- Preview;
- AI;
- Simulation;

as focused views rather than pretending to fit the full desktop IDE simultaneously.

### 6.8 Command Sheet

Mobile uses the same Command Registry as desktop but renders it as a Command Sheet.

### 6.9 Android Back

R7 establishes a Shell Back Resolver.

General priority:

1. Modal / Popover;
2. Context Sheet;
3. Command Sheet;
4. drill-down/detail page;
5. Full Game Host Escape;
6. Immersive exit;
7. Workspace child route;
8. previous Atria route;
9. applicable WebView history;
10. app-exit confirmation.

Full Game defaults to a Host Escape surface instead of one accidental Back press immediately terminating the Full UI.

Immersive keeps its existing transient-layer-first then exit behavior.

---

## 7. Core capability promotion

### 7.1 Agents and Memory

Agent Orchestration and Memory are first-class Atria capabilities.

They leave the product path:

`Extensions -> Agent & Memory -> Open Workspace`

and become:

```text
Agents
├ Orchestration
├ Runs
├ Memory
└ Presets
```

Existing engine/runtime/persistence implementations remain reusable.

The existing Agents "Diagnostics" concept should become **Run Trace** or equivalent so "Diagnostics" consistently means the global observability product.

### 7.2 Skills

Skills are primary Library assets:

`Library -> Skills`

Agents and presets link contextually to assigned skills rather than making Skills an Agent-only subsystem.

### 7.3 Studio

Studio is a first-class product domain, not an Extension entry.

Project type selects the authoring experience:

- Narrative Card -> Character Authoring;
- Game Package -> Atria Game Studio.

R6 Project Navigator, structured editors, Simulation, AI Builder and native `.atria` pipeline remain authoritative.

### 7.4 Runtime

Runtime becomes first-class.

Its Overview makes Runtime Roles understandable at a glance, including:

- role;
- primary connection/model;
- health;
- fallback state;
- disabled/not configured state.

Deep pages include Roles, Connections, Model/Prompt Presets and Retrieval.

Provider-specific legacy forms may initially be mounted through a compatibility adapter instead of being rewritten wholesale.

### 7.5 Immersive

Primary action moves to Play/Stage presentation controls.

Settings retains only Immersive defaults/preferences.

### 7.6 Diagnostics

Diagnostics becomes a Shell-level utility.

It remains quiet when healthy and surfaces contextually on failures.

Deep links may connect incidents to Agents, Plugins, Studio and Runtime.

---

## 8. Extensions / Plugins reclassification

### 8.1 Product name and meaning

User-facing "Extensions" becomes **Plugins**.

Plugins means installable/updatable/enableable/disableable/removable third-party functionality.

### 8.2 Implementation is not product classification

Atria-owned functionality may continue to use the existing extension loader internally without appearing as a Plugin.

```text
implementation type != product classification
```

Atria core includes Game Runtime, Agents, Memory, Studio, World Workspace, Diagnostics and Immersive regardless of their current loading directory.

### 8.3 Built-in feature compatibility

Legacy built-in feature settings that do not warrant first-class Workspace status may temporarily live under Settings / Built-in Features / Advanced while reusing existing setting nodes.

### 8.4 Legacy plugin settings

Third-party plugins that append settings into legacy extension containers remain supported through a formal **Legacy Plugin Settings Surface**.

### 8.5 Legacy extension menu

Existing extension-menu actions remain reachable through a compatibility surface. The long-term host extension path should move toward stable APIs such as:

- registerCommand;
- registerWorkspace;
- registerSettingsPage;
- registerContextAction.

R7 need not force all third-party plugins to migrate immediately.

---

## 9. Settings scope

Settings should contain application-level preferences rather than become a miscellaneous feature bucket.

Target categories include:

- Appearance;
- Language;
- Accessibility;
- Input / Hotkeys;
- Notifications where applicable;
- Storage / Sync;
- Account;
- Privacy;
- Built-in Features;
- Advanced.

Diagnostics, Agent configuration, core Runtime configuration, World management and primary Immersive action are not normal Settings destinations.

---

## 10. Atria 1.0 Design System

R7 Design System is defined as:

> **Tokens + Primitives + Patterns + AI Development Rules**

### 10.1 Visual role

Atria Host is neutral, modern and low-interference.

Game/Character content may be visually expressive. The Host should not impose a permanent RPG, cyberpunk, visual-novel or launcher aesthetic.

### 10.2 Theme bridge

Existing SillyTavern/SmartTheme values remain compatibility inputs.

```text
SmartTheme / user theme
 -> Legacy Theme Adapter
 -> Atria semantic tokens
 -> Atria components
```

New Atria components consume `--atri-*` tokens rather than directly treating SmartTheme variables as their public design API.

### 10.3 Token categories

Define consistent semantic tokens for:

- text;
- background/canvas;
- surfaces/raised/overlay;
- borders;
- accent;
- success/warning/danger;
- focus;
- typography;
- spacing;
- radius;
- elevation;
- motion;
- responsive environment;
- safe areas.

### 10.4 Typography

Use semantic roles rather than arbitrary `mainFontSize +/- value` calculations:

- Display;
- Title;
- Heading;
- Subheading;
- Body;
- Body Small;
- Caption;
- Mono.

Narrative prose and dense Workspace UI may use different approved density/typography patterns.

### 10.5 Spacing, radius and density

Use a small shared spacing scale instead of per-feature arbitrary pixel values.

Radius semantics:

- sm;
- md;
- lg;
- pill.

Density:

- comfortable;
- compact.

### 10.6 Elevation

Prefer semantic layers:

- Canvas;
- Surface;
- Raised;
- Overlay;

instead of every nested block acquiring another border.

### 10.7 Interaction states

Components define:

- rest;
- hover where the device supports hover;
- active;
- selected;
- focus-visible;
- disabled;
- loading;
- error.

Touch UI must not rely on hover.

### 10.8 Motion

Standard motion categories:

- fast;
- normal;
- slow.

All non-essential motion respects reduced-motion preferences.

### 10.9 Responsive modes

Product responsive semantics are:

- **Compact**
- **Medium**
- **Expanded**

Exact pixel breakpoints are selected during implementation using real viewport/E2E evidence rather than frozen arbitrarily in this plan.

---

## 11. Required host primitives

R7 should establish reusable Atria-native primitives at least for:

- AppShell;
- NavigationRail;
- BottomNavigation;
- GlobalBar;
- ContextBar;
- FocusArea;
- Stage;
- Workspace;
- Dock;
- Sheet;
- Inspector;
- Timeline;
- Composer;
- CommandPalette;
- CommandSheet;
- RuntimeCard;
- StatusChip;
- Toolbar;
- SegmentedControl;
- SplitPane;
- EmptyState;
- ErrorState;
- LoadingState;
- HostRecovery.

Reusable patterns should include at least:

- list-detail;
- master-detail;
- editor workspace;
- runtime status;
- incident list-detail;
- mobile drill-down.

The design system is intended to become the default target for future Codex/AI frontend work.

---

## 12. Technology boundary

R7 does **not** use the shell redesign as a reason to migrate the entire frontend to React/Vue or another framework.

Continue using the current DOM/ES-module/controller stack and compatibility jQuery where needed.

Build stable DOM primitives, class/data contracts and controller APIs.

Do not introduce Shadow DOM everywhere. Use namespaced Atria components/tokens by default and isolate only where isolation materially helps.

---

## 13. Legacy DOM and compatibility boundaries

### 13.1 Preserve stateful native anchors

R7 does not require deletion/renaming of these internal compatibility anchors:

- `#sheld`
- `#chat`
- `#form_sheld`
- `#send_form`
- `#send_textarea`

They currently act as an internal ABI for message actions, reasoning, macros, vectors, autocomplete, audio, tests and R4 native-component composition.

The product relationship changes so they live under the Atria Stage rather than defining the entire application.

### 13.2 Reparent, do not duplicate

Hard rule:

> **Reparent, don't duplicate.**

Maintain:

- one Conversation DOM;
- one Composer DOM;
- one generation source of truth;
- one authoritative existing Workspace controller for each feature.

Do not create a second chat/timeline and synchronize it with `#chat`.

Do not create a second Composer and synchronize it with `#send_form`.

### 13.3 Compatibility Islands

Legacy host nodes may remain temporarily as Compatibility Hosts, including old Character, World Info, API/provider settings, User Settings and extension setting containers.

New Workspaces can mount/reparent the existing real nodes while progressively removing old drawer geometry/chrome.

### 13.4 MovingUI

Atria 1.0 Shell does not participate in legacy MovingUI geometry.

MovingUI may remain for legacy compatibility islands, but it cannot own AppShell, Stage, Navigation, Dock or Workspace layout.

### 13.5 Legacy CardApp

Existing CardApp remains supported as a **Legacy Full Stage Surface**.

It may own Stage presentation but not the Atria Host.

Host Recovery remains available so a broken CardApp cannot permanently trap the user.

### 13.6 Surface API

R4 Surface / Native Component contracts remain stable.

R7 upgrades the old DOM-bound adapter into a semantic Host Surface Registry.

Target semantic mapping:

- `app.root` -> Stage root;
- `chat.header` -> Timeline header region;
- `chat.footer` -> Timeline footer region;
- `composer.before` -> Composer pre-action region;
- `composer.after` -> Composer post-action region;
- `sidebar.right` -> Context Dock;
- `drawer` -> Host transient/Sheet surface;
- `modal` -> Modal layer.

`sidebar.left` must never grant Game Packages ownership of Atria primary navigation.

---

## 14. Migration strategy

R7 is not a big-bang rewrite.

Principles:

1. **Preserve stateful internals, replace product shell.**
2. **Reparent, don't duplicate.**
3. **Promote Atria core; isolate legacy/plugin compatibility.**
4. **Migrate in independently verifiable slices.**
5. **R7 exit removes the old product architecture, not necessarily every old DOM ID.**

A temporary development gate may allow legacy/new shell comparison during implementation, but R7 must exit with the Atria Shell authoritative. Do not ship two permanent product shells.

---

## 15. Phased implementation plan

### R7A — Design System & Shell Foundation

Build:

- semantic tokens/theme adapter;
- shared primitives;
- AppShell;
- Navigation;
- Global/Context Bar;
- FocusArea;
- Dock;
- Sheet;
- Command Registry/Palette/Sheet;
- responsive environment.

Exit:
- stable Expanded and Compact shell fixtures;
- no major product feature migration required yet.

### R7B — Play / Native Conversation Host

Move the existing native conversation stack into the new Stage:

- `#sheld`;
- `#chat`;
- `#form_sheld`;
- `#send_form`.

Preserve:

- send;
- stop;
- continue;
- edit;
- delete;
- swipe;
- regenerate;
- branch;
- history/search behavior.

Exit:
- Narrative Card flows work under the new Host without duplicated chat/composer state.

### R7C — Game Surface Integration

Integrate:

- Component;
- Hybrid;
- Full;
- native Conversation/Composer slots;
- Host Surface Registry;
- legacy CardApp;
- Host Recovery;
- Immersive.

Exit:
- Narrative + Component + Hybrid + Full + legacy CardApp operate under the new Shell.

### R7D — Desktop / Mobile Navigation

Make the new shell authoritative for:

- Desktop Navigation Rail;
- Mobile Bottom Navigation;
- routes/history;
- Context Dock;
- Context Sheet;
- Command surfaces;
- Android Back Resolver;
- keyboard/safe-area behavior;
- Compact/Medium/Expanded layouts.

Exit:
- primary navigation no longer depends on old top-bar/drawer navigation.

### R7E — First-class Workspaces

Integrate existing feature controllers into WorkspaceHost:

- Agents / Memory;
- Game Studio;
- World Info;
- Diagnostics.

Use adapters/chrome migration rather than recreating engines.

Exit:
- these Atria core capabilities no longer require Extensions/User Settings drawers as their primary entry.

### R7F — Library & Runtime

Build product-level Library and Runtime IA.

Library:
- Characters;
- Games;
- Worlds & Knowledge;
- Skills.

Runtime:
- Overview;
- Roles;
- Connections;
- Model/Prompt Presets;
- Retrieval.

Provider-specific deep configuration may continue through legacy form adapters.

Exit:
- primary Character/World/Runtime tasks are reachable through the new IA.

### R7G — Plugins & Settings Reclassification

- expose third-party Plugins distinctly;
- keep legacy plugin settings compatibility;
- relocate built-in legacy feature settings appropriately;
- slim Settings;
- retire Extensions/User Settings/API drawers as primary product navigation.

Exit:
- Atria core no longer lives in the Plugins/Extensions bucket.

### R7H — Legacy Shell Retirement & Final Hardening

- remove obsolete old shell launchers/chrome from normal product flow;
- isolate remaining compatibility anchors;
- stop MovingUI from controlling the new shell;
- remove stale shell-specific CSS only where safe;
- update frontend/plugin guidance;
- complete final R0-R7 regression/performance validation.

Exit:
- Atria Shell is authoritative across desktop/mobile and all major product domains.

---

## 16. Testing strategy

R7 verification is capability-focused, not screenshot-only.

### 16.1 Conversation

Cover:

- send;
- stop;
- continue;
- edit;
- delete;
- swipe;
- regenerate;
- branch;
- history/search;
- generation interruption.

### 16.2 Game Runtime

Cover:

- Narrative;
- Component;
- Hybrid;
- Full;
- native Conversation mount/restore;
- native Composer mount/restore;
- Rewrite Narrative;
- Retry Turn;
- Outcome/Narrative variants;
- Host Recovery;
- broken-package escape/disable.

### 16.3 Workspaces

Cover:

- Library;
- Studio;
- Agents;
- Runtime;
- Diagnostics;
- World/Knowledge;
- Skills.

### 16.4 Responsive/navigation

Cover:

- Compact;
- Medium;
- Expanded;
- portrait;
- landscape;
- keyboard-open;
- safe-area behavior;
- route restore;
- Dock;
- Sheet;
- Command Palette/Sheet;
- Android Back;
- Immersive escape;
- Full Game escape.

### 16.5 Plugin compatibility

Maintain fixtures for:

- legacy extension settings mount;
- legacy extension menu actions;
- popup/modal;
- chat API;
- generation API;
- plugin enable/disable/settings persistence.

### 16.6 Broader checks

R7 final validation should include:

- focused shell/component tests;
- frontend smoke/E2E for major host paths;
- Game Runtime R4/R5/R6 regression;
- ESLint;
- complete Node unit suite;
- frontend build.

Android/Docker builds remain opt-in under repository policy unless R7 actually changes the relevant native/build surface or the user explicitly requests them.

---

## 17. Performance constraints

R7 must not make startup materially worse by eager-loading every Workspace.

Preserve/extend lazy loading.

Track important boundaries such as:

- Shell bootstrap;
- first visible;
- Play ready;
- Workspace route switch;
- Timeline/Dock open;
- Sheet open.

Large Studio, Diagnostics Expert, Agent graph and similar modules should load only when their product route or feature requires them.

---

## 18. In scope

R7 includes:

- host information architecture;
- desktop shell;
- mobile shell;
- Design System;
- Stage/Timeline/Workspace composition;
- Context Dock/Sheet;
- Command system;
- core Workspace promotion;
- Agent/Memory promotion;
- Runtime UX;
- Plugins reclassification;
- Settings slimming;
- compatibility adapters;
- Surface Registry;
- Host Recovery;
- Android Back shell contract;
- responsive host behavior;
- frontend regression/performance coverage.

---

## 19. Out of scope

R7 does not reopen these areas without a concrete shell-integration defect:

- R0-R6 runtime semantics;
- new Game UI modes;
- World Runtime redesign;
- Agent engine redesign;
- Memory engine redesign;
- `.atria` package format redesign;
- Game Studio core feature rewrite;
- wholesale Agent/Memory directory relocation;
- React/Vue full-project migration;
- deletion of every legacy DOM ID;
- full rewrite of every provider-specific settings form;
- mandatory immediate migration of every third-party plugin;
- unrestricted IDE-style free window management;
- speculative large-world Entity Store work.

---

## 20. Exit criteria

R7 is complete when:

### Product
- desktop and mobile visibly use an Atria-native host rather than inherited top icon + drawer chat IA;
- Play/Library/Studio/Agents/Runtime form a coherent product;
- Narrative Cards remain first-class;
- Component/Hybrid/Full feel native to the same host;
- Atria core features no longer require Extensions/User Settings drawers as their primary entry.

### Architecture
- Atria Shell/Stage/Workspace/Dock/Sheet/Timeline/Runtime/Plugins are the public host architecture;
- legacy SillyTavern DOM is an implementation/compatibility detail;
- Conversation and Composer remain single source of truth;
- Game Packages continue to target stable Surface/Native Component contracts.

### Compatibility
- Narrative Card workflows remain intact;
- PNG/JSON/CharX interchange remains supported;
- native `.atria` remains supported;
- legacy CardApp remains recoverable;
- high-value plugin settings/menu/API paths remain usable through compatibility surfaces.

### Validation
- major desktop/mobile host paths pass focused frontend smoke/E2E;
- Game Runtime integration regression passes;
- Node unit suite passes;
- ESLint passes;
- frontend build passes;
- performance checks show no unjustified eager-load/startup regression.

---

## 21. Branch, merge and archive policy

R0-R6 are frozen at:

`refactor/game-runtime-architecture@26692b80aaa073e2442f5ed23b3f082ef25b3e2c`

R7 uses the independent branch:

`refactor/atria-game-first-shell-redesign`

created directly from that exact R6 validated HEAD.

During R7:

- do not continue feature development on `refactor/game-runtime-architecture`;
- do not merge `refactor/game-runtime-architecture` into `main`;
- do not merge R7 into `main` before R7 completion;
- do not delete either long-running branch.

Because R7 is based on the full R0-R6 branch history, the final R7 validated branch contains the complete R0-R7 Master Refactor.

Final integration is therefore:

```text
R7 final validated branch
  -> main
```

Do **not** separately merge the frozen R0-R6 branch into `main`.

After the final R7 result is merged and verified, archive/clean up:

- `refactor/game-runtime-architecture`;
- `refactor/atria-game-first-shell-redesign`;

according to repository policy.

---

## 22. Preparation state

As of the preparation handoff:

- R6 is complete and validated;
- the R0-R6 branch is frozen at the validated HEAD;
- the R7 branch has been created from that exact HEAD;
- this document is the authoritative R7 product/frontend architecture plan;
- no R7 functional implementation has started in the preparation conversation.

The next conversation should execute R7A first and continue through R7H, using this document as the primary implementation plan.
