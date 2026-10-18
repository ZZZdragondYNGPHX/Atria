# Frontend redesign — Phase 3 pushed; await Phase 4 authorization

- Date: 2026-09-24
- Repository: `ZZZdragondYNGPHX/Atria`
- Main: `402b53a98a823573591db4e9fd015f98e6effbdb` (Phase 1 integrated)
- Current branch: `refactor/atria-product-frontend-redesign`
- Pushed HEAD: `27a61893a285365c4c42e7ac21bd4263227afc5b`
- Completed: Phases 1–3. Outstanding: Phases 4–8.
- **Stop at this checkpoint.** Continue only when the user says continue.
- Keep this branch. Do not recreate from main, merge or delete it at individual
  phase checkpoints. Phases 2 and 3 are intentionally unmerged.

## Authority and records

1. `planning/atria-product-frontend-redesign/DESIGN.md` — formal authority,
   including Phase 3 details in section 10.
3. `PHASE-1.md` and `PHASE-2.md` in the same folder — complete; do not redo.
4. `refactor/atria-product-frontend-redesign.md` — original architecture audit,
   not a competing visual proposal.

Previous handoff archived as
`handoff/frontend-redesign-phase2-pushed-2026-09-24.md`.

## Phase 3 summary

Rebuilt Play landing, transcript, composer, control bar/More and Timeline/Context
inspector. Stable reading position and committed DOM during streaming; Save,
portable import, loading/error/retry, history and recovery feedback. Reuses Shell
Dock/Sheet, Navigation and Native Session/generation authority. Native Game
sidebars use the inspector; modal/drawer anchors use native dialogs; Full recovery
stays outside package content with focus restoration. Play CSS is extracted from
Shell. Corrected adjacent Sheet keyboard trapping and a toast dismissal race.
New Chinese text is included.

No second router, persistence, runtime state or configuration authority. Native
ABI, Stage/transient/recovery, exact resources, Studio and plugin ownership remain.

**User decision:** SillyTavern migration is retired. Do not restore its UI or
endpoints. Atria backup restore, storage-engine migration and existing upstream
Native ABI remain; no broad upstream removal is authorized.

## Next target after continuation

**Phase 4 — Library:** Works/details, Sessions, Worlds, Knowledge, prompt resources
and Skills. Preserve exact resource identity, plugin-defined resources and current
controllers.

Skills: frontend-design → ui-ux-pro-max → implement → real browser/screenshots →
web-design-guidelines → emil-design-eng → regression. No taste-skill.
Complete autonomous fixes, commit/push, update docs and phase record, report, stop.
