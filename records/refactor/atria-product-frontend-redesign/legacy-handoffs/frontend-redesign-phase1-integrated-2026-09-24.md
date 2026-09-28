# Frontend redesign — Phase 1 integrated; Codex Astra takeover for Phase 2+

- Date: 2026-09-24
- Repository: `ZZZdragondYNGPHX/Atria`
- Integrated main: `402b53a98a823573591db4e9fd015f98e6effbdb`
- Phase 1 validated implementation: `f28615b5d5451f75e8abd959fa84cca0d942f56d`
- Phase 1 PR: #86
- Previous task branch `refactor/atria-product-frontend-redesign` was merged and deleted.
- Next implementer: Codex Astra.
- Phase 1 is complete. **Do not redo Phase 1.**
- Future work starts from live `main`; create/recreate the task branch from the actual current `main` before implementing Phase 2+.

## Current task

Continue **Atria Product Frontend Redesign** from Phase 2 onward.

The visual north star remains:

**Apple-style — restrained, polished, coherent, premium, product-first.**

This means disciplined hierarchy, calm materials, precise spacing and interaction quality. It does **not** mean literal macOS/iOS imitation.

The design authority is:

- `docs:planning/atria-product-frontend-redesign/DESIGN.md`
- `docs:refactor/atria-product-frontend-redesign.md` for the original audit/boundary map
- `docs:planning/atria-product-frontend-redesign/PHASE-1.md` for completed Phase 1 evidence

Do not restart visual exploration from scratch and do not replace the approved design direction with a generic alternative.

## Phase 1 delivered and frozen

Phase 1 established the shared design foundation and frame:

- Atria tokens and appearance lifecycle
- Atria icon system
- shared components
- responsive sidebar / rail / toolbar / compact tab bar
- inspector Dock / Sheet
- utility menu
- command/search surface
- designed state panels
- dark/light integration
- responsive Shell behavior
- narrow-width / 320px layout fixes
- presentation-test updates required by the new frame

Existing route authority, Native generation ABI, runtime authority and persistence boundaries remain intact.

Phase 1 evidence:

- Shell Jest: 24 suites / 96 tests passed
- Edge Playwright foundation/navigation: 13 passed
- desktop / medium / compact visual inspection completed
- dark/light, search, inspector, utilities and narrow widths inspected
- root lint passed
- aggregate architecture guards passed
- cold webpack build passed
- `git diff --check` passed

Do not repeat this work unless a later phase uncovers a real regression.

## Remaining phases

2. **Entry surfaces** — startup/loading, login, onboarding, global dialogs/toasts
3. **Play and Native Game** — landing, transcript, composer, controls, host surfaces
4. **Library** — Works/detail, Sessions, Worlds, Knowledge, prompt resources, Skills
5. **Runtime** — grouped configuration surfaces and compact editor
6. **Build / Studio** — full authoring workspace, review, preview, Project Agent
7. **Agents and utilities** — embedded orchestration, Settings, Plugins, Account, Diagnostics
8. **Final acceptance** — cross-domain regression, screenshots and final integration

Continue in this order unless the design document is materially revised for a concrete technical reason.

## Frontend skills — mandatory role separation

Before continuing Phase 2, Codex Astra should have the following skills available:

1. **`frontend-design` — primary visual/design authority**
   - Use it when shaping or substantially redesigning a surface.
   - It owns aesthetic judgment and the final visual direction.
   - Do not let the other skills flatten its design into a generic checklist UI.

2. **`ui-ux-pro-max` — product/UX completeness support**
   - Use it to check dense product workflows, responsive behavior, hierarchy, forms, navigation, mobile and accessibility completeness.
   - It supplements the visual direction; it does not override it.

3. **`web-design-guidelines` — post-implementation audit**
   - Use after a surface is implemented.
   - It is for web UX/accessibility/implementation review, not for deciding the initial visual language.

4. **`emil-design-eng` — final interaction/polish pass**
   - Use after the page structure and visual design are already sound.
   - Focus on motion, feedback, transitions, component feel and invisible interaction details.

Do **not** add `taste-skill` for this task. Its strong opinions overlap with the primary design authority and are not a good fit for Atria's dense multi-step product UI.

Recommended order for each redesigned surface:

`frontend-design → ui-ux-pro-max → implementation + real browser screenshots → web-design-guidelines → emil-design-eng polish → regression`

Do not invoke all design skills as equal co-designers at once.

## Non-negotiable redesign standard

This remains a full product redesign, not CSS polish.

Not acceptable:

- changing only colors, radius or shadows
- preserving old DOM purely to satisfy presentation tests
- redesigning desktop but leaving mobile as compressed desktop
- skipping difficult legacy/compatibility surfaces without documenting them
- using the same generic bordered card/list for every domain
- claiming completion from DOM/unit tests without real browser visual validation
- allowing old presentation tests to force the old visual structure back
- weakening Native/runtime/persistence authority to make the UI easier to build

When an old test protects behavior/architecture, preserve it.
When it only pins obsolete presentation geometry/class order, update the test to the new design rather than reverting the design.

## Architecture boundaries that must remain

Preserve:

- Navigation Authority and deep-link semantics
- WorkspaceHost ownership
- Native Session authority
- Native Play internal generation ABI
- Native Game Stage / transient / recovery ownership
- Studio inspect / review / execute / ChangeSet / exact revision boundaries
- Library exact resources
- Runtime Native model / connection / route / generation / prompt authority
- Project Agent + human authority
- plugin-defined resources
- Settings / Account / Plugin existing controllers and persistence
- keyboard / focus / Escape / Back behavior
- compact virtual-keyboard handling, safe areas and Android WebView usability
- no second routing, persistence or configuration authority

## Codex Astra working protocol

This is a multi-stage task.

Because Phase 1 was explicitly merged and its branch deleted, start the continuation from the **live current `main`**, then recreate/use:

`refactor/atria-product-frontend-redesign`

Do not reset main to the old Phase 1 baseline.

For each phase:

1. inspect the current implementation and the design spec;
2. implement the whole phase, not a cosmetic subset;
3. run targeted tests/lint/build and all relevant offline/browser validation;
4. use real browser screenshots at desktop and compact/mobile widths;
5. use the frontend skills according to the role separation above;
6. fix ordinary code/test/workflow problems autonomously;
7. commit and push the phase;
8. update the formal design document only for material design changes;
9. update this handoff / the relevant phase record with branch, HEAD, completed work, validation, open limitations and next phase;
10. report the phase result and stop until the user says continue.

Do not wait on GitHub CI as the primary debugging mechanism. Run local/offline validation yourself. If CI later fails for an ordinary code/test/workflow reason, fix it autonomously.

Pause only when the next step genuinely requires:

- Android / Termux physical-device evidence
- real device UI screenshots that cannot be reproduced locally
- credentials / secrets / permissions / account authorization
- the user checkpoint after completing the current phase

## Phase 2 next target

Start with **Entry surfaces**:

- startup / preloader / blocking loading
- login
- first-run onboarding
- global dialogs / popups
- toasts / transient notices where they form part of the product frame

The goal is to make the user journey from launch into the already-redesigned Phase 1 Shell feel like one Atria product.

Do not touch Phase 3+ implementation until Phase 2 is complete and reported.

Previous completed Model / Prompt / Runtime handoff remains archived at:

`handoff/model-prompt-runtime-complete-2026-09-23.md`
