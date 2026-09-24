# Atria Product Frontend Redesign — Design Specification

Status: active (task `refactor/atria-product-frontend-redesign`).
Input boundary map: `docs/plans/atria-product-frontend-redesign-audit.md`.
This document is the visual and interaction authority for the redesign. It does
not change product capability, routing, persistence or runtime authority.

## 1. Product character

Atria is a place to play, keep and make interactive works. The interface
should feel calm, precise and expensive: content first, chrome quiet, one
coherent frame everywhere. The reference is the discipline of Apple software
(restraint, typography-led hierarchy, soft materials, exact spacing), not its
literal widgets.

Principles:

1. **Content first.** The story (Play), the work (Library) and the project
   (Build) own the canvas. Chrome recedes into materials and hairlines.
2. **One frame.** Every domain lives inside the same sidebar / toolbar /
   content / inspector structure. Domains never bring their own app shell.
3. **Hierarchy through type, not boxes.** Large titles, clear weights and
   secondary text replace nested borders and card-in-card layouts.
4. **Quiet surfaces.** Tonal layering (canvas → surface → raised → elevated)
   with hairline separators. Shadows only for things that float.
5. **Honest state.** Loading, empty, error, read-only and recovery states are
   designed surfaces with a next action, never raw JSON or bare text.
6. **Technical depth on demand.** Revision ids, hashes and raw payloads live
   behind "Details" disclosures in monospace, never as the primary view.
7. **Adaptive, not squeezed.** Expanded, medium and compact are distinct
   compositions of the same DOM, not a desktop layout shrunk down.

## 2. Foundations

### 2.1 Appearance

- Atria owns two palettes: **dark** (default) and **light**.
- The existing theme authority (SmartTheme, chosen in Settings → Appearance)
  selects the appearance: `appearance.js` reads the computed root
  `--SmartThemeBlurTintColor` / `--SmartThemeBodyColor`, derives luminance and
  writes `data-atria-appearance="dark|light"` on `<html>`. It observes the root
  `style` attribute so theme switches apply live. No new preference or storage
  is introduced.
- While the Shell is mounted, `atria-tokens.css` re-maps SmartTheme variables
  and `--mainFontFamily` onto Atria tokens (the *legacy bridge*), so embedded
  compatibility controllers, popups and toasts render in the Atria palette.
  Recovery mode (`?atriaShellRecovery=legacy`) keeps the untouched legacy look.

### 2.2 Color tokens (`--atri-*`)

| Role | Dark | Light |
| --- | --- | --- |
| `canvas` (window) | `#0e0f12` | `#f6f6f8` |
| `surface-1` (content) | `#16171b` | `#ffffff` |
| `surface-2` (grouped rows, inputs) | `#1d1e23` | `#f1f1f4` |
| `surface-3` (raised / hover) | `#25262c` | `#e8e8ed` |
| `elevated` (menus, palette, sheets) | `#202127` | `#ffffff` |
| `material-sidebar` | `rgb(22 23 27 / .86)` + blur | `rgb(238 238 242 / .86)` + blur |
| `material-bar` | `rgb(14 15 18 / .78)` + blur | `rgb(246 246 248 / .82)` + blur |
| `separator` / `-strong` | `rgb(255 255 255 / .075 / .13)` | `rgb(0 0 0 / .08 / .14)` |
| `fill` / `-hover` / `-pressed` | white `.06 / .09 / .12` | black `.045 / .07 / .10` |
| `text-primary` | `rgb(245 245 247 / .94)` | `#1c1c1f` |
| `text-secondary` | `rgb(235 235 245 / .62)` | `rgb(60 60 67 / .72)` |
| `text-tertiary` | `rgb(235 235 245 / .40)` | `rgb(60 60 67 / .48)` |
| `accent` (fill) | `#5b68f0` | `#4a57e8` |
| `accent-text` | `#8d98ff` | `#3d4ad8` |
| `accent-soft` | accent 16% | accent 11% |
| `success` / `warning` / `danger` | `#3ccf86` / `#f2b54a` / `#ff6b61` | `#1d9a57` / `#b7791f` / `#d93a2b` |

Accent is Atria Indigo: a blue-violet that reads as "story / night" while
staying a neutral system accent. It is used for primary actions, selection,
focus and links only — never for large backgrounds.

Legacy `--atri-color-*` names remain as aliases of the new roles so older
Atria CSS (orchestrator panel, prompt editors, preset manager) inherits the
new palette without per-file rewrites.

### 2.3 Typography

- Sans: `system-ui, -apple-system, "SF Pro Text", "Segoe UI Variable Text",
  "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI",
  "Microsoft YaHei", "Noto Sans SC", "Noto Sans", sans-serif`.
