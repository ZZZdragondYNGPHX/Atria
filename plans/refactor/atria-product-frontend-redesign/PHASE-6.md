# Frontend redesign — Phase 6 Build / Studio

- Date: 2026-09-24
- Branch: `refactor/atria-product-frontend-redesign`
- Main baseline: `402b53a98a823573591db4e9fd015f98e6effbdb`
- Starting HEAD: `853c590bff9169a5e29804bd9fe565a4371b51a4`
- Implementation HEAD: `a4d08510f3bcd00b5a2caba1459247f5201058e0`
- Status: implemented, validated, committed and pushed. Not merged into main.
- Phases 1–6 complete; Phases 7–8 outstanding. Stop pending user continuation.

## Delivered

The approved calm IDE now owns the complete Native Studio presentation in
`atria-build.css`: project header, source-list tree, editor, optional Inspector
or Project Agent side panel, and collapsible Problems / Output / History / Changes.
The native section was removed from the accumulated legacy Studio stylesheet;
unrelated legacy and shared Prompt authoring styles remain isolated.

Projects use searchable rows and a New Project form backed by the existing Native
create endpoint. Collections show labelled fields, nested disclosures and a Source
view over the same local JSON draft. Unknown/plugin members survive round trips.
Empty collections have a Source authoring path. This is not a new resource schema
or store: the backend continues validation and inspect/review/execute.

Review opens a visible activity surface with an operation summary and expandable
exact evidence. Applying is deduplicated; validation failure retains the draft;
revision conflicts require explicit reload and renewed review. Success returns
focus to the editor and collapses the empty activity area. Library Attach / Fork /
Update remain explicit exact-revision operations under their existing controller.
Assets still pair manifest and file operations in the same Workspace.

UI Design / Structure / Bindings / Source retain the shared Component Model.
Invalid Source/Bindings remain editable with a focused error; unapplied text cannot
silently stage the old model. Property drafts also survive tab changes and must be
applied locally before staging. Structure actions have accessible names and focus is
restored after local renders. Source file reads reject stale responses, expose
retry, and disable review until the selected file is loaded. Preview, simulation
and build have summaries with detailed technical evidence on demand.

Project Agent remains optional and human-authorized. Its task/plan/progress UI,
evidence and conversation disclosures replace the debug JSON wall. Failed creation
retains intent. Pending task switching/new-task actions are disabled; takeover
aborts generation and excludes late updates. Inspect changes opens the Studio
review surface; only the existing explicit human Commit action commits.

Compact Studio uses Project / Editor / Preview / AI / More as distinct views.
The shared Shell Environment owns the 719px boundary, pointer, reduced-motion and
virtual-keyboard state. Medium floating panels exclude covered editor controls
from keyboard focus. Inspector/Agent dismissal delegates from the existing Shell
Back/Escape path through WorkspaceHost to the active controller before leaving the
detail route. No second router or transient persistence was introduced.

Simplified Chinese interface labels use the existing Shell localization map.
Resource names, task content and identifiers remain literal product data.

## Architecture and test decisions

- Navigation Authority, WorkspaceHost, Project/Workspace/ChangeSet, exact revision,
  conflict, Resource Registry/Graph, Component Model, Native generation and human
  authority remain. No backend or persistence implementation changed.
- A7/A8 guards previously required the obsolete “Agent arrives in A8” placeholder.
  They now guard the integrated Agent controller and active panel. A9 guards
  functional execute/preview calls instead of incidental architecture prose.
  All other architecture guards remain intact.
- The older P6 authoring browser test expected the pre-Phase-4 Library save label
  and post-save DOM. It now follows Save revision → Back to resources. Exact
  immutable-resource and inspect-before-apply assertions remain.
- User/external changes to root AGENTS.md and FORK_MAINTENANCE.md are preserved and
  excluded from this phase's commits.
- SillyTavern migration remains retired. Phase 7–8 were not implemented.