- Mono: `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo,
  Consolas, "Noto Sans Mono", monospace`.
- Scale multiplies `--mainFontSize` (15px × user font scale), so the existing
  font-scale preference keeps working:

| Token | × base | Weight | Use |
| --- | --- | --- | --- |
| `large-title` | 2.133 (32) | 700 | Domain landing titles |
| `title-1` | 1.733 (26) | 700 | Page / detail titles |
| `title-2` | 1.4 (21) | 650 | Section titles |
| `title-3` | 1.2 (18) | 600 | Card / group titles |
| `headline` | 1 (15) | 600 | Row titles, toolbar title |
| `body` | 1 (15) | 400 | Text |
| `callout` | 0.933 (14) | 400 | Controls, sidebar |
| `footnote` | 0.867 (13) | 400 | Secondary text |
| `caption` | 0.8 (12) | 500 | Labels, badges |
| `reading` | 1.067 (16) | 400 | Play transcript, line-height 1.75 |

Titles use `-0.012em` to `-0.02em` tracking; body uses default tracking.
Numbers in revisions, counts and times use `tabular-nums`.

### 2.4 Space, radius, elevation, motion

- 4-point grid: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radius: `xs 5`, `sm 7`, `md 10` (controls), `lg 14` (cards, groups),
  `xl 20` (sheets, dialogs, composer), `pill`.
- Elevation: `shadow-1` (resting lift, cards on hover), `shadow-2`
  (popovers, inspector overlay), `shadow-3` (dialogs, palette). Dark mode adds
  a 0.5px inner highlight ring instead of heavier shadows.
- Motion: `fast 140ms`, `base 220ms`, `slow 360ms`; `ease-out
  cubic-bezier(.2,.8,.2,1)`, `ease-sheet cubic-bezier(.32,.72,0,1)`.
  Reduced motion (OS or Atria accessibility preference) collapses durations.
- Materials use `backdrop-filter: blur(24px) saturate(1.6)` behind
  `@supports`; `body.no-blur` (Fast UI) and Android-constrained cases fall back
  to solid surfaces.

### 2.5 Iconography

A single Atria line icon set (`atria-shell/icons.js`): 24px grid, 1.75px
stroke, round caps/joins, drawn with `createElementNS` (no HTML strings).
Icons are decorative (`aria-hidden`) and always paired with a text label or an
accessible name. Font Awesome remains only inside legacy compatibility islands.

## 3. The frame

```
Expanded ≥1180                      Medium 720–1179        Compact ≤719
┌────────┬──────────────────┬─────┐ ┌──┬──────────────┐    ┌──────────────┐
│Sidebar │ Toolbar          │Insp.│ │R │ Toolbar      │    │ Nav bar      │
│ 244px  ├──────────────────┤ 340 │ │a ├──────────────┤    ├──────────────┤
│material│ Content          │(opt)│ │i │ Content      │    │ Content      │
│        │                  │     │ │l │  Inspector ⇢ │    │              │
│        │                  │     │ │76│  (overlay)   │    ├──────────────┤
└────────┴──────────────────┴─────┘ └──┴──────────────┘    │ Tab bar      │
                                                           └──────────────┘
```

- **Sidebar** (`NavigationRail` primitive): brand mark + wordmark, the five
  domains (Play, Library, Build, Agents, Runtime), then utilities pinned at the
  bottom (Plugins, Diagnostics, Settings) and the Account row. Selected row:
  accent-soft fill, accent icon, primary text. Medium collapses the same
  element into a 76px icon rail with small labels.
- **Toolbar** (`GlobalBar` + `ContextBar` merged into one bar): leading back
  chevron (child routes), title (route leaf) with the domain as eyebrow on
  detail routes, trailing context actions slot, search button (`⌘K`), and the
  inspector toggle (only when the inspector has content). The static "Runtime
  ready" chip is removed; `setRuntimeStatus` shows a quiet status only when a
  caller reports one.
- **Inspector** (`Dock` primitive): closed by default. Expanded: a 340px
  column with its own header. Medium: a floating right panel over content.
  Compact: the same node moves into the bottom **Sheet** with grabber and
  peek / half / full detents. Workspace summaries still mount there, but the
  inspector no longer opens itself for them.
- **Tab bar** (`BottomNavigation`): material bar, icon + label, selected in
  accent; hidden while the software keyboard is open. Compact utilities are
  reached from the toolbar's account button (menu) and from search.
- **Search / Command** (`CommandPalette` / `CommandSheet`): Spotlight-style
  floating panel (640px, 14vh from top) with a large field, grouped results,
  icons, keyboard selection (↑/↓/Enter) and shortcut hints. Compact: a top
  sheet filling the safe area.
- **Recovery** keeps its layer but uses the designed state panel.

## 4. Shared components

- **Page header**: large title, one-line description, trailing actions; a
  **scope bar** (capsule segmented control) for domain sections.
- **Buttons**: `primary` (accent fill), `secondary` (fill), `plain` (text),
  `destructive`; sizes `sm 28`, `md 34`, `lg 44` (touch). Icon buttons are
  32/36px circles or rounded squares.
- **Fields**: 34px (44px on coarse pointers), `surface-2` fill, no border
  at rest, accent focus ring (3px soft + 1px solid).
- **Grouped list** (inset grouped rows): the default presentation for
  settings-like and resource lists; rows 44–56px with title, secondary text,
  trailing value/accessory and chevron.
- **Cards**: used for works/sessions only (content objects), not for text.
- **Badges / status**: small capsules with tone dot.
- **State panel**: icon, title, message, optional action; loading uses a
  native-feeling spinner.
- **Details disclosure**: "Details" rows revealing monospace metadata.
- **Switches**: embedded legacy checkboxes inside Atria settings render as
  switches (same `<input>`; presentation only).

## 5. Domains

- **Play**: landing with greeting title, "Continue" session cards, "Recent
  works" poster row and primary actions (Browse Library, Import save). Active
  session: slim session bar (title, work, state badge, control strip), story
  transcript (narrator/actor prose without bubbles, player turns as soft
  accent blocks, system notes centered), floating auto-growing composer with
  circular send/stop, Timeline & Saves and Context as inspector-style panels.
- **Native Game surfaces**: game sidebars use the inspector; drawers/modals
  get the transient frame; full host and recovery use the stage and recovery
  layers with the designed recovery panel.
- **Library**: Works as poster grid (generated covers from stable ids),
  Work detail hero (cover, title, meta, Play / Continue, sessions, versions,
  dependencies, Details); Worlds & Knowledge as grouped lists with revision
  timelines; Prompt Programs / Modules / Generation Profiles as a technical
  resource list + structured editor; Skills hosted in the same frame.
- **Runtime**: System-Settings-style grouped forms per section (Routes,
  Models, Connections, Profiles, Diagnostics); compact editor stays a
  full-screen dialog with focus trap and Escape.
- **Build / Studio**: calm IDE — project header with revision badge and
  primary actions, source-list resource tree, editor surface, property
  inspector, bottom activity drawer (Problems / Output / History / Changes),
  review / ChangeSet / conflict banners, Project Agent as a side panel.
  Compact: Project / Editor / Preview / AI / More views.
- **Agents**: hub of workspace tiles; embedded orchestrator adopts Atria
  tokens and hides its duplicate chrome when embedded.
- **Settings / Plugins / Account / Diagnostics**: grouped settings pages,
  plugin rows with switches, account profile header, log viewer.
- **Entry**: preloader (mark + progress), blocking loader (spinner on
  material), login (centered identity card), onboarding (welcome sheet),
  global popups and toasts (Atria dialog style).

## 6. Responsive and platform rules

- Breakpoints stay those of the Environment authority (compact ≤719,
  medium ≤1179). Components adapt by `data-atria-viewport`, not ad-hoc widths.
- Coarse pointers: 44px minimum targets, 16px input font (prevents iOS zoom).
- Keyboard open (compact): tab bar hidden, composer and sheets respect the
  measured visual viewport; no fixed elements behind the keyboard.
- Safe areas: toolbar top, tab bar bottom, sheets and dialogs honor
  `--atri-safe-area-*`.
- Android WebView: no reliance on `:has()` for layout-critical rules, blur
  behind `@supports`, no `position: fixed` inside transformed ancestors.
- No horizontal overflow at any width ≥ 320px.

## 7. Compatibility contract

Preserved behavior hooks: all `id`s used by native ABI and tests, the
`data-atria-*` state and routing attributes, accessible names of product
actions, primitive names (`ATRIA_PRIMITIVES`), shell API and slot identity,
Native Play ABI (1px non-empty host), Escape / Back ordering, focus traps.
Presentation-only test pins (class names, geometry, region order) are
migrated with the new design and recorded in the phase log.

## 8. Delivery phases

Phase 1 is integrated into main. Phases 2–5 are implemented and pushed on
`refactor/atria-product-frontend-redesign`. Continue Phase 6 only after the user
says continue. Keep this branch through Phase 8; do not merge into main or delete
the branch at individual phase checkpoints.