## Validation

Executed locally, with isolated fixture data and Microsoft Edge / Playwright:

- Shell unit suite: 26 suites / 110 tests passed.
- Native Studio/authoring: 5 suites / 24 tests passed.
- Final focused Studio/localization follow-up: 5 suites / 14 tests passed
  (overlaps the Shell total).
- Final UI-property regression: 1 suite / 4 tests passed (two new tests).
- Full lint, targeted frontend/test lint, aggregate P8 architecture/residual guards.
- Three cold frontend builds completed successfully.
- Final browser acceptance: 7 tests passed; Chinese-label follow-up: 1 passed.
  Property-draft desktop follow-up: 1 passed; compact/loading follow-up: 2 passed.
  Final retry-button polish follow-up: 1 passed. Follow-ups overlap the main run.

Browser coverage includes desktop 1440, medium 900, compact 390/320, exact resource
authoring, real concurrent-write conflict, inspect without mutation, apply, UI
source failure/correction, Native preview, Source read failure/retry, Agent service
failure with retained intent, project load failure/retry/create, light/dark,
Escape/focus restoration, horizontal overflow, Chinese large text, simulated safe
area/virtual keyboard, reduced motion, and the 719/720 responsive boundary.

## Review corrections

Frontend-design followed DESIGN rather than choosing a new aesthetic. UX review
checked task hierarchy, field grouping and separate compact views. Post-build
[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
review addressed labelled controls, error focus, overflow and keyboard access.
Emil design-engineering review:

| Before | After | Why |
| --- | --- | --- |
| Escape left the project before closing Inspector | Shell delegates to the active controller before detail-route Back | Preserve navigation ordering and focus |
| Task failure cleared intent | Local draft survives busy/error renders | Recovery should not require retyping |
| Invalid UI source disappeared on error | Exact text retained; error focused; staging disabled | Avoid accidental staging of an older model |
| Unapplied property edits vanished across tabs | Draft survives and requires Apply Properties before staging | Keep the proposed interface consistent with the user's input |
| Empty activity occupied editor space after apply | Collapse on success and restore editor focus | Put authored content first |
| Medium panel covered focusable editor controls | Covered editor becomes inert while the panel is open | Keyboard focus stays visible |
| Compact toolbar wrapped into uneven rows | Three-column action grid; independent compact views | Predictable narrow-screen targets |
| Compact input rule reduced source-editor height | Textareas retain multiline height; 320px browser assertion protects it | Source editing stays usable with touch and keyboard |
| Project-load retry button escaped the domain styling | Error surface stays inside the Native Studio frame | Recovery has the same visible, touch-sized action as the rest of Build |
| Inspector references showed blank sections/raw JSON | Named rows and explicit empty states; evidence disclosed | Distinguish empty data from missing UI |

## Limits and next phase

Browser keyboard/safe-area checks are simulated, not physical Android/Termux/IME
evidence. No Android/Docker build, live model credentials, SQL matrix or complete
repository test suite was run. Agent generation/commit authority is covered by
existing targeted unit contracts; the browser intentionally exercises unavailable
Agent recovery without external credentials.

Final cleanup of task-generated local test directories was rejected by automatic
approval review (`blocked by policy`). Phase 6 test-result directories, isolated
fixture data, logs and build caches remain local and are not committed. Only the
selected screenshot evidence is stored on docs.

Selected screenshots are under `phase-6-images/`: overview-dark-1440,
ui-design-1440, agent-error-1440, inspector-900, overview-light-320, conflict-320,
review-320, source-error-320, project-list-320, project-loading-320, project-retry-320, studio-zh-large-light-320,
studio-zh-keyboard-320 and studio-zh-medium-720 (all PNG).

Next: Phase 7 — Agents and Utilities, only after user continuation. Retain this
branch, fetch first, read latest handoff and DESIGN, preserve all existing controller
and persistence ownership. Do not redo completed Phases 1–6.