1. **Foundations and frame:** tokens, appearance, icon set, shared component
   stylesheet/builders, responsive Shell, search, inspector, menu, state panels,
   affected presentation tests and browser acceptance. Domain-specific CSS
   extraction follows the phase that redesigns its owning domain.
2. **Entry surfaces:** startup/loading, login, onboarding, global dialogs/toasts.
3. **Play and Native Game:** landing, transcript, composer, controls, host surfaces.
4. **Library:** Works/details, Sessions, Worlds, Knowledge, prompt resources, Skills.
5. **Runtime:** grouped configuration surfaces and compact editor.
6. **Build/Studio:** complete authoring workspace, review, preview and Project Agent.
7. **Agents and utilities:** embedded orchestration, Settings, Plugins, Account, Diagnostics.
8. **Final acceptance:** cross-domain regression, complete screenshots and integration.

Phase 1 does not claim redesigned domain content or entry surfaces. Existing
domain controllers remain inside the new frame; their remaining mixed language
and old page layouts are addressed in their owning phases above.

## 9. Phase 2 entry specification and decisions — 2026-09-24

The approved foundation is unchanged. Entry surfaces use the existing Atria
palette, system typography, focus treatment and appearance resolver.

- **Startup:** centered Atria mark, wordmark and indeterminate progress. No
  invented percentage. After 20 seconds, offer Reload without declaring an
  operation failed. First-paint containment ends when the existing startup
  authority removes the preloader; no second readiness state is introduced.
- **Login:** centered identity surface on expanded/medium screens; a single
  unboxed column on compact screens. Native account buttons, labeled forms,
  visible request feedback, a retryable connection failure and an empty-account
  state. Registration, password recovery, OAuth and redirect semantics retain
  the existing controllers/endpoints. Appearance uses the same resolver with
  the default dark palette before an authenticated preference is available.
- **Onboarding:** welcome, language, persona name, optional product orientation,
  then Get started. The existing persona/settings path persists completion.
  Language controls retain their existing locale handlers. Blank names receive
  inline feedback. New onboarding text includes Simplified/Traditional Chinese.
- **Migration retirement (explicit user decision):** SillyTavern migration is
  no longer a supported product entry path. Remove the migration UI, handlers,
  styles and dedicated `/api/users/import/data-zip`, `/import/config`, and
  `/import/global-extensions` routes. Atria backup restore, storage-engine
  migration, Native ABI and the upstream code foundation remain intact.
- **Global dialogs:** preserve Popup types/results, custom actions/inputs,
  nested modal ownership and Escape semantics. Native action buttons, associated
  titles/labels, scrollable content and separate action area share Atria tokens.
  Dialogs consume the existing Environment visual-viewport measurement and
  dispose that subscription with their lifecycle.
- **Loading:** default blocking feedback is content-sized; custom overlay
  content retains its sizing options. The action-loader registry still owns
  handles and stop callbacks. A closing overlay can only clean up its own nodes.
- **Notices:** elevated tonal feedback with semantic color accents and an
  accessible dismiss control. Inside a modal, notices occupy space below the
  action area rather than floating over fields. Action-loader notices keep their
  explicit stop control and cannot be dismissed independently of the operation.

Evidence: `PHASE-2.md`. This does not redesign Play, Library, Runtime, Studio,
Agents, Settings, Plugins or Account content.

## 10. Phase 3 Play specification and decisions — 2026-09-24

The foundation and domain direction above remain authoritative. Play presentation
now lives in `atria-play.css`; the Shell retains viewport, ABI isolation and stage
ownership rules.

- **Landing:** a typographic invitation, Continue session objects and a Recent
  works shelf. Covers use the existing icon and semantic palette, selected by a
  stable package-id hash. No invented artwork, new cover persistence or resource
  identity is introduced. Loading, missing dependencies, empty and retry states
  are visible; Browse Library and work covers use WorkspaceHost.
- **Reading:** restrained actor labels, unboxed narrative at the existing reading
  width, tonal player turns and centered system notes. Keyed DOM projection keeps
  committed prose and reader position stable while a transient reply streams.
  Jump to latest is explicit when the reader moves away from the bottom.
- **Composer:** auto-growing field with a circular Send/Stop control. Enter adds
  a paragraph; Ctrl/Cmd+Enter sends except during IME composition. The existing
  generation ABI remains the only submission path. History/recovery states offer
  Return to current story / Reload session through existing session authority.
- **Controls:** Timeline, Context and Save remain visible; retry/re-enter/restart,
  quick save and load use More. More closes on action, outside interaction and
  Escape; focus returns to its visible trigger. Save/password/name inputs reuse
  the shared Popup controller, with pending and result feedback.
- **Inspector:** Timeline & Saves and Context occupy the existing Dock/compact
  Sheet without duplicate headings. Technical payloads are disclosed on demand.
  Request ordering prevents stale Timeline results from replacing Context.
  Import keeps exact dependency preflight and immutable conflicts: an existing
  conflicting session is never overwritten to accommodate the UI.
- **Native Game:** both sidebars use Shell's Dock; modal/drawer anchors are native
  dialogs with a host-owned Close action, focus/Escape handling and measured
  viewport limits. Low-specificity form defaults keep unstyled package fields
  readable while allowing package styles. Full Game retains stage leases; its
  expandable recovery controls remain outside package content, below the global
  bar, with pending/error feedback and focus restoration on exit.
- **Adjacent corrections:** compact Sheet keyboard focus wraps within the Sheet;
  dialog, More and recovery dismissal joins existing Escape/Back ordering. A
  dismissed global notice cannot be revived by pointer re-entry during its fade.

Evidence: `PHASE-3.md`. This phase does not redesign Library, Runtime, Build,
Agents or utilities. SillyTavern migration remains retired.

## 11. Phase 4 Library specification and decisions — 2026-09-24

The existing Library direction is implemented with the foundation palette,
typography and WorkspaceHost. No visual direction is replaced.

- **Works:** searchable poster grid using the same stable-id cover treatment as
  Play. Installation/save import are explicit disclosures with review, permission
  consent and recoverable failure. Detail uses a cover/title hero, Continue/Start
  New, grouped sessions, installed versions and optional exact dependency data.
  Destructive actions use the existing native Popup confirmation and retain
  reference protection. Long technical identities belong in Details.
- **Worlds & Knowledge:** grouped rows and named create/rename controls; detail
  prioritizes readable Knowledge prose, binding references and revision history.
  Revision payloads remain exact and optionally disclosed. Authored names and text
  are literal content, not localization keys.
- **Technical resources:** Prompt Programs/Modules/Generation Profiles share a
  filterable origin-aware list and structured editor. Library saves immutable
  revisions; Studio remains a separate Review/Apply authority. Package originals
  stay read-only and support the existing exact-closure Fork/Derive operations.
  Advanced data survives switching editor mode, validation failure and retry.
- **Skills:** grouped inventory, keyboard tabs and native action buttons in the
  same frame. Secondary/import actions are disclosed; file editing reuses existing
  scope and expectedSha256 ownership. Conflicts remain visible in the editor and
  preserve draft text. The bundled importer acts on the whole collection: only an
  explicit collection action is shown, with a notice that differing local copies
  are replaced. This corrects misleading UI without adding an install authority.
- **Responsive navigation:** desktop uses the section strip; medium/compact use a
  labelled native picker backed by the same routes. Compact gives the picker the
  full row so long section names fit. Posters use four/three/two columns; action
  rows stack and forms retain touch targets. Safe-area/keyboard bounds remain
  owned by the Shell.
- **Interaction:** local errors are focusable, pending writes deduplicate, native
  dialog cancellation restores focus, stale reads cannot replace newer routes,
  and editor mode/stage changes preserve data and keyboard position. Motion is
  limited to brief pointer feedback, honoring reduced-motion preferences.

Evidence: `PHASE-4.md`. This phase does not redesign Runtime, Build/Studio, Agents
or utilities. SillyTavern migration remains retired.

## 12. Phase 5 Runtime specification and decisions — 2026-09-24

The approved Runtime direction is implemented as semantic grouped forms and quiet
resource rows, with desktop label/value alignment and compact full-width fields.
Identity details are disclosed; grouping separates connection/authentication,
model/budget/capabilities, route/exact resources/fallback/policy, and profile
revision/sampling/output. Diagnostics separates route/context/input and shows
compiled evidence behind disclosures. Active Native Session owns preview context;
Project fields are unavailable while it supplies that context.

Medium/compact use a labelled section picker through WorkspaceHost. The compact
editor uses the existing Environment's 719px breakpoint and measured visual
viewport, retains its draft across resizing, traps Tab, consumes Escape and
restores Shell inert/focus state. Form errors receive focus; pending writes are
announced and deduplicated. The same exact Native resources and Secret references
are saved; immutable profile writes never silently repin routes. Unsupported
capabilities/controls remain explicit and fail closed. Visual Prompt authoring is
reached through the already delivered Library. No new configuration authority.

Runtime CSS is extracted into its own domain stylesheet using the Phase 1 tokens.
See `PHASE-5.md` for acceptance, review corrections and screenshots.
